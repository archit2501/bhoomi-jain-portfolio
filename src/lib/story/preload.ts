import type { StoryShape, StoryState } from './controller';

export interface FrameRef {
  group: number;
  frame: number;
}

/**
 * The frames whose media may load: the one on screen and the one a tap would show next, which
 * may be the first story of the next highlight. Nothing further ahead loads, as on Instagram.
 */
export function framesToLoad(shape: StoryShape, state: StoryState): FrameRef[] {
  const current = { group: state.group, frame: state.frame };
  if (state.frame + 1 < (shape[state.group] ?? 0)) {
    return [current, { group: state.group, frame: state.frame + 1 }];
  }
  if (state.group + 1 < shape.length) return [current, { group: state.group + 1, frame: 0 }];
  return [current];
}

/** The attributes that make an image (or a <picture> source) fetch. */
const FETCHING = ['src', 'srcset'] as const;

type AttributeHost = Pick<Element, 'getAttribute' | 'setAttribute' | 'removeAttribute'>;

/** Stops an image or source from fetching until `unpark` is called: src → data-src, and so on. */
export function park(el: AttributeHost): void {
  for (const name of FETCHING) {
    const value = el.getAttribute(name);
    if (value === null) continue;
    el.setAttribute(`data-parked-${name}`, value);
    el.removeAttribute(name);
  }
}

/** Puts back what `park` took away. Sources first, then the image, as the browser expects. */
export function unpark(el: AttributeHost): void {
  for (const name of FETCHING) {
    const value = el.getAttribute(`data-parked-${name}`);
    if (value === null) continue;
    el.setAttribute(name, value);
    el.removeAttribute(`data-parked-${name}`);
  }
}
