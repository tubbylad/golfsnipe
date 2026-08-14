import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listBrsAccounts } from '@/lib/brs-accounts';
import { createTargetAction } from '../actions';
import { DAY_NAMES } from '../../_util';
import styles from '../../dashboard.module.css';

/**
 * Create a Target. Needs at least one BRS account to attach to; when there are
 * none we point the user at the add-account page instead of rendering the form.
 * The action re-validates and re-checks account ownership on submit.
 */
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
              A tee time to snipe each week the moment the sheet opens.
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
            <form action={createTargetAction} className={styles.form}>
              <label className={styles.field}>
                BRS account
                <select className={styles.select} name="brsAccountId" required>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.clubSlug} ({a.username})
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                Day of week
                <select className={styles.select} name="dayOfWeek" defaultValue="6">
                  {DAY_NAMES.map((day, i) => (
                    <option key={day} value={i}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                Tee time
                <input
                  className={styles.input}
                  name="teeTime"
                  type="time"
                  defaultValue="07:45"
                  required
                />
              </label>
              <label className={styles.field}>
                Holes
                <select className={styles.select} name="holes" defaultValue="18">
                  <option value="18">18</option>
                  <option value="9">9</option>
                </select>
              </label>
              <label className={styles.field}>
                Party size
                <select className={styles.select} name="size" defaultValue="4">
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
              </label>
              <label className={styles.field}>
                Poll window start
                <input
                  className={styles.input}
                  name="pollWindowStart"
                  type="time"
                  defaultValue="18:00"
                  required
                />
              </label>
              <label className={styles.field}>
                Poll window end
                <input
                  className={styles.input}
                  name="pollWindowEnd"
                  type="time"
                  defaultValue="21:00"
                  required
                />
              </label>
              <button className={styles.button} type="submit">
                Save target
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
