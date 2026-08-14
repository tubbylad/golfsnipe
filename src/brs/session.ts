import { CookieJar } from 'tough-cookie';
import {
  findSlot,
  parseBookingForm,
  parseLoginToken,
  parseReleaseTime,
  parseRoster,
  type Member,
  type ReleaseInfo,
  type Slot,
} from './parse';
import { buildBookingBody, type PlayerSeat } from './booking';

export interface BookSlotOptions {
  holes?: 9 | 18;
  /** player_2..4 — golfer-ids, -2 for a guest, null for an open seat. */
  partners?: PlayerSeat[];
  /** Parallel to `[booker, ...partners]`; true = that player takes a buggy. */
  buggies?: boolean[];
  /** Override the form's pre-selected player_1 booker golfer-id. */
  bookerGolferId?: number;
  /** Stop before POSTing and return the assembled payload. */
  dryRun?: boolean;
}

export type BookResult =
  | { status: 'would-book'; action: string; body: string; players: PlayerSeat[] }
  | { status: 'booked'; action: string; bookingRef: string | null }
  | { status: 'error'; reason: string; httpStatus?: number };

const DEFAULT_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export interface BrsSessionOptions {
  clubSlug: string;
  baseUrl?: string;
  userAgent?: string;
  /** Injectable for tests; defaults to the global fetch (undici). */
  fetchImpl?: typeof fetch;
}

