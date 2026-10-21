import { describe, expect, it } from 'vitest';
import { parseTheme, THEME_BOOT_SCRIPT, THEME_KEY } from './theme';

describe('parseTheme', () => {
  it('keeps a known choice', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('auto')).toBe('auto');
  });

  it('follows the system for anything else', () => {
    for (const stored of [null, '', 'sepia', 'DARK']) expect(parseTheme(stored)).toBe('auto');
  });
});

describe('THEME_BOOT_SCRIPT', () => {
  it('sets data-theme from storage and never throws', () => {
    const store = new Map([[THEME_KEY, 'dark']]);
    const classes = new Set<string>();
    const root = {
      dataset: {} as Record<string, string>,
      classList: { add: (c: string) => classes.add(c) },
    };
    const run = new Function('localStorage', 'document', THEME_BOOT_SCRIPT);
    run({ getItem: (k: string) => store.get(k) ?? null }, { documentElement: root });
    expect(root.dataset.theme).toBe('dark');
    expect(classes.has('js')).toBe(true);
    expect(() =>
      run(
        {
          getItem: () => {
            throw new Error('blocked');
          },
        },
        { documentElement: root },
      ),
    ).not.toThrow();
  });
});
