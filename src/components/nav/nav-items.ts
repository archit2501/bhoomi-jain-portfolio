import type { IconName } from '../icon-names';

export type NavId =
  | 'home'
  | 'search'
  | 'explore'
  | 'reels'
  | 'messages'
  | 'notifications'
  | 'create'
  | 'profile'
  | 'insights';

export interface NavItem {
  id: NavId;
  label: string;
  /** Where it goes. Items that open a panel or sheet keep a real page here for no-JS. */
  href: string;
  icon: IconName;
  /** On desktop, opens this slide-out panel (search, notifications) or sheet (create). */
  opens?: 'panel-search' | 'panel-notifications' | 'create-sheet';
}

const ITEMS: Record<Exclude<NavId, 'insights'>, NavItem> = {
  // "/" is her profile (profile-first layout), so Home is the feed, as on Instagram.
  home: { id: 'home', label: 'Home', href: '/feed/', icon: 'home' },
  search: {
    id: 'search',
    label: 'Search',
    href: '/explore/',
    icon: 'search',
    opens: 'panel-search',
  },
  explore: { id: 'explore', label: 'Explore', href: '/explore/', icon: 'explore' },
  reels: { id: 'reels', label: 'Reels', href: '/reels/', icon: 'reels' },
  messages: { id: 'messages', label: 'Messages', href: '/direct/', icon: 'messages' },
  notifications: {
    id: 'notifications',
    label: 'Notifications',
    href: '/notifications/',
    icon: 'notifications',
    opens: 'panel-notifications',
  },
  create: {
    id: 'create',
    label: 'Create',
    href: '/direct/',
    icon: 'create',
    opens: 'create-sheet',
  },
  profile: { id: 'profile', label: 'Profile', href: '/', icon: 'profile' },
};

/** instagram.com's left nav, top to bottom. "More" sits apart at the bottom. */
export const SIDE_NAV: readonly NavItem[] = [
  ITEMS.home,
  ITEMS.search,
  ITEMS.explore,
  ITEMS.reels,
  ITEMS.messages,
  ITEMS.notifications,
  ITEMS.create,
  ITEMS.profile,
];

/** The app's 2026 tab bar: Home, Reels, DMs, Search, Profile (Create moved to the top bar). */
export const BOTTOM_TABS: readonly NavItem[] = [
  ITEMS.home,
  ITEMS.reels,
  ITEMS.messages,
  // On a phone, Search is the Explore page with its search box, as in the app.
  { ...ITEMS.search, opens: undefined },
  ITEMS.profile,
];

/** The phone's top bar: Create on the left, Notifications (the heart) on the right. */
export const TOP_BAR = {
  create: ITEMS.create,
  notifications: { ...ITEMS.notifications, opens: undefined },
} as const;
