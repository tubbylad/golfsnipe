import { beforeEach, expect, test } from 'vitest';
import { authenticate } from './auth';
import { createUser } from './users';
import { resetDb } from '../../test/reset-db';

// Real ephemeral Postgres. authenticate is the credential check behind the
// login action; getCurrentUser reads the request cookie and is exercised via
// the app (not unit-tested here), mirroring the session cookie helpers.
beforeEach(async () => {
  await resetDb();
});

test('authenticate returns the user for correct credentials', async () => {
  const created = await createUser({ email: 'login@example.com', name: 'Log', password: 's3cret' });
  const user = await authenticate('login@example.com', 's3cret');
  expect(user).not.toBeNull();
  expect(user!.id).toBe(created.id);
});

test('authenticate returns null for a wrong password', async () => {
  await createUser({ email: 'login@example.com', name: 'Log', password: 's3cret' });
  expect(await authenticate('login@example.com', 'wrong')).toBeNull();
});

test('authenticate returns null for an unknown email', async () => {
  expect(await authenticate('ghost@example.com', 'whatever')).toBeNull();
});

test('authenticate normalizes the email (case-insensitive lookup)', async () => {
  const created = await createUser({ email: 'Case@Example.com', name: 'C', password: 'pw' });
  const user = await authenticate('  CASE@example.COM ', 'pw');
  expect(user!.id).toBe(created.id);
});
