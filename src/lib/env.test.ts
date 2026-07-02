import { expect, test } from 'vitest';

test('parseEnv throws when BRS_VAULT_KEY missing', async () => {
  const { parseEnv } = await import('./env');
  expect(() => parseEnv({ DATABASE_URL: 'x', APP_ORIGIN: 'x' })).toThrow();
});

test('parseEnv returns a typed config when required vars are present', async () => {
  const { parseEnv } = await import('./env');
  const cfg = parseEnv({
    DATABASE_URL: 'postgresql://brs:brs@localhost:5432/brs',
    BRS_VAULT_KEY: 'zZ9k…base64…',
    APP_ORIGIN: 'http://localhost:3000',
  });
  expect(cfg.DATABASE_URL).toBe('postgresql://brs:brs@localhost:5432/brs');
  expect(cfg.SMS_SENDER).toBeUndefined();
});
