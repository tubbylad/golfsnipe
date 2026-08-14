'use client';

import { useActionState } from 'react';
import styles from './auth.module.css';
import type { CodeState } from './otp-actions';

type Action = (state: CodeState, formData: FormData) => Promise<CodeState>;

/**
 * Two-step passwordless form. Step 1 collects details and requests an SMS code;
 * once sent, step 2 collects the 6-digit code. Signup asks for name + mobile too;
 * login only needs the email (the code goes to the mobile on file).
 */
export function OtpAuthForm({
  mode,
  requestAction,
  verifyAction,
}: {
  mode: 'signup' | 'login';
  requestAction: Action;
  verifyAction: Action;
}) {
  const [reqState, req, reqPending] = useActionState<CodeState, FormData>(requestAction, null);
  const [verState, ver, verPending] = useActionState<CodeState, FormData>(verifyAction, null);

  const sent = reqState && 'sent' in reqState ? reqState : null;

  if (!sent) {
    return (
      <form action={req} className={styles.form}>
        {mode === 'signup' && (
          <label className={styles.field}>
            Name
            <input className={styles.input} name="name" autoComplete="name" required />
          </label>
        )}
        <label className={styles.field}>
          Email
          <input className={styles.input} name="email" type="email" autoComplete="email" required />
        </label>
        {mode === 'signup' && (
          <label className={styles.field}>
            Mobile number
            <input
              className={styles.input}
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="07700 900000"
              required
            />
          </label>
        )}
        {reqState && 'error' in reqState ? (
          <p className={styles.error} role="alert">
            {reqState.error}
          </p>
        ) : null}
        <button className={styles.button} type="submit" disabled={reqPending}>
          {reqPending ? 'Sending code...' : 'Text me a code'}
        </button>
      </form>
    );
  }

  return (
    <form action={ver} className={styles.form}>
      <p className={styles.subtitle}>We texted a 6-digit code to your mobile.</p>
      <input type="hidden" name="email" value={sent.email} />
      <label className={styles.field}>
        Code
        <input
          className={styles.input}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
        />
      </label>
      {verState && 'error' in verState ? (
        <p className={styles.error} role="alert">
          {verState.error}
        </p>
      ) : null}
      <button className={styles.button} type="submit" disabled={verPending}>
        {verPending ? 'Verifying...' : mode === 'signup' ? 'Create account' : 'Log in'}
      </button>
    </form>
  );
}
