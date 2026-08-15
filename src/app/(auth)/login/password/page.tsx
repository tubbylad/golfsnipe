import Link from 'next/link';
import { LoginForm } from '../login-form';
import { AuthShell } from '../../auth-shell';
import styles from '../../auth.module.css';

export default function PasswordLoginPage() {
  return (
    <AuthShell title="Password login">
      <p className={styles.subtitle}>For admin accounts.</p>
      <LoginForm />
      <p className={styles.subtitle}>
        <Link href="/login">Back to code login</Link>
      </p>
    </AuthShell>
  );
}
