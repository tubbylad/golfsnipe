import { readSessionCookie, validateSession } from '@/lib/session';
import type { User } from '@/generated/prisma/client';

/**
 * Resolve the currently signed-in user from the request's session cookie, or
 * null if there is no valid session. Request-scoped (reads `cookies()`), so it
 * runs only inside Server Components / Actions / Route Handlers — the reusable
 * guard behind the dashboard layout. Login is passwordless (SMS code) only.
 */
export async function getCurrentUser(): Promise<User | null> {
  const id = await readSessionCookie();
  if (!id) return null;
  return validateSession(id);
}
