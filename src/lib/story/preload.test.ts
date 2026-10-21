import { describe, expect, it } from 'vitest';
import { createStory } from './controller';
import { framesToLoad, park, unpark } from './preload';

const shape = [3, 2];

describe('framesToLoad', () => {
  it('loads the frame on screen and the next one in the same highlight', () => {
    expect(framesToLoad(shape, createStory(shape, 0, 0))).toEqual([
      { group: 0, frame: 0 },
      { group: 0, frame: 1 },
    ]);
  });

  it("at a highlight's last frame, the next is the first frame of the next highlight", () => {
    expect(framesToLoad(shape, createStory(shape, 0, 2))).toEqual([
      { group: 0, frame: 2 },
      { group: 1, frame: 0 },
    ]);
  });

  it('at the very last frame there is nothing ahead to load', () => {
    expect(framesToLoad(shape, createStory(shape, 1, 1))).toEqual([{ group: 1, frame: 1 }]);
  });
});

/** Just enough of an Element for the attribute juggling. */
function fakeElement(attributes: Record<string, string>) {
  const map = new Map(Object.entries(attributes));
  return {
    getAttribute: (name: string) => map.get(name) ?? null,
    setAttribute: (name: string, value: string) => void map.set(name, value),
    removeAttribute: (name: string) => void map.delete(name),
    attributes: () => Object.fromEntries(map),
  };
}

describe('park and unpark', () => {
  it('moves src and srcset aside so nothing fetches, and puts them back', () => {
    const img = fakeElement({ src: 'a.webp', srcset: 'a-480.webp 480w', alt: 'A' });
    park(img);
    expect(img.attributes()).toEqual({
      alt: 'A',
      'data-parked-src': 'a.webp',
      'data-parked-srcset': 'a-480.webp 480w',
    });
    unpark(img);
    expect(img.attributes()).toEqual({ alt: 'A', src: 'a.webp', srcset: 'a-480.webp 480w' });
  });

  it('leaves elements without those attributes alone, and unparking twice is harmless', () => {
    const source = fakeElement({ srcset: 'b.avif 480w', type: 'image/avif' });
    park(source);
    unpark(source);
    unpark(source);
    expect(source.attributes()).toEqual({ srcset: 'b.avif 480w', type: 'image/avif' });
    const bare = fakeElement({ alt: '' });
    park(bare);
    expect(bare.attributes()).toEqual({ alt: '' });
  });
});
