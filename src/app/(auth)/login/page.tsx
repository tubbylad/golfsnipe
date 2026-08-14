import Link from 'next/link';
import { OtpAuthForm } from '../otp-form';
import { requestLoginCodeAction, verifyLoginCodeAction } from '../otp-actions';
import styles from '../auth.module.css';

export default function LoginPage() {
  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>Log in</h1>
        <p className={styles.subtitle}>Enter your email and we will text a code to your mobile.</p>
        <OtpAuthForm
          mode="login"
          requestAction={requestLoginCodeAction}
          verifyAction={verifyLoginCodeAction}
        />
        <p className={styles.subtitle}>
          New here? <Link href="/signup">Create an account</Link>
        </p>
        <p className={styles.subtitle}>
          <Link href="/login/password">Admin password login</Link>
        </p>
      </div>
    </main>
  );
}
