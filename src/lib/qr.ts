/**
 * Draws a QR code's modules as one SVG path, a run of dark modules per rectangle, so the code
 * takes her colours from CSS (currentColor) and stays a few KB. The code itself is encoded at
 * build time (uqr); nothing QR-related runs in the browser. O(n²) for an n×n code.
 */
export function qrPath(modules: readonly (readonly boolean[])[]): string {
  const parts: string[] = [];
  for (const [y, row] of modules.entries()) {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < row.length && row[x + run]) run++;
      parts.push(`M${x} ${y}h${run}v1h-${run}z`);
      x += run;
    }
  }
  return parts.join('');
}
