import { expect, test } from 'vitest';
import { generateCode, hashCode, verifyCode } from './otp';

test('generateCode returns a 6-digit numeric string', () => {
  expect(generateCode()).toMatch(/^\d{6}$/);
});

test('generateCode varies across calls', () => {
  const codes = new Set(Array.from({ length: 25 }, generateCode));
  expect(codes.size).toBeGreaterThan(1);
});

test('hashCode is deterministic and binds to code + secret', () => {
  expect(hashCode('123456', 'secret')).toBe(hashCode('123456', 'secret'));
  expect(hashCode('123456', 'secret')).not.toBe(hashCode('654321', 'secret'));
  expect(hashCode('123456', 'secret')).not.toBe(hashCode('123456', 'other'));
});

test('hashCode never returns the plaintext code', () => {
  expect(hashCode('123456', 'secret')).not.toContain('123456');
});

test('verifyCode accepts only the right code under the right secret', () => {
  const h = hashCode('123456', 'secret');
  expect(verifyCode('123456', h, 'secret')).toBe(true);
  expect(verifyCode('654321', h, 'secret')).toBe(false);
  expect(verifyCode('123456', h, 'wrong')).toBe(false);
  expect(verifyCode('123456', 'not-hex', 'secret')).toBe(false);
});
