// Tech Pictionary's drawing surface: a fixed 4:3 canvas in small ints, so every screen draws the same picture.
// Shared by Convex (convex/drawings.ts checks ink against it) and the drawing components. Keep imports relative.

/** The canvas, in logical units. Points are ints in 0–W × 0–H. */
export const W = 1000;
export const H = 750;

/** Ink colors and brush sizes. Ink is checked against these on the server. */
export const COLORS = ["#111111", "#e0472f", "#1f6fd1", "#2e9a4a", "#f49a1d", "#8a4fd8"];
export const SIZES = [6, 14, 32];

/** Ink rows per query block: phones subscribe block by block, so a new row only resends the last block. */
export const INK_BLOCK = 20;
/** Most ink rows a drawing can have at once, and most numbers in one row. */
export const MAX_INK_ROWS = 2000;
export const MAX_INK_POINTS = 400;

/** The longest guess a phone can send. */
export const GUESS_MAX = 60;

/** The longest word or phrase an officer can set for a drawing. */
export const WORD_MAX = 30;

/** The word as blanks for the TV: each letter or digit a blank, spaces and punctuation as they are. */
export const blanks = (word: string) => word.replace(/[a-z0-9]/gi, "_");

/** An SVG path through flat [x, y, x, y, …] points, smoothed through the midpoints. One point is a dot. */
export function inkPath(p: number[]) {
  if (p.length < 4) return p.length === 2 ? `M${p[0]} ${p[1]}l0 0` : "";
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length - 2; i += 2) d += `Q${p[i]} ${p[i + 1]} ${(p[i] + p[i + 2]) / 2} ${(p[i + 1] + p[i + 3]) / 2}`;
  return `${d}L${p[p.length - 2]} ${p[p.length - 1]}`;
}
