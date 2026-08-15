'use client';

import { useState } from 'react';
import { toggleTargetActiveAction, deleteTargetAction } from './targets/actions';
import styles from './dashboard.module.css';

/** Pause/resume and cancel (with confirm) for a snipe, shown on the Home list. */
export function SnipeControls({ targetId, active }: { targetId: string; active: boolean }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <form action={deleteTargetAction} className={styles.confirmRow}>
        <input type="hidden" name="targetId" value={targetId} />
        <span className={styles.confirmText}>Cancel this snipe?</span>
        <button type="submit" className={styles.dangerBtn}>
          Cancel it
        </button>
        <button type="button" className={styles.linkMuted} onClick={() => setConfirming(false)}>
          Keep
        </button>
      </form>
    );
  }

  return (
    <div className={styles.snipeControls}>
      <form action={toggleTargetActiveAction}>
        <input type="hidden" name="targetId" value={targetId} />
        <button type="submit" className={styles.miniBtn}>
          {active ? 'Pause' : 'Resume'}
        </button>
      </form>
      <button type="button" className={styles.linkDanger} onClick={() => setConfirming(true)}>
        Cancel
      </button>
    </div>
  );
}
