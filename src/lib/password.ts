import { hash as argon2Hash, verify as argon2Verify, type Options } from '@node-rs/argon2';

/**
 * Password hashing with Argon2id (memory-hard, side-channel resistant) via
 * @node-rs/argon2. `hashPassword` returns a self-describing encoded hash
 * (`$argon2id$v=19$m=...`) that embeds its own salt and parameters, so no
 * separate salt column is needed. Plaintext passwords are never stored.
 *
 * Parameters are pinned to the OWASP-recommended Argon2id floor (19 MiB memory,
 * 2 iterations, 1 lane), well above the library's 4 MiB default.
 */
const HASH_OPTIONS = {
  // @node-rs/argon2's `Algorithm` is an ambient const enum, which this repo's
  // isolatedModules TS config forbids referencing by name (TS2748). Argon2id is
  // value 2 (and is also the library default) — pin it explicitly by value.
  algorithm: 2,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} satisfies Options;

export function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, HASH_OPTIONS);
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
