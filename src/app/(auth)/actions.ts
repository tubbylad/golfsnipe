'use server';

import { redirect } from 'next/navigation';
import { registerWithInvite } from '@/lib/invites';
import { authenticate } from '@/lib/auth';
import {
  createSession,
  setSessionCookie,
  readSessionCookie,
  invalidateSession,
  clearSessionCookie,
} from '@/lib/session';

/**
 * Thin Server Action wrappers around the TDD'd logic in `@/lib/*`. These handle
 * only request-context concerns — reading FormData, starting the session +
 * cookie, and redirecting — so the testable pieces (invite claim, credential
 * check) stay in plain DB-backed functions.
 *
 * `redirect()` throws a NEXT_REDIRECT control-flow signal, so it is always
 * called OUTSIDE any try/catch (per the Next.js docs).
 */
export type AuthState = { error: string } | null;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** Signup: validate the invite, create the user + claim the invite atomically,
 * then start a session. Invalid/used/expired token → an error, no account. */
export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const token = field(formData, 'token');
  const name = field(formData, 'name').trim();
  const email = field(formData, 'email').trim();
  const password = field(formData, 'password');

  if (!token) return { error: 'Missing invite token — use the link from your invite email.' };
  if (!name || !email || !password) {
    return { error: 'Name, email and password are all required.' };
  }

  const result = await registerWithInvite({ token, name, email, password });
  if (!result.ok) {
    return {
      error:
        result.reason === 'email_taken'
          ? 'An account with that email already exists. Try logging in.'
          : 'This invite link is invalid, already used, or expired.',
    };
  }

  const sessionId = await createSession(result.user.id);
  await setSessionCookie(sessionId);
  redirect('/dashboard');
}

/** Login: check credentials, and on success start a session. Failure returns a
 * single generic message so we never reveal whether the email exists. */
export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = field(formData, 'email').trim();
  const password = field(formData, 'password');

  if (!email || !password) return { error: 'Enter your email and password.' };

  const user = await authenticate(email, password);
  if (!user) return { error: 'Invalid email or password.' };

  const sessionId = await createSession(user.id);
  await setSessionCookie(sessionId);
  redirect('/dashboard');
}

/** Logout: invalidate the server-side session, clear the cookie, back to login. */
export async function logoutAction(): Promise<void> {
  const id = await readSessionCookie();
  if (id) await invalidateSession(id);
  await clearSessionCookie();
  redirect('/login');
}
