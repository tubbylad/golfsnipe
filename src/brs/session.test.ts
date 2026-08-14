import { expect, test } from 'vitest';
import { BrsSession } from './session';
import { findSlot, parseBookingForm } from './parse';

/**
 * @live integration test — hits the real BRS site, so it is SKIPPED unless BRS_LIVE is set.
 * Run manually:
 *   BRS_LIVE=1 BRS_LIVE_USER=<user> BRS_LIVE_PASS=<pass> npx vitest run src/brs/session.test.ts
 * Never runs in CI. Opens one off-peak slot (locks 3 min, auto-releases); never books.
 */
const live = process.env.BRS_LIVE ? test : test.skip;

const clubSlug = process.env.BRS_LIVE_CLUB ?? 'monifieth';
const courseId = Number(process.env.BRS_LIVE_COURSE ?? '3');
const date = process.env.BRS_LIVE_DATE ?? '2026/08/19';

live(
  'logs in, reads availability + roster, and opens a slot to a valid booking form',
  async () => {
    const s = new BrsSession({ clubSlug });
    await s.login(process.env.BRS_LIVE_USER ?? '', process.env.BRS_LIVE_PASS ?? '');
    expect(s.isLoggedIn).toBe(true);

    const avail = await s.getAvailability(courseId, date);
    expect(avail).toHaveProperty('times');

    const roster = await s.getRoster();
    expect(roster.length).toBeGreaterThan(100);
    expect(typeof roster[0].golferId).toBe('number');

    // Prefer an off-peak (afternoon) bookable slot to minimise the 3-min lock impact.
    const times = Object.keys((avail as { times: Record<string, unknown> }).times);
    const bookable = times
      .map((t) => findSlot(avail as Parameters<typeof findSlot>[0], t))
      .filter((sl): sl is NonNullable<typeof sl> => !!sl && sl.bookable && !!sl.url);
    const pick =
      bookable.find((sl) => Number(sl.time.split(':')[0]) >= 13) ?? bookable[0];
    expect(pick, 'expected at least one bookable slot on the test date').toBeTruthy();

    const html = await s.openSlot(pick!.url!);
    const form = parseBookingForm(html);
    expect(form.action).toContain('/bookings/store/');
    expect(form.csrfToken.length).toBeGreaterThan(10);
    expect(typeof form.bookerGolferId).toBe('number');

    await s.logout();
  },
  30_000,
);

live(
  'bookSlot dry-run assembles a valid POST payload without booking anything',
  async () => {
    const s = new BrsSession({ clubSlug });
    await s.login(process.env.BRS_LIVE_USER ?? '', process.env.BRS_LIVE_PASS ?? '');
    const avail = await s.getAvailability(courseId, date);
    const times = Object.keys((avail as { times: Record<string, unknown> }).times);
    const bookable = times
      .map((t) => findSlot(avail as Parameters<typeof findSlot>[0], t))
      .filter((sl): sl is NonNullable<typeof sl> => !!sl && sl.bookable && !!sl.url);
    const pick = bookable.find((sl) => Number(sl.time.split(':')[0]) >= 13) ?? bookable[0];

    const result = await s.bookSlot(pick!.url!, { holes: 18, partners: [], dryRun: true });
    expect(result.status).toBe('would-book');
    if (result.status === 'would-book') {
      const body = new URLSearchParams(result.body);
      expect((body.get('_token') ?? '').length).toBeGreaterThan(10);
      expect(Number(body.get('member_booking_form[player_1]'))).toBeGreaterThan(0);
      expect(body.get('member_booking_form[confirm_booking]')).toBe('');
    }
    await s.logout();
  },
  30_000,
);
