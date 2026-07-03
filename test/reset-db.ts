import { prisma } from '@/lib/db';

/**
 * Truncate every application table so a DB-touching test starts from a clean,
 * deterministic state. Call from `beforeEach` in DB suites.
 *
 * Table names are discovered from `pg_tables` (rather than hard-coded) so this
 * keeps working as the schema grows. `_prisma_migrations` is preserved — the
 * schema stays intact; only data is cleared. `RESTART IDENTITY CASCADE` also
 * resets sequences and follows foreign keys, so order doesn't matter.
 */
export async function resetDb(): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) return;

  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
