'use client';

import { useActionState } from 'react';
import { signupAction, type AuthState } from '../actions';
import styles from '../auth.module.css';

const initialState: AuthState = null;

/**
 * Client form for invite signup. `useActionState` drives the pending state and
 * surfaces the action's `{ error }` result. The invite token rides along as a
 * hidden field so the flow works even before/without client JS.
 */
export function SignupForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(signupAction, initialState);

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="token" value={token} />
      <label className={styles.field}>
        Name
        <input className={styles.input} name="name" autoComplete="name" required />
      </label>
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
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      {state?.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      <button className={styles.button} type="submit" disabled={pending}>
        {pending ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}
