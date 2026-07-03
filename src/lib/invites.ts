import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { createUser } from '@/lib/users';
import type { Prisma, User } from '@/generated/prisma/client';

/** Invites live 7 days. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Mint a single-use invite. The token doubles as the secret in the signup URL,
 * so — like a session id — it MUST be unguessable: we generate it from a CSPRNG
 * (32 random bytes -> 256-bit base64url token) rather than relying on the
 * schema's `@default(cuid())`, which is not cryptographically secure.
 *
 * `email` is optional metadata (who the invite was intended for); it does not
 * restrict who can redeem the token.
 */
export async function createInvite(email?: string): Promise<string> {
  const token = randomBytes(32).toString('base64url'); // 256-bit opaque token
  await prisma.invite.create({
    data: { token, email: email ?? null, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  });
  return token;
}

/**
 * Atomically claim an invite for `newUserId`. Succeeds only if the invite
 * exists, is unexpired, and is still unused. The single guarded `updateMany`
 * (WHERE token = ? AND usedById IS NULL AND expiresAt > now) is the race-safe
 * primitive: concurrent claims contend on the same row and exactly one sees a
 * count of 1. Returns whether this call was the one that claimed it.
 *
 * `client` accepts an interactive transaction client so the claim can be
 * composed with user creation (see `registerWithInvite`).
 */
export async function consumeInvite(
  token: string,
  newUserId: string,
  client: Prisma.TransactionClient = prisma,
): Promise<boolean> {
  const { count } = await client.invite.updateMany({
    where: { token, usedById: null, expiresAt: { gt: new Date() } },
    data: { usedById: newUserId },
  });
  return count === 1;
}

/** Signup outcome: the created user, or a reason the account was not created. */
export type RegisterResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'invalid_invite' | 'email_taken' };

/** Thrown inside the signup transaction to force a rollback when the invite
 * can't be claimed (used/expired/unknown). Never escapes this module. */
class InviteUnavailableError extends Error {}

/** True for a Prisma unique-constraint violation (P2002), duck-typed so we
 * don't depend on the concrete error class across Prisma versions. */
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Create an account from an invite, in one transaction: the user is inserted
 * and the invite is claimed together, so if the claim fails (the token was
 * already spent, expired, or unknown) the whole thing rolls back and NO user is
 * left behind. A duplicate email likewise rolls back, leaving the invite
 * unspent for another attempt.
 */
export async function registerWithInvite(input: {
  token: string;
  name: string;
  email: string;
  password: string;
}): Promise<RegisterResult> {
  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await createUser(
        { email: input.email, name: input.name, password: input.password },
        tx,
      );
      const claimed = await consumeInvite(input.token, created.id, tx);
      if (!claimed) throw new InviteUnavailableError();
      return created;
    });
    return { ok: true, user };
  } catch (e) {
    if (e instanceof InviteUnavailableError) return { ok: false, reason: 'invalid_invite' };
    if (isUniqueViolation(e)) return { ok: false, reason: 'email_taken' };
    throw e;
  }
}
