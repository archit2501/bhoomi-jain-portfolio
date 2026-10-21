import { THEME_KEY, parseTheme, type ThemeChoice } from '../lib/theme';

export type { ThemeChoice };

/** The visitor's saved choice; "auto" when none, or when storage is unavailable. */
export function readTheme(): ThemeChoice {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return 'auto';
  }
}

export function saveTheme(choice: ThemeChoice): void {
  try {
    if (choice === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Private mode or blocked storage: the choice still applies to this page.
  }
}

/** tokens.css reads `data-theme`; without it the system setting decides. */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'auto') delete root.dataset.theme;
  else root.dataset.theme = choice;
}
