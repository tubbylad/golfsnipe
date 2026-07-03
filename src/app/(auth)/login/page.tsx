import { LoginForm } from './login-form';
import styles from '../auth.module.css';

export default function LoginPage() {
  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>Log in</h1>
        <p className={styles.subtitle}>Welcome back to the Tee-Time Sniper.</p>
        <LoginForm />
      </div>
    </main>
  );
}
