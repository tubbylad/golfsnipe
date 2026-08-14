'use client';

import { useActionState } from 'react';
import { addBrsAccountAction, type AccountState } from './actions';
import styles from '../../dashboard.module.css';

/** Add-account form: one pasted URL replaces slug/platform/course; login is verified on save. */
export function AccountForm() {
  const [state, action, pending] = useActionState<AccountState, FormData>(addBrsAccountAction, null);

  return (
    <form action={action} className={styles.form}>
      <label className={styles.field}>
        Your BRS tee-sheet web address
        <input
          className={styles.input}
          name="url"
          type="url"
          placeholder="https://members.brsgolf.com/yourclub/tee-sheet/1"
          required
        />
      </label>
      <p className={styles.hint}>
        Open your club tee sheet in BRS and paste the address from your browser. We read your club and
        course from it, so you do not need to know them.
      </p>
      <label className={styles.field}>
        BRS username (your membership or card number)
        <input className={styles.input} name="username" autoComplete="off" required />
      </label>
      <label className={styles.field}>
        BRS password
        <input className={styles.input} name="password" type="password" autoComplete="off" required />
      </label>
      {state?.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      <button className={styles.button} type="submit" disabled={pending}>
        {pending ? 'Checking your login...' : 'Save account'}
      </button>
    </form>
  );
}
