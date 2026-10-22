import { initLike } from './like';
import { initSave } from './save';
import { initShare } from './share';

/**
 * The home feed (task 4.1.3): each card's like, link and comments; a caption cut at two lines
 * opens with "more"; and the rail's lens switch narrows the feed to Frontend, Backend or AI work.
 */

const LENS = 'bhoomi:feed-lens';

export function initFeed(): void {
  const feed = document.querySelector<HTMLElement>('[data-feed]');
  if (!feed) return;

  for (const card of feed.querySelectorAll<HTMLElement>('.feed-card')) {
    initLike(card);
    initSave(card);
    initShare(card);
    // The comments live on the post's page.
    card
      .querySelector('.action-row .comment')
      ?.addEventListener('click', () => location.assign(card.dataset.href!));

    const caption = card.querySelector<HTMLElement>('[data-caption]');
    const more = card.querySelector<HTMLButtonElement>('[data-more]');
    if (caption && more) {
      // Only a caption that's actually cut gets "more". Offscreen cards aren't laid out yet
      // (content-visibility), so this is checked again whenever the caption gets its size.
      const check = () => {
        more.hidden =
          caption.classList.contains('open') || caption.scrollHeight <= caption.clientHeight + 1;
      };
      new ResizeObserver(check).observe(caption);
      more.addEventListener('click', () => {
        caption.classList.add('open');
        more.hidden = true;
      });
    }
  }

  const status = document.querySelector<HTMLElement>('[data-feed-status]');
  const apply = (lens: string) => {
    if (lens === 'all') delete feed.dataset.lens;
    else feed.dataset.lens = lens;
    const shown = [...feed.querySelectorAll<HTMLElement>('.feed-card')].filter(
      (card) => lens === 'all' || (card.dataset.lenses ?? '').split(' ').includes(lens),
    ).length;
    if (status) status.textContent = `Showing ${shown} post${shown === 1 ? '' : 's'}`;
  };

  const lensSwitch = document.querySelector<HTMLFieldSetElement>('[data-lens-switch]');
  lensSwitch?.addEventListener('change', (event) => {
    const lens = (event.target as HTMLInputElement).value;
    apply(lens);
    try {
      sessionStorage.setItem(LENS, lens);
    } catch {
      // Storage blocked: the lens lasts for this page.
    }
  });

  // The lens chosen earlier in this tab, if the rail is on screen to show it.
  const saved = savedLens();
  const radio = saved
    ? lensSwitch?.querySelector<HTMLInputElement>(`input[value="${CSS.escape(saved)}"]`)
    : null;
  if (saved && radio && lensSwitch && lensSwitch.offsetParent !== null) {
    radio.checked = true;
    apply(saved);
  }
}

function savedLens(): string | null {
  try {
    return sessionStorage.getItem(LENS);
  } catch {
    return null;
  }
}
