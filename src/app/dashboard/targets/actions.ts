'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { decryptSecret } from '@/lib/vault';
import { BrsSession } from '@/brs/session';
import { parseReleaseTime } from '@/brs/parse';
import type { Prisma } from '@/generated/prisma/client';

/**
 * Server Actions for tee-time Targets. Each re-reads the session and re-checks
 * ownership from the DB. `redirect()` is only ever called OUTSIDE a try/catch.
 */

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export type TeeSheetSlot = { time: string; status: 'open' | 'booked' | 'unavailable' };
/** Present only when the whole sheet has not opened yet — the instant it goes live. */
export type SheetRelease = { time: string; title: string };
export type TeeSheetResult =
  | { ok: true; slots: TeeSheetSlot[]; release: SheetRelease | null }
  | { ok: false; error: string };

/**
 * Live tee sheet for a date: logs into the chosen BRS account, reads the sheet,
 * and returns each real tee time with its BRS status. Used by the slot picker.
 */
export async function fetchTeeSheetAction(brsAccountId: string, isoDate: string): Promise<TeeSheetResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return { ok: false, error: 'Pick a date first.' };
  const account = await prisma.brsAccount.findFirst({ where: { id: brsAccountId, userId: user.id } });
  if (!account) return { ok: false, error: 'Account not found.' };

  const password = await decryptSecret(account.passwordCipher, account.passwordNonce);
  const session = new BrsSession({ clubSlug: account.clubSlug });
  try {
    await session.login(account.username, password);
    const avail = await session.getAvailability(account.courseId, isoDate.replace(/-/g, '/'));
    // If the whole sheet has not opened yet, BRS carries the release instant here.
    const release = parseReleaseTime(avail as Parameters<typeof parseReleaseTime>[0]);
    const rawTimes = (avail as { times?: Record<string, unknown> }).times ?? {};
    const slots: TeeSheetSlot[] = [];
    for (const [time, v] of Object.entries(rawTimes)) {
      const tt = (v as { tee_time?: { bookable: boolean; booked: boolean } }).tee_time;
      if (!tt) continue; // skip sunrise/sunset markers
      slots.push({ time, status: tt.bookable ? 'open' : tt.booked ? 'booked' : 'unavailable' });
    }
    return { ok: true, slots, release };
  } catch {
    return { ok: false, error: 'Could not read the tee sheet. Check the account login is correct.' };
  } finally {
    await session.logout().catch(() => {});
  }
}

/**
 * Create a Target from the picker. The weekday comes from the chosen date. The
 * group (buddies/guests) is snapshotted onto the target so it books every run
 * with no separate weekly step. `repeat=once` books that single date then the
 * worker retires it; otherwise it recurs weekly.
 */
export async function createTargetAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const brsAccountId = field(formData, 'brsAccountId');
  const isoDate = field(formData, 'date');
  const teeTimes = field(formData, 'teeTimes')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => HHMM.test(t));
  const autoNext = field(formData, 'autoNext') === 'on';
  const holes = Number(field(formData, 'holes')) === 9 ? 9 : 18;
  const size = Math.min(4, Math.max(1, Number(field(formData, 'size')) || 4));
  const oneShot = field(formData, 'repeat') === 'once';
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(isoDate);
  const dayOfWeek = validDate ? new Date(`${isoDate}T00:00:00Z`).getUTCDay() : NaN;
  const playerIds = formData.getAll('playerIds').filter((v): v is string => typeof v === 'string');

  if (!brsAccountId || Number.isNaN(dayOfWeek) || teeTimes.length === 0) {
    redirect('/dashboard/targets/new');
  }

  const account = await prisma.brsAccount.findFirst({
    where: { id: brsAccountId, userId: user.id },
    select: { id: true },
  });
  if (!account) redirect('/dashboard/targets/new');

  // Snapshot the chosen buddies/guests as the snipe's default group (seats − the booker).
  const players = playerIds.length
    ? await prisma.player.findMany({ where: { id: { in: playerIds }, userId: user.id } })
    : [];
  const playerSet = players.slice(0, Math.max(0, size - 1)).map((p) => ({
    playerId: p.id,
    displayName: p.displayName,
    brsGolferId: p.brsGolferId,
    isGuest: p.isGuest,
  })) as unknown as Prisma.InputJsonValue;

  await prisma.target.create({
    data: {
      brsAccountId: account.id,
      dayOfWeek,
      teeTimes,
      autoNext,
      holes,
      size,
      playerSet,
      oneShot,
      oneShotDate: oneShot && validDate ? new Date(`${isoDate}T00:00:00Z`) : null,
    },
  });
  redirect('/dashboard');
}

/** Toggle a target's `active` flag (ownership-checked), then revalidate the views. */
export async function toggleTargetActiveAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const targetId = field(formData, 'targetId');
  if (!targetId) redirect('/dashboard/targets');

  const target = await prisma.target.findFirst({
    where: { id: targetId, brsAccount: { userId: user.id } },
    select: { id: true, active: true },
  });
  if (!target) redirect('/dashboard/targets');

  await prisma.target.update({ where: { id: target.id }, data: { active: !target.active } });
  revalidatePath('/dashboard/targets');
  revalidatePath('/dashboard');
}

/** Cancel (delete) a snipe the caller owns, along with its runs. Ownership-checked. */
export async function deleteTargetAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const targetId = field(formData, 'targetId');
  const target = targetId
    ? await prisma.target.findFirst({
        where: { id: targetId, brsAccount: { userId: user.id } },
        select: { id: true },
      })
    : null;
  if (target) {
    await prisma.weeklyRun.deleteMany({ where: { targetId: target.id } });
    await prisma.target.delete({ where: { id: target.id } });
  }
  revalidatePath('/dashboard');
  redirect('/dashboard');
}
