import type { PlayerSeat } from './booking';
import { findSlot, type ReleaseInfo } from './parse';
import type { BookResult, BookSlotOptions } from './session';

export interface SnipeTarget {
  courseId: number;
  /** The specific date to snipe, `YYYY/MM/DD`. */
  date: string;
  /** Preferred tee times "HH:mm", in priority order. */
  times: string[];
  /** If all preferred times are gone, take the next bookable later slot. */
  autoNext?: boolean;
  holes?: 9 | 18;
  partners?: PlayerSeat[];
  buggies?: boolean[];
  /** Rehearsal: run the full pipeline but stop before the real POST. */
  dryRun?: boolean;
}

/** The slice of BrsSession the engine needs — lets tests inject a fake. */
export interface SnipeSessionLike {
  getAvailability(courseId: number, date: string): Promise<unknown>;
  bookSlot(slotUrl: string, opts: BookSlotOptions): Promise<BookResult>;
}

export interface SnipeClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface SnipeResult {
  status: 'won' | 'lost' | 'error';
  /** The tee time that was actually secured. */
  time?: string;
  bookingRef?: string | null;
  attempts: number;
  reason?: string;
}

/** Poll cadence by ms-until-release (positive = future): gentle far out, burst around the flip. */
export function pollDelayMs(msUntilRelease: number): number {
  if (msUntilRelease > 120_000) return 15_000;
  if (msUntilRelease > 3_000) return 2_000;
  if (msUntilRelease > -30_000) return 250; // from ~3s before to ~30s after release
  return 2_000;
}

/** The next FUTURE date whose UTC day-of-week === dow (never returns `from`'s own date). */
export function nextDateForDayOfWeek(dow: number, from: Date): Date {
  const ahead = ((dow - from.getUTCDay() + 7) % 7) || 7;
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + ahead);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const toDatePath = (d: Date) =>
  `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;

export interface ReleaseReader {
  getReleaseInfo(courseId: number, date: string): Promise<ReleaseInfo | null>;
}

export interface SnipePlan {
  date: string;
  releaseAtMs: number | null;
  alreadyLive: boolean;
}

/**
 * Decide the date to snipe and read its release time. Recurring targets use the
 * next matching day-of-week; a one-off passes an explicit `date` (YYYY/MM/DD).
 */
export async function planNextSnipe(
  session: ReleaseReader,
  target: { courseId: number; dayOfWeek: number; date?: string },
  from: Date,
): Promise<SnipePlan> {
  const date = target.date ?? toDatePath(nextDateForDayOfWeek(target.dayOfWeek, from));
  const release = await session.getReleaseInfo(target.courseId, date);
  return {
    date,
    releaseAtMs: release ? Date.parse(release.time) : null,
    alreadyLive: release === null,
  };
}

/**
 * Bookable slots to attempt this poll, in the order to try them: the preferred times
 * first (priority order), then — if autoNext — later bookable slots ascending.
 */
export function candidateSlots(
  availability: unknown,
  target: SnipeTarget,
): { time: string; url: string }[] {
  const avail = availability as Parameters<typeof findSlot>[0];
  const out: { time: string; url: string }[] = [];
  const seen = new Set<string>();

  for (const t of target.times) {
    const slot = findSlot(avail, t);
    if (slot?.bookable && slot.url) {
      out.push({ time: t, url: slot.url });
      seen.add(t);
    }
  }

  if (target.autoNext && target.times.length) {
    const latestPreferred = target.times.reduce((a, b) => (a > b ? a : b));
    const allTimes = Object.keys(
      (availability as { times?: Record<string, unknown> }).times ?? {},
    ).sort();
    for (const t of allTimes) {
      if (t > latestPreferred && !seen.has(t)) {
        const slot = findSlot(avail, t);
        if (slot?.bookable && slot.url) out.push({ time: t, url: slot.url });
      }
    }
  }
  return out;
}

/**
 * Poll the sheet until a preferred slot flips bookable, then pounce — trying the priority
 * list (and auto-next slots) in order, moving on if one is snatched. won / lost / error.
 */
export async function snipe(
  session: SnipeSessionLike,
  target: SnipeTarget,
  releaseAtMs: number,
  clock: SnipeClock,
  opts: { maxWindowMs?: number } = {},
): Promise<SnipeResult> {
  const maxWindow = opts.maxWindowMs ?? 60_000;
  let attempts = 0;
  for (;;) {
    if (clock.now() - releaseAtMs > maxWindow) {
      return { status: 'lost', attempts, reason: 'release window elapsed without a bookable slot' };
    }
    attempts++;
    const avail = await session.getAvailability(target.courseId, target.date);
    for (const slot of candidateSlots(avail, target)) {
      const res = await session.bookSlot(slot.url, {
        holes: target.holes ?? 18,
        partners: target.partners,
        buggies: target.buggies,
        dryRun: target.dryRun,
      });
      if (res.status === 'booked') {
        return { status: 'won', time: slot.time, bookingRef: res.bookingRef, attempts };
      }
      if (res.status === 'would-book') {
        return { status: 'won', time: slot.time, bookingRef: null, attempts };
      }
      // 'error' → that slot was snatched between poll and book; try the next candidate
    }
    await clock.sleep(pollDelayMs(releaseAtMs - clock.now()));
  }
}
