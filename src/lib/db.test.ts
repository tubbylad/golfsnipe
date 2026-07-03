import { beforeEach, expect, test } from 'vitest';
import { prisma } from '@/lib/db';
import { resetDb } from '../../test/reset-db';

// Real database round-trip: exercises the ephemeral test Postgres, the applied
// migration, and the Prisma 7 driver-adapter client. Nothing is mocked.

beforeEach(async () => {
  await resetDb();
});

test('creates a User and reads it back (real DB round-trip)', async () => {
  const created = await prisma.user.create({
    data: { email: 'alice@example.com', name: 'Alice', passwordHash: 'hash-1' },
  });

  expect(created.id).toMatch(/^c[0-9a-z]+$/); // cuid default
  expect(created.isAdmin).toBe(false); // schema default
  expect(created.phone).toBeNull(); // optional, unset
  expect(created.createdAt).toBeInstanceOf(Date);

  const found = await prisma.user.findUnique({ where: { email: 'alice@example.com' } });
  expect(found).not.toBeNull();
  expect(found?.id).toBe(created.id);
  expect(found?.name).toBe('Alice');
  expect(found?.passwordHash).toBe('hash-1');
});

test('each test starts from a clean database (isolation)', async () => {
  // Reusing the same unique email only succeeds if the previous test's row was
  // truncated by resetDb() in beforeEach — otherwise this violates User_email_key.
  await prisma.user.create({
    data: { email: 'alice@example.com', name: 'Alice Again', passwordHash: 'hash-2' },
  });

  expect(await prisma.user.count()).toBe(1);
});
