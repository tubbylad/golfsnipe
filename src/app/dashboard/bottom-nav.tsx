'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS, type NavIcon } from './_nav';
import styles from './dashboard.module.css';

const ICONS: Record<NavIcon, React.ReactNode> = {
  home: <path d="M3 11 L12 4 L21 11 M5 9.5 V20 H19 V9.5" />,
  plus: <path d="M12 5 V19 M5 12 H19" />,
  people: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19 c0-3 2.6-4.8 5.5-4.8 s5.5 1.8 5.5 4.8" />
      <circle cx="17.5" cy="9.5" r="2.2" />
    </>
  ),
  week: (
    <>
      <rect x="4" y="5.5" width="16" height="15" rx="1.5" />
      <path d="M4 10 H20 M8.5 3.5 V7 M15.5 3.5 V7" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21 s6.5-5.8 6.5-10.5 a6.5 6.5 0 0 0-13 0 C5.5 15.2 12 21 12 21 z" />
      <circle cx="12" cy="10.5" r="2.4" />
    </>
  ),
};

/** Fixed bottom tab bar for mobile (thumb-reach nav, no scrolling, no hidden items). */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav className={styles.bottomnav} aria-label="Primary">
      {NAV_ITEMS.map((it) => {
        const active = it.exact ? path === it.href : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={active ? styles.tabOn : styles.tab}>
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {ICONS[it.icon]}
            </svg>
            <span>{it.short}</span>
          </Link>
        );
      })}
    </nav>
  );
}
