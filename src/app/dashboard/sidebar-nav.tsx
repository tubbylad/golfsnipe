'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './dashboard.module.css';

const ITEMS = [
  { href: '/dashboard', label: 'Home', exact: true },
  { href: '/dashboard/targets/new', label: 'New snipe' },
  { href: '/dashboard/buddies', label: 'Buddies' },
  { href: '/dashboard/week', label: 'This week' },
];

/** Sidebar links with an active-state marker (needs the pathname, so client-side). */
export function SidebarNav() {
  const path = usePathname();
  return (
    <div className={styles.navlist}>
      {ITEMS.map((it) => {
        const active = it.exact ? path === it.href : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={active ? styles.sideOn : styles.sideLink}>
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
