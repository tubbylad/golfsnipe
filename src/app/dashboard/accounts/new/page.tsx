import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { saveBrsAccount } from '@/lib/brs-accounts';
import styles from '../../dashboard.module.css';

/**
 * Add a BRS account. The inline Server Action re-reads the session (Server
 * Actions are reachable by direct POST, so it authorizes itself rather than
 * trusting the page render) and hands the plaintext password straight to
 * saveBrsAccount, which encrypts it via the vault before storing.
 */
export default async function NewBrsAccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  async function createAccount(formData: FormData) {
    'use server';
    const current = await getCurrentUser();
    if (!current) redirect('/login');

    const clubSlug = String(formData.get('clubSlug') ?? '').trim();
    const username = String(formData.get('username') ?? '').trim();
    const password = String(formData.get('password') ?? '');
    const platform = formData.get('platform') === 'legacy' ? 'legacy' : 'modern';
    const courseId = Number(formData.get('courseId')) || 1;

    // Required fields are enforced client-side; guard again for direct POSTs.
    if (!clubSlug || !username || !password) redirect('/dashboard/accounts/new');

    await saveBrsAccount({
      userId: current.id,
      clubSlug,
      platform,
      courseId,
      username,
      password,
    });
    redirect('/dashboard');
  }

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
          <form action={createAccount} className={styles.form}>
            <label className={styles.field}>
              Club slug
              <input
                className={styles.input}
                name="clubSlug"
                placeholder="e.g. st-andrews"
                required
              />
            </label>
            <label className={styles.field}>
              Platform
              <select className={styles.select} name="platform" defaultValue="modern">
                <option value="modern">Modern</option>
                <option value="legacy">Legacy</option>
              </select>
            </label>
            <label className={styles.field}>
              Course id
              <input
                className={styles.input}
                name="courseId"
                type="number"
                min={1}
                defaultValue={1}
                required
              />
            </label>
            <label className={styles.field}>
              BRS username
              <input className={styles.input} name="username" autoComplete="off" required />
            </label>
            <label className={styles.field}>
              BRS password
              <input
                className={styles.input}
                name="password"
                type="password"
                autoComplete="off"
                required
              />
            </label>
            <button className={styles.button} type="submit">
              Save account
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
