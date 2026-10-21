/**
 * Story viewer state machine. Pure: the view calls `reduce` for every user action or finished
 * frame and renders the result. Groups are highlights; frames are the stories inside one.
 */

export interface StoryState {
  group: number;
  frame: number;
  paused: boolean;
  /** True once the viewer has moved past the last frame of the last group: close it. */
  done: boolean;
}

export type StoryEvent =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'nextGroup' }
  | { type: 'prevGroup' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'togglePause' }
  | { type: 'goTo'; group: number; frame?: number };

/** Frame counts per group, e.g. [5, 4, 4] for three highlights. */
export type StoryShape = readonly number[];

export function createStory(shape: StoryShape, group = 0, frame = 0): StoryState {
  const g = clamp(group, 0, shape.length - 1);
  return { group: g, frame: clamp(frame, 0, (shape[g] ?? 1) - 1), paused: false, done: false };
}

export function reduce(shape: StoryShape, state: StoryState, event: StoryEvent): StoryState {
  if (state.done) return state;
  const lastGroup = shape.length - 1;
  const lastFrame = (shape[state.group] ?? 1) - 1;
  switch (event.type) {
    case 'next':
      if (state.frame < lastFrame) return { ...state, frame: state.frame + 1 };
      return reduce(shape, state, { type: 'nextGroup' });
    case 'prev':
      if (state.frame > 0) return { ...state, frame: state.frame - 1 };
      // At a group's first frame, back goes to the previous highlight's start, or restarts.
      return state.group > 0 ? { ...state, group: state.group - 1, frame: 0 } : { ...state };
    case 'nextGroup':
      if (state.group < lastGroup) return { ...state, group: state.group + 1, frame: 0 };
      return { ...state, done: true };
    case 'prevGroup':
      return { ...state, group: Math.max(0, state.group - 1), frame: 0 };
    case 'pause':
      return { ...state, paused: true };
    case 'resume':
      return { ...state, paused: false };
    case 'togglePause':
      return { ...state, paused: !state.paused };
    case 'goTo':
      return { ...createStory(shape, event.group, event.frame), paused: state.paused };
  }
}

/** The state of each progress bar in the current group. */
export function barStates(
  shape: StoryShape,
  state: StoryState,
): ('done' | 'current' | 'upcoming')[] {
  return Array.from({ length: shape[state.group] ?? 0 }, (_, i) =>
    i < state.frame ? 'done' : i === state.frame ? 'current' : 'upcoming',
  );
}

export const IMAGE_FRAME_MS = 5000;

/**
 * Instagram shows a photo for 5 s. Text frames get reading time on top: about 220 ms per word,
 * never under 5 s or over 10 s. An explicit duration always wins.
 */
export function frameDuration(frame: { durationMs?: number; words?: number }): number {
  if (frame.durationMs) return frame.durationMs;
  if (!frame.words) return IMAGE_FRAME_MS;
  return clamp(2500 + 220 * frame.words, IMAGE_FRAME_MS, 10000);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
