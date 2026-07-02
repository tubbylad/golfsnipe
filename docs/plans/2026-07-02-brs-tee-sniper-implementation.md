# BRS Tee-Time Sniper — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a self-hosted, multi-user web app that auto-books ("snipes") a recurring BRS Golf tee time (e.g. Sat 07:45 × 4) the instant the tee sheet is released.

**Architecture:** Next.js (App Router) web + an in-process snipe worker, backed by Postgres. BRS passwords are encrypted at rest with a key held outside the DB. The snipe path is pure HTTP (login → poll JSON availability → grab the 3-minute slot lock → POST booking), with a Playwright fallback if Cloudflare ever challenges. Everything expensive (login, resolving players to golfer-IDs) happens before release so the release-moment action is a single request.

**Tech Stack:** TypeScript, Next.js (App Router), Prisma + Postgres, Vitest, `libsodium-wrappers` (cred vault), `@node-rs/argon2` (password hashing), `undici`/`fetch` + `tough-cookie` + `cheerio` (BRS client), `node-cron` (scheduler), Playwright (fallback + recon), Resend (email), Hetzner SMS sender.

**Design reference:** `docs/plans/2026-07-02-brs-tee-sniper-design.md`

---

## Stack decisions (locked for this plan)

- **ORM = Prisma.** Well-documented, first-class migrations. (Drizzle is a fine lighter alternative; not used here.)
- **Auth = custom email+password, DB-backed opaque sessions, invite-only.** No Auth.js — the user set is tiny and trusted; a sessions table + httpOnly cookie is simpler and auditable.
- **Cred vault = libsodium `crypto_secretbox`** (XSalsa20-Poly1305). Key = `BRS_VAULT_KEY` (32 bytes, base64) from env, never in the DB.
- **Tests = Vitest.** Scraper/parser logic is tested against **recorded fixtures** (real BRS responses saved to disk), never against the live site.
- **Worker = `node-cron` in-process** to start (few targets). Swap to BullMQ only if we outgrow it (YAGNI).

## Environment variables (`.env`, gitignored; `.env.example` committed)

```
DATABASE_URL=postgresql://brs:brs@localhost:5432/brs
BRS_VAULT_KEY=            # openssl rand -base64 32
APP_ORIGIN=http://localhost:3000
RESEND_API_KEY=
SMS_ENDPOINT=            # Hetzner SMS sender — interface TBD (see Phase 6)
SMS_SENDER=GolfSniper
```

## Prerequisite gate

- **Phases 0–1 need no BRS access** — build immediately.
- **Phases 2–7 are GATED on a live BRS account** (ideally modern `members.brsgolf.com`) to record fixtures and rehearse timing. Do not start Phase 2 until that login is in hand.

---

# PHASE 0 — Scaffolding (no BRS access needed)

### Task 0.1: Initialize the Next.js + TypeScript app

**Files:** creates the app skeleton in the repo root.

**Step 1:** Scaffold (run in repo root; keep the existing `docs/`, `README.md`, `.gitignore`):
```bash
npx create-next-app@latest . --ts --app --eslint --src-dir --use-npm --no-tailwind --import-alias "@/*"
```
Answer "yes" to overwriting nothing critical; if it refuses due to existing files, scaffold in a temp dir and copy in.

**Step 2:** Add dev/test deps:
```bash
npm i -D vitest @vitest/coverage-v8 tsx
npm i zod
```

**Step 3:** Add `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'], globals: true },
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
});
```

**Step 4:** Add scripts to `package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`.

**Step 5:** Sanity test — create `src/lib/sanity.test.ts`:
```ts
import { expect, test } from 'vitest';
test('vitest runs', () => { expect(1 + 1).toBe(2); });
```
Run: `npm test` → expect 1 passed.

**Step 6:** Commit.
```bash
git add -A && git commit -m "chore: scaffold Next.js + TypeScript + Vitest"
```

### Task 0.2: Local Postgres + Prisma

**Step 1:** `docker-compose.yml` (local dev DB):
```yaml
services:
  db:
    image: postgres:16
    environment: { POSTGRES_USER: brs, POSTGRES_PASSWORD: brs, POSTGRES_DB: brs }
    ports: ["5432:5432"]
    volumes: [ "brs_pgdata:/var/lib/postgresql/data" ]
volumes: { brs_pgdata: {} }
```
Run: `docker compose up -d db`.

