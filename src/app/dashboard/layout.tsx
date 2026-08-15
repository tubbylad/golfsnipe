import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { FlagMark } from '@/components/flag-mark';
import { SidebarNav } from './sidebar-nav';
import { BottomNav } from './bottom-nav';
import { logoutAction } from '../(auth)/actions';
import styles from './dashboard.module.css';

/**
 * The /dashboard app shell. Desktop: a green sidebar beside the page canvas.
 * Mobile: a slim top bar (brand + logout) plus a fixed bottom tab bar. Also the
 * session guard, so every dashboard page can assume an authenticated request.
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

      <header className={styles.topbar}>
        <div className={styles.tbBrand}>
          <FlagMark variant="light" size={22} />
          <span className={styles.wm}>GolfSnipe</span>
        </div>
        <form action={logoutAction}>
          <button className={styles.tbLogout} type="submit">
            Log out
          </button>
        </form>
      </header>

      <div className={styles.canvas}>{children}</div>

      <BottomNav />
    </div>
  );
}
