import type { PlayerSeat } from './booking';
import type { ReleaseInfo, Slot } from './parse';
import type { BookResult, BookSlotOptions } from './session';

export interface SnipeTarget {
  courseId: number;
  /** The specific date to snipe, `YYYY/MM/DD`. */
  date: string;
  time: string;
  holes?: 9 | 18;
  partners?: PlayerSeat[];
  buggies?: boolean[];
  /** Rehearsal: run the full pipeline but stop before the real POST. */
  dryRun?: boolean;
}

/** The slice of BrsSession the engine needs — lets tests inject a fake. */
export interface SnipeSessionLike {
  getSlot(courseId: number, date: string, time: string): Promise<Slot | null>;
  bookSlot(slotUrl: string, opts: BookSlotOptions): Promise<BookResult>;
}

export interface SnipeClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface SnipeResult {
  status: 'won' | 'lost' | 'error';
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
  /** The date to snipe, `YYYY/MM/DD`. */
  date: string;
  /** Epoch-ms of the release, or null if already live (or unknown). */
  releaseAtMs: number | null;
  alreadyLive: boolean;
}

/**
 * Decide the next date to snipe for a recurring target (e.g. every Saturday) and read
 * its release time. `alreadyLive` = the date's casual times are already bookable.
 */
export async function planNextSnipe(
  session: ReleaseReader,
  target: { courseId: number; dayOfWeek: number; time?: string },
  from: Date,
): Promise<SnipePlan> {
  const date = toDatePath(nextDateForDayOfWeek(target.dayOfWeek, from));
  const release = await session.getReleaseInfo(target.courseId, date);
  return {
    date,
    releaseAtMs: release ? Date.parse(release.time) : null,
    alreadyLive: release === null,
  };
}

/**
 * Poll the target slot until it flips bookable, then pounce (openSlot lock → POST).
 * Deterministic under an injected clock. Returns won / lost / error.
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
      return {
        status: 'lost',
        attempts,
        reason: 'release window elapsed without a bookable slot',
      };
    }
    attempts++;
    const slot = await session.getSlot(target.courseId, target.date, target.time);
    if (slot?.bookable && slot.url) {
      const res = await session.bookSlot(slot.url, {
        holes: target.holes ?? 18,
        partners: target.partners,
        buggies: target.buggies,
        dryRun: target.dryRun,
      });
      if (res.status === 'booked') return { status: 'won', bookingRef: res.bookingRef, attempts };
      if (res.status === 'would-book') return { status: 'won', bookingRef: null, attempts };
      return { status: 'error', attempts, reason: res.reason };
    }
    await clock.sleep(pollDelayMs(releaseAtMs - clock.now()));
  }
}
