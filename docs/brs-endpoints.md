# BRS endpoints — recorded from live recon (Task 2.0)

**Club:** Monifieth Golf Links · **Platform:** modern (`members.brsgolf.com/<club>`) · **Recon date:** 2026-08-14
**Account used:** the operator's Monifieth membership (a **dev/test** login). Credentials live only in the vault / operator's head — never committed; real member names & ids are anonymized out of every fixture.

The modern app is **Symfony (server-rendered login) + a Vue tee-sheet SPA** that talks to JSON endpoints.
All JSON endpoints below were called with header `X-Requested-With: XMLHttpRequest` while logged in.

---

## 1. Login  — `GET/POST /<club>/login`

- `GET /monifieth/login` renders the form. Fields (Symfony form named `login_form`):
  - `login_form[username]` — membership / **links season-ticket number** (a numeric id)
  - `login_form[password]`
  - `login_form[_token]` — **hidden CSRF**, scrape this from the GET before POSTing
  - `login_form[login]` — submit button name
- `POST /monifieth/login` (same URL, `application/x-www-form-urlencoded`) with those fields.
- **Success** = 302 → `/<club>` (home). Session cookies are **httpOnly** (not visible to JS; a cookie jar
  will carry them automatically). Only GA (`_ga`,`_gid`,`_gat_*`) cookies are JS-visible.
- **Login-success detection** for the client: after POST, GET home and check for a logout link
  (`a[href$="/logout"]`) / absence of the `login_form`.
- Fixture: `src/brs/__fixtures__/login-page.html` (real form; the `_token` value is expired/harmless).

## 2. Availability (poll)  — `GET /<club>/tee-sheet/data/<courseId>/<YYYY/MM/DD>?_=<epoch_ms>`

- Returns JSON: `{ title, warnings, casualBookingRules, times }`.
- `times` is an **object keyed by "HH:mm"** (NOT an array). Non-slot rows appear as markers:
  `{ "sunrise": true }`, `{ "sunset": true }`, `{ "sunset_alert": true }` — skip anything without a `tee_time`.
- Each real slot = `{ "tee_time": { ... } }`. Slot fields:

  | field | meaning |
  |---|---|
  | `bookable` | **THE flag the sniper keys on.** `true` ⇒ we may open/book it (via `url`). |
  | `url` | slot-open link, **populated iff `bookable`** (else `null`). See §4. |
  | `booked` | slot has ≥1 player. Can be `true` **and** `bookable:true` (a joinable partial 4-ball). |
  | `participants` | array of `{ name, has_buggy, is_buddy }`; empty seats are `{ name:null,... }`. |
  | `reservation`,`reservation_type`,`reservation_colour` | lead booker + colour (`#1896ff` member, `#E6E6E6` empty). |
  | `holes`, `buggies_remaining` | 18 / buggy availability. |
  | `reason`,`detail` | when NOT bookable: `"View Only"` / `"Members may view but not book this tee time."` |
  | `editable`, `unavailable_label` | edit-own-booking flag / label text. |

- `findSlot(json, "07:46")` ⇒ `json.times["07:46"]?.tee_time`; **bookable iff `.bookable === true`**, then GET `.url`.
- ⚠ **Tee interval is club-specific** — Monifieth is **8 min** (`07:30, 07:38, 07:46, 07:54 …`), so "07:45" ⇒ `07:46`. Don't hardcode `:45/:00`; store the exact string per target.
- Fixture: `src/brs/__fixtures__/tee-sheet-data.json` (anonymized; every state).

## 2a. ⭐ Release time — `casualBookingRules` (kills the "learn the release" guesswork)

