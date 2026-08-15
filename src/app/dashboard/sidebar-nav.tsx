'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from './_nav';
import styles from './dashboard.module.css';

/** Desktop sidebar links with an active-state marker (needs the pathname, so client-side). */
export function SidebarNav() {
  const path = usePathname();
  return (
    <div className={styles.navlist}>
      {NAV_ITEMS.map((it) => {
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
