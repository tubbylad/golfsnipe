import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import type { Prisma, User } from '@/generated/prisma/client';

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  isAdmin?: boolean;
}

/** Canonical email form: trimmed + lowercased, so casing/whitespace can't
 * create distinct accounts for the same address. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Create a user, hashing the password before it ever reaches the database.
 * The plaintext is discarded once hashed; only `passwordHash` is persisted.
 * Email is normalized (trim + lowercase). Throws on a duplicate email (the
 * `User.email` unique constraint).
 *
 * `client` defaults to the shared singleton but accepts an interactive
 * transaction client, so user creation can be composed atomically with other
 * writes (e.g. claiming a single-use invite in the same transaction).
 */
export async function createUser(
  input: CreateUserInput,
  client: Prisma.TransactionClient = prisma,
): Promise<User> {
  const passwordHash = await hashPassword(input.password);
  return client.user.create({
    data: {
      email: normalizeEmail(input.email),
      name: input.name,
      passwordHash,
      isAdmin: input.isAdmin ?? false,
    },
  });
}

/** Look up a user by email (unique, normalized). Returns null if none exists. */
export async function findUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
}