**Step 2:** Install Prisma: `npm i -D prisma && npm i @prisma/client && npx prisma init --datasource-provider postgresql`.

**Step 3:** Put `DATABASE_URL` in `.env`. Create `.env.example` (same keys, empty values). Confirm `.env` is gitignored (it is).

**Step 4:** Commit `docker-compose.yml`, `prisma/schema.prisma`, `.env.example`.

### Task 0.3: Zod-validated env module

**Files:** Create `src/lib/env.ts`, `src/lib/env.test.ts`.

**Step 1 (test first):**
```ts
import { expect, test } from 'vitest';
test('parseEnv throws when BRS_VAULT_KEY missing', async () => {
  const { parseEnv } = await import('./env');
  expect(() => parseEnv({ DATABASE_URL: 'x', APP_ORIGIN: 'x' })).toThrow();
});
```
**Step 2:** Run → fails (no `parseEnv`).
**Step 3:** Implement `src/lib/env.ts` with a zod schema requiring `DATABASE_URL`, `BRS_VAULT_KEY`, `APP_ORIGIN`, optional `RESEND_API_KEY`, `SMS_ENDPOINT`, `SMS_SENDER`; export `parseEnv(source=process.env)` and a memoized `env`.
**Step 4:** Run → passes. **Step 5:** Commit.

### Task 0.4: Production Dockerfile + Coolify note

**Step 1:** Add a multi-stage `Dockerfile` (Next.js standalone output; set `output: 'standalone'` in `next.config.js`).
**Step 2:** Add `docs/DEPLOY.md`: Coolify app on `root@88.99.211.189`, Postgres as a Coolify DB, set env incl. `BRS_VAULT_KEY`; note the future UK-colo move is a redeploy. (Reference the [add-a-domain/custom_labels] recipe from memory when wiring a domain.)
**Step 3:** Commit.

---

# PHASE 1 — Data model, auth, credential vault (no BRS access needed)

### Task 1.1: Prisma schema + first migration

**Files:** Modify `prisma/schema.prisma`; creates `prisma/migrations/*`.

**Step 1:** Define models:
```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String
  phone        String?
  passwordHash String
  isAdmin      Boolean  @default(false)
  createdAt    DateTime @default(now())
  sessions     Session[]
  brsAccounts  BrsAccount[]
  players      Player[]
}
model Session {
  id        String   @id @default(cuid()) // opaque cookie value
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())
}
model Invite {
  id        String   @id @default(cuid())
  token     String   @unique
  email     String?
  usedById  String?
  expiresAt DateTime
  createdAt DateTime @default(now())
}
enum BrsPlatform { modern legacy }
model BrsAccount {
  id             String   @id @default(cuid())
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  clubSlug       String
  platform       BrsPlatform @default(modern)
  courseId       Int      @default(1)
  username       String
  passwordCipher String   // base64 (libsodium secretbox)
  passwordNonce  String   // base64
  lastLoginOkAt  DateTime?
  createdAt      DateTime @default(now())
  targets        Target[]
}
model Target {
  id              String   @id @default(cuid())
  brsAccountId    String
  brsAccount      BrsAccount @relation(fields: [brsAccountId], references: [id], onDelete: Cascade)
  dayOfWeek       Int      @default(6)     // 6 = Saturday
  teeTime         String   @default("07:45")
  holes           Int      @default(18)
  size            Int      @default(4)
  active          Boolean  @default(true)
  learnedReleaseAt String? // "19:30" once learned
  pollWindowStart String   @default("18:00")
  pollWindowEnd   String   @default("21:00")
  createdAt       DateTime @default(now())
  weeklyRuns      WeeklyRun[]
}
model Player {
  id           String  @id @default(cuid())
  userId       String
  user         User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  displayName  String
  brsGolferId  String?
  isGuest      Boolean @default(false)
  createdAt    DateTime @default(now())
}
enum RunStatus { pending armed won lost error skipped }
model WeeklyRun {
  id                String    @id @default(cuid())
  targetId          String
  target            Target    @relation(fields: [targetId], references: [id], onDelete: Cascade)
  targetDate        DateTime  @db.Date
  status            RunStatus @default(pending)
  playerSet         Json?
  bookingRef        String?
  detectedReleaseAt DateTime?
  timeline          Json?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}
```
**Step 2:** `npx prisma migrate dev --name init` → expect a migration + generated client.
**Step 3:** Add `src/lib/db.ts` exporting a singleton `PrismaClient`.
**Step 4:** Commit schema + migration + `db.ts`.

