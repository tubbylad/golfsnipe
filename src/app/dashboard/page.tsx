import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listBrsAccounts } from '@/lib/brs-accounts';
import { prisma } from '@/lib/db';
import { logoutAction } from '../(auth)/actions';
import { DAY_NAMES, formatTargetDate } from './_util';
import styles from './dashboard.module.css';

export default async function DashboardPage() {
  // The layout already guards this tree; re-read here for the user + to fetch
  // this user's accounts, targets and recent runs.
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [accounts, runs] = await Promise.all([
    listBrsAccounts(user.id),
    prisma.weeklyRun.findMany({
      where: { target: { brsAccount: { userId: user.id } } },
      orderBy: [{ targetDate: 'desc' }, { createdAt: 'desc' }],
      take: 10,
      include: { target: { include: { brsAccount: true } } },
    }),
  ]);

  return (
    <main className={styles.wrap}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Tee-Time Sniper</h1>
            <p className={styles.subtitle}>Signed in as {user.name}</p>
          </div>
          <form action={logoutAction}>
            <button className={styles.logout} type="submit">
              Log out
            </button>
          </form>
        </div>

        <div className={styles.nav}>
          <Link className={styles.navLink} href="/dashboard/targets">
            Targets
          </Link>
          <Link className={styles.navLink} href="/dashboard/buddies">
            Buddies
          </Link>
          <Link className={styles.navLink} href="/dashboard/week">
            Who is in
          </Link>
        </div>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>BRS accounts</h2>
          {accounts.length === 0 ? (
            <p className={styles.empty}>No BRS accounts yet - add one to start sniping.</p>
          ) : (
            <ul className={styles.list}>
              {accounts.map((account) => (
                <li key={account.id} className={styles.accountRow}>
                  <div className={styles.accountName}>
                    {account.clubSlug} <span className={styles.muted}>({account.platform})</span>
                  </div>
                  <div className={styles.muted}>
                    {account.username} · course {account.courseId}
                  </div>
                  {account.targets.length === 0 ? (
                    <p className={styles.empty}>No targets yet.</p>
                  ) : (
                    <ul className={styles.list}>
                      {account.targets.map((target) => (
                        <li key={target.id} className={styles.muted}>
                          {DAY_NAMES[target.dayOfWeek] ?? `Day ${target.dayOfWeek}`} at{' '}
                          {target.teeTime} · {target.holes} holes · party of {target.size}
                          {target.active ? '' : ' (paused)'}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p style={{ marginTop: '1rem' }}>
            <Link className={styles.linkButton} href="/dashboard/accounts/new">
              + Add BRS account
            </Link>
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Recent runs</h2>
          {runs.length === 0 ? (
            <p className={styles.empty}>
              No runs yet. Set who is in for a target to arm the next one.
            </p>
          ) : (
            <ul className={styles.list}>
              {runs.map((run) => (
                <li key={run.id} className={styles.accountRow}>
                  <div className={styles.row}>
                    <div>
                      <div className={styles.accountName}>
                        {run.target.brsAccount.clubSlug}:{' '}
                        {DAY_NAMES[run.target.dayOfWeek] ?? `Day ${run.target.dayOfWeek}`}{' '}
                        {run.target.teeTime}
                      </div>
                      <div className={styles.muted}>
                        {formatTargetDate(run.targetDate)}
                        {run.bookingRef ? ` · ref ${run.bookingRef}` : ''}
                      </div>
                    </div>
                    <span className={styles.badge}>{run.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
