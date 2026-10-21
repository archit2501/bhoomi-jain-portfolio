import { isLiked, LIKE_HAPTIC_MS, likeKey, likesLine, saveLiked } from '../lib/likes';
import { isDoubleTap } from '../lib/post-nav';
import { durationMs } from '../lib/motion';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE_FALLBACK = 'cubic-bezier(0.17, 0.17, 0, 1)';

/** A motion token from tokens.css, so the script and the stylesheet can't drift apart. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
const ms = (name: string, fallback: number) => durationMs(token(name)) ?? fallback;

/** Web Animations with a token easing; an engine without linear() gets Instagram's curve. */
function animate(el: Element, keyframes: Keyframe[], duration: number, easing: string) {
  try {
    return el.animate(keyframes, { duration, easing });
  } catch {
    return el.animate(keyframes, { duration, easing: EASE_FALLBACK });
  }
}

function storage(): Storage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

interface LikeChange {
  id: string;
  liked: boolean;
}

/**
 * The like moment, as on Instagram: tapping the heart springs the icon; a double-tap on the
 * photo (or a double-click) likes with a big heart at the tap point as well, and never unlikes.
 * Android gets a short tick. The like is remembered in this browser until the likes API (task
 * 3.1.2) counts it, and every copy of the post on the page follows along.
 */
export function initLike(root: HTMLElement): void {
  const row = root.querySelector<HTMLElement>('.action-row');
  const button = row?.querySelector<HTMLButtonElement>('.like');
  // The reels rail has no room for a likes line; the button alone shows the like there.
  const line = row?.querySelector<HTMLElement>('.likes');
  const id = row?.dataset.post;
  if (!row || !button || !id) return;

  const show = (liked: boolean) => {
    button.setAttribute('aria-pressed', String(liked));
    if (!line) return;
    const text = likesLine(liked);
    line.textContent = text ?? '';
    line.hidden = !text;
  };
  show(isLiked(storage(), id));

  const spring = (liked: boolean) => {
    if (reducedMotion()) return;
    const icon = button.querySelector(liked ? '.heart-on' : '.heart-off');
    if (!icon) return;
    const from = liked ? 0 : 0.8;
    animate(
      icon,
      [{ scale: from }, { scale: 1 }],
      ms('--dur-like', 420),
      token('--ease-spring') || EASE_FALLBACK,
    );
  };

  const set = (liked: boolean) => {
    show(liked);
    spring(liked);
    saveLiked(storage(), id, liked);
    if (liked) navigator.vibrate?.(LIKE_HAPTIC_MS);
    document.dispatchEvent(
      new CustomEvent<LikeChange>('post:like', { detail: { id, liked }, bubbles: false }),
    );
  };

  button.addEventListener('click', () => set(button.getAttribute('aria-pressed') !== 'true'));

  // The same post elsewhere on the page (or in another tab) follows, without the animation.
  document.addEventListener('post:like', (event) => {
    const { detail } = event as CustomEvent<LikeChange>;
    if (detail.id === id && button.getAttribute('aria-pressed') !== String(detail.liked)) {
      show(detail.liked);
    }
  });
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === likeKey(id)) show(isLiked(storage(), id));
  });

  // Double-tap: the big heart at the tap point, slightly tilted, and the icon springs with it.
  const media = root.querySelector<HTMLElement>('[data-like-media]');
  const template = media?.querySelector<HTMLElement>('.burst');
  const burst = (x: number, y: number) => {
    if (button.getAttribute('aria-pressed') !== 'true') set(true);
    else spring(true);
    if (!media || !template || reducedMotion()) return;
    const heart = template.cloneNode(true) as HTMLElement;
    heart.classList.add('flying');
    const box = media.getBoundingClientRect();
    heart.style.left = `${x - box.left}px`;
    heart.style.top = `${y - box.top}px`;
    const tilt = `${Math.round(Math.random() * 24 - 12)}deg`;
    media.append(heart);
    const pop = animate(
      heart,
      [
        { opacity: 0, transform: `rotate(${tilt}) scale(0)`, offset: 0 },
        { opacity: 1, transform: `rotate(${tilt}) scale(1)`, offset: 0.45 },
        { opacity: 1, transform: `rotate(${tilt}) scale(1)`, offset: 0.75 },
        { opacity: 0, transform: `rotate(${tilt}) translateY(-40%) scale(0.6)`, offset: 1 },
      ],
      ms('--dur-heart-burst', 900),
      'ease-out',
    );
    void pop.finished.catch(() => {}).finally(() => heart.remove());
  };

  media?.addEventListener('dblclick', (event) => {
    if ((event.target as Element).closest('button, a')) return;
    event.preventDefault();
    burst(event.clientX, event.clientY);
  });
  let lastTap: number | undefined;
  media?.addEventListener('pointerup', (event) => {
    if (event.pointerType !== 'touch' || (event.target as Element).closest('button, a')) return;
    if (isDoubleTap(lastTap, event.timeStamp)) {
      burst(event.clientX, event.clientY);
      lastTap = undefined;
    } else {
      lastTap = event.timeStamp;
    }
  });
}
