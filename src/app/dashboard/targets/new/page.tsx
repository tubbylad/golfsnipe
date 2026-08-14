import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listBrsAccounts } from '@/lib/brs-accounts';
import { TargetPicker } from './target-picker';
import styles from '../../dashboard.module.css';

/** Create a Target via the live tee-sheet picker. Needs at least one BRS account. */
export default async function NewTargetPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const accounts = await listBrsAccounts(user.id);

  return (
    <main className={styles.wrap}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Add a target</h1>
            <p className={styles.subtitle}>
              Pick the day and the tee times you want. The bot snipes them each week the moment the
              sheet opens.
            </p>
          </div>
          <Link className={styles.back} href="/dashboard/targets">
            &larr; Back
          </Link>
        </div>

        <div className={styles.section}>
          {accounts.length === 0 ? (
            <p className={styles.empty}>
              Add a BRS account first, then you can set a target.{' '}
              <Link className={styles.navLink} href="/dashboard/accounts/new">
                + Add BRS account
              </Link>
            </p>
          ) : (
            <TargetPicker
              accounts={accounts.map((a) => ({ id: a.id, clubSlug: a.clubSlug, username: a.username }))}
            />
          )}
        </div>
      </div>
    </main>
  );
}
