'use client';

import { useState, useTransition } from 'react';
import { createTargetAction, fetchTeeSheetAction, type TeeSheetSlot } from '../actions';
import styles from '../../dashboard.module.css';

const STATUS_LABEL: Record<TeeSheetSlot['status'], string> = {
  open: 'open',
  booked: 'booked',
  unavailable: 'not released',
};

/** Pick a date, load the real BRS tee sheet, and tap the times you want in priority order. */
export function TargetPicker({ accounts }: { accounts: { id: string; clubSlug: string; username: string }[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<TeeSheetSlot[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const load = () => {
    setError('');
    setSlots(null);
    setPicked([]);
    start(async () => {
      const res = await fetchTeeSheetAction(accountId, date);
      if (res.ok) setSlots(res.slots);
      else setError(res.error);
    });
  };
  const toggle = (t: string) =>
    setPicked((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  return (
    <div>
      <label className={styles.field}>
        BRS account
        <select className={styles.select} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.clubSlug} ({a.username})
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        Date
        <input className={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <button
        className={styles.button}
        type="button"
        onClick={load}
        disabled={!accountId || !date || pending}
      >
        {pending ? 'Loading tee sheet...' : 'Show tee sheet'}
      </button>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {slots ? (
        <>
          <p className={styles.hint}>
            Tap the times you want, in order of preference. You can pick times shown as taken; the bot
            grabs them the moment they release.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: '8px',
              margin: '12px 0',
              maxHeight: '360px',
              overflowY: 'auto',
            }}
          >
            {slots.map((s) => {
              const idx = picked.indexOf(s.time);
              const on = idx >= 0;
              return (
                <button
                  key={s.time}
                  type="button"
                  onClick={() => toggle(s.time)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: on ? '2px solid #1896ff' : '1px solid rgba(128,128,128,0.4)',
                    background: on ? 'rgba(24,150,255,0.14)' : 'transparent',
                    color: 'inherit',
                    cursor: 'pointer',
                    textAlign: 'left',
                    font: 'inherit',
                  }}
                >
                  <strong>{s.time}</strong>
                  {on ? ` #${idx + 1}` : ''}
                  <br />
                  <span style={{ fontSize: '12px', opacity: 0.7 }}>{STATUS_LABEL[s.status]}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {picked.length > 0 ? (
        <form action={createTargetAction} className={styles.form}>
          <input type="hidden" name="brsAccountId" value={accountId} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="teeTimes" value={picked.join(',')} />
          <p className={styles.hint}>Priority: {picked.join(' then ')}</p>
          <label className={styles.checkRow}>
            <input type="checkbox" name="autoNext" /> If all of those are gone, take the next available
            later slot
          </label>
          <label className={styles.field}>
            Party size
            <select className={styles.select} name="size" defaultValue="4">
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </label>
          <label className={styles.field}>
            Holes
            <select className={styles.select} name="holes" defaultValue="18">
              <option value="18">18</option>
              <option value="9">9</option>
            </select>
          </label>
          <button className={styles.button} type="submit">
            Save target
          </button>
        </form>
      ) : null}
    </div>
  );
}
