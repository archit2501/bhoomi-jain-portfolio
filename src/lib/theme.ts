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
 * Inlined in <head>, before the first paint: marks the page as running JavaScript (so photos can
 * wait to fade in) and applies a saved theme (no light flash in dark). A string, because it must
 * run before any module loads.
 */
export const THEME_BOOT_SCRIPT = `document.documentElement.classList.add('js');try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
