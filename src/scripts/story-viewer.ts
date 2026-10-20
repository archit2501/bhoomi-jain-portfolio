import {
  barStates,
  createStory,
  reduce,
  type StoryEvent,
  type StoryState,
} from '../lib/story/controller';
import { classify, dragTransform, HOLD_MS } from '../lib/story/gestures';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const storySlugFromPath = (pathname: string) =>
  /^\/stories\/([a-z0-9-]+)\/?$/.exec(pathname)?.[1] ?? null;
const EASE = 'cubic-bezier(0.17, 0.17, 0, 1)';

/**
 * Full-screen story viewer for the highlights. Logic lives in src/lib/story; this file renders
 * state, runs each frame's progress bar on the Web Animations API (so pausing is exact), and maps
 * pointer and keyboard input to controller events.
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
  const framesEl = q<HTMLElement>('.frames');
  const progressEl = q<HTMLElement>('.progress');
  const groupLabel = q<HTMLElement>('.group-label');
  const pauseButton = q<HTMLButtonElement>('.pause');
  const status = q<HTMLElement>('.story-status');
  const peeks = {
    prev: q<HTMLButtonElement>('.peek-prev'),
    next: q<HTMLButtonElement>('.peek-next'),
  };
  if (!card || !framesEl || !progressEl || !groupLabel || !pauseButton || !status) return;

  let state: StoryState | null = null;
  let renderedGroup = -1;
  let progress: Animation | null = null;
  let busy = false;
  let returnUrl = '/';
  let returnTitle = document.title;
  // Safari doesn't focus a link on click; focus the opener explicitly when the viewer closes.
  let opener: HTMLElement | null = null;

  const renderGroup = (group: number) => {
    const template = templates[group];
    framesEl.replaceChildren(template.content.cloneNode(true));
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
    if (state.group !== renderedGroup) renderGroup(state.group);
    const frames = framesEl.querySelectorAll<HTMLElement>('.frame');
    frames.forEach((frame, i) => frame.classList.toggle('active', i === state!.frame));
    // Preload only the next frame's photo.
    frames[state.frame + 1]?.querySelectorAll('img').forEach((img) => (img.loading = 'eager'));

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

  // A cube turn between highlights, or a crossfade when the visitor prefers reduced motion.
  const turn = async (direction: 1 | -1, swap: () => void) => {
    busy = true;
    const fade = reducedMotion();
    card.dataset.transition = fade ? 'fade' : 'cube';
    const half = { duration: fade ? 100 : 150, fill: 'forwards' as const };
    const out = fade
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [
          {
            transformOrigin: direction > 0 ? 'right center' : 'left center',
            transform: 'perspective(1200px) rotateY(0deg)',
          },
          {
            transformOrigin: direction > 0 ? 'right center' : 'left center',
            transform: `perspective(1200px) rotateY(${direction > 0 ? -90 : 90}deg)`,
          },
        ];
    const into = fade
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [
          {
            transformOrigin: direction > 0 ? 'left center' : 'right center',
            transform: `perspective(1200px) rotateY(${direction > 0 ? 90 : -90}deg)`,
          },
          {
            transformOrigin: direction > 0 ? 'left center' : 'right center',
            transform: 'perspective(1200px) rotateY(0deg)',
          },
        ];
    try {
      await card.animate(out, { ...half, easing: 'ease-in' }).finished;
      swap();
      const entering = card.animate(into, { ...half, easing: EASE });
      await entering.finished;
      entering.cancel();
    } catch {
      swap();
    } finally {
      card.getAnimations().forEach((a) => a !== progress && a.cancel());
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

  const open = (group: number, push: boolean) => {
    state = createStory(shape, group);
    renderedGroup = -1;
    if (push) {
      returnUrl = location.pathname;
      returnTitle = document.title;
      history.pushState({ story: ids[group] }, '', `/stories/${ids[group]}/`);
    }
    const title = templates[group].dataset.title;
    if (title) document.title = title;
    if (!dialog.open) dialog.showModal();
    render(false);
  };

  // Opening: highlight links fall back to /stories/<id>/ pages without JavaScript.
  document.addEventListener('click', (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-story]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const group = ids.indexOf(link.dataset.story ?? '');
    if (group < 0) return;
    event.preventDefault();
    opener = link;
    open(group, true);
  });

  q('.story-close')?.addEventListener('click', () => dialog.close());
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
    if ((event.target as Element).closest('button') || busy) return;
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
    endPress();
    if (wasHolding) dispatch({ type: 'resume' });
    switch (gesture) {
      case 'tap-prev':
        if (!wasHolding) dispatch({ type: 'prev' }, true);
        break;
      case 'tap-next':
        if (!wasHolding) dispatch({ type: 'next' }, true);
        break;
      case 'swipe-down':
        dialog.close();
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
    framesEl.replaceChildren();
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
