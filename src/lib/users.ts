import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import type { User } from '@/generated/prisma/client';

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  isAdmin?: boolean;
}

/** Canonical email form: trimmed + lowercased, so casing/whitespace can't
 * create distinct accounts for the same address. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Create a user, hashing the password before it ever reaches the database.
 * The plaintext is discarded once hashed; only `passwordHash` is persisted.
 * Email is normalized (trim + lowercase). Throws on a duplicate email (the
 * `User.email` unique constraint).
 */
export async function createUser(input: CreateUserInput): Promise<User> {
  const passwordHash = await hashPassword(input.password);
  return prisma.user.create({
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
