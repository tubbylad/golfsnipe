import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listBrsAccounts } from '@/lib/brs-accounts';
import { logoutAction } from '../(auth)/actions';
import styles from './dashboard.module.css';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default async function DashboardPage() {
  // The layout already guards this tree; re-read here for the user + to satisfy
  // the type (and to fetch this user's accounts).
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const accounts = await listBrsAccounts(user.id);

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

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>BRS accounts</h2>
          {accounts.length === 0 ? (
            <p className={styles.empty}>No BRS accounts yet — add one to start sniping.</p>
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
      </div>
    </main>
  );
}
