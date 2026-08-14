import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { toggleTargetActiveAction } from './actions';
import { DAY_NAMES } from '../_util';
import styles from '../dashboard.module.css';

/** List this user's targets, grouped by BRS account, with pause/resume toggles. */
export default async function TargetsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const accounts = await prisma.brsAccount.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    include: { targets: { orderBy: { createdAt: 'asc' } } },
  });

  return (
    <main className={styles.wrap}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Targets</h1>
            <p className={styles.subtitle}>Tee times the sniper watches for, grouped by account.</p>
          </div>
          <Link className={styles.back} href="/dashboard">
            &larr; Dashboard
          </Link>
        </div>

        <div className={styles.nav}>
          <Link className={styles.navLink} href="/dashboard/targets/new">
            + Add target
          </Link>
          <Link className={styles.navLink} href="/dashboard/week">
            Set who is in
          </Link>
        </div>

        {accounts.length === 0 ? (
          <div className={styles.section}>
            <p className={styles.empty}>
              No BRS accounts yet.{' '}
              <Link className={styles.navLink} href="/dashboard/accounts/new">
                + Add BRS account
              </Link>
            </p>
          </div>
        ) : (
          accounts.map((account) => (
            <section key={account.id} className={styles.section}>
              <h2 className={styles.sectionTitle}>
                {account.clubSlug} <span className={styles.muted}>({account.platform})</span>
              </h2>
              {account.targets.length === 0 ? (
                <p className={styles.empty}>No targets on this account yet.</p>
              ) : (
                <ul className={styles.list}>
                  {account.targets.map((target) => (
                    <li key={target.id} className={styles.accountRow}>
                      <div className={styles.row}>
                        <div>
                          <div className={styles.accountName}>
                            {DAY_NAMES[target.dayOfWeek] ?? `Day ${target.dayOfWeek}`} at{' '}
                            {target.teeTime}
                          </div>
                          <div className={styles.muted}>
                            {target.holes} holes · party of {target.size} · polls{' '}
                            {target.pollWindowStart} to {target.pollWindowEnd}
                          </div>
                        </div>
                        <div className={styles.row}>
                          <span className={styles.badge}>
                            {target.active ? 'Active' : 'Paused'}
                          </span>
                          <form action={toggleTargetActiveAction}>
                            <input type="hidden" name="targetId" value={target.id} />
                            <button className={styles.logout} type="submit">
                              {target.active ? 'Pause' : 'Resume'}
                            </button>
                          </form>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))
        )}
      </div>
    </main>
  );
}
