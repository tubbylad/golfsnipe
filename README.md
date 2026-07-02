# BRS Tee-Time Sniper

Self-hosted, multi-user web app that auto-books ("snipes") a recurring golf tee time on
[BRS Golf](https://brsgolf.com) the instant the tee sheet is released.

- **Target:** e.g. Saturday 07:45, 4 players, released Monday evening.
- **How it wins:** pre-warms a logged-in session and pre-resolved players, then lands one
  slot-open GET at release to claim the 3-minute lock before any human can click through.
- **Stack:** Next.js + Postgres + a snipe worker; pure HTTP primary, Playwright fallback.

**Status:** design approved, pre-implementation.

See [`docs/plans/2026-07-02-brs-tee-sniper-design.md`](docs/plans/2026-07-02-brs-tee-sniper-design.md)
for the full design.

> Automation of your own club account. Club/BRS terms may restrict bots; users accept a
> one-time acknowledgement at signup. Behaviour is kept human-like and polite by design.
