import { expect, test } from 'vitest';
import { hashPassword, verifyPassword } from './password';

test('hashPassword returns an argon2 hash, never the plaintext', async () => {
  const h = await hashPassword('hunter2');
  expect(h).not.toBe('hunter2');
  expect(h).not.toContain('hunter2');
  expect(h.startsWith('$argon2')).toBe(true);
});

test('hashPassword pins Argon2id at the OWASP floor (m=19456, t=2, p=1)', async () => {
  // The encoded hash embeds the parameters used, e.g.
  // $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
  const h = await hashPassword('hunter2');
  expect(h.startsWith('$argon2id$')).toBe(true);
  expect(h).toContain('m=19456');
  expect(h).toContain('t=2');
  expect(h).toContain('p=1');
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