/** Format a Date as the `YYYY/MM/DD` path segment BRS expects (UTC-safe, date-only). */
export function toDatePath(date: Date | string): string {
  if (typeof date === 'string') return date;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

/**
 * A logged-in BRS member session over pure HTTP (no browser). Holds a cookie jar,
 * scrapes the Symfony CSRF token, and exposes the read paths the sniper needs.
 * All booking-mutation lives in bookSlot() (Phase 3), not here.
 */
export class BrsSession {
  private readonly jar = new CookieJar();
  private readonly origin: string;
  private readonly base: string;
  private readonly ua: string;
  private readonly fetchImpl: typeof fetch;
  private loggedIn = false;

  constructor(opts: BrsSessionOptions) {
    this.origin = (opts.baseUrl ?? 'https://members.brsgolf.com').replace(/\/+$/, '');
    this.base = `${this.origin}/${opts.clubSlug}`;
    this.ua = opts.userAgent ?? DEFAULT_UA;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  get isLoggedIn(): boolean {
    return this.loggedIn;
  }

  private async absorbCookies(res: Response, url: string): Promise<void> {
    const setCookies =
      (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const c of setCookies) {
      try {
        await this.jar.setCookie(c, url);
      } catch {
        /* ignore malformed/foreign cookies */
      }
    }
  }

  /** Low-level request against the club base (or an absolute URL), carrying the jar. */
  private async request(
    path: string,
    init: RequestInit & { xhr?: boolean } = {},
  ): Promise<Response> {
    const url = path.startsWith('http')
      ? path
      : path.startsWith('/' + this.base.split('/').pop())
        ? `${this.origin}${path}`
        : `${this.base}${path}`;
    const cookie = await this.jar.getCookieString(url);
    const { xhr, headers, ...rest } = init;
    const res = await this.fetchImpl(url, {
      ...rest,
      redirect: 'manual',
      headers: {
        'User-Agent': this.ua,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(xhr ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
        ...((headers as Record<string, string>) ?? {}),
      },
    });
    await this.absorbCookies(res, url);
    return res;
  }

  /** GET /login → scrape token → POST credentials → verify the 302 to home. */
  async login(username: string, password: string): Promise<void> {
    const getRes = await this.request('/login');
    const token = parseLoginToken(await getRes.text());
    const body = new URLSearchParams({
      'login_form[username]': username,
      'login_form[password]': password,
      'login_form[_token]': token,
      'login_form[login]': '',
    });
    const postRes = await this.request('/login', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: this.origin,
        Referer: `${this.base}/login`,
      },
    });
    const location = postRes.headers.get('location') ?? '';
    if (postRes.status !== 302 || location.includes('/login')) {
      throw new Error(`BRS login failed (status ${postRes.status}, location "${location}")`);
    }
    this.loggedIn = true;
  }

  /** Raw availability payload for a course/date (JSON). */
  async getAvailability(courseId: number, date: Date | string): Promise<unknown> {
    const res = await this.request(
      `/tee-sheet/data/${courseId}/${toDatePath(date)}?_=${Date.now()}`,
      { xhr: true },
    );
    if (res.status !== 200) throw new Error(`getAvailability HTTP ${res.status}`);
    return res.json();
  }

  /** A single normalised slot, or null (marker/absent). */
  async getSlot(courseId: number, date: Date | string, time: string): Promise<Slot | null> {
    const json = await this.getAvailability(courseId, date);
    return findSlot(json as Parameters<typeof findSlot>[0], time);
  }

  /** The date's release time, or null when already live. */
  async getReleaseInfo(courseId: number, date: Date | string): Promise<ReleaseInfo | null> {
    const json = await this.getAvailability(courseId, date);
    return parseReleaseTime(json as Parameters<typeof parseReleaseTime>[0]);
  }

  /**
   * Best-effort: probe candidate course ids on a date and return the first one that
   * has a bookable slot (i.e. this member can actually book it). Null if none do.
   * Used to auto-fill the course when the user pastes only a bare club URL.
   */
  async detectBookableCourse(
    date: Date | string,
    candidates: number[] = [1, 2, 3, 4],
  ): Promise<number | null> {
    for (const courseId of candidates) {
      try {
        const json = await this.getAvailability(courseId, date);
        const times = (json as { times?: Record<string, unknown> }).times ?? {};
        for (const time of Object.keys(times)) {
          if (findSlot(json as Parameters<typeof findSlot>[0], time)?.bookable) return courseId;
        }
      } catch {
        // course id not valid for this club (e.g. HTTP 500) — try the next
      }
    }
    return null;
  }

  /** The full club roster (fetch once, cache; matching happens locally). */
  async getRoster(): Promise<Member[]> {
    const res = await this.request(`/member/data?_=${Date.now()}`, { xhr: true });
    if (res.status !== 200) throw new Error(`getRoster HTTP ${res.status}`);
    return parseRoster((await res.json()) as Parameters<typeof parseRoster>[0]);
  }

  /** GET a slot's lock URL (acquires the 3-min lock) → the booking-form HTML. */
  async openSlot(slotUrl: string): Promise<string> {
    const res = await this.request(slotUrl);
    if (res.status !== 200) throw new Error(`openSlot HTTP ${res.status}`);
    return res.text();
  }

  /**
   * The full booking action for one slot: open it (locks 3 min) → scrape form →
   * assemble the POST. With `dryRun`, stops before POSTing and returns the payload.
   * player_1 defaults to the form's pre-selected booker.
   *
   * NOTE: the real-POST confirmation shape is not yet validated (no live booking sent);
   * success is inferred from the 302, and bookingRef is best-effort until proven.
   */
  async bookSlot(slotUrl: string, opts: BookSlotOptions = {}): Promise<BookResult> {
    const html = await this.openSlot(slotUrl);
    const form = parseBookingForm(html);
    const booker = opts.bookerGolferId ?? form.bookerGolferId;
    if (booker == null) {
      return { status: 'error', reason: 'could not determine booker golfer-id from booking form' };
    }
    const players: PlayerSeat[] = [booker, ...(opts.partners ?? [])];
    const body = buildBookingBody({
      csrfToken: form.csrfToken,
      holes: opts.holes ?? 18,
      players,
      buggies: opts.buggies,
    });

    if (opts.dryRun) {
      return { status: 'would-book', action: form.action, body, players };
    }

    const res = await this.request(`${this.origin}${form.action}`, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: this.origin,
        Referer: slotUrl.startsWith('http') ? slotUrl : `${this.origin}${slotUrl}`,
      },
    });
    const location = res.headers.get('location') ?? '';
    // A successful booking 302-redirects to the tee sheet (validated live 2026-08-14).
    if (res.status === 302 && location.includes('/tee-sheet')) {
      return { status: 'booked', action: form.action, bookingRef: null };
    }
    if (res.status === 302 && location.includes('/login')) {
      return { status: 'error', reason: 'session expired during booking' };
    }
    return {
      status: 'error',
      reason: `booking not confirmed (HTTP ${res.status}, location "${location}")`,
      httpStatus: res.status,
    };
  }

  /**
   * Cancel a booking: `POST /<club>/bookings/delete/<course>/<YYYYMMDD>/<HHmm>` (→ 204).
   * Mirrors the store URL. Used to undo the validation/proof bookings.
   */
  async cancelBooking(courseId: number, date: Date | string, time: string): Promise<boolean> {
    const datePath = toDatePath(date).replace(/\//g, '');
    const hhmm = time.replace(':', '');
    const res = await this.request(`/bookings/delete/${courseId}/${datePath}/${hhmm}`, {
      method: 'POST',
      xhr: true,
      headers: { Origin: this.origin },
    });
    return res.status === 204 || res.status === 200 || res.status === 302;
  }

  async logout(): Promise<void> {
    try {
      await this.request('/logout');
    } finally {
      this.loggedIn = false;
    }
  }
}
