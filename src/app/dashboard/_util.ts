import { nextDateForDayOfWeek } from '@/brs/engine';

/**
 * Shared, route-free helpers for the dashboard tree (a leading-underscore file
 * is ignored by the App Router). Keeps day labels, date formatting and the
 * WeeklyRun.playerSet shape in one place so the pages stay consistent.
 */

/** Day-of-week labels, index 0 = Sunday to match JS getUTCDay()/getDay(). */
export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * One selected player in a WeeklyRun's `playerSet` (the weekly "who's in").
 * Snapshotted at save time and shaped to map straight onto booking seats later:
 * a real member carries a numeric `brsGolferId`; a guest carries `isGuest` and
 * no id (booked as the -2 guest seat).
 */
export interface WeekPlayerSelection {
  playerId: string;
  displayName: string;
  brsGolferId: string | null;
  isGuest: boolean;
}

/**
 * The next date a target fires on, computed exactly like the snipe engine
 * (`nextDateForDayOfWeek`: UTC, always a future date). This is the date a
 * WeeklyRun is keyed to, so the UI and the engine agree on which day is next.
 */
export function upcomingTargetDate(dayOfWeek: number, from: Date = new Date()): Date {
  return nextDateForDayOfWeek(dayOfWeek, from);
}

/** Format a Date as the engine's `YYYY/MM/DD` path (UTC), matching the snipe worker. */
export function toDatePath(date: Date): string {
  return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

/**
 * The deterministic WeeklyRun id for a (target, date). Mirrors the snipe worker's
 * `${targetId}:${YYYY/MM/DD}` id scheme (scripts/worker.ts), so the UI's "who's
 * in" write and the worker's run row converge on ONE row via upsert instead of
 * creating duplicate runs for the same date.
 */
export function weeklyRunId(targetId: string, date: Date): string {
  return `${targetId}:${toDatePath(date)}`;
}

/** Deterministic UTC date label, e.g. "Sat 22 Aug 2026" (locale-free, no em-dashes). */
export function formatTargetDate(date: Date): string {
  return `${DAY_ABBR[date.getUTCDay()]} ${date.getUTCDate()} ${MONTH_ABBR[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Read a WeeklyRun.playerSet JSON column back into typed selections (defensive). */
export function readPlayerSet(value: unknown): WeekPlayerSelection[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is WeekPlayerSelection =>
      !!v &&
      typeof v === 'object' &&
      typeof (v as { playerId?: unknown }).playerId === 'string',
  );
}
