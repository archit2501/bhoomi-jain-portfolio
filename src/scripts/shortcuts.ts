import { shortcutFor, type ShortcutAction } from '../lib/shortcuts';

/**
 * The desktop keyboard layer (task 5.1.2). Each key clicks the same button a pointer would, on
 * whatever is in front: the story viewer, the post pop-up, the reels feed, the home feed or a
 * post's page. Typing in a field, or holding Ctrl, Cmd or Alt, leaves keys alone; so does
 * switching single-key shortcuts off on the "?" sheet (kept in this browser).
 */

const OFF = 'bhoomi:shortcuts';

export function shortcutsOn(): boolean {
  try {
    return localStorage.getItem(OFF) !== 'off';
  } catch {
    return true;
  }
}

const typing = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !==
    null;

const click = (el: Element | null | undefined) => {
  if (!(el instanceof HTMLElement) || (el as HTMLButtonElement).disabled) return false;
  el.click();
  return true;
};

/**
 * The reel the player is on: the one in the URL (it follows the reel in view, and moves at once
 * on a step), or else the one nearest the middle of the screen.
 */
function currentReel(): HTMLElement | null {
  const id = /^\/reels\/([^/]+)\/$/.exec(location.pathname)?.[1];
  const byUrl = id
    ? document.querySelector<HTMLElement>(`.reel-item[data-reel="${CSS.escape(id)}"]`)
    : null;
  if (byUrl) return byUrl;
  const middle = innerHeight / 2;
  let best: HTMLElement | null = null;
  let distance = Infinity;
  for (const item of document.querySelectorAll<HTMLElement>('.reel-item')) {
    const rect = item.getBoundingClientRect();
    const d = Math.abs((rect.top + rect.bottom) / 2 - middle);
    if (d < distance) [best, distance] = [item, d];
  }
  return best;
}

/** The feed card at the top of the screen, below the top bar. */
function currentCard(cards: HTMLElement[]): number {
  const top = 72;
  const i = cards.findIndex((card) => card.getBoundingClientRect().bottom > top + 40);
  return i < 0 ? cards.length - 1 : i;
}

function announce(text: string) {
  const status = document.querySelector('[data-shortcut-status]');
  if (status) status.textContent = text;
}

function run(action: ShortcutAction): boolean {
  if (action.startsWith('go:')) {
    location.assign(action.slice(3));
    return true;
  }
  if (action === 'help') {
    const sheet = document.getElementById('shortcuts-sheet') as HTMLDialogElement | null;
    if (!sheet || sheet.open) return false;
    sheet.showModal();
    return true;
  }
  // "/" belongs to the shell (src/scripts/shell.ts), which checks the same switch.
  if (action === 'search') return false;

  const story = document.querySelector<HTMLDialogElement>('#story-viewer[open]');
  if (story) {
    if (action === 'next') return click(story.querySelector('.frame-next'));
    if (action === 'previous') return click(story.querySelector('.frame-prev'));
    return false; // Space and the arrows are the viewer's own.
  }
  const modal = document.querySelector<HTMLDialogElement>('#post-modal[open]');
  if (modal) {
    if (action === 'next') return click(modal.querySelector('.post-next'));
    if (action === 'previous') return click(modal.querySelector('.post-prev'));
    if (action === 'like') return click(modal.querySelector('.post-view .like'));
    if (action === 'save') return click(modal.querySelector('.post-view .save'));
    return false;
  }
  // Any other open dialog or sheet has the keyboard to itself.
  if (document.querySelector('dialog[open], [popover]:popover-open')) return false;

  if (document.querySelector('.reels-feed')) {
    const reel = currentReel();
    if (action === 'next') return click(document.querySelector('.reels-next'));
    if (action === 'previous') return click(document.querySelector('.reels-prev'));
    if (action === 'like') return click(reel?.querySelector('.like'));
    if (action === 'save') return click(reel?.querySelector('.save'));
    if (action === 'pause') return click(reel?.querySelector('.reel-toggle'));
    if (action === 'mute') {
      const video = reel?.querySelector('video');
      if (!reel?.dataset.sound || !video) {
        announce('This reel has no sound.');
        return true;
      }
      video.muted = !video.muted;
      announce(video.muted ? 'Sound off' : 'Sound on');
      return true;
    }
    return false;
  }

  const feed = document.querySelector('[data-feed]');
  if (feed) {
    const cards = [...feed.querySelectorAll<HTMLElement>('.feed-card')].filter(
      (card) => card.offsetParent !== null,
    );
    if (!cards.length) return false;
    const i = currentCard(cards);
    if (action === 'next' || action === 'previous') {
      const target =
        cards[Math.max(0, Math.min(cards.length - 1, i + (action === 'next' ? 1 : -1)))];
      target.scrollIntoView({ block: 'start', behavior: 'instant' });
      target.querySelector<HTMLElement>('h2 a')?.focus({ preventScroll: true });
      return true;
    }
    if (action === 'like') return click(cards[i].querySelector('.like'));
    if (action === 'save') return click(cards[i].querySelector('.save'));
    return false;
  }

  const view = document.querySelector('.post-view');
  if (view) {
    if (action === 'like') return click(view.querySelector('.like'));
    if (action === 'save') return click(view.querySelector('.save'));
  }
  return false;
}

export function initShortcuts(): void {
  const sheet = document.getElementById('shortcuts-sheet') as HTMLDialogElement | null;
  const toggle = sheet?.querySelector<HTMLInputElement>('[data-shortcuts-toggle]');
  if (toggle) {
    toggle.checked = shortcutsOn();
    toggle.addEventListener('change', () => {
      try {
        if (toggle.checked) localStorage.removeItem(OFF);
        else localStorage.setItem(OFF, 'off');
      } catch {
        // Storage blocked: the switch lasts for this page.
      }
      announce(toggle.checked ? 'Single-key shortcuts on' : 'Single-key shortcuts off');
    });
  }
  let opener: HTMLElement | null = null;
  sheet?.querySelector('[data-close]')?.addEventListener('click', () => sheet.close());
  sheet?.addEventListener('click', (event) => {
    if (event.target === sheet) sheet.close();
  });
  sheet?.addEventListener('close', () => opener?.focus());
  document.querySelectorAll<HTMLElement>('[data-open-shortcuts]').forEach((button) => {
    button.addEventListener('click', () => {
      opener = document.querySelector<HTMLElement>('[popovertarget="more-menu"]') ?? button;
      document.getElementById('more-menu')?.hidePopover?.();
      sheet?.showModal();
    });
  });

  let afterG = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (typing(event.target) || !shortcutsOn()) return;
    if (!afterG && (event.key === 'g' || event.key === 'G') && !event.shiftKey) {
      afterG = true;
      clearTimeout(timer);
      timer = setTimeout(() => (afterG = false), 1500);
      return;
    }
    const action = shortcutFor(event.key, afterG);
    afterG = false;
    if (action && run(action)) event.preventDefault();
  });
}
