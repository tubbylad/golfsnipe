'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  createTargetAction,
  fetchTeeSheetAction,
  type SheetRelease,
  type TeeSheetSlot,
} from '../actions';
import d from '../../dashboard.module.css';
import p from './picker.module.css';

type PlayerOption = { id: string; displayName: string; isGuest: boolean };

const STATUS_LABEL: Record<TeeSheetSlot['status'], string> = {
  open: 'Open',
  booked: 'Booked',
  unavailable: 'Unavailable',
};

function formatRelease(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * Pick a date, load the real BRS tee sheet as a ledger, tap the times you want in
 * priority order, choose who's playing and whether it repeats, then save. The
 * sheet distinguishes not-yet-open (every time pickable) from live (only Open).
 */
export function TargetPicker({
  accounts,
  players,
}: {
  accounts: { id: string; clubSlug: string; username: string }[];
  players: PlayerOption[];
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<TeeSheetSlot[] | null>(null);
  const [release, setRelease] = useState<SheetRelease | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [size, setSize] = useState(4);
  const [repeat, setRepeat] = useState<'weekly' | 'once'>('weekly');
  const [chosenPlayers, setChosenPlayers] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const weekday = date
    ? new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
    : '';
  const maxPartners = Math.max(0, size - 1);

  const load = () => {
    setError('');
    setSlots(null);
    setRelease(null);
    setPicked([]);
    start(async () => {
      const res = await fetchTeeSheetAction(accountId, date);
      if (res.ok) {
        setSlots(res.slots);
        setRelease(res.release);
      } else {
        setError(res.error);
      }
    });
  };
  const toggle = (t: string) =>
    setPicked((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  const togglePlayer = (id: string) =>
    setChosenPlayers((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const changeSize = (n: number) => {
    setSize(n);
    setChosenPlayers((cur) => cur.slice(0, Math.max(0, n - 1)));
  };

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
            {release ? (
              <p className={p.releaseBanner}>
                This sheet has not opened yet. It goes live <b>{formatRelease(release.time)}</b>. Pick
                the times you want and the bot books the first available one the instant it opens.
              </p>
            ) : (
              <p className={p.liveBanner}>
                This sheet is already open, so these are live bookings. Only <b>Open</b> times can be
                picked.
              </p>
            )}
            <div className={p.ledger}>
              {slots.map((s) => {
                const idx = picked.indexOf(s.time);
                const on = idx >= 0;
                const pickable = !!release || s.status === 'open';
                const statusClass = release
                  ? ''
                  : s.status === 'booked'
                    ? p.booked
                    : s.status === 'unavailable'
                      ? p.unavail
                      : '';
                const body = on ? (
                  <span className={p.body}>Your #{idx + 1} pick</span>
                ) : release ? (
                  <span className={p.body} />
                ) : (
                  <span className={p.body}>{STATUS_LABEL[s.status]}</span>
                );
                const act = on ? (
                  <span className={p.pri}>{idx + 1}</span>
                ) : pickable ? (
                  <span className={p.mini}>+ Pick</span>
                ) : null;

                if (!pickable) {
                  return (
                    <div key={s.time} className={`${p.trow} ${p.rowStatic} ${statusClass}`}>
                      <span className={p.t}>{s.time}</span>
                      {body}
                      <span className={p.act}>{act}</span>
                    </div>
                  );
                }
                return (
                  <button
                    key={s.time}
                    type="button"
                    onClick={() => toggle(s.time)}
                    className={`${p.trow} ${statusClass} ${on ? p.sel : ''}`}
                  >
                    <span className={p.t}>{s.time}</span>
                    {body}
                    <span className={p.act}>{act}</span>
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
                  Tap the times on the left, in order of preference. The bot tries #1 first, then #2,
                  and so on.
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
                <input type="hidden" name="repeat" value={repeat} />
                {chosenPlayers.map((id) => (
                  <input key={id} type="hidden" name="playerIds" value={id} />
                ))}

                <div className={p.divide} style={{ margin: '2px 0 12px' }} />
                <label className={d.checkRow}>
                  <input type="checkbox" name="autoNext" defaultChecked /> If all of those are gone,
                  take the next open slot after your last pick
                </label>

                <div className={p.divide} style={{ margin: '14px 0 0' }} />
                <h3 className={p.panelH} style={{ marginTop: 14 }}>
                  When
                </h3>
                <div className={p.seg}>
                  <button
                    type="button"
                    className={`${p.segBtn} ${repeat === 'weekly' ? p.segOn : ''}`}
                    onClick={() => setRepeat('weekly')}
                  >
                    Every week
                  </button>
                  <button
                    type="button"
                    className={`${p.segBtn} ${repeat === 'once' ? p.segOn : ''}`}
                    onClick={() => setRepeat('once')}
                  >
                    Just once
                  </button>
                </div>
                <p className={p.note} style={{ marginTop: 10 }}>
                  {repeat === 'weekly' ? (
                    <>
                      Repeats <b>every {weekday || 'week'}</b> at that sheet release until you cancel.
                    </>
                  ) : (
                    <>
                      Books <b>{formatDate(date)}</b> once, then stops.
                    </>
                  )}
                </p>

                <div className={p.divide} style={{ margin: '14px 0 0' }} />
                <h3 className={p.panelH} style={{ marginTop: 14 }}>
                  Who's playing
                </h3>
                {players.length === 0 ? (
                  <p className={d.hint} style={{ marginTop: 8 }}>
                    Just you for now. Add the people you play with on the{' '}
                    <Link className={p.plink} href="/dashboard/buddies">
                      Buddies
                    </Link>{' '}
                    page to include them.
                  </p>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <p className={d.hint} style={{ marginBottom: 6 }}>
                      You{chosenPlayers.length ? ` + ${chosenPlayers.length}` : ''}, up to {size}{' '}
                      seats.
                    </p>
                    {players.map((pl) => {
                      const on = chosenPlayers.includes(pl.id);
                      return (
                        <label key={pl.id} className={d.checkRow}>
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={!on && chosenPlayers.length >= maxPartners}
                            onChange={() => togglePlayer(pl.id)}
                          />
                          {pl.displayName}
                          {pl.isGuest ? <span className={d.muted}> (guest)</span> : null}
                        </label>
                      );
                    })}
                  </div>
                )}

                <div className={p.divide} style={{ margin: '14px 0 0' }} />
                <div className={p.pair} style={{ marginTop: 14 }}>
                  <label className={d.field} style={{ flex: 1 }}>
                    Party size
                    <select
                      className={d.select}
                      name="size"
                      value={size}
                      onChange={(e) => changeSize(Number(e.target.value))}
                    >
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
