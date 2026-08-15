import Link from 'next/link';
import { OtpAuthForm } from '../otp-form';
import { requestSignupCodeAction, verifySignupCodeAction } from '../otp-actions';
import { AuthShell } from '../auth-shell';
import styles from '../auth.module.css';

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      pitch={
        <>
          Book your Saturday tee time <i>the second the sheet drops.</i>
        </>
      }
    >
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
    </AuthShell>
  );
}
