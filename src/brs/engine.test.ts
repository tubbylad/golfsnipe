import { expect, test } from 'vitest';
import {
  nextDateForDayOfWeek,
  planNextSnipe,
  pollDelayMs,
  snipe,
  type SnipeSessionLike,
} from './engine';
import type { BookResult } from './session';

/** Build an availability payload from {time: {bookable, url?}} specs. */
function avail(slots: Record<string, { bookable: boolean; url?: string | null; booked?: boolean }>) {
  const times: Record<string, unknown> = {};
  for (const [t, s] of Object.entries(slots)) {
    times[t] = {
      tee_time: {
        bookable: s.bookable,
        booked: s.booked ?? false,
        url: s.url ?? (s.bookable ? `/u/${t}` : null),
        holes: 18,
        reservation: null,
        participants: [],
      },
    };
  }
  return { times };
}

function fakeSession(
  script: unknown[],
  book: (url: string) => BookResult,
): SnipeSessionLike & { books: string[] } {
  let i = 0;
  const s = {
    books: [] as string[],
    async getAvailability() {
      return script[Math.min(i++, script.length - 1)];
    },
    async bookSlot(url: string) {
      s.books.push(url);
      return book(url);
    },
  };
  return s;
}

function fakeClock(startMs: number) {
  let t = startMs;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
}

const booked = (ref = 'REF'): BookResult => ({ status: 'booked', action: '/a', bookingRef: ref });

test('pollDelayMs is gentle far out, bursts around release, backs off after the window', () => {
  expect(pollDelayMs(600_000)).toBe(15_000);
  expect(pollDelayMs(60_000)).toBe(2_000);
  expect(pollDelayMs(1_000)).toBe(250);
  expect(pollDelayMs(-5_000)).toBe(250);
  expect(pollDelayMs(-60_000)).toBe(2_000);
});

test('nextDateForDayOfWeek returns the next FUTURE occurrence (never today)', () => {
  const fri = new Date(Date.UTC(2026, 7, 14));
  expect(nextDateForDayOfWeek(6, fri).toISOString().slice(0, 10)).toBe('2026-08-15');
  expect(nextDateForDayOfWeek(5, fri).toISOString().slice(0, 10)).toBe('2026-08-21');
});

test('planNextSnipe picks the next matching date and reads its release time', async () => {
  const reader = {
    async getReleaseInfo(_c: number, date: string) {
      return date === '2026/08/22' ? { time: '2026-08-14T19:00:00+01:00', title: 't' } : null;
    },
  };
  const plan = await planNextSnipe(reader, { courseId: 3, dayOfWeek: 6 }, new Date(Date.UTC(2026, 7, 15)));
  expect(plan.date).toBe('2026/08/22');
  expect(plan.alreadyLive).toBe(false);
  expect(plan.releaseAtMs).toBe(Date.parse('2026-08-14T19:00:00+01:00'));
});

test('planNextSnipe flags alreadyLive when there is no release rule', async () => {
  const reader = { async getReleaseInfo() { return null; } };
  const plan = await planNextSnipe(reader, { courseId: 3, dayOfWeek: 6 }, new Date(Date.UTC(2026, 7, 15)));
  expect(plan.alreadyLive).toBe(true);
  expect(plan.releaseAtMs).toBeNull();
});

test('snipe books the top-priority slot the instant it flips bookable', async () => {
  const s = fakeSession(
    [
      avail({ '10:18': { bookable: false }, '10:26': { bookable: false } }),
      avail({ '10:18': { bookable: true }, '10:26': { bookable: true } }),
    ],
    () => booked(),
  );
  const res = await snipe(s, { courseId: 3, date: '2026/08/22', times: ['10:18', '10:26'] }, 0, fakeClock(0));
  expect(res.status).toBe('won');
  expect(res.time).toBe('10:18');
  expect(s.books).toEqual(['/u/10:18']);
});

test('snipe falls through to the next preferred time when the first is snatched', async () => {
  const s = fakeSession(
    [avail({ '10:18': { bookable: true }, '10:26': { bookable: true } })],
    (url) => (url === '/u/10:18' ? { status: 'error', reason: 'taken' } : booked('R2')),
  );
  const res = await snipe(s, { courseId: 3, date: '2026/08/22', times: ['10:18', '10:26'] }, 0, fakeClock(0));
  expect(res.status).toBe('won');
  expect(res.time).toBe('10:26');
  expect(s.books).toEqual(['/u/10:18', '/u/10:26']);
});

test('autoNext takes the next bookable slot after the picks when all picks are gone', async () => {
  const s = fakeSession(
    [avail({ '10:18': { bookable: false }, '10:26': { bookable: true }, '10:34': { bookable: true } })],
    () => booked('R3'),
  );
  const res = await snipe(
    s,
    { courseId: 3, date: '2026/08/22', times: ['10:18'], autoNext: true },
    0,
    fakeClock(0),
  );
  expect(res.status).toBe('won');
  expect(res.time).toBe('10:26');
});

test('without autoNext, an unavailable lone pick keeps waiting then loses', async () => {
  const s = fakeSession(
    [avail({ '10:18': { bookable: false }, '10:26': { bookable: true } })],
    () => booked(),
  );
  const res = await snipe(
    s,
    { courseId: 3, date: '2026/08/22', times: ['10:18'] },
    0,
    fakeClock(0),
    { maxWindowMs: 30_000 },
  );
  expect(res.status).toBe('lost');
  expect(s.books).toEqual([]);
});