### Task 1.2: Credential vault (SECURITY-CRITICAL — full code + tests)

**Files:** Create `src/lib/vault.ts`, `src/lib/vault.test.ts`.

**Step 1 (write the failing tests):**
```ts
import { beforeAll, expect, test } from 'vitest';
import _sodium from 'libsodium-wrappers';

beforeAll(async () => {
  await _sodium.ready;
  process.env.BRS_VAULT_KEY = _sodium.to_base64(
    _sodium.randombytes_buf(_sodium.crypto_secretbox_KEYBYTES),
    _sodium.base64_variants.ORIGINAL,
  );
});

test('round-trips a secret', async () => {
  const { encryptSecret, decryptSecret } = await import('./vault');
  const { cipher, nonce } = await encryptSecret('hunter2');
  expect(await decryptSecret(cipher, nonce)).toBe('hunter2');
});
test('uses a fresh nonce each call', async () => {
  const { encryptSecret } = await import('./vault');
  const a = await encryptSecret('x'); const b = await encryptSecret('x');
  expect(a.cipher).not.toBe(b.cipher);
});
test('rejects a tampered ciphertext', async () => {
  const { encryptSecret, decryptSecret } = await import('./vault');
  const { cipher, nonce } = await encryptSecret('x');
  const bad = cipher.slice(0, -2) + (cipher.endsWith('A') ? 'BB' : 'AA');
  await expect(decryptSecret(bad, nonce)).rejects.toThrow();
});
```
**Step 2:** Run → fails (no `vault`). Install: `npm i libsodium-wrappers && npm i -D @types/libsodium-wrappers`.
**Step 3 (implement `src/lib/vault.ts`):**
```ts
import _sodium from 'libsodium-wrappers';

let ready: Promise<typeof _sodium> | null = null;
const sodium = () => (ready ??= _sodium.ready.then(() => _sodium));

async function key() {
  const s = await sodium();
  const b64 = process.env.BRS_VAULT_KEY;
  if (!b64) throw new Error('BRS_VAULT_KEY is not set');
  const k = s.from_base64(b64, s.base64_variants.ORIGINAL);
  if (k.length !== s.crypto_secretbox_KEYBYTES) throw new Error('BRS_VAULT_KEY must be 32 bytes');
  return k;
}
export async function encryptSecret(plaintext: string) {
  const s = await sodium(); const k = await key();
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const c = s.crypto_secretbox_easy(s.from_string(plaintext), nonce, k);
  const enc = (u: Uint8Array) => s.to_base64(u, s.base64_variants.ORIGINAL);
  return { cipher: enc(c), nonce: enc(nonce) };
}
export async function decryptSecret(cipherB64: string, nonceB64: string) {
  const s = await sodium(); const k = await key();
  const dec = (b: string) => s.from_base64(b, s.base64_variants.ORIGINAL);
  const plain = s.crypto_secretbox_open_easy(dec(cipherB64), dec(nonceB64), k);
  return s.to_string(plain);
}
```
**Step 4:** Run → all pass. **Step 5:** Commit. Document `openssl rand -base64 32` for `BRS_VAULT_KEY` in `.env.example`.

### Task 1.3: Password hashing + user creation

**Files:** `src/lib/password.ts` (+ test), `src/lib/users.ts` (+ test).
- TDD `hashPassword`/`verifyPassword` with `@node-rs/argon2` (`npm i @node-rs/argon2`): hash≠plaintext, verify true on match, false on mismatch.
- TDD `createUser({email,name,password})` writes a User with a hash (use a test DB or mock Prisma); duplicate email throws.
- Commit after each green.

### Task 1.4: Sessions (DB-backed, httpOnly cookie)

