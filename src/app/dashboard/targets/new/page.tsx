import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listBrsAccounts } from '@/lib/brs-accounts';
import { prisma } from '@/lib/db';
import { TargetPicker } from './target-picker';
import styles from '../../dashboard.module.css';

/** Create a snipe via the live tee-sheet ledger. Needs at least one connected club. */
export default async function NewTargetPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [accounts, players] = await Promise.all([
    listBrsAccounts(user.id),
    prisma.player.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } }),
  ]);

  return (
    <main className={styles.wrap}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>New snipe</h1>
            <p className={styles.subtitle}>
              Pick the day and the tee times you want. The bot books them each week the moment the
              sheet opens.
            </p>
          </div>
          <Link className={styles.back} href="/dashboard">
            &larr; Home
          </Link>
        </div>

        {accounts.length === 0 ? (
          <section className={styles.section}>
            <p className={styles.empty}>
              Connect a club first, then set your tee time.{' '}
              <Link className={styles.back} href="/dashboard/accounts/new">
                Connect a club
              </Link>
            </p>
          </section>
        ) : (
          <TargetPicker
            accounts={accounts.map((a) => ({ id: a.id, clubSlug: a.clubSlug, username: a.username }))}
            players={players.map((p) => ({
              id: p.id,
              displayName: p.displayName,
              isGuest: p.isGuest,
            }))}
          />
        )}
      </div>
    </main>
  );
}
