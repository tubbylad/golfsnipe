'use client';

import { useActionState, useState } from 'react';
import { addBuddyAction, type BuddyState } from './actions';
import styles from '../dashboard.module.css';

const initial: BuddyState = null;

type AccountOption = { id: string; label: string };

/**
 * Client add-buddy form. Submits a name; the action always returns the matching
 * member(s) for confirmation (never saves straight away). The user confirms the
 * right person, then we resubmit with the chosen golfer-id to save.
 */
export function AddBuddyForm({ accounts }: { accounts: AccountOption[] }) {
  const [state, action, pending] = useActionState(addBuddyAction, initial);
  const [pickedGolferId, setPickedGolferId] = useState('');

  const found = state && 'ambiguous' in state ? state : null;
  const single = found?.ambiguous.length === 1 ? found.ambiguous[0].golferId : '';
  const picked = pickedGolferId || single; // a lone match is pre-selected for a one-tap confirm
  const pickedLabel = found?.ambiguous.find((m) => m.golferId === picked)?.label ?? '';

  return (
    <form action={action} className={styles.form}>
      <label className={styles.field}>
        Search using account
        <select className={styles.select} name="accountId" required defaultValue={accounts[0]?.id}>
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
          defaultValue={found?.name ?? ''}
          autoComplete="off"
          required
        />
      </label>

      {found ? (
        <div className={styles.field}>
          <span>
            {found.ambiguous.length === 1
              ? 'Confirm this is the right person, then add:'
              : 'More than one member matched. Pick the right one:'}
          </span>
          {found.ambiguous.map((m) => (
            <label key={m.golferId} className={styles.checkRow}>
              <input
                type="radio"
                name="golferId"
                value={m.golferId}
                checked={picked === m.golferId}
                onChange={() => setPickedGolferId(m.golferId)}
              />
              {m.label}
            </label>
          ))}
          <input type="hidden" name="displayName" value={pickedLabel} />
        </div>
      ) : null}

      {state && 'error' in state ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}

      <button className={styles.button} type="submit" disabled={pending || (!!found && !picked)}>
        {pending
          ? 'Searching...'
          : found
            ? pickedLabel
              ? `Add ${pickedLabel}`
              : 'Add selected buddy'
            : 'Find buddy'}
      </button>
    </form>
  );
}
