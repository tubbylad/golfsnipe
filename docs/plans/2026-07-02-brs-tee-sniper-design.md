# BRS Tee-Time Sniper — Design

**Date:** 2026-07-02
**Status:** Design approved — ready for implementation planning

## 1. Goal

A small, self-hosted web app that lets a handful of friends auto-book ("snipe") a
recurring golf tee time on **BRS Golf** the instant the tee sheet is released.

Primary target: **Saturday 07:45, 4 players**, released "Monday evening" (exact time
varies / unknown per club). Each user stores their own club login and sets that week's
playing partners; the bot logs in, watches the sheet, and secures the slot faster than
any human could.

## 2. Confirmed decisions

| Decision | Choice |
|---|---|
| Core job | **Auto-book (snipe)** — complete the booking automatically at release |
| Scope | **A few friends** — multi-user app, each with own club login + target |
| Release timing | **Unknown/varies** → poll-and-pounce a window; **learn** the real release time week over week |
| Players | **Vary weekly** → per-week "who's in?" form; secure the slot even if unfilled |
| Notifications | **SMS** (instant result) + **Email** (receipt) |
| Hosting | **Hetzner / Coolify** now; portable (Docker) → **UK colo** later for lower latency |
| Stack | **Node/TypeScript**, Next.js web + worker; **pure HTTP primary**, **Playwright fallback** |

## 3. Recon: BRS Golf reality (2026)

Read-only recon of public pages + four existing open-source bots.

- **Booking app is a plain server-rendered Symfony form app** — login + booking are
  ordinary `x-www-form-urlencoded` / multipart POSTs with scrapeable CSRF tokens.
  **No captcha, no PIN** — username (membership / card number) + password.
- **Cloudflare fronts everything but does NOT actively challenge the booking app.** Raw
  HTTP returns 200 with the full form; all prior-art bots use zero browser automation.
  → **Pure HTTP is viable and is the primary path.**
- **Availability is a clean JSON endpoint** — no browser needed even to read the sheet.
- **Two platforms coexist** (detect per club):
  - Modern "members app": `https://members.brsgolf.com/<club>` (Symfony; `rmm_sid`+`auth`
    cookies). **Target this first.**
  - Legacy PHP: `https://www.brsgolf.com/<club>` (`PHPSESSID`, `members_home.php`).
- **3-minute slot lock:** opening a slot ("Book Now") locks it server-side for 3 minutes.
- **Release = club-configurable fixed time that rolls forward** (e.g. 19:30 seven days
  ahead; 07:30 eight days ahead). No global time — user-configured / learned. Hot slots
  fill in ~5 min, sometimes seconds.
- **Ban risk is behavioural + human** — club admins get analytics flagging abusive
  patterns (spare-slot blocking, book-and-cancel). No documented WAF rate-limits;
  community politeness baseline = poll ~30s, re-login every ~5 min.

**Prior art to port from:**

- `niallhodgen/tee-time-booker` (Python) — reference login + `bookings/store` payloads.
- `Ronan-H/brs-butler` (TS/Node) — auth + `/tee-sheet/data/1/<date>` JSON polling + token refresh.
- `Darce87/BRS-login-script`, `pabrodez/brsGolfTelegramBot` — legacy surface.

## 4. Architecture

- **Web app (Next.js, Coolify/Docker)** — invite-only; add BRS account, define target,
  weekly "who's in?" form, dashboard.
- **Postgres** — users, encrypted BRS creds, targets, buddies, weekly runs + timelines.
- **Credential vault** — BRS passwords encrypted at rest (libsodium/age); key held
  **outside the DB** (env/secret on host), decrypted in-memory only at snipe time. BRS
  isn't OAuth, so a reversible secret is unavoidable — we just do it properly.
- **Snipe worker** — background process (node-cron / BullMQ). Per target: wake before
  window → login → poll → lock → book. The heart (§6).
- **HTTP client (primary)** — `undici`/fetch + cookie jar. **Playwright (fallback)** —
  only on a detected Cloudflare challenge (403/503 + `cf-mitigated`).
- **Notifier** — SMS (Hetzner sender) + Email (Resend), both writing run-logs.

Web + worker share one process at this scale; split later.

## 5. Data model

- **users** — app login (invite-only), name, email, phone (SMS).
- **brs_accounts** — user_id, club_slug, platform (modern|legacy), course_id (default 1),
  username (card no.), password_encrypted, last_login_ok_at.
- **targets** — brs_account_id, day_of_week (Sat), tee_time (07:45), holes (18), size (4),
  active; learned_release_at (nullable), poll_window.
- **players / buddies** — user_id, display_name, brs_golfer_id (resolved + cached), is_guest.
- **weekly_runs** — target_id, target_date, player_set (JSON snapshot), status
  (armed|won|lost|error|skipped), booking_ref, detected_release_at, timeline (JSON events).

Encryption key lives outside the DB.

## 6. Snipe engine

**Principle: everything expensive happens _before_ release; at the gun we fire one tiny request.**

Pre-position (seconds before release):

- Already **logged in** (session kept fresh, re-login ~5 min).
- Players **already resolved to golfer-IDs** (weekly form ran days ago).
- Target URL/date precomputed; **warm keep-alive HTTP/2 connection** held open.

**The race is one GET, not the whole booking.** BRS locks a slot for 3 min the instant
you open it → winning = landing the **slot-open GET** first, then completing the POST
calmly within the lock.

Timeline (once the release time is learned):

