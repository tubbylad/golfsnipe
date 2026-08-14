'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { upcomingTargetDate, weeklyRunId, type WeekPlayerSelection } from '../_util';

/**
 * Set the upcoming WeeklyRun's playerSet ("who's in") for one of the caller's
 * targets. Re-reads the session, verifies target ownership, caps the selection
 * at the target's party size, then upserts the WeeklyRun for the next target
 * date. Chosen Players are snapshotted into the JSON playerSet, so a later
 * roster or buddy change cannot silently rewrite an already locked-in week.
 */

export type WeekState = null | { error: string } | { ok: true; count: number };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export async function saveWeekAction(_prev: WeekState, formData: FormData): Promise<WeekState> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const targetId = field(formData, 'targetId');
  const playerIds = formData
    .getAll('playerIds')
    .filter((v): v is string => typeof v === 'string');

  const target = await prisma.target.findFirst({
    where: { id: targetId, brsAccount: { userId: user.id } },
    select: { id: true, dayOfWeek: true, size: true },
  });
  if (!target) return { error: 'That target could not be found.' };

  if (playerIds.length > target.size) {
    return {
      error: `This target seats ${target.size}. Remove ${playerIds.length - target.size} to continue.`,
    };
  }

  // Snapshot the chosen players (scoped to this user) into the playerSet.
  const players = playerIds.length
    ? await prisma.player.findMany({ where: { id: { in: playerIds }, userId: user.id } })
    : [];
  const selections: WeekPlayerSelection[] = players.map((p) => ({
    playerId: p.id,
    displayName: p.displayName,
    brsGolferId: p.brsGolferId,
    isGuest: p.isGuest,
  }));
  const playerSet = selections as unknown as Prisma.InputJsonValue;

  // Deterministic id (shared with the snipe worker) makes this idempotent: the
  // UI and the worker upsert the SAME run row for a given target + date.
  const targetDate = upcomingTargetDate(target.dayOfWeek);
  const id = weeklyRunId(target.id, targetDate);
  await prisma.weeklyRun.upsert({
    where: { id },
    create: { id, targetId: target.id, targetDate, playerSet },
    update: { playerSet },
  });

  revalidatePath('/dashboard/week');
  revalidatePath('/dashboard');
  return { ok: true, count: selections.length };
}
