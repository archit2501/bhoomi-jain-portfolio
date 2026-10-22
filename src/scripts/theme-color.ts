/**
 * The browser's own bar colour, for a screen that differs from the page: the story viewer is
 * black while it's open, as in the app. An override goes first, so it wins over the page's own.
 */
export function setThemeColor(color: string | null): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-override]');
  if (!color) {
    meta?.remove();
    return;
  }
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.dataset.override = '';
    document.head.prepend(meta);
  }
  meta.content = color;
}
