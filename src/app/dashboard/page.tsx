import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listBrsAccounts } from '@/lib/brs-accounts';
import { prisma } from '@/lib/db';
import { DAY_NAMES, formatTargetDate, readPlayerSet, upcomingTargetDate } from './_util';
import { SnipeControls } from './snipe-controls';
import styles from './dashboard.module.css';

const MS_PER_DAY = 86_400_000;

function titleCase(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function daysUntil(date: Date): string {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const then = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const dd = Math.round((then - start) / MS_PER_DAY);
  if (dd <= 0) return 'Today';
  if (dd === 1) return 'Tomorrow';
  return `In ${dd} days`;
}

/** "You, Dylan Thomas · 1 open" — the group booked into this snipe. */
function rosterText(playerSet: unknown, size: number): string {
  const names = readPlayerSet(playerSet).map((r) => r.displayName);
  const open = Math.max(0, size - 1 - names.length);
  let text = ['You', ...names].join(', ');
  if (open > 0) text += ` · ${open} open`;
  return text;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [accounts, runs] = await Promise.all([
    listBrsAccounts(user.id),
    prisma.weeklyRun.findMany({
      where: { target: { brsAccount: { userId: user.id } } },
      orderBy: [{ targetDate: 'desc' }, { createdAt: 'desc' }],
      take: 8,
      include: { target: { include: { brsAccount: true } } },
    }),
  ]);

  const snipes = accounts
    .flatMap((account) => account.targets.map((target) => ({ account, target })))
    .map((s) => ({
      ...s,
      next:
        s.target.oneShot && s.target.oneShotDate
          ? new Date(s.target.oneShotDate)
          : upcomingTargetDate(s.target.dayOfWeek),
    }))
    .sort(
      (a, b) =>
        Number(b.target.active) - Number(a.target.active) || a.next.getTime() - b.next.getTime(),
    );

  const nextUp = snipes.find((s) => s.target.active);

  return (
    <main className={styles.wrap}>
      <div className={styles.container}>
        <div className={styles.pageH}>
          <div>
            <h1 className={styles.title}>Your snipes</h1>
            <p className={styles.subtitle}>
              {snipes.length === 0
                ? 'Set one up and the bot books it the moment the sheet opens.'
                : `${snipes.filter((s) => s.target.active).length} armed. The bot books each one the moment its sheet opens.`}
            </p>
          </div>
          <Link className={styles.button} href="/dashboard/targets/new">
            + New snipe
          </Link>
        </div>

        {accounts.length === 0 ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Get started</h2>
            <div className={styles.emptyCta}>
              <p>Connect the club you book through, then set the tee time you want each week.</p>
              <Link className={styles.button} href="/dashboard/accounts/new">
                Connect a club
              </Link>
            </div>
          </section>
        ) : snipes.length === 0 ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Almost there</h2>
            <div className={styles.emptyCta}>
              <p>Your club is connected. Now set the tee time you want the bot to book each week.</p>
              <Link className={styles.button} href="/dashboard/targets/new">
                Set up your first snipe
              </Link>
            </div>
          </section>
        ) : (
          <>
            {nextUp ? (
              <div className={styles.next}>
                <div className={styles.nextL}>
                  <span className={styles.kicker}>Next to fire</span>
                  <h2 className={styles.club}>
                    {titleCase(nextUp.account.clubSlug)}{' '}
                    <small>course {nextUp.account.courseId}</small>
                  </h2>
                  <div className={styles.sched}>
                    <span
                      className={`${styles.tag} ${nextUp.target.oneShot ? styles.tagOnce : styles.tagGo}`}
                    >
                      {nextUp.target.oneShot ? 'Once' : `Every ${DAY_NAMES[nextUp.target.dayOfWeek]}`}
                    </span>
                    {nextUp.target.teeTimes.map((t, i) => (
                      <span key={t} className={styles.tt}>
                        {i + 1}. {t}
                      </span>
                    ))}
                    {nextUp.target.autoNext ? <span className={styles.then}>then next open</span> : null}
                  </div>
                  <div className={styles.seats}>
                    <span className={styles.badge}>{rosterText(nextUp.target.playerSet, nextUp.target.size)}</span>
                    <span className={styles.state}>
                      <span className={styles.sq} />
                      Armed
                    </span>
                  </div>
                </div>
                <div className={styles.nextR}>
                  <span className={styles.clabel}>Next tee off</span>
                  <div className={styles.count}>{daysUntil(nextUp.next)}</div>
                  <div className={styles.fires}>{formatTargetDate(nextUp.next)}</div>
                </div>
              </div>
            ) : null}

            <div className={styles.queue}>
              <div className={styles.qHead}>
                <h3 className={styles.qHeadTitle}>All snipes</h3>
                <span className={styles.qN}>{snipes.length} queued</span>
              </div>
              {snipes.map(({ account, target, next }) => (
                <div
                  key={target.id}
                  className={`${styles.snipeRow} ${target.active ? styles.qArmed : styles.qPaused}`}
                >
                  <div className={styles.snipeMain}>
                    <div className={styles.clubCell}>
                      {titleCase(account.clubSlug)}
                      <small>course {account.courseId}</small>
                    </div>
                    <div className={styles.snipeMeta}>
                      <span className={`${styles.tag} ${target.oneShot ? styles.tagOnce : styles.tagGo}`}>
                        {target.oneShot ? 'Once' : `Every ${DAY_NAMES[target.dayOfWeek]}`}
                      </span>
                      {target.teeTimes.map((t) => (
                        <span key={t} className={styles.tt}>
                          {t}
                        </span>
                      ))}
                      <span className={styles.metaDate}>{formatTargetDate(next)}</span>
                      <span className={styles.metaRoster}>{rosterText(target.playerSet, target.size)}</span>
                    </div>
                  </div>
                  <div className={styles.snipeRight}>
                    <span
                      className={`${styles.qState} ${target.active ? styles.qStateArmed : styles.qStatePaused}`}
                    >
                      {target.active ? 'Armed' : 'Paused'}
                    </span>
                    <SnipeControls targetId={target.id} active={target.active} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className={styles.queue}>
          <div className={styles.qHead}>
            <h3 className={styles.qHeadTitle}>Recent snipes</h3>
          </div>
          {runs.length === 0 ? (
            <p className={styles.empty}>No runs yet. Your armed snipes will show up here once they fire.</p>
          ) : (
            runs.map((run) => {
              const won = run.status === 'won';
              return (
                <div key={run.id} className={styles.run}>
                  <span className={styles.runDate}>{formatTargetDate(run.targetDate)}</span>
                  <span className={styles.runDesc}>
                    {titleCase(run.target.brsAccount.clubSlug)} · {run.target.teeTimes.join(', ')}
                    {run.bookingRef ? ` · ref ${run.bookingRef}` : ''}
                  </span>
                  <span className={`${styles.runTag} ${won ? styles.runWon : styles.runLost}`}>
                    {won ? 'Won' : run.status}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
