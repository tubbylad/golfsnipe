'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Server Actions for tee-time Targets. Server Actions are reachable by direct
 * POST, so each one re-reads the session and re-checks ownership from a trusted
 * source (the DB) rather than trusting the rendered form. `redirect()` throws a
 * control-flow signal, so it is only ever called OUTSIDE a try/catch.
 */

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** "HH:MM" 24-hour time, matching what <input type="time"> submits. */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Create a Target under one of the caller's BRS accounts. The chosen account is
 * verified to belong to this user before writing; invalid input bounces back to
 * the form. Poll-window fields are applied only when valid, otherwise the
 * schema defaults (18:00 to 21:00) stand.
 */
export async function createTargetAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const brsAccountId = field(formData, 'brsAccountId');
  const dayOfWeek = Number(field(formData, 'dayOfWeek'));
  const teeTime = field(formData, 'teeTime').trim();
  const holes = Number(field(formData, 'holes')) === 9 ? 9 : 18;
  const size = Math.min(4, Math.max(1, Number(field(formData, 'size')) || 4));
  const pollWindowStart = field(formData, 'pollWindowStart').trim();
  const pollWindowEnd = field(formData, 'pollWindowEnd').trim();

  const validDay = Number.isInteger(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6;
  if (!brsAccountId || !validDay || !HHMM.test(teeTime)) {
    redirect('/dashboard/targets/new');
  }

  // Ownership check: the account must belong to this user.
  const account = await prisma.brsAccount.findFirst({
    where: { id: brsAccountId, userId: user.id },
    select: { id: true },
  });
  if (!account) redirect('/dashboard/targets/new');

  await prisma.target.create({
    data: {
      brsAccountId: account.id,
      dayOfWeek,
      teeTime,
      holes,
      size,
      ...(HHMM.test(pollWindowStart) ? { pollWindowStart } : {}),
      ...(HHMM.test(pollWindowEnd) ? { pollWindowEnd } : {}),
    },
  });

  redirect('/dashboard/targets');
}

/**
 * Toggle a target's `active` flag. Confirms the target is owned by the caller
 * (via its account) before flipping, then revalidates the affected views so the
 * change shows immediately without a redirect.
 */
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

  await prisma.target.update({
    where: { id: target.id },
    data: { active: !target.active },
  });

  revalidatePath('/dashboard/targets');
  revalidatePath('/dashboard');
}
