import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { WeekForm } from './week-form';
import { DAY_NAMES, formatTargetDate, readPlayerSet, upcomingTargetDate } from '../_util';
import styles from '../dashboard.module.css';

/**
 * Weekly "who's in": choose a target (via ?targetId, defaulting to the first),
 * then set the group for its next run. Defaults come from the upcoming run's
 * playerSet if it exists, otherwise the most recent run's set (carry-over),
 * intersected with the buddies that still exist.
 */
export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ targetId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { targetId } = await searchParams;

  const [targets, players] = await Promise.all([
    prisma.target.findMany({
      where: { brsAccount: { userId: user.id } },
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
      include: { brsAccount: true },
    }),
    prisma.player.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } }),
  ]);

  const selected =
    (targetId ? targets.find((t) => t.id === targetId) : undefined) ?? targets[0] ?? null;

  let defaultIds: string[] = [];
  let targetDate: Date | null = null;
  if (selected) {
    targetDate = upcomingTargetDate(selected.dayOfWeek);
    const upcoming = await prisma.weeklyRun.findFirst({
      where: { targetId: selected.id, targetDate },
    });
    const source =
      upcoming ??
      (await prisma.weeklyRun.findFirst({
        where: { targetId: selected.id },
        orderBy: { createdAt: 'desc' },
      }));
    if (source) {
      const existingIds = new Set(players.map((p) => p.id));
      defaultIds = readPlayerSet(source.playerSet)
        .map((s) => s.playerId)
        .filter((id) => existingIds.has(id));
    }
  }

  return (
    <main className={styles.wrap}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Who is in this week</h1>
            <p className={styles.subtitle}>Set the group for the next run of a target.</p>
          </div>
          <Link className={styles.back} href="/dashboard">
            &larr; Dashboard
          </Link>
        </div>

        {targets.length === 0 ? (
          <div className={styles.section}>
            <p className={styles.empty}>
              No targets yet.{' '}
              <Link className={styles.navLink} href="/dashboard/targets/new">
                + Add target
              </Link>
            </p>
          </div>
        ) : (
          <>
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Target</h2>
              <div className={styles.nav}>
                {targets.map((t) => (
                  <Link
                    key={t.id}
                    href={`/dashboard/week?targetId=${t.id}`}
                    className={t.id === selected?.id ? styles.navLinkActive : styles.navLink}
                  >
                    {t.brsAccount.clubSlug}: {DAY_NAMES[t.dayOfWeek] ?? `Day ${t.dayOfWeek}`}{' '}
                    {t.teeTime}
                    {t.active ? '' : ' (paused)'}
                  </Link>
                ))}
              </div>
            </div>

            {selected && targetDate ? (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>
                  {selected.brsAccount.clubSlug} ·{' '}
                  {DAY_NAMES[selected.dayOfWeek] ?? `Day ${selected.dayOfWeek}`} {selected.teeTime}
                </h2>
                <p className={styles.hint}>Next run: {formatTargetDate(targetDate)}</p>
                <WeekForm
                  targetId={selected.id}
                  size={selected.size}
                  players={players.map((p) => ({
                    id: p.id,
                    displayName: p.displayName,
                    isGuest: p.isGuest,
                    brsGolferId: p.brsGolferId,
                  }))}
                  selectedIds={defaultIds}
                />
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
