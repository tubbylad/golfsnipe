import Link from 'next/link';
import { LoginForm } from '../login-form';
import styles from '../../auth.module.css';

export default function PasswordLoginPage() {
  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>Password login</h1>
        <p className={styles.subtitle}>For admin accounts.</p>
        <LoginForm />
        <p className={styles.subtitle}>
          <Link href="/login">Back to code login</Link>
        </p>
      </div>
    </main>
  );
}