**Files:** `src/lib/session.ts` (+ test).
- TDD `createSession(userId)` → returns id, row with `expiresAt` ~30 days out.
- TDD `validateSession(id)` → returns user for a live session, `null` for expired/missing.
- TDD `invalidateSession(id)`.
- Helpers `setSessionCookie`/`readSessionCookie`/`clearSessionCookie` (Next `cookies()`), httpOnly + secure + sameSite=lax.
- Commit.

### Task 1.5: Invite-only signup + login pages

**Files:** `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`, server actions in `src/app/(auth)/actions.ts`, plus a one-off admin/seed script `scripts/seed-admin.ts`.
- `seed-admin.ts`: create the first admin user from env prompts (run once).
- Signup requires a valid unused `Invite.token` (from the URL); consumes it; creates user; starts session.
- Login: verify password, start session, redirect to `/dashboard`.
- Minimal UI (no styling yet). Manual test: seed admin → create an invite row → sign up → land on dashboard.
- Commit.

### Task 1.6: "Add BRS account" flow (uses the vault)

**Files:** `src/app/dashboard/accounts/new/page.tsx`, action in `src/app/dashboard/accounts/actions.ts`, `src/lib/brs-accounts.ts` (+ test).
- Form: club slug, platform (modern/legacy), course id (default 1), username, password.
- `saveBrsAccount()` encrypts the password via `encryptSecret` and stores `passwordCipher`+`passwordNonce` — **the plaintext password is never persisted**. TDD this: assert the stored row contains no plaintext and decrypts back to the input.
- Commit.

### Task 1.7: Protected dashboard shell

**Files:** `src/app/dashboard/layout.tsx` (session guard → redirect to /login if none), `src/app/dashboard/page.tsx` (list BRS accounts + targets, empty states).
- Manual test: unauthenticated → redirected; authenticated → sees their accounts.
- Commit.

**End of Phase 1: a deployable multi-user app with encrypted BRS credential storage — zero BRS calls yet.** Good checkpoint to deploy to Coolify (Task 0.4 / DEPLOY.md) and confirm it runs on the Hetzner box.

---

# PHASE 2 — BRS client, read-only (GATED on a live BRS account)

> **Discovery-first.** We cannot write exact code until we've seen the real responses. Record them once, commit them as fixtures, then TDD parsers against the fixtures. Never hit the live site from tests.

### Task 2.0 (DISCOVERY): Record the real flows
- Using the friend's login, drive a **Playwright** session (`scripts/recon/*.ts`) and **save to `src/brs/__fixtures__/`**: the login page HTML (for `login_form[_token]`), a successful login response/cookies, a `tee-sheet/data/1/<date>` JSON body, a slot-open page HTML (for `member_booking_form[token]` + `[_token]`), and — critically — the **member-search / autocomplete** request+response (watch the network tab while typing a partner's name).
- Write `docs/brs-endpoints.md` capturing exact URLs, params, field names, cookie names, and the modern-vs-legacy differences observed. **This unblocks concrete code for 2.1–2.4.**

### Task 2.1: `BrsSession` — login + cookie jar + token scrape
- `undici` + `tough-cookie`; `cheerio` to pull `login_form[_token]`.
- TDD `parseLoginToken(html)` against the fixture. TDD cookie persistence. Live login behind an integration test tagged `@live` (run manually, not in CI).

### Task 2.2: Availability poll + parser
- `getAvailability(date)` → GET the JSON endpoint; `findSlot(json, "07:45")` → `{bookable, booked, url}`.
- TDD `findSlot` against the JSON fixture (bookable, booked, and not-yet-released cases).

### Task 2.3: Member-search resolver (name → golfer-ID)
- `resolveGolferId(session, name)` calling the endpoint found in 2.0; cache to `Player.brsGolferId`.
- TDD the response parser against the fixture; handle no-match / multi-match.

### Task 2.4: Platform detection
- `detectPlatform(clubSlug)` → modern vs legacy by which base responds; store on `BrsAccount`. TDD against fixtures of each.

---

# PHASE 3 — Booking + dry-run (GATED)

