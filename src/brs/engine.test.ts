import { expect, test } from 'vitest';
import {
  nextDateForDayOfWeek,
  planNextSnipe,
  pollDelayMs,
  snipe,
  type SnipeSessionLike,
} from './engine';
import type { Slot } from './parse';
import type { BookResult } from './session';

const slot = (over: Partial<Slot> = {}): Slot => ({
  time: '07:46',
  bookable: false,
  booked: false,
  url: null,
  holes: 18,
  reservation: null,
  participants: [],
  ...over,
});

/** Fake session: yields scripted slots per poll, returns a fixed book result. */
function fakeSession(script: (Slot | null)[], book: BookResult): SnipeSessionLike & { books: number } {
  let i = 0;
  const s = {
    books: 0,
    async getSlot() {
      return script[Math.min(i++, script.length - 1)];
    },
    async bookSlot() {
      s.books++;
      return book;
    },
  };
  return s;
}

/** Fake clock: sleep advances virtual time so loops terminate deterministically. */
function fakeClock(startMs: number) {
  let t = startMs;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
}

// --- cadence ---
test('pollDelayMs is gentle far out, bursts around release, backs off after the window', () => {
  expect(pollDelayMs(600_000)).toBe(15_000); // 10 min out
  expect(pollDelayMs(60_000)).toBe(2_000); // 1 min out
  expect(pollDelayMs(1_000)).toBe(250); // 1 s before → burst
  expect(pollDelayMs(-5_000)).toBe(250); // 5 s after → still burst
  expect(pollDelayMs(-60_000)).toBe(2_000); // 1 min after → backed off
});

// --- target date ---
test('nextDateForDayOfWeek returns the next FUTURE occurrence (never today)', () => {
  const fri = new Date(Date.UTC(2026, 7, 14)); // 2026-08-14 is a Friday (day 5)
  expect(nextDateForDayOfWeek(6, fri).toISOString().slice(0, 10)).toBe('2026-08-15'); // Sat +1
  expect(nextDateForDayOfWeek(5, fri).toISOString().slice(0, 10)).toBe('2026-08-21'); // Fri +7 (not today)
});

// --- pounce ---
test('snipe books the instant the target slot flips bookable → won', async () => {
  const s = fakeSession(
    [slot(), slot(), slot({ bookable: true, url: '/x/bookings/book/tok/3/20260822/0746' })],
    { status: 'booked', action: '/a', bookingRef: 'ABC123' },
  );
  const res = await snipe(s, { courseId: 3, date: '2026/08/22', time: '07:46' }, 0, fakeClock(0));
  expect(res.status).toBe('won');
  expect(res.bookingRef).toBe('ABC123');
  expect(res.attempts).toBe(3);
  expect(s.books).toBe(1);
});

test('snipe gives up as lost when the window elapses with no bookable slot', async () => {
  const s = fakeSession([slot()], { status: 'booked', action: '/a', bookingRef: null });
  const res = await snipe(
    s,
    { courseId: 3, date: '2026/08/22', time: '07:46' },
    0,
    fakeClock(0),
    { maxWindowMs: 30_000 },
  );
  expect(res.status).toBe('lost');
  expect(s.books).toBe(0);
});

test('snipe surfaces a booking error instead of claiming a win', async () => {
  const s = fakeSession([slot({ bookable: true, url: '/x' })], {
    status: 'error',
    reason: 'booking POST HTTP 500',
  });
  const res = await snipe(s, { courseId: 3, date: '2026/08/22', time: '07:46' }, 0, fakeClock(0));
  expect(res.status).toBe('error');
  expect(res.reason).toContain('500');
});

// --- scheduler ---
test('planNextSnipe picks the next matching date and reads its release time', async () => {
  const reader = {
    async getReleaseInfo(_c: number, date: string) {
      return date === '2026/08/22'
        ? { time: '2026-08-14T19:00:00+01:00', title: 'Casual times will become live...' }
        : null;
    },
  };
  const fromSat = new Date(Date.UTC(2026, 7, 15)); // 2026-08-15 (Sat) → next Sat is 08-22
  const plan = await planNextSnipe(reader, { courseId: 3, dayOfWeek: 6, time: '07:46' }, fromSat);
  expect(plan.date).toBe('2026/08/22');
  expect(plan.alreadyLive).toBe(false);
  expect(plan.releaseAtMs).toBe(Date.parse('2026-08-14T19:00:00+01:00'));
});

test('planNextSnipe flags alreadyLive when the date has no release rule', async () => {
  const reader = { async getReleaseInfo() { return null; } };
  const plan = await planNextSnipe(
    reader,
    { courseId: 3, dayOfWeek: 6, time: '07:46' },
    new Date(Date.UTC(2026, 7, 15)),
  );
  expect(plan.alreadyLive).toBe(true);
  expect(plan.releaseAtMs).toBeNull();
});
