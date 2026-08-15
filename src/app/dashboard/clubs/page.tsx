import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listBrsAccounts } from '@/lib/brs-accounts';
import { RemoveClubButton } from './remove-club-button';
import styles from '../dashboard.module.css';

function titleCase(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

/** Manage the BRS club logins the user books through: list, connect more, remove. */
export default async function ClubsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const accounts = await listBrsAccounts(user.id);

  return (
    <main className={styles.wrap}>
      <div className={styles.container}>
        <div className={styles.pageH}>
          <div>
            <h1 className={styles.title}>Clubs</h1>
            <p className={styles.subtitle}>
              The BRS logins you book through. Connect as many clubs as you play.
            </p>
          </div>
          <Link className={styles.button} href="/dashboard/accounts/new">
            + Connect a club
          </Link>
        </div>

        {accounts.length === 0 ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>No clubs yet</h2>
            <div className={styles.emptyCta}>
              <p>Connect the club you book through by pasting your BRS tee-sheet web address.</p>
              <Link className={styles.button} href="/dashboard/accounts/new">
                Connect a club
              </Link>
            </div>
          </section>
        ) : (
          <div className={styles.queue}>
            <div className={styles.qHead}>
              <h3 className={styles.qHeadTitle}>Connected clubs</h3>
              <span className={styles.qN}>
                {accounts.length} club{accounts.length === 1 ? '' : 's'}
              </span>
            </div>
            {accounts.map((a) => (
              <div key={a.id} className={styles.clubRow}>
                <div>
                  <div className={styles.clubName}>{titleCase(a.clubSlug)}</div>
                  <div className={styles.clubMeta}>
                    {a.username} · course {a.courseId} · {a.targets.length} snipe
                    {a.targets.length === 1 ? '' : 's'}
                  </div>
                </div>
                <RemoveClubButton
                  accountId={a.id}
                  clubName={titleCase(a.clubSlug)}
                  snipeCount={a.targets.length}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
