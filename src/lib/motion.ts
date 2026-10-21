/**
 * Reads a CSS duration ("420ms", or ".9s" once the build has minified tokens.css) as
 * milliseconds, so scripts can take their timing from the motion tokens. Undefined if unreadable.
 */
export function durationMs(value: string): number | undefined {
  const match = /^(-?\d*\.?\d+)(ms|s)$/.exec(value.trim());
  if (!match) return undefined;
  const n = Number(match[1]);
  return match[2] === 's' ? n * 1000 : n;
}
