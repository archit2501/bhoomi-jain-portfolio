import { wrapText } from './og';

export interface DiagramNode {
  id: string;
  label: string;
  detail?: string;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

export interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string[];
  detail: string[];
  /** Its row, top to bottom: the slide colours its layers in her ring's order. */
  layer: number;
}

export interface Arrow {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
  /** The layer the arrow leads into, for its colour. */
  layer: number;
  /** Where the label sits: beside the arrow's midpoint. */
  labelX: number;
  labelY: number;
}

export interface DiagramLayout {
  width: number;
  height: number;
  boxes: Box[];
  arrows: Arrow[];
}

/** The slide is 4:5, so the diagram flows top to bottom in a 400×500 box. */
export const DIAGRAM_W = 400;
export const DIAGRAM_H = 500;
const PAD = 24;
const GAP_X = 16;

/**
 * Each node's layer: the longest chain of edges leading to it, so data flows downward
 * (client, then API, then database). Edges back up the chain are ignored. O(n·e).
 */
export function layers(nodes: DiagramNode[], edges: DiagramEdge[]): Map<string, number> {
  const layer = new Map(nodes.map((n) => [n.id, 0]));
  // A longest-path relaxation; at most n passes, which also stops on a cycle.
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const { from, to } of edges) {
      const next = (layer.get(from) ?? 0) + 1;
      if (layer.has(to) && next > (layer.get(to) ?? 0) && next < nodes.length) {
        layer.set(to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return layer;
}

/**
 * Wraps a "·"-separated list without breaking inside a term ("React Router · Tailwind · React
 * Query" never splits "React Query"); a term too long for a line on its own wraps by words.
 */
export function wrapTerms(text: string, maxChars: number, maxLines: number): string[] {
  const terms = text.split(/\s+·\s+/);
  if (terms.length < 2) return wrapText(text, maxChars, maxLines);
  const lines: string[] = [];
  let line = '';
  for (const term of terms) {
    const candidate = line ? `${line} · ${term}` : term;
    if (candidate.length <= maxChars || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = term;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1]} …`;
  return kept;
}

/** Positions every box and arrow for an SVG of DIAGRAM_W × DIAGRAM_H. */
export function layoutDiagram(nodes: DiagramNode[], edges: DiagramEdge[]): DiagramLayout {
  const layer = layers(nodes, edges);
  const rows = Math.max(...layer.values()) + 1;
  const rowH = (DIAGRAM_H - 2 * PAD) / rows;
  const boxH = Math.min(96, rowH * 0.62);
  const boxes: Box[] = [];
  for (let row = 0; row < rows; row++) {
    const inRow = nodes.filter((n) => layer.get(n.id) === row);
    const width = Math.min(260, (DIAGRAM_W - 2 * PAD - GAP_X * (inRow.length - 1)) / inRow.length);
    const total = width * inRow.length + GAP_X * (inRow.length - 1);
    inRow.forEach((node, i) => {
      const chars = Math.max(10, Math.floor(width / 9));
      boxes.push({
        id: node.id,
        x: (DIAGRAM_W - total) / 2 + i * (width + GAP_X),
        y: PAD + row * rowH + (rowH - boxH) / 2,
        width,
        height: boxH,
        label: wrapText(node.label, chars, 2),
        detail: node.detail ? wrapTerms(node.detail, Math.floor(chars * 1.25), 2) : [],
        layer: row,
      });
    });
  }
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const arrows: Arrow[] = edges.flatMap(({ from, to, label }) => {
    const a = byId.get(from);
    const b = byId.get(to);
    if (!a || !b) return [];
    const x1 = a.x + a.width / 2;
    const y1 = a.y + a.height;
    const x2 = b.x + b.width / 2;
    const y2 = b.y;
    return [
      {
        x1,
        y1,
        x2,
        y2,
        label,
        layer: b.layer,
        labelX: (x1 + x2) / 2 + 10,
        labelY: (y1 + y2) / 2 + 4,
      },
    ];
  });
  return { width: DIAGRAM_W, height: DIAGRAM_H, boxes, arrows };
}

/** A text version for screen readers: "React SPA to Express API (REST + JWT), …". */
export function describeDiagram(nodes: DiagramNode[], edges: DiagramEdge[]): string {
  const name = new Map(nodes.map((n) => [n.id, n.label]));
  return edges
    .map((e) => `${name.get(e.from)} to ${name.get(e.to)}${e.label ? ` (${e.label})` : ''}`)
    .join(', ');
}
