import { describe, expect, it } from 'vitest';
import {
  barStates,
  createStory,
  frameDuration,
  reduce,
  type StoryEvent,
  type StoryState,
} from './controller';

const shape = [3, 2, 4];
const run = (state: StoryState, ...events: StoryEvent[]) =>
  events.reduce((s, e) => reduce(shape, s, e), state);

describe('createStory', () => {
  it('starts at the requested group and frame, clamped to what exists', () => {
    expect(createStory(shape)).toEqual({ group: 0, frame: 0, paused: false, done: false });
    expect(createStory(shape, 2, 3)).toMatchObject({ group: 2, frame: 3 });
    expect(createStory(shape, 9, 9)).toMatchObject({ group: 2, frame: 3 });
    expect(createStory(shape, -1, -1)).toMatchObject({ group: 0, frame: 0 });
  });
});

describe('reduce', () => {
  it('next walks frames, then rolls into the next group', () => {
    const s = run(createStory(shape), { type: 'next' }, { type: 'next' });
    expect(s).toMatchObject({ group: 0, frame: 2 });
    expect(run(s, { type: 'next' })).toMatchObject({ group: 1, frame: 0, done: false });
  });

  it('next past the last frame of the last group finishes', () => {
    const s = run(createStory(shape, 2, 3), { type: 'next' });
    expect(s.done).toBe(true);
    expect(run(s, { type: 'prev' })).toBe(s);
  });

  it('prev steps back, then to the previous group, and restarts at the very start', () => {
    expect(run(createStory(shape, 1, 1), { type: 'prev' })).toMatchObject({ group: 1, frame: 0 });
    expect(run(createStory(shape, 1, 0), { type: 'prev' })).toMatchObject({ group: 0, frame: 0 });
    const start = createStory(shape);
    const restarted = run(start, { type: 'prev' });
    expect(restarted).toEqual(start);
    expect(restarted).not.toBe(start);
  });

  it('jumps between groups', () => {
    expect(run(createStory(shape, 0, 2), { type: 'nextGroup' })).toMatchObject({
      group: 1,
      frame: 0,
    });
    expect(run(createStory(shape, 2, 1), { type: 'prevGroup' })).toMatchObject({
      group: 1,
      frame: 0,
    });
    expect(run(createStory(shape, 0, 1), { type: 'prevGroup' })).toMatchObject({
      group: 0,
      frame: 0,
    });
    expect(run(createStory(shape, 2, 0), { type: 'nextGroup' }).done).toBe(true);
  });

  it('pauses, resumes and toggles', () => {
    const s = createStory(shape);
    expect(run(s, { type: 'pause' }).paused).toBe(true);
    expect(run(s, { type: 'pause' }, { type: 'resume' }).paused).toBe(false);
    expect(run(s, { type: 'togglePause' }, { type: 'togglePause' }).paused).toBe(false);
  });

  it('keeps the pause state across navigation and goTo', () => {
    const paused = run(createStory(shape), { type: 'pause' });
    expect(run(paused, { type: 'next' }).paused).toBe(true);
    expect(run(paused, { type: 'goTo', group: 2, frame: 1 })).toMatchObject({
      group: 2,
      frame: 1,
      paused: true,
    });
  });
});

describe('barStates', () => {
  it('marks frames before the current one done and after it upcoming', () => {
    expect(barStates(shape, createStory(shape, 2, 1))).toEqual([
      'done',
      'current',
      'upcoming',
      'upcoming',
    ]);
  });
});

describe('frameDuration', () => {
  it('shows photos for 5 s and honours explicit durations', () => {
    expect(frameDuration({})).toBe(5000);
    expect(frameDuration({ durationMs: 8000, words: 3 })).toBe(8000);
  });

  it('gives text frames reading time between 5 and 10 s', () => {
    expect(frameDuration({ words: 4 })).toBe(5000);
    expect(frameDuration({ words: 20 })).toBe(6900);
    expect(frameDuration({ words: 200 })).toBe(10000);
  });
});
