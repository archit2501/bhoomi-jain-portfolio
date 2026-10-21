export const THEME_KEY = 'bhoomi:theme';
export const THEME_CHOICES = ['auto', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

/** Anything stored that isn't a known choice means "follow the system". */
export function parseTheme(stored: string | null): ThemeChoice {
  return (THEME_CHOICES as readonly string[]).includes(stored ?? '')
    ? (stored as ThemeChoice)
    : 'auto';
}

/**
 * Inlined in <head> so a saved theme applies before the first paint (no light flash in dark).
 * Kept as a string because it must run before any module loads.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
