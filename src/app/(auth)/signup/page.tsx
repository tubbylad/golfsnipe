import Link from 'next/link';
import { SignupForm } from './signup-form';
import styles from '../auth.module.css';

/**
 * Invite-only signup. The invite token arrives as `?token=`; without one there
 * is nothing to sign up against (there is no open registration). The token's
 * actual validity is checked server-side on submit.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] : (params.token ?? '');

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>Create your account</h1>
        {token ? (
          <>
            <p className={styles.subtitle}>You&apos;ve been invited to the Tee-Time Sniper.</p>
            <SignupForm token={token} />
          </>
        ) : (
          <p className={styles.muted}>
            This page needs an invite link. Ask an admin for one, then open the link they send
            you.
          </p>
        )}
        <p className={styles.muted}>
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </div>
    </main>
  );
}
