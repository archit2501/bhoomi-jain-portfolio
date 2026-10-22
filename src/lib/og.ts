/** Text helpers shared by build-time drawing (diagrams; share cards are src/lib/og-card.ts). */

/** Greedy word wrap to at most `maxLines` lines; the last line ends with "…" if text was cut. */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) {
      lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[\s.,;:]+$/, '')}…`;
      return lines;
    }
  }
  if (line) lines.push(line);
  return lines;
}
