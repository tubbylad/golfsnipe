/**
 * Vitest global setup: spin up a real, throwaway Postgres for the whole test run.
 *
 * Uses embedded-postgres on an ephemeral port with a temp data dir (wiped on
 * teardown), applies migrations via `prisma migrate deploy` (a no-op until the
 * first migration lands in Task 1.1), and exposes DATABASE_URL to the tests.
 *
 * DB-touching tests run against this real database — never mocked.
 */
import type { TestProject } from 'vitest/node';
import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address() as AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

export default async function setup(project: TestProject) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'brs-test-pg-'));
  const port = await getFreePort();
  const user = 'brs';
  const password = 'brs';
  const database = 'brs';

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user,
    password,
    authMethod: 'password',
    persistent: false, // ephemeral: stop() wipes the cluster
    onLog: () => {},
    onError: () => {},
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase(database);

  const databaseUrl = `postgresql://${user}:${password}@localhost:${port}/${database}`;
  process.env.DATABASE_URL = databaseUrl;
  project.provide('DATABASE_URL', databaseUrl);

  // Apply migrations. No-op today (zero migrations); exercised from Task 1.1.
  try {
    execFileSync(path.resolve('node_modules/.bin/prisma'), ['migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer };
    console.error(
      '[test] prisma migrate deploy failed:\n' + String(e.stdout ?? '') + String(e.stderr ?? ''),
    );
    throw err;
  }

  return async () => {
    await pg.stop();
    rmSync(dataDir, { recursive: true, force: true });
  };
}