```
19:29:59.900  poll target-date JSON every ~300ms (NTP-synced clock)
19:30:00.140  07:45 flips bookable  →  fire slot-open GET
19:30:00.310  slot LOCKED to us (3-min hold)  ← race won here
19:30:00.9xx  POST booking (4 pre-resolved players)
19:30:01.4xx  CONFIRMED → SMS
```

Cadence + politeness:

- **Discovery (week 1 / until learned):** poll the window (e.g. Mon 18:00–21:00) at
  ~10–20s, tighten near detection; record `detected_release_at`.
- **Learned:** schedule a burst — poll ~300ms only in a tight ±window (T−2s … T+30s);
  gentle otherwise.
- Only ever poll the **single target date's** data endpoint. Never crawl the whole sheet.
  Never book-and-cancel.

Residual risks (honest):

1. Against **another bot** it's a latency race — optimise (colo near CF UK/IE edge, warm
   connection) but no guarantee.
2. **Week 1** unknown release → poll a window (still faster than humans), learn it.
3. **Cloudflare challenge at the burst** → HTTP stalls → Playwright fallback (slower);
   mitigate with a warm browser context on standby.

## 7. Booking flow (pure HTTP)

1. **Login** — GET `/login` → scrape `login_form[_token]` + cookies → POST
   `login_form[username|password|_token]`.
2. **Poll** — GET `/<club>/tee-sheet/data/1/<YYYY/MM/DD>?_=<epoch_ms>` → find
   `times["07:45"].tee_time.bookable`.
3. **Lock** — GET the slot `url` → scrape `member_booking_form[token]` (slot-lock) +
   `[_token]` (CSRF).
4. **Book** — POST `/<club>/bookings/store/1/<date>/07:45` as **multipart/form-data with
   an empty `files=[]`**, fields: `member_booking_form[token]`, `[holes]=18`,
   `[player_1]=<you>`, `[player_2..4]=<golfer-ids>`, `[guest-rate-2..4]`,
   `[vendor-tx-code]`, `[_token]`.

Hard sub-problems:

- **Name → golfer-ID resolver** — resolve each buddy **once** on add (member-search
  autocomplete endpoint, to be enumerated during build) and **cache the ID**. Guests →
  `guest-rate-N` + name.
- **Partial player set** — securing the slot > who's on it (BRS allows later amend up to
  the cut-off). Missing form → snipe anyway (you + known players, close/hold spares).
  **Never miss the slot over a missing name.**

Tokens are per-request (Symfony CSRF), re-scraped in steps 1 & 3. Platform (modern/legacy)
chosen at account-add.

## 8. Weekly UX + notifications

- **Setup (once):** invite → app login → add BRS account (verified by test-login) →
  define target → add buddies (resolve + cache IDs).
- **Weekly nudge:** SMS/email "Who's in for Sat DD Mon? Tap to set your 4." One-tap from
  buddies / add guest. No response → default group, amend later.
- **Monday eve:** fully automatic.
- **Result:** SMS instant (booked + conf / missed / login failed); Email receipt +
  timeline; Dashboard run list with expandable ms-timeline, login health, "test login
  now", "pause this week".

## 9. Test strategy + staying un-flagged

- **~80% read-only** (login, poll, token-scrape, resolver) → test freely, zero side effects.
- **Dry-run mode** — full pipeline (arm → detect → lock) but **stop before POST**, report
  "would have booked." Rehearse timing weekly, risk-free.
- **Booking POST** — validate once/twice on a **quiet far-future slot, then immediately
  cancel**, with the account-holder's knowledge. No test-loops on live slots.
- **Un-flagged** — single-date polling, fast only in the ~30s burst, gentle otherwise; no
  whole-sheet crawl; no book-and-cancel; re-login ~5 min. One 4-ball at release = a keen member.
- **ToS** — club/BRS terms may forbid automation; the risk (privileges revoked) sits with
  the account holder → **one-time acknowledgement at signup**. Not zero-risk; behaviour
  kept human-like to minimise it.

## 10. Prerequisites

- **A live BRS account to build against** (ideally modern `members.brsgolf.com`) — to
  enumerate the member-search endpoint and rehearse timing.
- Host secrets: encryption key, Postgres, Resend key, Hetzner SMS creds.

## 11. To discover during build

- Exact **member-search / autocomplete endpoint** (name → golfer-ID) and its params.
- Exact **guest-rate** field semantics (fees?).
- Each club's **real release time** (learned) and advance-booking window.
- Whether any friend's club is **legacy PHP** (adds a second endpoint set).
- Cloudflare behaviour under the real release burst (does it ever challenge?).

## 12. Build phases (rough)

1. **Skeleton** — repo, Next.js + Postgres + Docker/Coolify, invite-only auth, encrypted creds.
2. **BRS client (read-only)** — login, session, token-scrape, availability JSON,
   member-search resolver. Tested against a real account.
3. **Booking + dry-run** — the lock + POST path behind a dry-run flag; validate once on a quiet slot.
4. **Snipe engine** — scheduler, pre-warm, cadence, release-time learning, Playwright fallback.
5. **UX** — target setup, buddies, weekly form + nudge, dashboard/timeline.
6. **Notifications** — SMS + email wiring.
7. **Harden + go live** — one real Saturday in dry-run, then live.

## 13. References

- Endpoints: `members.brsgolf.com/<club>/{login, tee-sheet/1/<date>,
  tee-sheet/data/1/<date>, bookings/store/1/<date>/<HH:mm>}`
- Prior art: `niallhodgen/tee-time-booker`, `Ronan-H/brs-butler`,
  `Darce87/BRS-login-script`, `pabrodez/brsGolfTelegramBot`.
