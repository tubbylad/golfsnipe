/**
 * Snipe worker — the autonomous loop. For each active Target it logs in, reads the
 * next matching date's release time, and when release is imminent runs the snipe
 * (poll → pounce), records the WeeklyRun, and notifies the user.
 *
 *   npm run worker            # SAFE: dry-run — rehearses, never books for real
 *   WORKER_LIVE=1 npm run worker   # armed: will place real bookings
 *
 * Deploy as a single long-running process. `.env` supplies DATABASE_URL, BRS_VAULT_KEY,
 * RESEND_* / SMS_* (see src/lib/env.ts).
 */
import 'dotenv/config';
import { prisma } from '@/lib/db';
import { decryptSecret } from '@/lib/vault';
import { BrsSession, toDatePath } from '@/brs/session';
import { planNextSnipe, snipe } from '@/brs/engine';
import { notifyRun } from '@/lib/notifications';
import type { PlayerSeat } from '@/brs/booking';

const LEAD_MS = 3 * 60_000; // arm the snipe when release is within 3 minutes
const DEFAULT_SWEEP_MS = 5 * 60_000; // gentle idle cadence (aligns with the ~5-min re-login norm)
const MIN_SWEEP_MS = 30_000;
const LIVE = process.env.WORKER_LIVE === '1';

const realClock = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
};

const TERMINAL = new Set(['won', 'lost', 'error', 'skipped']);

function partnersFromPlayerSet(playerSet: unknown, size: number): PlayerSeat[] {
  if (!Array.isArray(playerSet)) return [];
  // The UX stores rich objects ({ brsGolferId, isGuest, ... }); also tolerate raw seats.
  const seats: PlayerSeat[] = playerSet.map((p) => {
    if (p == null || typeof p === 'number') return (p ?? null) as PlayerSeat;
    if (typeof p === 'object' && 'isGuest' in p && (p as { isGuest?: boolean }).isGuest) return -2;
    const id = Number((p as { brsGolferId?: unknown }).brsGolferId);
    return Number.isFinite(id) && id > 0 ? id : null;
  });
  return seats.slice(0, Math.max(0, size - 1));
}

function dateToUtc(datePath: string): Date {
  return new Date(`${datePath.replace(/\//g, '-')}T00:00:00.000Z`);
}

/** One sweep across active targets; returns how long to sleep before the next sweep. */
async function runOnce(): Promise<number> {
  const targets = await prisma.target.findMany({
    where: { active: true },
    include: { brsAccount: { include: { user: true } } },
  });
  let nextSweep = DEFAULT_SWEEP_MS;

  for (const t of targets) {
    const account = t.brsAccount;
    let session: BrsSession | undefined;
    try {
      const password = await decryptSecret(account.passwordCipher, account.passwordNonce);
      session = new BrsSession({ clubSlug: account.clubSlug });
      await session.login(account.username, password);

      // One-off snipes target a specific date and retire once it is past.
      if (t.oneShot) {
        const todayUtc = new Date();
        todayUtc.setUTCHours(0, 0, 0, 0);
        if (!t.oneShotDate || t.oneShotDate.getTime() < todayUtc.getTime()) {
          await prisma.target.update({ where: { id: t.id }, data: { active: false } });
          continue;
        }
      }

      const plan = await planNextSnipe(
        session,
        t.oneShot && t.oneShotDate
          ? { courseId: account.courseId, dayOfWeek: t.dayOfWeek, date: toDatePath(t.oneShotDate) }
          : { courseId: account.courseId, dayOfWeek: t.dayOfWeek },
        new Date(),
      );

      const run = await prisma.weeklyRun.upsert({
        where: { id: `${t.id}:${plan.date}` },
        create: { id: `${t.id}:${plan.date}`, targetId: t.id, targetDate: dateToUtc(plan.date) },
        update: {},
      });
      if (TERMINAL.has(run.status)) continue;

      const untilRelease = plan.releaseAtMs ? plan.releaseAtMs - Date.now() : 0;
      if (untilRelease > LEAD_MS) {
        nextSweep = Math.min(nextSweep, Math.max(MIN_SWEEP_MS, untilRelease - LEAD_MS));
        continue;
      }

      // Arm and run.
      await prisma.weeklyRun.update({
        where: { id: run.id },
        data: {
          status: 'armed',
          detectedReleaseAt: plan.releaseAtMs ? new Date(plan.releaseAtMs) : null,
        },
      });
      const result = await snipe(
        session,
        {
          courseId: account.courseId,
          date: plan.date,
          times: t.teeTimes,
          autoNext: t.autoNext,
          holes: t.holes === 9 ? 9 : 18,
          partners: partnersFromPlayerSet(t.playerSet ?? run.playerSet, t.size),
          dryRun: !LIVE,
        },
        plan.releaseAtMs ?? Date.now(),
        realClock,
      );

      await prisma.weeklyRun.update({
        where: { id: run.id },
        data: {
          status: result.status,
          bookingRef: result.bookingRef ?? null,
          timeline: { attempts: result.attempts, reason: result.reason ?? null, dryRun: !LIVE },
        },
      });
      // A one-off has now had its single attempt — retire it.
      if (t.oneShot) {
        await prisma.target.update({ where: { id: t.id }, data: { active: false } });
      }
      await notifyRun(
        {
          status: result.status,
          club: account.clubSlug,
          course: String(account.courseId),
          date: plan.date,
          time: result.time ?? t.teeTimes[0] ?? '?',
          size: t.size,
          bookingRef: result.bookingRef,
          reason: LIVE ? result.reason : `${result.reason ?? ''} (dry-run rehearsal)`.trim(),
        },
        { email: account.user.email, phone: account.user.phone },
      );
      console.log(
        `[worker] target ${t.id} ${plan.date} ${result.time ?? t.teeTimes.join('/')} -> ${result.status}`,
      );
    } catch (err) {
      console.error(`[worker] target ${t.id} failed:`, err instanceof Error ? err.message : err);
    } finally {
      await session?.logout().catch(() => {});
    }
  }
  return nextSweep;
}

async function main() {
  console.log(`[worker] starting (${LIVE ? 'LIVE — will book' : 'DRY-RUN — rehearsing only'})`);
  for (;;) {
    const sleep = await runOnce().catch((e) => {
      console.error('[worker] sweep error:', e);
      return DEFAULT_SWEEP_MS;
    });
    await realClock.sleep(sleep);
  }
}

main().catch((e) => {
  console.error('[worker] fatal:', e);
  process.exit(1);
});
