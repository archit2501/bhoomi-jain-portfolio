import { DOUBLE_TAP_MS } from '../lib/post-nav';
import { PLAY_VISIBLE, postersToLoad } from '../lib/reels';
import { initLike } from './like';
import { initShare } from './share';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The reels feed (ReelsFeed.astro). A reel plays, muted and with captions on, once 60% of it is
 * on screen, and pauses when it scrolls away or the tab is hidden. The URL and title follow the
 * reel in view. Only the reel on screen and the next one load their poster; a video loads when
 * its reel first plays. Reels are silent, so the only control is play and pause: the button,
 * or a tap on the video (a double-tap likes). With reduced motion nothing plays on its own.
 */
export function initReelsFeed(): void {
  const feed = document.querySelector<HTMLElement>('.reels-feed');
  if (!feed) return;
  const items = [...feed.querySelectorAll<HTMLElement>('.reel-item')];
  const prev = document.querySelector<HTMLButtonElement>('.reels-prev');
  const next = document.querySelector<HTMLButtonElement>('.reels-next');
  let current = -1;
  // The page opens on the reel in its URL, which comes first; don't restore an old scroll.
  history.scrollRestoration = 'manual';
  // A reel the visitor paused stays paused when they scroll back to it.
  const pausedByVisitor = new Set<HTMLElement>();

  const videoOf = (item: HTMLElement) => item.querySelector<HTMLVideoElement>('.reel-video');

  const loadPoster = (item: HTMLElement) => {
    const img = item.querySelector<HTMLImageElement>('.reel-poster');
    if (img?.dataset.src && !img.getAttribute('src')) img.src = img.dataset.src;
  };

  const play = (item: HTMLElement) => {
    const video = videoOf(item);
    if (!video) return;
    if (!video.getAttribute('src') && video.dataset.src) video.src = video.dataset.src;
    // Captions on by default; some engines leave a default track hidden until asked.
    for (const track of video.textTracks) track.mode = 'showing';
    if (reducedMotion() || pausedByVisitor.has(item) || document.hidden) return;
    void video.play().catch(() => {});
  };

  const pause = (item: HTMLElement) => {
    const video = videoOf(item);
    if (video && !video.paused) video.pause();
  };

  const show = (i: number) => {
    current = i;
    items.forEach((item, j) => j !== i && pause(item));
    for (const j of postersToLoad(items.length, i)) loadPoster(items[j]);
    play(items[i]);
    if (prev) prev.disabled = i === 0;
    if (next) next.disabled = i === items.length - 1;
    const id = items[i].dataset.reel;
    if (id && location.pathname !== `/reels/${id}/`) {
      history.replaceState(history.state, '', `/reels/${id}/`);
    }
    if (items[i].dataset.pageTitle) document.title = items[i].dataset.pageTitle;
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const i = items.indexOf(entry.target as HTMLElement);
        if (entry.intersectionRatio >= PLAY_VISIBLE) {
          if (i !== current) show(i);
          else play(items[i]);
        } else {
          pause(items[i]);
        }
      }
    },
    { threshold: [0, PLAY_VISIBLE] },
  );
  items.forEach((item) => observer.observe(item));

  document.addEventListener('visibilitychange', () => {
    const item = items[current];
    if (!item) return;
    if (document.hidden) pause(item);
    else play(item);
  });

  const step = (direction: 1 | -1) => {
    // Before the observer's first report, the page is on the first reel.
    const from = Math.max(0, current);
    const i = Math.min(items.length - 1, Math.max(0, from + direction));
    if (i === current) return;
    items[i].scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    // The URL, title and buttons follow at once; the observer confirms as the scroll lands.
    show(i);
  };
  prev?.addEventListener('click', () => step(-1));
  next?.addEventListener('click', () => step(1));

  // The feed pattern's keys: Page Down and Page Up, plus the arrows, one reel at a time.
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if ((event.target as Element).closest('input, textarea, select, dialog[open]')) return;
    const direction =
      event.key === 'ArrowDown' || event.key === 'PageDown'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'PageUp'
          ? -1
          : 0;
    if (!direction) return;
    event.preventDefault();
    step(direction);
  });

  for (const item of items) {
    initLike(item);
    initShare(item);

    // "more" appears only when the caption doesn't fit on its line.
    const text = item.querySelector<HTMLElement>('.reel-text');
    const description = item.querySelector<HTMLElement>('.reel-description');
    const more = item.querySelector<HTMLButtonElement>('.reel-more');
    if (text && description && more) {
      more.hidden = description.scrollWidth <= description.clientWidth + 1;
      more.addEventListener('click', () => {
        const open = more.getAttribute('aria-expanded') !== 'true';
        more.setAttribute('aria-expanded', String(open));
        more.textContent = open ? 'less' : 'more';
        text.classList.toggle('expanded', open);
      });
    }

    const video = videoOf(item);
    const toggle = item.querySelector<HTMLButtonElement>('.reel-toggle');
    if (!video || !toggle) continue;
    const sync = () => toggle.setAttribute('aria-label', video.paused ? 'Play' : 'Pause');
    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    const playPause = () => {
      if (video.paused) {
        pausedByVisitor.delete(item);
        if (!video.getAttribute('src') && video.dataset.src) video.src = video.dataset.src;
        void video.play().catch(sync);
      } else {
        pausedByVisitor.add(item);
        video.pause();
      }
    };
    toggle.addEventListener('click', playPause);
    // A tap pauses or plays, but only once it's clear it isn't the first half of a double-tap.
    let tap: ReturnType<typeof setTimeout> | undefined;
    item.querySelector('.reel-media')?.addEventListener('click', (event) => {
      if ((event.target as Element).closest('button, a')) return;
      if (tap) {
        clearTimeout(tap);
        tap = undefined;
        return;
      }
      tap = setTimeout(() => {
        tap = undefined;
        playPause();
      }, DOUBLE_TAP_MS);
    });
  }
}
