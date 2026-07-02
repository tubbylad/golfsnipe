import 'vitest';

// Values passed from the global setup via `project.provide(...)` and read in
// tests / setup files via `inject(...)`.
declare module 'vitest' {
  interface ProvidedContext {
    DATABASE_URL: string;
  }
}
