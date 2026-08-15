/** Dashboard navigation items, shared by the desktop sidebar and the mobile
 * bottom tab bar. `_`-prefixed so the App Router ignores it as a route. */
export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home', short: 'Home', icon: 'home', exact: true },
  { href: '/dashboard/targets/new', label: 'New snipe', short: 'New', icon: 'plus', exact: false },
  { href: '/dashboard/clubs', label: 'Clubs', short: 'Clubs', icon: 'pin', exact: false },
  { href: '/dashboard/buddies', label: 'Buddies', short: 'Buddies', icon: 'people', exact: false },
  { href: '/dashboard/week', label: 'This week', short: 'Week', icon: 'week', exact: false },
] as const;

export type NavIcon = (typeof NAV_ITEMS)[number]['icon'];
