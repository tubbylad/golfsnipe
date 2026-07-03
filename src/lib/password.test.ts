import { expect, test } from 'vitest';
import { hashPassword, verifyPassword } from './password';

test('hashPassword returns an argon2 hash, never the plaintext', async () => {
  const h = await hashPassword('hunter2');
  expect(h).not.toBe('hunter2');
  expect(h).not.toContain('hunter2');
  expect(h.startsWith('$argon2')).toBe(true);
});

test('verifyPassword is true for the matching password', async () => {
  const h = await hashPassword('hunter2');
  expect(await verifyPassword(h, 'hunter2')).toBe(true);
});

test('verifyPassword is false for a non-matching password', async () => {
  const h = await hashPassword('hunter2');
  expect(await verifyPassword(h, 'wrong-password')).toBe(false);
});

test('verifyPassword fails closed (false, not throw) on a malformed hash', async () => {
  expect(await verifyPassword('not-a-real-hash', 'whatever')).toBe(false);
});
