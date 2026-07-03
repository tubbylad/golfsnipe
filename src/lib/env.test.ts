import { expect, test } from 'vitest';

// A syntactically valid vault key: 32 zero bytes, base64-encoded.
const VALID_VAULT_KEY = Buffer.alloc(32).toString('base64');

test('parseEnv throws when BRS_VAULT_KEY missing', async () => {
  const { parseEnv } = await import('./env');
  expect(() => parseEnv({ DATABASE_URL: 'x', APP_ORIGIN: 'x' })).toThrow();
});

test('parseEnv returns a typed config when required vars are present', async () => {
  const { parseEnv } = await import('./env');
  const cfg = parseEnv({
    DATABASE_URL: 'postgresql://brs:brs@localhost:5432/brs',
    BRS_VAULT_KEY: VALID_VAULT_KEY,
    APP_ORIGIN: 'http://localhost:3000',
  });
  expect(cfg.DATABASE_URL).toBe('postgresql://brs:brs@localhost:5432/brs');
  expect(cfg.SMS_SENDER).toBeUndefined();
});

test('parseEnv rejects a BRS_VAULT_KEY that is not 32 base64 bytes', async () => {
  const { parseEnv } = await import('./env');
  const base = {
    DATABASE_URL: 'postgresql://brs:brs@localhost:5432/brs',
    APP_ORIGIN: 'http://localhost:3000',
  };
  // 16 bytes (too short), non-base64 garbage, and empty are all rejected.
  expect(() => parseEnv({ ...base, BRS_VAULT_KEY: Buffer.alloc(16).toString('base64') })).toThrow();
  expect(() => parseEnv({ ...base, BRS_VAULT_KEY: 'not-valid-base64!!!' })).toThrow();
  expect(() => parseEnv({ ...base, BRS_VAULT_KEY: '' })).toThrow();
});
