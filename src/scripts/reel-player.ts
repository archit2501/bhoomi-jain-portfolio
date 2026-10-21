import { neighbor } from '../lib/post-nav';

interface ReelData {
  id: string;
  title: string;
  description: string;
  video: string;
  poster?: string;
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Full-screen reel player. Reels are silent, so there is no unmute control: the visible button
 * pauses and plays, and the on-screen text is read out through aria-describedby. With reduced
 * motion the reel opens paused on its poster. Without JavaScript the tiles link to the MP4s.
 */
export function initReelPlayer(): void {
  const found = document.getElementById('reel-player') as HTMLDialogElement | null;
  const dataEl = document.getElementById('reel-data');
  if (!found || !dataEl) return;
  const dialog: HTMLDialogElement = found;
  const reels = JSON.parse(dataEl.textContent ?? '[]') as ReelData[];
  const ids = reels.map((r) => r.id);
  const video = dialog.querySelector<HTMLVideoElement>('.reel-video');
  const toggle = dialog.querySelector<HTMLButtonElement>('.reel-toggle');
  const title = dialog.querySelector<HTMLElement>('.reel-title');
  const description = dialog.querySelector<HTMLElement>('.reel-description');
  const prev = dialog.querySelector<HTMLButtonElement>('.reel-prev');
  const next = dialog.querySelector<HTMLButtonElement>('.reel-next');
  if (!video || !toggle || !title || !description || !prev || !next) return;

  let current: string | null = null;

  const syncToggle = () => toggle.setAttribute('aria-label', video.paused ? 'Play' : 'Pause');
  video.addEventListener('play', syncToggle);
  video.addEventListener('pause', syncToggle);

  const show = (id: string) => {
    const reel = reels.find((r) => r.id === id);
    if (!reel) return;
    current = id;
    video.poster = reel.poster ?? '';
    video.src = reel.video;
    title.textContent = reel.title;
    description.textContent = reel.description;
    dialog.setAttribute('aria-label', `Reel: ${reel.title}`);
    prev.hidden = !neighbor(ids, id, -1);
    next.hidden = !neighbor(ids, id, 1);
    if (!dialog.open) dialog.showModal();
    if (reducedMotion()) {
      syncToggle();
    } else {
      video.play().catch(syncToggle);
    }
  };

  const step = (direction: 1 | -1) => {
    const id = current && neighbor(ids, current, direction);
    if (id) show(id);
  };

  document.addEventListener('click', (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-reel]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    show(link.dataset.reel ?? '');
  });

  const playPause = () => {
    if (video.paused) void video.play().catch(syncToggle);
    else video.pause();
  };
  toggle.addEventListener('click', playPause);
  video.addEventListener('click', playPause);
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  dialog.querySelector('.reel-close')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') step(1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') step(-1);
  });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
    current = null;
  });
}
