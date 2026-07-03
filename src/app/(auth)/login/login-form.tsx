'use client';

import { useActionState } from 'react';
import { loginAction, type AuthState } from '../actions';
import styles from '../auth.module.css';

const initialState: AuthState = null;

/** Client login form. Shows the single generic error the action returns (it
 * never reveals whether the email exists). */
export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action} className={styles.form}>
      <label className={styles.field}>
        Email
        <input
          className={styles.input}
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </label>
      <label className={styles.field}>
        Password
        <input
          className={styles.input}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {state?.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      <button className={styles.button} type="submit" disabled={pending}>
        {pending ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  );
}
