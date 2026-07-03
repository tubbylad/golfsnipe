import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup-env.ts'],
    // The global setup boots ONE shared Postgres for the whole run; every worker
    // connects to it. Running test files in parallel forks would let DB tests
    // race on that shared database. Serialise files so DB state is deterministic
    // (each DB suite additionally truncates via resetDb() in beforeEach). The
    // suite is I/O-bound on a single Postgres, so this costs little.
    fileParallelism: false,
  },
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
});
