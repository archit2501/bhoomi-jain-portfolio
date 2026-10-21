import {
  barStates,
  createStory,
  reduce,
  type StoryEvent,
  type StoryState,
} from '../lib/story/controller';
import { classify, dragTransform, HOLD_MS } from '../lib/story/gestures';
import { framesToLoad, park, unpark } from '../lib/story/preload';
import { asCard, asRing, isOnScreen } from '../lib/story/zoom';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const storySlugFromPath = (pathname: string) =>
  /^\/stories\/([a-z0-9-]+)\/?$/.exec(pathname)?.[1] ?? null;
const EASE = 'cubic-bezier(0.17, 0.17, 0, 1)';
// tokens.css: --dur-story-open and --dur-story-cube.
const ZOOM_MS = 280;
const CUBE_MS = 350;
const FADE_MS = 150;

/**
 * Full-screen story viewer for the highlights. Logic lives in src/lib/story; this file renders
 * state, runs each frame's progress bar on the Web Animations API (so pausing is exact), and maps
 * pointer and keyboard input to controller events.
 *
 * Motion, as on Instagram: the card grows out of the ring that was tapped and shrinks back into
 * the current highlight's ring when dismissed; highlights change with a two-face cube. With
 * reduced motion the viewer fades and highlights cross-fade.
 */
