import { slideIndex } from '../lib/post-nav';
import { initLike } from './like';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Carousel, like and copy-link behaviour for one PostView, on the post page or in the pop-up. */
export function enhancePostView(root: HTMLElement): void {
  if (root.dataset.enhanced) return;
  root.dataset.enhanced = 'true';

  const track = root.querySelector<HTMLElement>('.track');
  const slides = root.querySelectorAll('.slide');
  const prev = root.querySelector<HTMLButtonElement>('.slide-nav.prev');
  const next = root.querySelector<HTMLButtonElement>('.slide-nav.next');
  const dots = root.querySelectorAll('.dots span');
  const slideStatus = root.querySelector('.slide-status');

  const current = () =>
    track ? slideIndex(track.scrollLeft, track.clientWidth, slides.length) : 0;
  // The slide a smooth scroll is heading to: quick clicks count from there, not from wherever
  // the scroll happens to be mid-animation.
  let target: number | null = null;
  const sync = () => {
    const i = current();
    if (i === target) target = null;
    dots.forEach((dot, j) => dot.classList.toggle('on', j === i));
    if (prev) prev.hidden = i === 0;
    if (next) next.hidden = i === slides.length - 1;
  };
  const go = (step: 1 | -1) => {
    if (!track) return;
    const i = Math.min(slides.length - 1, Math.max(0, (target ?? current()) + step));
    target = i;
    track.scrollTo({ left: i * track.clientWidth, behavior: reducedMotion() ? 'auto' : 'smooth' });
    // Announced on manual navigation only, as the carousel pattern recommends.
    if (slideStatus) slideStatus.textContent = `Slide ${i + 1} of ${slides.length}`;
  };
  prev?.addEventListener('click', () => go(-1));
  next?.addEventListener('click', () => go(1));
  track?.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
  track?.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    // Arrow keys on the slides move slides, not posts.
    event.preventDefault();
    event.stopPropagation();
    go(event.key === 'ArrowRight' ? 1 : -1);
  });

  // Tags on screenshots show and hide together with their button, as on Instagram photos.
  root.querySelectorAll<HTMLButtonElement>('.tags-toggle').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const on = toggle.getAttribute('aria-pressed') !== 'true';
      toggle.setAttribute('aria-pressed', String(on));
      const label = toggle.querySelector('.visually-hidden');
      if (label) label.textContent = on ? 'Hide tags' : 'Show tags';
    });
  });

  initLike(root);

  const share = root.querySelector<HTMLButtonElement>('.share');
  const shareStatus = root.querySelector('.action-row .status');
  share?.addEventListener('click', async () => {
    const url = new URL(share.dataset.href ?? location.pathname, location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      if (shareStatus) shareStatus.textContent = 'Link copied';
    } catch {
      if (shareStatus) shareStatus.textContent = `Copy failed. The link is ${url}`;
    }
  });
}
