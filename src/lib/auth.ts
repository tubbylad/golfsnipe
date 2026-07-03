import { findUserByEmail } from '@/lib/users';
import { verifyPassword } from '@/lib/password';
import { readSessionCookie, validateSession } from '@/lib/session';
import type { User } from '@/generated/prisma/client';

/**
 * Verify a login: look up the user by (normalized) email and check the password
 * against the stored Argon2 hash. Returns the user on success, or null when the
 * email is unknown OR the password is wrong. Callers MUST NOT distinguish the
 * two cases to the client — a single generic "invalid email or password" avoids
 * leaking which accounts exist.
 */
export async function authenticate(email: string, password: string): Promise<User | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const ok = await verifyPassword(user.passwordHash, password);
  return ok ? user : null;
}

/**
 * Resolve the currently signed-in user from the request's session cookie, or
 * null if there is no valid session. Request-scoped (reads `cookies()`), so it
 * runs only inside Server Components / Actions / Route Handlers — the reusable
 * guard behind the dashboard layout.
 */
export async function getCurrentUser(): Promise<User | null> {
  const id = await readSessionCookie();
  if (!id) return null;
  return validateSession(id);
}