### Task 3.1: Slot-lock GET + booking-token scrape
- `openSlot(session, slotUrl)` → GET (acquires the 3-min lock), scrape `member_booking_form[token]` + `[_token]`. TDD scrape against fixture.

### Task 3.2: Booking POST builder
- Build the multipart body **with an empty `files=[]`**, `member_booking_form[holes]=18`, `[player_1]`=booker, `[player_2..4]`=resolved IDs, `[guest-rate-*]`, `[_token]`. TDD the body builder (field presence/format) — pure function, no network.

### Task 3.3: `bookSlot()` + **dry-run flag**
- `bookSlot(target, playerSet, { dryRun })`: run login→poll→openSlot; if `dryRun`, **stop before POST** and return `wouldBook` with the assembled payload; else POST and parse the confirmation → `bookingRef`.
- Integration `@live`: run in dry-run against a real sheet. Then **one** real POST on a quiet far-future slot, capture the confirmation shape, **cancel it manually**. Record the confirmation as a fixture; TDD the confirmation parser.
- Commit.

---

# PHASE 4 — Snipe engine (GATED)

### Task 4.1: Scheduler
- `node-cron` job per active target that wakes at `pollWindowStart` on the target weekday; computes `targetDate` (next matching Saturday within the club's advance window).

### Task 4.2: Pre-warm + cadence
- On arm: login, ensure players resolved, hold a warm connection. Poll cadence: gentle (10–20s) until near the learned time, burst (~300ms) in `[T−2s, T+30s]`. First run has no learned time → poll the whole window at ~15s.

### Task 4.3: Pounce
- On `bookable`, immediately `openSlot` (win the lock), then `bookSlot`. Record `detectedReleaseAt`; write the ms-timeline to `WeeklyRun.timeline`; set status won/lost/error.

### Task 4.4: Release-time learning
- After a successful detect, store `detectedReleaseAt` → update `Target.learnedReleaseAt` (rolling average / latest). Next week schedules the burst around it.

### Task 4.5: Cloudflare-challenge fallback
- Detect 403/503 + `cf-mitigated`; if seen, re-run the critical path via a **pre-warmed Playwright context**. Log that the fallback fired.

---

# PHASE 5 — Weekly UX (partially GATED — buddies need 2.3)

- **Target setup** page (day/time/holes/size, poll window).
- **Buddies**: add/edit players; resolve+cache golfer-IDs (needs 2.3).
- **Weekly "who's in?"** form → writes `WeeklyRun.playerSet`; default to last week's set if unanswered.
- **Dashboard**: weekly-run list with expandable ms-timeline, BRS-login health, "test login now", "pause this week".

---

# PHASE 6 — Notifications

### Task 6.1: Email (Resend)
- `sendEmail()` via Resend; booked-receipt + timeline template. TDD the template renderer (pure) against a sample run.

### Task 6.2: SMS (Hetzner sender)
- **DISCOVERY:** read `personal-teeth-reminder-cron` memory / inspect `root@88.99.211.189` to learn the exact send mechanism (gateway/command) and sender id.
- `sendSms(to, body)` wrapping it; instant booked/missed/login-failed messages. Normalize to UK mobile (`447…`) — reuse the MRM `normalizeMobile` idea; don't text landlines.

### Task 6.3: Wire into the run lifecycle
- On won/lost/error → SMS (instant) + email (receipt), both appended to the timeline.

---

# PHASE 7 — Harden + go live

- One real Saturday in **dry-run**, review the timeline (did we detect the release, would we have won?).
- Add the **one-time ToS acknowledgement** at signup.
- Flip the first user live. Watch the first live run closely; tune cadence/pre-warm.
- Backup/restore note for Postgres; confirm `BRS_VAULT_KEY` is backed up **separately** from the DB.

---

## Cross-cutting rules

- **TDD**: parsers/builders are pure and fixture-tested; anything hitting BRS is an `@live` integration test run manually, never in CI.
- **Politeness (non-negotiable)**: poll only the single target date; burst only in the ~30s window; re-login ~5 min; never crawl the whole sheet; never book-and-cancel to test on live slots.
- **Frequent commits**: one per green step.
- **Secrets**: `.env` gitignored; `BRS_VAULT_KEY` and DB backed up separately.
