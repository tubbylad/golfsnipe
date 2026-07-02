import { inject } from 'vitest';

/**
 * The global setup provides DATABASE_URL, but under Vitest's default forks pool
 * env mutations made there don't reach worker processes. Bridge it into this
 * worker's process.env so app code (and Prisma) can read it normally.
 */
const databaseUrl = inject('DATABASE_URL');
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}
