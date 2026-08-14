'use client';

import { useActionState, useState } from 'react';
import { saveWeekAction, type WeekState } from './actions';
import styles from '../dashboard.module.css';

const initial: WeekState = null;

type PlayerOption = {
  id: string;
  displayName: string;
  isGuest: boolean;
  brsGolferId: string | null;
};

/**
 * Client "who's in" form. Checkboxes are capped at the target's party size
 * (unchecked boxes disable once the cap is hit); the server action re-checks the
 * cap and writes the WeeklyRun. Defaults come pre-checked from the server.
 */
export function WeekForm({
  targetId,
  size,
  players,
  selectedIds,
}: {
  targetId: string;
  size: number;
  players: PlayerOption[];
  selectedIds: string[];
}) {
  const [state, action, pending] = useActionState(saveWeekAction, initial);
  const [selected, setSelected] = useState<string[]>(selectedIds);

  function toggle(id: string, checked: boolean) {
    setSelected((cur) => (checked ? [...cur, id] : cur.filter((x) => x !== id)));
  }

  const atMax = selected.length >= size;

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="targetId" value={targetId} />
      <p className={styles.hint}>
        Pick up to {size}. Selected {selected.length} of {size}.
      </p>

      {players.length === 0 ? (
        <p className={styles.empty}>No buddies yet. Add some on the Buddies page first.</p>
      ) : (
        players.map((p) => {
          const isChecked = selected.includes(p.id);
          return (
            <label key={p.id} className={styles.checkRow}>
              <input
                type="checkbox"
                name="playerIds"
                value={p.id}
                checked={isChecked}
                disabled={!isChecked && atMax}
                onChange={(e) => toggle(p.id, e.target.checked)}
              />
              {p.displayName}{' '}
              <span className={styles.muted}>
                {p.isGuest ? '(guest)' : p.brsGolferId ? `(id ${p.brsGolferId})` : '(no id)'}
              </span>
            </label>
          );
        })
      )}

      {state && 'error' in state ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      {state && 'ok' in state ? (
        <p className={styles.hint} role="status">
          Saved. {state.count} player{state.count === 1 ? '' : 's'} set for this week.
        </p>
      ) : null}

      <button
        className={styles.button}
        type="submit"
        disabled={pending || players.length === 0}
      >
        {pending ? 'Saving...' : 'Save who is in'}
      </button>
    </form>
  );
}
