/**
 * Saving a post or reel (task 5.1.2), as Instagram's bookmark: kept in this browser only, listed
 * on /saved/. Every copy of the item on the page, and other tabs, follow along.
 */

const KEY = 'bhoomi:saved';

export interface Saved {
  /** A post's slug, or "reel-<id>". */
  id: string;
  at: number;
}

export function readSaved(): Saved[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((s) => typeof s?.id === 'string') : [];
  } catch {
    return [];
  }
}

function writeSaved(list: Saved[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

const isSaved = (id: string) => readSaved().some((s) => s.id === id);

function showAll(id: string, saved: boolean): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    `button.save[data-save="${CSS.escape(id)}"]`,
  )) {
    button.setAttribute('aria-pressed', String(saved));
    button.setAttribute('aria-label', saved ? 'Remove from saved' : 'Save');
  }
}

export function initSave(root: HTMLElement): void {
  const button = root.querySelector<HTMLButtonElement>('button.save[data-save]');
  if (!button || button.dataset.saveReady) return;
  button.dataset.saveReady = '';
  const id = button.dataset.save!;
  const status = root.querySelector('.action-row .status');
  showAll(id, isSaved(id));
  button.addEventListener('click', () => {
    const saved = !isSaved(id);
    const rest = readSaved().filter((s) => s.id !== id);
    const ok = writeSaved(saved ? [{ id, at: Date.now() }, ...rest] : rest);
    if (!ok) {
      if (status) status.textContent = "Couldn't save in this browser.";
      return;
    }
    showAll(id, saved);
    if (status) status.textContent = saved ? 'Saved' : 'Removed from saved';
  });
}

// Another tab saved or removed something: follow it.
window.addEventListener('storage', (event) => {
  if (event.key !== KEY && event.key !== null) return;
  for (const button of document.querySelectorAll<HTMLButtonElement>('button.save[data-save]')) {
    showAll(button.dataset.save!, isSaved(button.dataset.save!));
  }
});
