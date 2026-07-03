import { beforeEach, expect, test } from 'vitest';
import { prisma } from '@/lib/db';
import { createInvite, consumeInvite, registerWithInvite } from './invites';
import { createUser, findUserByEmail } from './users';
import { resetDb } from '../../test/reset-db';

// Real ephemeral Postgres — nothing mocked. These cover invite minting, the
// atomic single-use guarantee of consumeInvite, and the transactional signup
// (registerWithInvite) where a failed invite claim must roll back the new user.
beforeEach(async () => {
  await resetDb();
});

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

test('createInvite mints a CSPRNG token and stores an unused, ~7-day invite', async () => {
  const before = Date.now();
  const token = await createInvite();

  // 32 random bytes -> 43-char unpadded base64url = 256 bits of entropy.
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

  const row = await prisma.invite.findUnique({ where: { token } });
  expect(row).not.toBeNull();
  expect(row!.usedById).toBeNull();
  expect(row!.email).toBeNull();
  const ttl = row!.expiresAt.getTime() - before;
  expect(Math.abs(ttl - SEVEN_DAYS_MS)).toBeLessThan(60_000);
});

test('createInvite can pin the invite to an email', async () => {
  const token = await createInvite('Guest@Example.com');
  const row = await prisma.invite.findUnique({ where: { token } });
  expect(row!.email).toBe('Guest@Example.com');
});

test('createInvite tokens are distinct across calls', async () => {
  const a = await createInvite();
  const b = await createInvite();
  expect(a).not.toBe(b);
});

test('consumeInvite marks the invite used and returns true', async () => {
  const user = await createUser({ email: 'u@example.com', name: 'U', password: 'pw' });
  const token = await createInvite();

  expect(await consumeInvite(token, user.id)).toBe(true);

  const row = await prisma.invite.findUnique({ where: { token } });
  expect(row!.usedById).toBe(user.id);
});

test('consumeInvite is single-use: a second consume of the same token fails', async () => {
  const u1 = await createUser({ email: 'a@example.com', name: 'A', password: 'pw' });
  const u2 = await createUser({ email: 'b@example.com', name: 'B', password: 'pw' });
  const token = await createInvite();

  expect(await consumeInvite(token, u1.id)).toBe(true);
  expect(await consumeInvite(token, u2.id)).toBe(false);

  // Still recorded against the first claimant only.
  const row = await prisma.invite.findUnique({ where: { token } });
  expect(row!.usedById).toBe(u1.id);
});

test('consumeInvite fails for an expired token', async () => {
  const user = await createUser({ email: 'exp@example.com', name: 'Exp', password: 'pw' });
  const expired = await prisma.invite.create({
    data: { token: 'expired-token', expiresAt: new Date(Date.now() - 1000) },
  });
  expect(await consumeInvite(expired.token, user.id)).toBe(false);
  const row = await prisma.invite.findUnique({ where: { token: expired.token } });
  expect(row!.usedById).toBeNull();
});

test('consumeInvite fails for an unknown token', async () => {
  const user = await createUser({ email: 'x@example.com', name: 'X', password: 'pw' });
  expect(await consumeInvite('no-such-token', user.id)).toBe(false);
});

test('registerWithInvite creates the user and consumes the invite atomically', async () => {
  const token = await createInvite();
  const result = await registerWithInvite({
    token,
    name: 'New User',
    email: 'New@Example.com',
    password: 'hunter2',
  });

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('unreachable');
  expect(result.user.email).toBe('new@example.com'); // normalized

  // Invite is now spent, pinned to the created user.
  const invite = await prisma.invite.findUnique({ where: { token } });
  expect(invite!.usedById).toBe(result.user.id);

  // The user exists and carries a hash, not the plaintext.
  const stored = await findUserByEmail('new@example.com');
  expect(stored!.id).toBe(result.user.id);
  expect(stored!.passwordHash).not.toContain('hunter2');
});

test('registerWithInvite rolls back the user when the invite is already used', async () => {
  const token = await createInvite();
  const first = await registerWithInvite({
    token,
    name: 'First',
    email: 'first@example.com',
    password: 'pw',
  });
  expect(first.ok).toBe(true);

  const usersBefore = await prisma.user.count();
  const second = await registerWithInvite({
    token, // same, now-spent token
    name: 'Second',
    email: 'second@example.com',
    password: 'pw',
  });

  expect(second.ok).toBe(false);
  if (second.ok) throw new Error('unreachable');
  expect(second.reason).toBe('invalid_invite');

  // No account was created — the failed invite claim rolled back the insert.
  expect(await prisma.user.count()).toBe(usersBefore);
  expect(await findUserByEmail('second@example.com')).toBeNull();
});

test('registerWithInvite rejects an expired invite without creating a user', async () => {
  await prisma.invite.create({
    data: { token: 'expired', expiresAt: new Date(Date.now() - 1000) },
  });
  const result = await registerWithInvite({
    token: 'expired',
    name: 'Nope',
    email: 'nope@example.com',
    password: 'pw',
  });
  expect(result.ok).toBe(false);
  expect(await findUserByEmail('nope@example.com')).toBeNull();
});

test('registerWithInvite reports a taken email and leaves the invite unspent', async () => {
  await createUser({ email: 'taken@example.com', name: 'Existing', password: 'pw' });
  const token = await createInvite();

  const result = await registerWithInvite({
    token,
    name: 'Dup',
    email: 'Taken@example.com', // same address, different case
    password: 'pw',
  });

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('unreachable');
  expect(result.reason).toBe('email_taken');

  // The unique-constraint failure rolled back the tx: the invite is untouched
  // and can still be redeemed by someone else.
  const invite = await prisma.invite.findUnique({ where: { token } });
  expect(invite!.usedById).toBeNull();
  const other = await createUser({ email: 'other@example.com', name: 'Other', password: 'pw' });
  expect(await consumeInvite(token, other.id)).toBe(true);
});
