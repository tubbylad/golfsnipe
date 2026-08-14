import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/** A fresh 6-digit numeric code (CSPRNG, zero-padded). */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * HMAC-SHA256 of a code under a server secret (hex). Codes are stored hashed,
 * never in plaintext, so a DB leak does not expose live codes.
 */
export function hashCode(code: string, secret: string): string {
  return createHmac('sha256', secret).update(code).digest('hex');
}

/** Constant-time check of a submitted code against a stored hash (false on any mismatch). */
export function verifyCode(code: string, hash: string, secret: string): boolean {
  const expected = Buffer.from(hashCode(code, secret), 'hex');
  const actual = Buffer.from(hash, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
