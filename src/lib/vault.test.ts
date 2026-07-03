import { beforeAll, expect, test } from 'vitest';
import _sodium from 'libsodium-wrappers';

beforeAll(async () => {
  await _sodium.ready;
  process.env.BRS_VAULT_KEY = _sodium.to_base64(
    _sodium.randombytes_buf(_sodium.crypto_secretbox_KEYBYTES),
    _sodium.base64_variants.ORIGINAL,
  );
});

test('round-trips a secret', async () => {
  const { encryptSecret, decryptSecret } = await import('./vault');
  const { cipher, nonce } = await encryptSecret('hunter2');
  expect(await decryptSecret(cipher, nonce)).toBe('hunter2');
});
test('uses a fresh nonce each call', async () => {
  const { encryptSecret } = await import('./vault');
  const a = await encryptSecret('x'); const b = await encryptSecret('x');
  expect(a.cipher).not.toBe(b.cipher);
});
test('rejects a tampered ciphertext', async () => {
  const { encryptSecret, decryptSecret } = await import('./vault');
  const { cipher, nonce } = await encryptSecret('x');
  const bad = cipher.slice(0, -2) + (cipher.endsWith('A') ? 'BB' : 'AA');
  await expect(decryptSecret(bad, nonce)).rejects.toThrow();
});
