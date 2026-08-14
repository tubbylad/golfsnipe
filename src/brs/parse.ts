import * as cheerio from 'cheerio';

/** Scrape the Symfony CSRF token from the modern-platform login page (`login_form[_token]`). */
export function parseLoginToken(html: string): string {
  const $ = cheerio.load(html);
  const token = $('input[name="login_form[_token]"]').attr('value');
  if (!token) throw new Error('login_form[_token] not found in login page HTML');
  return token;
}

/**
 * Derive the account fields from a BRS URL the user can just paste (their tee-sheet
 * or booking page). Host → platform, first path segment → club slug, and the numeric
 * segment after `tee-sheet`/`book` → course. Returns null for a non-BRS or invalid URL.
 */
export function parseBrsUrl(
  input: string,
): { slug: string; platform: 'modern' | 'legacy'; courseId: number | null } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  let platform: 'modern' | 'legacy';
  if (host === 'members.brsgolf.com') platform = 'modern';
  else if (host === 'www.brsgolf.com' || host === 'brsgolf.com') platform = 'legacy';
  else return null;

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  const ts = parts.indexOf('tee-sheet');
  const bk = parts.indexOf('book');
  let courseId: number | null = null;
  if (ts >= 0 && /^\d+$/.test(parts[ts + 1] ?? '')) courseId = Number(parts[ts + 1]);
  else if (bk >= 0 && /^\d+$/.test(parts[bk + 2] ?? '')) courseId = Number(parts[bk + 2]);

  return { slug: parts[0], platform, courseId };
}

export interface SlotParticipant {
  name: string | null;
  hasBuggy: boolean;
  isBuddy: boolean;
}

export interface Slot {
  time: string;
  bookable: boolean;
  booked: boolean;
  /** Slot-open URL (acquires the 3-min lock on GET); populated only when bookable. */
  url: string | null;
  holes: number | null;
  reservation: string | null;
  participants: SlotParticipant[];
}

interface RawParticipant {
  name: string | null;
  has_buggy: boolean;
  is_buddy: boolean;
}
interface RawTeeTime {
  bookable: boolean;
  booked: boolean;
  url: string | null;
  holes: number | null;
  reservation: string | null;
  participants: RawParticipant[];
}
interface Availability {
  times: Record<string, { tee_time?: RawTeeTime } | undefined>;
}

export interface ReleaseInfo {
  /** ISO-8601 with offset, e.g. "2026-08-14T19:00:00+01:00" — the authoritative release instant. */
  time: string;
  title: string;
}

/**
 * When a date's casual times are not yet live, the payload carries a `casualBookingRules`
 * entry with the exact release moment; once live the array is empty. Returns null when live.
 */
export function parseReleaseTime(availability: {
  casualBookingRules?: { time: string; title: string }[];
}): ReleaseInfo | null {
  const rule = availability.casualBookingRules?.[0];
  if (!rule) return null;
  return { time: rule.time, title: rule.title };
}

export interface Member {
  /** BRS golfer-id — the numeric value used as player_1..4 in a booking. */
  golferId: number;
  firstName: string;
  lastName: string;
  initials: string;
}

interface RawMember {
  member_id: number;
  first_name: string;
  last_name: string;
  initials: string;
}

/** Normalise the full club roster (`GET /<club>/member/data`) — matched locally, never server-side. */
export function parseRoster(data: RawMember[]): Member[] {
  return data.map((m) => ({
    golferId: m.member_id,
    firstName: m.first_name,
    lastName: m.last_name,
    initials: m.initials,
  }));
}

const normaliseName = (s: string) =>
  s
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Match a typed name against the roster. Accepts "first last", "last first",
 * "last, first", or surname-only. Returns all matches — 0 = none, 1 = unique,
 * >1 = ambiguous (the caller disambiguates).
 */
export function matchMembers(roster: Member[], query: string): Member[] {
  const q = normaliseName(query);
  if (!q) return [];
  return roster.filter((m) => {
    const first = normaliseName(m.firstName);
    const last = normaliseName(m.lastName);
    return [`${first} ${last}`, `${last} ${first}`, last].includes(q);
  });
}

export interface BookingForm {
  /** POST target: `/<club>/bookings/store/<course>/<YYYYMMDD>/<HHmm>`. */
  action: string;
  /** Top-level `_token` CSRF field (not bracketed). */
  csrfToken: string;
  /** player_1 comes pre-selected to the booker's golfer-id; null if absent. */
  bookerGolferId: number | null;
}

/**
 * Parse the booking form returned by GETting a slot's lock URL: the POST action,
 * the CSRF token, and the pre-selected booker golfer-id. The 3-min slot lock is
 * held in the session — there is no slot-token form field to scrape.
 */
export function parseBookingForm(html: string): BookingForm {
  const $ = cheerio.load(html);
  // Fields are selected document-wide by their unique names: in the live markup the
  // player selects render outside the <form name="member_booking_form"> element.
  const action = $('form[name="member_booking_form"]').attr('action');
  if (!action) throw new Error('member_booking_form action not found');
  const csrfToken = $('input[name="_token"]').first().attr('value');
  if (!csrfToken) throw new Error('member_booking_form _token not found');
  const player1 = $('select[name="member_booking_form[player_1]"]');
  const selected =
    player1.find('option[selected]').attr('value') ||
    player1
      .find('option')
      .filter((_, o) => !!$(o).attr('value'))
      .first()
      .attr('value');
  const n = Number(selected);
  const bookerGolferId = selected && Number.isFinite(n) ? n : null;
  return { action, csrfToken, bookerGolferId };
}

/**
 * Look up a tee time (e.g. `"07:46"`) in an availability payload and normalise it.
 * `times` is keyed by "HH:mm"; marker rows (sunrise/sunset) and absent times → null.
 */
export function findSlot(availability: Availability, time: string): Slot | null {
  const entry = availability.times[time];
  if (!entry || !entry.tee_time) return null;
  const t = entry.tee_time;
  return {
    time,
    bookable: t.bookable,
    booked: t.booked,
    url: t.url,
    holes: t.holes,
    reservation: t.reservation,
    participants: t.participants.map((p) => ({
      name: p.name,
      hasBuggy: p.has_buggy,
      isBuddy: p.is_buddy,
    })),
  };
}
