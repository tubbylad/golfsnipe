/**
 * Local development Postgres — no Docker, no Homebrew.
 *
 * Starts a real Postgres cluster from the `embedded-postgres` npm package
 * (platform binary shipped as an optional dep) and keeps it running until you
 * press Ctrl+C. Data is persisted in `.pgdata/` (gitignored) so it survives
 * restarts.
 *
 *   npm run db:dev
 *
 * Connection string (matches .env):
 *   postgresql://brs:brs@localhost:5432/brs
 *
 * Production uses a Coolify-provisioned Postgres with the same DATABASE_URL
 * contract — nothing in the app changes.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), '.pgdata');
const PORT = 5432;
const USER = 'brs';
const PASSWORD = 'brs';
const DB = 'brs';

async function main() {
  // A cluster is "initialised" once Postgres has written its PG_VERSION marker.
  const alreadyInitialised = existsSync(path.join(DATA_DIR, 'PG_VERSION'));

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    port: PORT,
    user: USER,
    password: PASSWORD,
    authMethod: 'password',
    persistent: true, // never delete data on stop()
  });

  if (!alreadyInitialised) {
    console.log(`[dev-db] initialising cluster at ${DATA_DIR} ...`);
    await pg.initialise();
  }

  console.log(`[dev-db] starting Postgres on port ${PORT} ...`);
  await pg.start();

  // Ensure the application database exists (idempotent across restarts).
  try {
    await pg.createDatabase(DB);
    console.log(`[dev-db] created database "${DB}"`);
  } catch {
    console.log(`[dev-db] database "${DB}" already exists`);
  }

  console.log(`[dev-db] ready → postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DB}`);
  console.log('[dev-db] press Ctrl+C to stop.');

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`\n[dev-db] ${signal} received, stopping Postgres ...`);
    try {
      await pg.stop();
    } catch (err) {
      console.error('[dev-db] error during stop:', err);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[dev-db] failed to start:', err);
  process.exit(1);
});
