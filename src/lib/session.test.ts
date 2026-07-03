import { beforeEach, expect, test } from 'vitest';
import { prisma } from '@/lib/db';
import { createSession, validateSession, invalidateSession } from './session';
import { createUser } from './users';
import { resetDb } from '../../test/reset-db';

// Real ephemeral Postgres. The cookie wrappers (setSessionCookie etc.) are thin
// Next-request-scoped helpers and are intentionally not unit-tested here; these
// tests cover the DB-backed create/validate/invalidate/expiry logic.
beforeEach(async () => {
  await resetDb();
});

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

test('createSession stores a row for the user, expiring ~30 days out', async () => {
  const user = await createUser({ email: 'sess@example.com', name: 'U', password: 'pw' });
  const before = Date.now();
  const id = await createSession(user.id);

  expect(typeof id).toBe('string');
  expect(id.length).toBeGreaterThan(0);

  const row = await prisma.session.findUnique({ where: { id } });
  expect(row).not.toBeNull();
  expect(row!.userId).toBe(user.id);
  const ttl = row!.expiresAt.getTime() - before;
  expect(Math.abs(ttl - THIRTY_DAYS_MS)).toBeLessThan(60_000);
});

test('validateSession returns the user for a live session', async () => {
  const user = await createUser({ email: 'live@example.com', name: 'Live', password: 'pw' });
  const id = await createSession(user.id);

  const result = await validateSession(id);
  expect(result).not.toBeNull();
  expect(result!.id).toBe(user.id);
  expect(result!.email).toBe('live@example.com');
});

test('validateSession returns null for a missing or empty id', async () => {
  expect(await validateSession('does-not-exist')).toBeNull();
  expect(await validateSession('')).toBeNull();
});

test('validateSession returns null for an expired session', async () => {
  const user = await createUser({ email: 'exp@example.com', name: 'Exp', password: 'pw' });
  const expired = await prisma.session.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() - 1000) },
  });
  expect(await validateSession(expired.id)).toBeNull();
});

test('invalidateSession deletes the session so validate returns null', async () => {
  const user = await createUser({ email: 'inv@example.com', name: 'Inv', password: 'pw' });
  const id = await createSession(user.id);
  expect(await validateSession(id)).not.toBeNull();

  await invalidateSession(id);
  expect(await prisma.session.findUnique({ where: { id } })).toBeNull();
  expect(await validateSession(id)).toBeNull();
});

test('invalidateSession is a no-op for an unknown id', async () => {
  await expect(invalidateSession('nope')).resolves.toBeUndefined();
});
