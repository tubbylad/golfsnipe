'use client';

import { useState, useTransition } from 'react';
import { createTargetAction, fetchTeeSheetAction, type TeeSheetSlot } from '../actions';
import d from '../../dashboard.module.css';
import p from './picker.module.css';

const STATUS_LABEL: Record<TeeSheetSlot['status'], string> = {
  open: 'Open',
  booked: 'Booked',
  unavailable: 'Unavailable',
};

/** Pick a date, load the real BRS tee sheet as a ledger, and tap the times you
 * want in priority order. Booked/unreleased times are pickable too, so the bot
 * can grab them the instant they open. */
export function TargetPicker({
  accounts,
}: {
  accounts: { id: string; clubSlug: string; username: string }[];
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<TeeSheetSlot[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const weekday = date
    ? new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
    : '';

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
      <div className={p.top}>
        <label className={d.field}>
          Club
          <select
            className={d.select}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.clubSlug} ({a.username})
              </option>
            ))}
          </select>
        </label>
        <label className={d.field}>
          Date
          <input
            className={d.input}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button
          className={d.button}
          type="button"
          onClick={load}
          disabled={!accountId || !date || pending}
        >
          {pending ? 'Loading...' : 'Show tee sheet'}
        </button>
      </div>

      {error ? (
        <p className={d.error} role="alert">
          {error}
        </p>
      ) : null}

      {slots ? (
        <div className={p.grid}>
          <div className={p.ledgerWrap}>
            <div className={p.ledger}>
              {slots.map((s) => {
                const idx = picked.indexOf(s.time);
                const on = idx >= 0;
                const statusClass =
                  s.status === 'booked' ? p.booked : s.status === 'unavailable' ? p.unavail : '';
                return (
                  <button
                    key={s.time}
                    type="button"
                    onClick={() => toggle(s.time)}
                    className={`${p.trow} ${statusClass} ${on ? p.sel : ''}`}
                  >
                    <span className={p.t}>{s.time}</span>
                    <span className={p.body}>{on ? `Your #${idx + 1} pick` : STATUS_LABEL[s.status]}</span>
                    <span className={p.act}>
                      {on ? (
                        <span className={p.pri}>{idx + 1}</span>
                      ) : (
                        <span className={p.mini}>+ Pick</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className={p.panel}>
            <div>
              <h3 className={p.panelH}>Your picks</h3>
              {picked.length === 0 ? (
                <p className={d.hint} style={{ marginTop: 8 }}>
                  Tap times on the left, in order of preference. You can pick times shown as taken;
                  the bot grabs them the instant they release.
                </p>
              ) : (
                <div className={p.picklist} style={{ marginTop: 10 }}>
                  {picked.map((t, i) => (
                    <div key={t} className={p.pl}>
                      <span className={p.pn}>{i + 1}</span>
                      {t}
                      <button type="button" className={p.plX} onClick={() => toggle(t)}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {picked.length > 0 ? (
              <form action={createTargetAction}>
                <input type="hidden" name="brsAccountId" value={accountId} />
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="teeTimes" value={picked.join(',')} />
                <div className={p.divide} style={{ margin: '2px 0 12px' }} />
                <label className={d.checkRow}>
                  <input type="checkbox" name="autoNext" defaultChecked /> If all of those are gone,
                  take the next open slot after your last pick
                </label>
                <p className={p.note} style={{ margin: '10px 0' }}>
                  Repeats <b>every {weekday || 'week'}</b> at that sheet release until you cancel.
                </p>
                <div className={p.pair}>
                  <label className={d.field} style={{ flex: 1 }}>
                    Party size
                    <select className={d.select} name="size" defaultValue="4">
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                    </select>
                  </label>
                  <label className={d.field} style={{ flex: 1 }}>
                    Holes
                    <select className={d.select} name="holes" defaultValue="18">
                      <option value="18">18</option>
                      <option value="9">9</option>
                    </select>
                  </label>
                </div>
                <button
                  className={d.button}
                  type="submit"
                  style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}
                >
                  Add to queue
                </button>
              </form>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
