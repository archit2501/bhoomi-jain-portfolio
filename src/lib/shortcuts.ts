/**
 * The desktop keyboard layer (task 5.1.2): which key does what. The list on the "?" sheet and
 * the handler in src/scripts/shortcuts.ts both read this, so they can't disagree.
 */

export type ShortcutAction =
  'search' | 'next' | 'previous' | 'like' | 'save' | 'mute' | 'pause' | 'help' | `go:${string}`;

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['/'], label: 'Search' },
  { keys: ['J', '→ or ↓'], label: 'Next post, story or reel' },
  { keys: ['K', '← or ↑'], label: 'Previous post, story or reel' },
  { keys: ['L'], label: 'Like' },
  { keys: ['S'], label: 'Save' },
  { keys: ['Space'], label: 'Pause or play' },
  { keys: ['M'], label: 'Sound on or off (reels with sound)' },
  { keys: ['G', 'H'], label: 'Go home' },
  { keys: ['G', 'E'], label: 'Go to Explore' },
  { keys: ['G', 'R'], label: 'Go to Reels' },
  { keys: ['G', 'M'], label: 'Go to Messages' },
  { keys: ['G', 'P'], label: 'Go to her profile' },
  { keys: ['?'], label: 'Show these shortcuts' },
];

/** Where each "G then" letter goes. */
export const GO: Record<string, string> = {
  h: '/feed/',
  e: '/explore/',
  r: '/reels/',
  m: '/direct/',
  p: '/',
};

/** The action for a key press, given whether "G" was just pressed. Null for anything else. */
export function shortcutFor(key: string, afterG: boolean): ShortcutAction | null {
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (afterG) return GO[k] ? `go:${GO[k]}` : null;
  switch (k) {
    case '/':
      return 'search';
    case '?':
      return 'help';
    case 'j':
      return 'next';
    case 'k':
      return 'previous';
    case 'l':
      return 'like';
    case 's':
      return 'save';
    case 'm':
      return 'mute';
    case ' ':
      return 'pause';
    default:
      return null;
  }
}
