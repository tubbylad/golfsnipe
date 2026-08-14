'use client';

import { useActionState, useState } from 'react';
import { addBuddyAction, type BuddyState } from './actions';
import styles from '../dashboard.module.css';

const initial: BuddyState = null;

type AccountOption = { id: string; label: string };

/**
 * Client add-buddy form. Submits a name to the server action, which either saves
 * the unique match (and redirects), reports an error, or returns several matches
 * to disambiguate. In that case we render a radio pick and resubmit with the
 * chosen golfer-id.
 */
export function AddBuddyForm({ accounts }: { accounts: AccountOption[] }) {
  const [state, action, pending] = useActionState(addBuddyAction, initial);
  const [pickedGolferId, setPickedGolferId] = useState('');

  const ambiguous = state && 'ambiguous' in state ? state : null;

  return (
    <form action={action} className={styles.form}>
      <label className={styles.field}>
        Search using account
        <select
          className={styles.select}
          name="accountId"
          required
          defaultValue={accounts[0]?.id}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        Buddy name
        <input
          className={styles.input}
          name="name"
          placeholder="First Last"
          defaultValue={ambiguous?.name ?? ''}
          autoComplete="off"
          required
        />
      </label>

      {ambiguous ? (
        <div className={styles.field}>
          <span>More than one member matched. Pick the right one:</span>
          {ambiguous.ambiguous.map((m) => (
            <label key={m.golferId} className={styles.checkRow}>
              <input
                type="radio"
                name="golferId"
                value={m.golferId}
                checked={pickedGolferId === m.golferId}
                onChange={() => setPickedGolferId(m.golferId)}
              />
              {m.label}
            </label>
          ))}
          <input
            type="hidden"
            name="displayName"
            value={ambiguous.ambiguous.find((m) => m.golferId === pickedGolferId)?.label ?? ''}
          />
        </div>
      ) : null}

      {state && 'error' in state ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        className={styles.button}
        type="submit"
        disabled={pending || (!!ambiguous && !pickedGolferId)}
      >
        {pending ? 'Searching...' : ambiguous ? 'Add selected buddy' : 'Find and add buddy'}
      </button>
    </form>
  );
}
