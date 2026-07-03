import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * Singleton Prisma Client (Prisma 7 driver-adapter model).
 *
 * Prisma 7 requires an explicit driver adapter — here `PrismaPg`, backed by a
 * `pg` connection pool built from `DATABASE_URL`. The connection string is read
 * at construction time; the test harness and Next.js both set it before this
 * module is first imported.
 *
 * In development we cache the client on `globalThis` so Next.js Hot Module
 * Reloading reuses one instance instead of opening a fresh pool on every edit
 * (which would otherwise exhaust Postgres connections). In production a single
 * fresh client is created per process.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
