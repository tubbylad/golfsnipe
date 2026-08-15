import Link from 'next/link';
import { OtpAuthForm } from '../otp-form';
import { requestLoginCodeAction, verifyLoginCodeAction } from '../otp-actions';
import { AuthShell } from '../auth-shell';
import styles from '../auth.module.css';

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      pitch={
        <>
          The tee time you always miss, <i>booked the second the sheet drops.</i>
        </>
      }
    >
      <p className={styles.subtitle}>Enter your email and we will text a code to your mobile.</p>
      <OtpAuthForm
        mode="login"
        requestAction={requestLoginCodeAction}
        verifyAction={verifyLoginCodeAction}
      />
      <p className={styles.subtitle}>
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </AuthShell>
  );
}
