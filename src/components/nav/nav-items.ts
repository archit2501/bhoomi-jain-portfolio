export type NavId = 'home' | 'reels' | 'messages';

export interface NavItem {
  id: NavId;
  label: string;
  href: string;
  /** Opens the contact sheet instead of navigating; the href is the no-JS fallback. */
  opensContact?: boolean;
}

/**
 * Instagram's 2026 order (Home, Reels, Messages, Search, Profile), keeping only items that do
 * something real on a portfolio. Search has nothing to search, and Profile would be the
 * visitor's own profile, so both are left out.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'home', label: 'Home', href: '/' },
  { id: 'reels', label: 'Reels', href: '/reels/' },
  { id: 'messages', label: 'Messages', href: '#contact', opensContact: true },
];
