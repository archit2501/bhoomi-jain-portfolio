/**
 * Typo-tolerant matching for the Search panel (task 4.1.1). Every word of the query has to match
 * a word of the item: the word itself, its start, somewhere inside it, or its start within a
 * couple of typing mistakes ("reakt" finds React, "mongdb" finds MongoDB). Hand-rolled with no
 * dependency: the index is under 200 items, so a straight scan on every keystroke is fast.
 *
 * A typo is forgiven only when the first letter is right and the words are long enough to tell
 * apart, as search engines do; otherwise "fastapi" would find "REST APIs".
 *
 * Cost per keystroke: O(n·w·m·l) for n items of up to w words of length l and a query of m
 * characters, with the edit-distance table cut off as soon as a word can't match.
 */

/** Some text, ready to match: its words, and all of them run together. */
export interface Field {
  words: string[];
  /** "nodejs" for "Node.js", "smartblogai" for "SmartBlog AI"; only when there are two words. */
  joined?: string;
}

export interface Searchable {
  title: Field;
  /** Other words that should find it (stack, organisation, group). */
  keywords: Field;
}

export interface Match {
  /** Lower is better. */
  score: number;
  /** Every query word matched in the title. */
  inTitle: boolean;
}

/** Lower case, no accents: "Résumé" and "resume" are the same word. */
export function normalise(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

/** The words of a text. Keeps + and # (C++, C#); a leading # is dropped: "#react" is "react". */
export function queryWords(text: string): string[] {
  return normalise(text)
    .split(/[^a-z0-9+#]+/)
    .map((word) => word.replace(/^#+/, ''))
    .filter(Boolean);
}

/** A text's words, and the whole of it run together, so "nodejs" finds "Node.js". */
export function fieldOf(text: string): Field {
  const words = queryWords(text);
  const joined = words.join('');
  return words.length > 1 && joined.length <= 32 ? { words, joined } : { words };
}

/** How many typing mistakes two words of these lengths may differ by. */
export function allowedEdits(length: number): number {
  return length <= 3 ? 0 : length <= 5 ? 1 : 2;
}

/**
 * The fewest edits (insert, delete, substitute, swap two neighbours) that turn `query` into the
 * start of `word`, or Infinity when it's more than `max`. O(m·l), stopping as soon as every cell
 * in a row is over the limit (a row's minimum never goes down).
 */
export function prefixDistance(query: string, word: string, max: number): number {
  const m = query.length;
  const l = word.length;
  let before = new Array<number>(l + 1).fill(0);
  let previous = Array.from({ length: l + 1 }, (_, j) => j);
  let current = new Array<number>(l + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    current[0] = i;
    let rowMin = i;
    for (let j = 1; j <= l; j++) {
      const cost = query[i - 1] === word[j - 1] ? 0 : 1;
      let d = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && query[i - 1] === word[j - 2] && query[i - 2] === word[j - 1]) {
        d = Math.min(d, before[j - 2] + 1);
      }
      current[j] = d;
      if (d < rowMin) rowMin = d;
    }
    if (rowMin > max) return Infinity;
    [before, previous, current] = [previous, current, before];
  }
  // The best match against any start of the word.
  let best = Infinity;
  for (let j = 0; j <= l; j++) if (previous[j] < best) best = previous[j];
  return best <= max ? best : Infinity;
}

/**
 * How well one query word matches one word: 0 the same word, 1 its start, 2 inside it,
 * 3 + edits a near miss of its start; Infinity no match. `typos` false allows no near misses.
 */
export function wordScore(query: string, word: string, typos = true): number {
  if (word === query) return 0;
  if (word.startsWith(query)) return 1;
  if (query.length >= 3 && word.includes(query)) return 2;
  if (!typos || query[0] !== word[0]) return Infinity;
  const max = allowedEdits(Math.min(query.length, word.length));
  if (!max) return Infinity;
  const edits = prefixDistance(query, word, max);
  return edits === Infinity ? Infinity : 3 + edits;
}

/** The best score for a query word in a field. */
function best(query: string, field: Field): number {
  let score = field.joined === undefined ? Infinity : wordScore(query, field.joined, false);
  for (const word of field.words) {
    if (score === 0) break;
    const s = wordScore(query, word);
    if (s < score) score = s;
  }
  return score;
}

/**
 * Whether an item matches every word of the query, and how well. Title words count more than
 * keywords; a query matched entirely in the title ranks above one that needed keywords.
 */
export function match(query: readonly string[], item: Searchable): Match | null {
  if (!query.length) return null;
  let score = 0;
  let inTitle = true;
  for (const word of query) {
    const title = best(word, item.title);
    if (title !== Infinity) {
      score += title;
      continue;
    }
    const keyword = best(word, item.keywords);
    if (keyword === Infinity) return null;
    score += keyword + 2;
    inTitle = false;
  }
  return { score, inTitle };
}
