import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';

/**
 * Password hashing with Argon2id (memory-hard, side-channel resistant) via
 * @node-rs/argon2. `hashPassword` returns a self-describing encoded hash
 * (`$argon2id$v=19$m=...`) that embeds its own salt and parameters, so no
 * separate salt column is needed. Plaintext passwords are never stored.
 */
export function hashPassword(password: string): Promise<string> {
  return argon2Hash(password);
}

/**
 * Verify a plaintext password against a stored Argon2 hash. Returns false on a
 * mismatch and also on a malformed/foreign hash (fail closed) rather than
 * throwing, so callers can treat the boolean as the sole auth decision.
 */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify(passwordHash, password);
  } catch {
    return false;
  }
}
