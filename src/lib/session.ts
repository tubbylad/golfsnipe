import { prisma } from '@/lib/db';
import type { User } from '@/generated/prisma/client';

/** Name of the opaque session cookie. */
export const SESSION_COOKIE = 'bts_session';

/** Sessions live 30 days. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;

// --- DB-backed session lifecycle -------------------------------------------
// Pure data-layer functions, unit-tested against the real Postgres.

/**
 * Create a session for `userId`, expiring ~30 days out. Returns the session id,
 * which doubles as the opaque cookie value (a cuid, unguessable).
 */
export async function createSession(userId: string): Promise<string> {
  const session = await prisma.session.create({
    data: { userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  return session.id;
}

/**
 * Resolve a session id to its user. Returns null for a missing/empty id or an
 * expired session. This is a pure read — expired rows are left for a separate
 * pruning job; `invalidateSession` is the explicit delete.
 */
export async function validateSession(id: string): Promise<User | null> {
  if (!id) return null;
  const session = await prisma.session.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  return session.user;
}

/** Delete a session. Idempotent — a no-op (no throw) when the id is unknown. */
export async function invalidateSession(id: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id } });
}

// --- Cookie helpers ---------------------------------------------------------
// Next 16's cookies() is async and request-scoped. next/headers is imported
// lazily so the DB logic above stays importable (and testable) outside a Next
// request context; these thin wrappers run only inside Server Actions / Route
// Handlers, where the cookie store exists.

async function cookieStore() {
  const { cookies } = await import('next/headers');
  return cookies();
}

/** Set the session cookie: httpOnly, secure, sameSite=lax, path=/, 30-day life. */
export async function setSessionCookie(id: string): Promise<void> {
  const store = await cookieStore();
  store.set(SESSION_COOKIE, id, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
    expires: new Date(Date.now() + SESSION_TTL_MS),
  });
}

/** Read the current session id from the request cookies, if present. */
export async function readSessionCookie(): Promise<string | undefined> {
  const store = await cookieStore();
  return store.get(SESSION_COOKIE)?.value;
}

/** Clear the session cookie (e.g. on logout). */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookieStore();
  store.delete(SESSION_COOKIE);
}
