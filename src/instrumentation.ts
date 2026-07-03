/**
 * Next.js instrumentation. `register()` runs once when a server instance is
 * initiated (not at build time), before the server handles any request.
 *
 * We use it to eagerly validate the environment — including that BRS_VAULT_KEY
 * is base64 decoding to exactly 32 bytes — so a misconfigured deployment fails
 * fast at boot instead of at the first encrypt/DB call.
 */
export async function register() {
  const { parseEnv } = await import('@/lib/env');
  parseEnv();
}
