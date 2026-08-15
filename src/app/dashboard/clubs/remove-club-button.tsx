'use client';

import { useState } from 'react';
import { removeBrsAccountAction } from './actions';
import styles from '../dashboard.module.css';

/** "Remove" a club with an inline confirm step, since it also deletes the club's snipes. */
export function RemoveClubButton({
  accountId,
  clubName,
  snipeCount,
}: {
  accountId: string;
  clubName: string;
  snipeCount: number;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button type="button" className={styles.linkDanger} onClick={() => setConfirming(true)}>
        Remove
      </button>
    );
  }

  return (
    <form action={removeBrsAccountAction} className={styles.confirmRow}>
      <input type="hidden" name="accountId" value={accountId} />
      <span className={styles.confirmText}>
        Remove {clubName}
        {snipeCount > 0 ? ` and its ${snipeCount} snipe${snipeCount === 1 ? '' : 's'}` : ''}?
      </span>
      <button type="submit" className={styles.dangerBtn}>
        Remove
      </button>
      <button type="button" className={styles.linkMuted} onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </form>
  );
}
