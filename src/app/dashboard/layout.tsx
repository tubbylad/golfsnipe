import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { FlagMark } from '@/components/flag-mark';
import { SidebarNav } from './sidebar-nav';
import { logoutAction } from '../(auth)/actions';
import styles from './dashboard.module.css';

/**
 * The /dashboard app shell: a green sidebar (brand + nav + logout) beside the
 * page canvas. Also the session guard, so every dashboard page can assume an
 * authenticated request.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const initials =
    user.name
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'GS';

  return (
    <div className={styles.shell}>
      <nav className={styles.side}>
        <div className={styles.brand}>
          <FlagMark variant="light" size={24} />
          <span className={styles.wm}>GolfSnipe</span>
        </div>
        <SidebarNav />
        <div className={styles.grow} />
        <div className={styles.foot}>
          <span className={styles.ava}>{initials}</span>
          <div className={styles.footMeta}>
            <span className={styles.footNm}>{user.name}</span>
            <form action={logoutAction}>
              <button className={styles.logout} type="submit">
                Log out
              </button>
            </form>
          </div>
        </div>
      </nav>
      <div className={styles.canvas}>{children}</div>
    </div>
  );
}
