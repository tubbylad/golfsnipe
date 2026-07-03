import _sodium from 'libsodium-wrappers';

/**
 * Credential vault — symmetric authenticated encryption for secrets we must
 * store and later replay (BRS account passwords). Backed by libsodium's
 * `crypto_secretbox` (XSalsa20-Poly1305): confidential + tamper-evident.
 *
 * The master key comes from `BRS_VAULT_KEY` (32 bytes, base64). Ciphertext and
 * nonce are returned base64-encoded and stored as separate columns; a fresh
 * random nonce is generated per encryption, so identical plaintexts never yield
 * identical ciphertexts. Decryption of a tampered ciphertext throws.
 */
let ready: Promise<typeof _sodium> | null = null;
const sodium = () => (ready ??= _sodium.ready.then(() => _sodium));

async function key() {
  const s = await sodium();
  const b64 = process.env.BRS_VAULT_KEY;
  if (!b64) throw new Error('BRS_VAULT_KEY is not set');
  const k = s.from_base64(b64, s.base64_variants.ORIGINAL);
  if (k.length !== s.crypto_secretbox_KEYBYTES) throw new Error('BRS_VAULT_KEY must be 32 bytes');
  return k;
}

export async function encryptSecret(plaintext: string) {
  const s = await sodium();
  const k = await key();
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const c = s.crypto_secretbox_easy(s.from_string(plaintext), nonce, k);
  const enc = (u: Uint8Array) => s.to_base64(u, s.base64_variants.ORIGINAL);
  return { cipher: enc(c), nonce: enc(nonce) };
}

export async function decryptSecret(cipherB64: string, nonceB64: string) {
  const s = await sodium();
  const k = await key();
  const dec = (b: string) => s.from_base64(b, s.base64_variants.ORIGINAL);
  const plain = s.crypto_secretbox_open_easy(dec(cipherB64), dec(nonceB64), k);
  return s.to_string(plain);
}
