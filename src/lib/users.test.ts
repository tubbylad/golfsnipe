import { beforeEach, expect, test } from 'vitest';
import { prisma } from '@/lib/db';
import { createUser, findUserByEmail } from './users';
import { verifyPassword } from './password';
import { resetDb } from '../../test/reset-db';

// Real database — the ephemeral test Postgres, the applied migration, and the
// Prisma driver-adapter client. Nothing is mocked.
beforeEach(async () => {
  await resetDb();
});

test('createUser persists an argon2 hash, never the plaintext password', async () => {
  const plaintext = 's3cret-pw';
  const user = await createUser({ email: 'a@example.com', name: 'Alice', password: plaintext });

  // The returned object carries a hash, not the plaintext.
  expect(user.passwordHash).not.toBe(plaintext);
  expect(user.passwordHash).not.toContain(plaintext);

  // Read the RAW row straight from Postgres to prove what is actually stored.
  const row = await prisma.user.findUnique({ where: { email: 'a@example.com' } });
  expect(row).not.toBeNull();
  expect(row!.passwordHash).not.toBe(plaintext);
  expect(row!.passwordHash).not.toContain(plaintext);
  expect(row!.passwordHash.startsWith('$argon2')).toBe(true);

  // The stored hash verifies against the original password (and only it).
  expect(await verifyPassword(row!.passwordHash, plaintext)).toBe(true);
  expect(await verifyPassword(row!.passwordHash, 'not-the-password')).toBe(false);
});

test('createUser defaults isAdmin to false and can set it true', async () => {
  const u1 = await createUser({ email: 'u1@example.com', name: 'U1', password: 'pw' });
  expect(u1.isAdmin).toBe(false);

  const u2 = await createUser({ email: 'u2@example.com', name: 'U2', password: 'pw', isAdmin: true });
  expect(u2.isAdmin).toBe(true);
});

test('createUser rejects a duplicate email (unique constraint)', async () => {
  await createUser({ email: 'dup@example.com', name: 'First', password: 'pw' });
  await expect(
    createUser({ email: 'dup@example.com', name: 'Second', password: 'pw' }),
  ).rejects.toThrow();
});

test('findUserByEmail returns the user, or null when absent', async () => {
  expect(await findUserByEmail('missing@example.com')).toBeNull();

  const created = await createUser({ email: 'find@example.com', name: 'Find', password: 'pw' });
  const found = await findUserByEmail('find@example.com');
  expect(found?.id).toBe(created.id);
  expect(found?.email).toBe('find@example.com');
});
