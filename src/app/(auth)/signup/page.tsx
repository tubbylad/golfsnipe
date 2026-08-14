import Link from 'next/link';
import { OtpAuthForm } from '../otp-form';
import { requestSignupCodeAction, verifySignupCodeAction } from '../otp-actions';
import styles from '../auth.module.css';

export default function SignupPage() {
  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>Create your account</h1>
        <p className={styles.subtitle}>
          Sign up with your email and mobile. We will text you a code to log in, no password needed.
        </p>
        <OtpAuthForm
          mode="signup"
          requestAction={requestSignupCodeAction}
          verifyAction={verifySignupCodeAction}
        />
        <p className={styles.subtitle}>
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </div>
    </main>
  );
}
