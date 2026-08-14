import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { listBrsAccounts } from '@/lib/brs-accounts';
import { AddBuddyForm } from './add-buddy-form';
import { addGuestAction, deleteBuddyAction } from './actions';
import styles from '../dashboard.module.css';

/** List this user's Players and offer add-buddy (roster lookup) + add-guest forms. */
export default async function BuddiesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [players, accounts] = await Promise.all([
    prisma.player.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } }),
    listBrsAccounts(user.id),
  ]);

  const accountOptions = accounts.map((a) => ({
    id: a.id,
    label: `${a.clubSlug} (${a.username})`,
  }));

  return (
    <main className={styles.wrap}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Buddies</h1>
            <p className={styles.subtitle}>The golfers you book with, resolved to their BRS ids.</p>
          </div>
          <Link className={styles.back} href="/dashboard">
            &larr; Dashboard
          </Link>
        </div>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Your players</h2>
          {players.length === 0 ? (
            <p className={styles.empty}>No buddies yet. Add one below.</p>
          ) : (
            <ul className={styles.list}>
              {players.map((p) => (
                <li key={p.id} className={styles.accountRow}>
                  <div className={styles.row}>
                    <div className={styles.accountName}>{p.displayName}</div>
                    <span className={styles.badge}>
                      {p.isGuest ? 'Guest' : p.brsGolferId ? `id ${p.brsGolferId}` : 'No id'}
                    </span>
                    <form action={deleteBuddyAction} style={{ marginLeft: 'auto' }}>
                      <input type="hidden" name="playerId" value={p.id} />
                      <button
                        type="submit"
                        aria-label={`Remove ${p.displayName}`}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'inherit',
                          opacity: 0.7,
                          cursor: 'pointer',
                          font: 'inherit',
                          textDecoration: 'underline',
                        }}
                      >
                        Remove
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Add a buddy</h2>
          {accountOptions.length === 0 ? (
            <p className={styles.empty}>
              Add a BRS account first so we can search its club roster.{' '}
              <Link className={styles.navLink} href="/dashboard/accounts/new">
                + Add BRS account
              </Link>
            </p>
          ) : (
            <AddBuddyForm accounts={accountOptions} />
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Add a guest</h2>
          <p className={styles.hint}>
            A guest has no BRS membership and is booked into an open seat.
          </p>
          <form action={addGuestAction} className={styles.form}>
            <label className={styles.field}>
              Guest name
              <input
                className={styles.input}
                name="displayName"
                placeholder="Guest name"
                autoComplete="off"
                required
              />
            </label>
            <button className={styles.button} type="submit">
              Add guest
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
