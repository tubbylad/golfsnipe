import { FlagMark } from '@/components/flag-mark';
import styles from './auth.module.css';

const GHOST_TIMES = `07:28   07:36   07:44   07:52   08:00   08:08
07:36   07:44   07:52   08:00   08:08   08:16
07:44   07:52   08:00   08:08   08:16   08:24
07:52   08:00   08:08   08:16   08:24   08:32`;

/**
 * The green branded "front door" shared by login / signup / password. On desktop
 * the pitch sits beside the form card; on mobile they stack. Pages without a
 * pitch (e.g. the admin password login) just centre the card.
 */
export function AuthShell({
  title,
  pitch,
  children,
}: {
  title: string;
  pitch?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className={styles.wrap}>
      <div className={styles.ghost} aria-hidden>
        {GHOST_TIMES}
      </div>
      <div className={styles.inner}>
        <header className={styles.brand}>
          <FlagMark variant="light" size={26} />
          <span className={styles.wm}>GolfSnipe</span>
        </header>
        <div className={pitch ? styles.stage : styles.stageSolo}>
          {pitch ? <p className={styles.pitch}>{pitch}</p> : null}
          <div className={styles.card}>
            <h1 className={styles.title}>{title}</h1>
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