export function initStoryViewer(): void {
  const found = document.getElementById('story-viewer') as HTMLDialogElement | null;
  if (!found) return;
  const dialog: HTMLDialogElement = found;
  const templates = [
    ...document.querySelectorAll<HTMLTemplateElement>('template[data-story-group]'),
  ];
  if (!templates.length) return;

  const ids = templates.map((t) => t.dataset.storyGroup ?? '');
  const shape = templates.map((t) => t.content.querySelectorAll('.frame').length);
  const q = <T extends Element>(selector: string) => dialog.querySelector<T>(selector);
  const card = q<HTMLElement>('.card');
  const cardWrap = q<HTMLElement>('.card-wrap');
  const preloadEl = q<HTMLElement>('.preload');
  const framesEl = q<HTMLElement>('.frames');
  const progressEl = q<HTMLElement>('.progress');
  const groupLabel = q<HTMLElement>('.group-label');
  const pauseButton = q<HTMLButtonElement>('.pause');
  const status = q<HTMLElement>('.story-status');
  const peeks = {
    prev: q<HTMLButtonElement>('.peek-prev'),
    next: q<HTMLButtonElement>('.peek-next'),
  };
  if (
    !card ||
    !cardWrap ||
    !preloadEl ||
    !framesEl ||
    !progressEl ||
    !groupLabel ||
    !pauseButton ||
    !status
  ) {
    return;
  }

  let state: StoryState | null = null;
  let renderedGroup = -1;
  let progress: Animation | null = null;
  let busy = false;
  let returnUrl = '/';
  let returnTitle = document.title;
  // Safari doesn't focus a link on click; focus the opener explicitly when the viewer closes.
  let opener: HTMLElement | null = null;
  // Highlights shown since the viewer opened; their rings turn "seen" when it closes.
  const viewed = new Set<string>();
  // Our own open and close animations, cancelled when the viewer closes.
  let motion: Animation[] = [];
  // Set while a focused sticker holds the story still, so leaving it resumes.
  let pausedBySticker = false;

  /** The on-screen ring (highlight circle or avatar) that opens a highlight, if any. */
  const ringFor = (group: number, preferred?: Element | null): HTMLElement | null => {
    const viewport = { width: innerWidth, height: innerHeight };
    const links = [
      ...(preferred ? [preferred] : []),
      ...document.querySelectorAll(`a[data-story="${CSS.escape(ids[group])}"]`),
    ];
    for (const link of links) {
      if (dialog.contains(link)) continue;
      for (const ring of link.querySelectorAll<HTMLElement>('.ring, .avatar')) {
        if (isOnScreen(ring.getBoundingClientRect(), viewport)) return ring;
      }
    }
    return null;
  };

  const chrome = () => [...dialog.querySelectorAll<HTMLElement>('.frame-nav, .peek:not([hidden])')];

  /** The card grows out of the ring while the black fades in behind it. */
  const zoomIn = async (ring: HTMLElement) => {
    busy = true;
    const box = cardWrap.getBoundingClientRect();
    const timing = { duration: ZOOM_MS, easing: EASE };
    const grow = card.animate([asRing(box, ring.getBoundingClientRect()), asCard(box)], timing);
    motion = [
      grow,
      dialog.animate([{ backgroundColor: 'transparent', offset: 0 }], timing),
      ...chrome().map((el) => el.animate([{ opacity: 0, offset: 0 }], timing)),
    ];
    try {
      await grow.finished;
    } catch {
      // Cancelled by a close mid-zoom.
    } finally {
      motion.forEach((a) => a.cancel());
      motion = [];
      dialog.classList.remove('zooming');
      busy = false;
    }
  };

  /**
   * Close, shrinking the card back into its highlight's ring when that ring is on screen.
   * `dragged` is where a downward swipe left the card, so the shrink starts from there.
   */
  const dismiss = async (dragged = 'none') => {
    if (!state || !dialog.open) return;
    const ring = reducedMotion() || busy ? null : ringFor(state.group);
    if (!ring) {
      dialog.close();
      return;
    }
    busy = true;
    progress?.pause();
    const box = cardWrap.getBoundingClientRect();
    const timing = { duration: ZOOM_MS, easing: EASE, fill: 'forwards' as const };
    const from = asCard(box, dragged);
    card.classList.add('dragging');
    dialog.classList.add('shrinking');
    const shrink = card.animate([from, asRing(box, ring.getBoundingClientRect())], timing);
    motion = [
      shrink,
      dialog.animate([{ backgroundColor: 'transparent' }], timing),
      ...chrome().map((el) => el.animate([{ opacity: 0 }], timing)),
    ];
    try {
      await shrink.finished;
    } catch {
      // Cancelled; close anyway.
    }
    dialog.close();
  };

  /** Lets the frame on screen and the next one load their photos; nothing further ahead. */
  const loadAhead = () => {
    if (!state) return;
    const frames = framesEl.querySelectorAll<HTMLElement>('.frame');
    preloadEl.replaceChildren();
    for (const ref of framesToLoad(shape, state)) {
      if (ref.group === state.group) {
        const frame = frames[ref.frame];
        frame?.querySelectorAll('img, source').forEach(unpark);
        frame?.querySelectorAll('img').forEach((img) => (img.loading = 'eager'));
        continue;
      }
      // The next highlight's first story: fetch its photo out of sight.
      const next = templates[ref.group].content.querySelectorAll('.frame')[ref.frame];
      next?.querySelectorAll('picture').forEach((picture) => {
        const copy = picture.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('img').forEach((img) => (img.loading = 'eager'));
        preloadEl.append(copy);
      });
    }
  };

  const renderGroup = (group: number) => {
    const template = templates[group];
    const content = template.content.cloneNode(true) as DocumentFragment;
    // Nothing fetches until loadAhead says so.
    content.querySelectorAll('img, source').forEach(park);
    framesEl.replaceChildren(content);
    progressEl.replaceChildren(
      ...Array.from({ length: shape[group] }, () => {
        const bar = document.createElement('span');
        bar.className = 'bar';
        const fill = document.createElement('span');
        fill.className = 'fill';
        bar.append(fill);
        return bar;
      }),
    );
    groupLabel.textContent = template.dataset.label ?? '';
    dialog.setAttribute('aria-label', `${template.dataset.label} stories`);
    for (const [side, offset] of [
      ['prev', -1],
      ['next', 1],
    ] as const) {
      const peek = peeks[side];
      const neighbour = templates[group + offset];
      if (!peek) continue;
      peek.hidden = !neighbour;
      if (!neighbour) continue;
      const label = neighbour.dataset.label ?? '';
      peek.setAttribute(
        'aria-label',
        `${side === 'prev' ? 'Previous' : 'Next'} highlight: ${label}`,
      );
      peek.querySelector('.peek-cover')!.textContent = neighbour.dataset.cover ?? '';
      peek.querySelector('.peek-label')!.textContent = label;
    }
    renderedGroup = group;
  };

  const syncPause = () => {
    pauseButton.setAttribute('aria-label', state?.paused ? 'Play' : 'Pause');
  };

  const render = (announce: boolean) => {
    if (!state) return;
    const hadFocus = framesEl.contains(document.activeElement);
    if (state.group !== renderedGroup) renderGroup(state.group);
    const frames = framesEl.querySelectorAll<HTMLElement>('.frame');
    frames.forEach((frame, i) => frame.classList.toggle('active', i === state!.frame));
    loadAhead();
    viewed.add(ids[state.group]);
    // A focused sticker that just left the screen hands focus to the pause button.
    if (hadFocus && !frames[state.frame]?.contains(document.activeElement)) pauseButton.focus();

    progress?.cancel();
    const fills = progressEl.querySelectorAll<HTMLElement>('.fill');
    barStates(shape, state).forEach((kind, i) => {
      fills[i].style.transform = kind === 'done' ? 'scaleX(1)' : 'scaleX(0)';
    });
    const duration = Number(frames[state.frame]?.dataset.duration) || 5000;
    progress = fills[state.frame].animate(
      [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
      { duration, easing: 'linear', fill: 'forwards' },
    );
    progress.onfinish = () => dispatch({ type: 'next' });
    if (state.paused || document.hidden) progress.pause();
    syncPause();
    if (announce) {
      status.textContent = `${groupLabel.textContent}, story ${state.frame + 1} of ${shape[state.group]}`;
    }
  };

  const syncUrl = () => {
    if (!state) return;
    const template = templates[state.group];
    history.replaceState({ story: ids[state.group] }, '', `/stories/${ids[state.group]}/`);
    if (template.dataset.title) document.title = template.dataset.title;
  };

  const shade = (face: HTMLElement) => {
    const layer = document.createElement('div');
    layer.className = 'shade';
    face.append(layer);
    return layer;
  };

  /**
   * A two-face cube between highlights: a frozen copy of the outgoing card and the real card,
   * already showing the next highlight, turn together about an axis half a card behind the
   * screen, each shaded as it faces away. Reduced motion cross-fades the two instead.
   */
  const turn = async (direction: 1 | -1, swap: () => void) => {
    busy = true;
    const fade = reducedMotion();
    card.dataset.transition = fade ? 'fade' : 'cube';
    const face = card.cloneNode(true) as HTMLElement;
    face.classList.add('face-out');
    face.classList.remove('dragging');
    face.inert = true;
    face.setAttribute('aria-hidden', 'true');
    face.querySelector('.story-status')?.remove();
    // Freeze the outgoing progress bar where it was.
    const liveFills = card.querySelectorAll<HTMLElement>('.fill');
    face.querySelectorAll<HTMLElement>('.fill').forEach((fill, i) => {
      fill.style.transform = getComputedStyle(liveFills[i]).transform;
    });
    card.after(face);
    swap();

    const timing = { duration: fade ? FADE_MS : CUBE_MS, easing: fade ? 'linear' : EASE };
    let animations: Animation[];
    if (fade) {
      animations = [face.animate([{ opacity: 1 }, { opacity: 0 }], timing)];
    } else {
      const width = cardWrap.getBoundingClientRect().width;
      cardWrap.classList.add('turning');
      cardWrap.style.perspective = `${Math.round(Math.max(800, width * 2.2))}px`;
      const origin = `50% 50% ${-width / 2}px`;
      const angle = direction * 90;
      animations = [
        face.animate(
          [
            { transformOrigin: origin, transform: 'rotateY(0deg)' },
            { transformOrigin: origin, transform: `rotateY(${-angle}deg)` },
          ],
          timing,
        ),
        card.animate(
          [
            { transformOrigin: origin, transform: `rotateY(${angle}deg)` },
            { transformOrigin: origin, transform: 'rotateY(0deg)' },
          ],
          timing,
        ),
        shade(face).animate([{ opacity: 0 }, { opacity: 0.6 }], timing),
        shade(card).animate([{ opacity: 0.6 }, { opacity: 0 }], timing),
      ];
    }
    try {
      await Promise.all(animations.map((a) => a.finished));
    } catch {
      // Cancelled by a close mid-turn.
    } finally {
      animations.forEach((a) => a.cancel());
      face.remove();
      card.querySelector(':scope > .shade')?.remove();
      cardWrap.classList.remove('turning');
      cardWrap.style.perspective = '';
      busy = false;
    }
  };

  function dispatch(event: StoryEvent, announce = false) {
    if (!state || busy) return;
    const previous = state;
    const next = reduce(shape, state, event);
    if (next.done) {
      dialog.close();
      return;
    }
    state = next;
    if (event.type === 'pause' || event.type === 'resume' || event.type === 'togglePause') {
      if (state.paused) progress?.pause();
      else progress?.play();
      syncPause();
      return;
    }
    if (next.group !== previous.group) {
      void turn(next.group > previous.group ? 1 : -1, () => {
        render(announce);
        syncUrl();
      });
    } else {
      render(announce);
    }
  }

  const open = (group: number, push: boolean, from?: Element) => {
    // Growing out of the tapped ring needs that ring on screen, and motion.
    const ring = push && !dialog.open && !reducedMotion() ? ringFor(group, from) : null;
    state = createStory(shape, group);
    renderedGroup = -1;
    if (push) {
      returnUrl = location.pathname;
      returnTitle = document.title;
      history.pushState({ story: ids[group] }, '', `/stories/${ids[group]}/`);
    }
    const title = templates[group].dataset.title;
    if (title) document.title = title;
    if (ring) dialog.classList.add('zooming');
    if (!dialog.open) dialog.showModal();
    render(false);
    if (ring) void zoomIn(ring);
  };

  // Opening: highlight links fall back to /stories/<id>/ pages without JavaScript.
  document.addEventListener('click', (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-story]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const group = ids.indexOf(link.dataset.story ?? '');
    if (group < 0) return;
    event.preventDefault();
    opener = link;
    open(group, true, link);
  });

  q('.story-close')?.addEventListener('click', () => void dismiss());
  // Esc shrinks the story back into its ring too, when the browser lets the close wait.
  dialog.addEventListener('cancel', (event) => {
    if (!event.cancelable || !state || reducedMotion() || !ringFor(state.group)) return;
    event.preventDefault();
    void dismiss();
  });

  // A focused sticker holds the story still (it would otherwise slide away mid-Tab).
  framesEl.addEventListener('focusin', (event) => {
    if (!state || state.paused || !(event.target as Element).closest('.sticker')) return;
    pausedBySticker = true;
    dispatch({ type: 'pause' });
  });
  framesEl.addEventListener('focusout', (event) => {
    const next = event.relatedTarget as Element | null;
    if (!pausedBySticker || next?.closest('.sticker')) return;
    pausedBySticker = false;
    dispatch({ type: 'resume' });
  });
  pauseButton.addEventListener('click', () => dispatch({ type: 'togglePause' }));
  q('.frame-prev')?.addEventListener('click', () => dispatch({ type: 'prev' }, true));
  q('.frame-next')?.addEventListener('click', () => dispatch({ type: 'next' }, true));
  peeks.prev?.addEventListener('click', () => dispatch({ type: 'prevGroup' }, true));
  peeks.next?.addEventListener('click', () => dispatch({ type: 'nextGroup' }, true));

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') dispatch({ type: 'next' }, true);
    else if (event.key === 'ArrowLeft') dispatch({ type: 'prev' }, true);
    else if (event.key === ' ' && !(event.target as Element).closest('button')) {
      event.preventDefault();
      dispatch({ type: 'togglePause' });
    }
  });

  // Pointer: tap zones, hold to pause, swipe down to close, swipe sideways between highlights.
  let down: { x: number; y: number; t: number; isTouch: boolean } | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let holding = false;

  const endPress = () => {
    clearTimeout(holdTimer);
    down = null;
    card.classList.remove('dragging');
    card.style.transform = '';
    dialog.classList.remove('chrome-hidden');
  };

  card.addEventListener('pointerdown', (event) => {
    // Buttons and sticker links are pressed, not tapped through.
    if ((event.target as Element).closest('button, a') || busy) return;
    down = {
      x: event.clientX,
      y: event.clientY,
      t: event.timeStamp,
      isTouch: event.pointerType === 'touch',
    };
    card.setPointerCapture?.(event.pointerId);
    holding = false;
    holdTimer = setTimeout(() => {
      holding = true;
      dispatch({ type: 'pause' });
      dialog.classList.add('chrome-hidden');
    }, HOLD_MS);
  });

  card.addEventListener('pointermove', (event) => {
    if (!down) return;
    const dx = event.clientX - down.x;
    const dy = event.clientY - down.y;
    if (Math.hypot(dx, dy) > 10) clearTimeout(holdTimer);
    if (dy > 10 && dy > Math.abs(dx) && !reducedMotion()) {
      const { translateY, scale } = dragTransform(dy);
      card.classList.add('dragging');
      card.style.transform = `translateY(${translateY}px) scale(${scale})`;
    }
  });

  card.addEventListener('pointerup', (event) => {
    if (!down) return;
    const rect = card.getBoundingClientRect();
    const gesture = classify(
      down,
      { x: event.clientX, y: event.clientY, t: event.timeStamp },
      {
        width: rect.width,
        left: rect.left,
        isTouch: down.isTouch,
      },
    );
    const wasHolding = holding;
    holding = false;
    if (gesture === 'swipe-down') {
      // Leave the card where the finger let go; the shrink picks it up from there.
      const dragged = card.style.transform || 'none';
      clearTimeout(holdTimer);
      down = null;
      dialog.classList.remove('chrome-hidden');
      void dismiss(dragged);
      return;
    }
    endPress();
    if (wasHolding) dispatch({ type: 'resume' });
    switch (gesture) {
      case 'tap-prev':
        if (!wasHolding) dispatch({ type: 'prev' }, true);
        break;
      case 'tap-next':
        if (!wasHolding) dispatch({ type: 'next' }, true);
        break;
      case 'swipe-next-group':
        dispatch({ type: 'nextGroup' }, true);
        break;
      case 'swipe-prev-group':
        dispatch({ type: 'prevGroup' }, true);
        break;
      default:
        break;
    }
  });

  card.addEventListener('pointercancel', () => {
    if (holding) dispatch({ type: 'resume' });
    holding = false;
    endPress();
  });

  document.addEventListener('visibilitychange', () => {
    if (!state || !progress) return;
    if (document.hidden) progress.pause();
    else if (!state.paused) progress.play();
  });

  dialog.addEventListener('close', () => {
    // A stale close event can arrive after Back then Forward reopened the viewer.
    if (dialog.open) return;
    progress?.cancel();
    progress = null;
    state = null;
    renderedGroup = -1;
    pausedBySticker = false;
    motion.forEach((a) => a.cancel());
    motion = [];
    dialog.classList.remove('zooming', 'shrinking');
    card.classList.remove('dragging');
    card.style.transform = '';
    framesEl.replaceChildren();
    preloadEl.replaceChildren();
    // The rings of what was watched turn grey (ProfileHeader keeps the intro's).
    document.dispatchEvent(new CustomEvent('story:seen', { detail: { ids: [...viewed] } }));
    viewed.clear();
    document.title = returnTitle;
    if (storySlugFromPath(location.pathname)) {
      if (history.state?.story) history.back();
      else history.replaceState({}, '', returnUrl);
    }
    opener?.focus();
  });

  window.addEventListener('popstate', () => {
    const slug = storySlugFromPath(location.pathname);
    const group = slug ? ids.indexOf(slug) : -1;
    if (group >= 0 && history.state?.story) {
      if (!dialog.open || !state) open(group, false);
      else if (state.group !== group) {
        state = { ...state, group, frame: 0 };
        render(false);
      }
    } else if (dialog.open) {
      dialog.close();
    }
  });
}
