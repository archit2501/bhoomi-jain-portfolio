import {
  formatCount,
  isLiked,
  LIKE_HAPTIC_MS,
  likeKey,
  likesParts,
  odometer,
  saveLiked,
} from '../lib/likes';
import { isDoubleTap } from '../lib/post-nav';
import { durationMs } from '../lib/motion';
import { turnstileToken } from './turnstile';

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
  count?: number;
}

/**
 * The like moment, as on Instagram: tapping the heart springs the icon; a double-tap on the
 * photo (or a double-click) likes with a big heart at the tap point as well, and never unlikes.
 * Android gets a short tick. Every copy of the post on the page follows along.
 *
 * The like is optimistic: it shows at once (count included), then goes to /api/likes/<id> with a
 * Turnstile token, and the server's answer is the truth. Taps made while a request is in flight
 * are coalesced; the last one wins. If saving fails, the like goes back to what the server last
 * said. If likes are switched off (503) or the API can't be reached, the like stays in this
 * browser only, as before the API existed.
 */
export function initLike(root: HTMLElement): void {
  const row = root.querySelector<HTMLElement>('.action-row');
  const button = row?.querySelector<HTMLButtonElement>('.like');
  // The reels rail has no room for a likes line; the button alone shows the like there.
  const line = row?.querySelector<HTMLElement>('.likes');
  const id = row?.dataset.post;
  if (!row || !button || !id) return;

  const status = row.querySelector<HTMLElement>('.status');
  const endpoint = `/api/likes/${encodeURIComponent(id)}`;
  let state: { liked: boolean; count?: number } = { liked: isLiked(storage(), id) };
  // What the database last said, and whether to talk to it at all.
  let serverLiked: boolean | undefined;
  // What a refused save goes back to: the database's last word, or before it has said anything,
  // what showed before the tap.
  let settled = state;
  let localOnly = false;
  // Once the visitor has tapped, a slow first read must not undo what they just did.
  let touched = false;
  let shownCount: number | null = null;

  /** The likes line, with the number in an odometer that rolls the digits that changed. */
  const renderLine = (roll: boolean) => {
    if (!line) return;
    const parts = likesParts(state.liked, state.count);
    if (!parts) {
      line.replaceChildren();
      line.hidden = true;
      shownCount = null;
      return;
    }
    line.hidden = false;
    if (parts.count === null) {
      line.textContent = parts.before + parts.after;
      shownCount = null;
      return;
    }
    const plain = document.createElement('span');
    plain.className = 'visually-hidden';
    plain.textContent = parts.before + formatCount(parts.count) + parts.after;
    const visual = document.createElement('span');
    visual.setAttribute('aria-hidden', 'true');
    const odo = document.createElement('span');
    odo.className = 'odometer';
    const from = roll && shownCount !== null ? shownCount : parts.count;
    for (const digit of odometer(from, parts.count)) {
      const cell = document.createElement('span');
      cell.className = 'odometer-cell';
      const char = document.createElement('span');
      char.textContent = digit.char;
      cell.append(char);
      odo.append(cell);
      if (digit.roll && !reducedMotion()) {
        animate(
          char,
          [
            { transform: `translateY(${digit.roll === 'up' ? '100%' : '-100%'})`, opacity: 0 },
            { transform: 'none', opacity: 1 },
          ],
          300,
          EASE_FALLBACK,
        );
      }
    }
    visual.append(parts.before, odo, parts.after);
    line.replaceChildren(plain, visual);
    shownCount = parts.count;
  };

  const show = (next: typeof state, roll = false) => {
    state = next;
    button.setAttribute('aria-pressed', String(state.liked));
    renderLine(roll);
  };
  show(state);

  const tell = (others: boolean) =>
    document.dispatchEvent(
      new CustomEvent<LikeChange>('post:like', {
        detail: { id, liked: state.liked, count: others ? state.count : undefined },
        bubbles: false,
      }),
    );

  // The database's view: whether this visitor liked it, and the count.
  void fetch(endpoint, { credentials: 'same-origin' })
    .then(async (res) => {
      if (res.status === 503) localOnly = true;
      if (!res.ok) return;
      const data = (await res.json()) as { liked: boolean; count: number };
      serverLiked = data.liked;
      settled = { liked: data.liked, count: data.count };
      if (touched) return;
      saveLiked(storage(), id, data.liked);
      show(settled);
    })
    .catch(() => {
      // Offline or no API: the local like stands.
    });

  let wanted: boolean | null = null;
  let syncing = false;
  const sync = async () => {
    if (syncing || localOnly) return;
    syncing = true;
    try {
      while (wanted !== null && wanted !== serverLiked) {
        const target = wanted;
        const token = await turnstileToken('like');
        const res = await fetch(endpoint, {
          method: target ? 'POST' : 'DELETE',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ turnstile: token }),
        });
        if (res.status === 503) {
          localOnly = true;
          break;
        }
        if (!res.ok) throw new Error(`like ${res.status}`);
        const data = (await res.json()) as { liked: boolean; count: number };
        serverLiked = data.liked;
        settled = { liked: data.liked, count: data.count };
        // A newer tap may be waiting: keep showing it while the loop catches up.
        show({ liked: wanted ?? data.liked, count: data.count }, true);
        tell(true);
      }
      wanted = null;
    } catch {
      wanted = null;
      saveLiked(storage(), id, settled.liked);
      show(settled);
      tell(true);
      if (status) status.textContent = "Couldn't save your like. Try again.";
    } finally {
      syncing = false;
    }
  };

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
    touched = true;
    const count =
      state.count === undefined || liked === state.liked
        ? state.count
        : Math.max(0, state.count + (liked ? 1 : -1));
    show({ liked, count }, true);
    spring(liked);
    saveLiked(storage(), id, liked);
    if (liked) navigator.vibrate?.(LIKE_HAPTIC_MS);
    tell(true);
    wanted = liked;
    void sync();
  };

  button.addEventListener('click', () => set(button.getAttribute('aria-pressed') !== 'true'));

  // The same post elsewhere on the page (or in another tab) follows, without the animation.
  document.addEventListener('post:like', (event) => {
    const { detail } = event as CustomEvent<LikeChange>;
    if (detail.id !== id) return;
    if (state.liked === detail.liked && state.count === (detail.count ?? state.count)) return;
    show({ liked: detail.liked, count: detail.count ?? state.count });
  });
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === likeKey(id)) {
      show({ ...state, liked: isLiked(storage(), id) });
    }
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
