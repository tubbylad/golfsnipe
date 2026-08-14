import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AccountForm } from './account-form';
import styles from '../../dashboard.module.css';

export default async function NewBrsAccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <main className={styles.wrap}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Add a BRS account</h1>
            <p className={styles.subtitle}>
              Your BRS login is encrypted before it is stored and only used to book.
            </p>
          </div>
          <Link className={styles.back} href="/dashboard">
            ← Back
          </Link>
        </div>

        <div className={styles.section}>
          <AccountForm />
        </div>
      </div>
    </main>
  );
}
