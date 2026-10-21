import { describe, expect, it } from 'vitest';
import { describeDiagram, DIAGRAM_H, DIAGRAM_W, layers, layoutDiagram } from './diagram';

const nodes = [
  { id: 'spa', label: 'React SPA', detail: 'React Router · Tailwind' },
  { id: 'api', label: 'Node.js / Express REST API' },
  { id: 'db', label: 'MongoDB' },
];
const edges = [
  { from: 'spa', to: 'api', label: 'REST + JWT' },
  { from: 'api', to: 'db', label: 'Mongoose' },
];

describe('layers', () => {
  it('puts each node one below the node feeding it', () => {
    expect(Object.fromEntries(layers(nodes, edges))).toEqual({ spa: 0, api: 1, db: 2 });
  });

  it('uses the longest chain, so a shortcut edge does not pull a node up', () => {
    const withShortcut = [...edges, { from: 'spa', to: 'db' }];
    expect(layers(nodes, withShortcut).get('db')).toBe(2);
  });

  it('stops on a cycle instead of looping forever', () => {
    const cycle = [...edges, { from: 'db', to: 'spa' }];
    const result = layers(nodes, cycle);
    for (const value of result.values()) expect(value).toBeLessThan(nodes.length);
  });
});

describe('layoutDiagram', () => {
  it('stacks layers top to bottom inside the 4:5 box, centred', () => {
    const { width, height, boxes } = layoutDiagram(nodes, edges);
    expect([width, height]).toEqual([DIAGRAM_W, DIAGRAM_H]);
    const [spa, api, db] = boxes;
    expect(spa.y).toBeLessThan(api.y);
    expect(api.y).toBeLessThan(db.y);
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(DIAGRAM_W);
      expect(b.y + b.height).toBeLessThanOrEqual(DIAGRAM_H);
      expect(Math.abs(b.x + b.width / 2 - DIAGRAM_W / 2)).toBeLessThan(1);
    }
  });

  it('places two nodes in one layer side by side', () => {
    const two = [...nodes, { id: 'cache', label: 'React Query cache' }];
    const { boxes } = layoutDiagram(two, [...edges, { from: 'spa', to: 'cache' }]);
    const api = boxes.find((b) => b.id === 'api')!;
    const cache = boxes.find((b) => b.id === 'cache')!;
    expect(api.y).toBe(cache.y);
    expect(api.x + api.width).toBeLessThan(cache.x);
  });

  it('wraps long labels to two lines and draws an arrow per edge', () => {
    const { boxes, arrows } = layoutDiagram(nodes, edges);
    expect(boxes[1].label.length).toBeLessThanOrEqual(2);
    expect(arrows).toHaveLength(2);
    expect(arrows[0].label).toBe('REST + JWT');
    expect(arrows[0].y1).toBeLessThan(arrows[0].y2);
  });

  it('skips an edge to a node that does not exist', () => {
    expect(layoutDiagram(nodes, [{ from: 'spa', to: 'ghost' }]).arrows).toEqual([]);
  });
});

describe('describeDiagram', () => {
  it('reads the flow for screen readers', () => {
    expect(describeDiagram(nodes, edges)).toBe(
      'React SPA to Node.js / Express REST API (REST + JWT), Node.js / Express REST API to MongoDB (Mongoose)',
    );
  });
});
