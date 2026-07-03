import { z } from 'zod';

/**
 * True when `v` is standard base64 (as produced by `openssl rand -base64 32`
 * and consumed by the vault's libsodium `ORIGINAL` variant) that decodes to
 * exactly 32 bytes — the size `crypto_secretbox` requires. Validating this at
 * parse time means a misconfigured key fails at boot, not at first encrypt.
 * 32 bytes encode to 44 base64 chars: 43 significant chars + one `=` pad.
 */
function isVaultKey(v: string): boolean {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(v)) return false;
  return Buffer.from(v, 'base64').length === 32;
}

/**
 * Validated application environment.
 *
 * Required: DATABASE_URL, BRS_VAULT_KEY, APP_ORIGIN.
 * Optional (until Phase 6): RESEND_API_KEY, SMS_ENDPOINT, SMS_SENDER.
 */
export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BRS_VAULT_KEY: z
    .string()
    .refine(isVaultKey, 'BRS_VAULT_KEY must be base64 that decodes to exactly 32 bytes'),
  APP_ORIGIN: z.string().min(1),
  RESEND_API_KEY: z.string().optional(),
  SMS_ENDPOINT: z.string().optional(),
  SMS_SENDER: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate an environment source (defaults to `process.env`).
 * Throws a ZodError if a required variable is missing or empty.
 */
export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  return envSchema.parse(source);
}

// Lazily parsed and memoized: importing this module never crashes on a partial
// environment (tooling, tests). Validation runs once, on first property access.
let cached: Env | undefined;

export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    cached ??= parseEnv();
    return cached[prop as keyof Env];
  },
});