For a date whose casual times are **not yet live**, the availability JSON's top-level
`casualBookingRules` array is populated with the EXACT release moment (it's `[]` once live):

```json
"casualBookingRules": [{
  "title": "Casual times will become live on 14 Aug 2026 at 19:00",
  "time": "2026-08-14T19:00:00+01:00",              // ISO-8601 w/ TZ — THE authoritative field
  "diffInMinutes": 411.9,
  "humanDiff": "6 hours from now",
  "countdownDiff": "51 minutes and 56 seconds"       // ⚠ BUGGY: constant across all dates — DO NOT use
}]
```

- **Scheduler reads `casualBookingRules[0].time` and fires the burst at that instant.** No polling-to-
  learn, no hardcoded weekday. Empty `[]` ⇒ the date is already live (snipe immediately / it's late).
- Trust `time` (cross-check `diffInMinutes`); **ignore `countdownDiff`** — it returned an identical
  "51 minutes…" for every date, clearly not per-date.
- ⚠ **The rule is PER-COURSE / PER-CLUB and varies — never hardcode it.** Monifieth Ashludie observed =
  **exactly 8 days ahead at 19:00 local**, rolling daily (22 Aug→14 Aug, 23 Aug→15 Aug, 29 Aug→21 Aug,
  05 Sep→28 Aug). A different club (e.g. the real end-user's) will publish its own `time`; the bot just
  reads whatever BRS puts there.
- This **replaces plan Task 4.4** (release-time learning) with a direct read. Keep only a tight
  poll-window guard around the stated `time` to absorb any clock skew at the actual flip.

## 3. ⚠ Per-course booking rights — courseId matters, and view-only is real

Course id is the `<courseId>` path segment. For **this member**, on 2026-08-15:

| courseId | course | result |
|---|---|---|
| 1 | **Medal** (championship) | 33 free slots, **0 bookable** — *"Members may view but not book"* (VIEW-ONLY) |
| 2 | — | HTTP 500 (not a valid course) |
| 3 | **Ashludie** (members' course, assumed) | 45 free, **46 bookable** ✅ |
| 4 | — | HTTP 500 |

- So a slot can be free yet `bookable:false` because **this membership can't book that course** — not a
  release-window artefact. The sniper must target a **course the account can actually book** (here: **3**).
- `BrsAccount.courseId` (schema default `1`) must be set **per account** — for this Monifieth account it's **3**.
- The club's rules are in a **"BOOKING INFO"** modal on the tee sheet, e.g. Medal:
  *"You can view Mon–Sun until 31 Jan 2027."* (view only — no book days granted).

## 4. Slot-open / lock  — `GET <url>` where url = `/<club>/bookings/book/<token>/<courseId>/<YYYYMMDD>/<HHmm>`

- Example: `/monifieth/bookings/book/YzdjM2U2MjE1Yzk3NGRi…%253D/3/20260815/1215`
- `<token>` is an opaque **double-URL-encoded base64** blob, unique per slot (from the availability JSON —
  do NOT construct it; take it verbatim from `.url`).
- GETting it **acquires the 3-minute server-side lock** and returns the booking form (§5). The lock is held
  in the **session** — there is **no `member_booking_form[token]` slot field** (the design's guess was wrong).
- Fixture: `src/brs/__fixtures__/booking-form.html` (anonymized).

## 5. Booking POST — `POST /<club>/bookings/store/<courseId>/<YYYYMMDD>/<HHmm>`  ✅ CAPTURED 2026-08-14

⚠ Corrects the design's guesses: it is **`application/x-www-form-urlencoded`** (NOT multipart), with
**no `files=[]`** and **no `guest-rate-N`** fields. Form `name="member_booking_form"`; `action` is the
compact course/date/time, e.g. `/monifieth/bookings/store/3/20260819/1419`. Body fields:

| field | value |
|---|---|
| `_token` | CSRF — **top-level name `_token`** (not bracketed); scrape from the booking-form HTML per attempt |
| `member_booking_form[holes]` | `9` or `18` |
| `member_booking_form[player_1]` | booker's **golfer-id**, comes pre-selected in the form (a numeric id, distinct from the login/season-ticket number) |
| `member_booking_form[player_2..4]` | golfer-id per partner · `-2` = Guest · empty = leave the seat open |
| `member_booking_form[player_N_buggy]` | checkbox `1` — send only when a buggy is taken, else omit |
| `member_booking_form[vendor-tx-code]` | empty for a standard member booking |
| `member_booking_form[payment-amount]` | empty for a standard member booking (guest/green fees may populate) |
| `member_booking_form[confirm_booking]` | submit trigger (empty value) |

- Scrape the **booker's own golfer-id** from `player_1` once per account and cache it (login username ≠ golfer-id).
- **Still pending (deliberately):** we have NOT sent a real POST. Validate once via dry-run → one real book on a
  quiet slot → cancel, with the account holder watching, to capture the confirmation shape (→ `bookingRef`).

## 6. ⭐ Member resolver (name → golfer-ID)  — `GET /<club>/member/data`

- **The blocker that turned out easy.** Returns the **ENTIRE club roster** (here 1,527 members), NOT a
  server-side search — the query string is **ignored**; Select2 filters client-side.
- Shape: `[{ "member_id": 4687, "first_name": "…", "last_name": "…", "initials": "" }, …]`
- ⇒ Resolver = **fetch once, cache the array, match locally** (surname/first-name), store `member_id` on
  `Player.brsGolferId`. Handles multi-match (e.g. two "Alex") in our code, not theirs.
- `member_id` is the numeric **golfer-ID** used as `player_2..4` in the booking POST.
- Fixture: `src/brs/__fixtures__/member-data.json` (anonymized; 6 members incl. a duplicate first name).

## 7. Other

- **Buddy list:** `GET /monifieth/buddy-list` (UI) + `GET /monifieth/buddy-list/data` (your saved buddies);
  add via a Select2 fed by §6, then "ADD TO BUDDY LIST". Buddies render blue (`is_buddy:true`) on the sheet.
- **ToS:** https://www.brsgolf.com/web/members-app-terms-of-service (for the Phase 7 one-time ack).
- **My Account:** `/monifieth/accounts`. **Bookings:** `/monifieth/bookings`.
- **Politeness (already respected in recon):** single-date polls, ~200-250ms spacing, read-only, no slot
  opened, no booking. Never crawl the whole sheet; burst only in the release window.

## Open questions for the operator

1. **Which course do you actually want to snipe?** The Medal (course 1) is **view-only** on this account;
   only course 3 is bookable. If the goal was Saturday mornings on the Medal, online sniping can't work for
   this membership — need to confirm the real target.
2. Real release day/time for the target course (to schedule the burst) — to be learned, but a starting hint helps.
