// Spooky Bugs art: paper cutouts in the poster's style, transparent WebP in public/spooky/.
// The TV's haunted scene and the Bug Hunt beetle on laptops both read from here.
export const SPOOKY_ART = {
  /** Full moon, torn-paper edge. */
  moon: "/spooky/moon.webp",
  /** Bat, wings up. Alternate with batDown to flap. */
  bat: "/spooky/bat.webp",
  /** Bat, wings down. */
  batDown: "/spooky/bat-down.webp",
  /** A wide row of pines, flat along the bottom, for the horizon. */
  pines: "/spooky/pines.webp",
  /** A wide dark hill, flat along the bottom, in front of the pines. */
  ridge: "/spooky/ridge.webp",
  /** The graveyard's ground from the front: torn-paper bands, tiling left to right, solid along the bottom quarter. 3:1. */
  yard: "/spooky/yard.webp",
  /** A few paper grass tufts on a low mound, flat along the bottom, for the foot of a gravestone. 5:2. */
  tufts: "/spooky/tufts.webp",
  /** A wide wisp of fog that tiles left to right. */
  fog: "/spooky/fog.webp",
  /** The beetle with the magnifying glass, side view facing right, legs in step one. */
  beetle: "/spooky/beetle.webp",
  /** The same beetle, legs in step two. Alternate with beetle to walk. */
  beetleStep: "/spooky/beetle-step.webp",
  /** A hanging spider, front view; the thread is drawn in CSS above it. */
  spider: "/spooky/spider.webp",
  /** A glass jar with a cork, empty, for catching the bug. */
  jar: "/spooky/jar.webp",
  /** A rounded gravestone, blank face, for names and scores. */
  gravestone: "/spooky/gravestone.webp",
  /** A carved pumpkin. */
  pumpkin: "/spooky/pumpkin.webp",
  /** A small paper ghost. */
  ghost: "/spooky/ghost.webp",
  /** A crooked haunted house on its own mound, gold-lit windows, 4:3. */
  house: "/spooky/house.webp",
  /** An iron fence, 4:1, that tiles left to right. */
  fence: "/spooky/fence.webp",
  /** A bare dead tree, roots and all, 3:4. */
  tree: "/spooky/tree.webp",
  /** A wooden signboard on a post, 2:1, its face blank for writing on. */
  sign: "/spooky/sign.webp",
} as const;

// The TV lobby's graveyard, by how many have joined: up to `upTo` players in `rows` rows of stones `width` cqw wide.
// Each fits across the ground (a stone and its gap are 1.1 × width, in 86cqw) and up it (a stone is 1.2 × width tall,
// and each row behind shows 70% of one, in 24cqw), so names stay on their own stone however many come.
const GRAVE_TIERS = [
  { upTo: 6, rows: 1, width: 11.5 },
  { upTo: 16, rows: 2, width: 9.4 },
  { upTo: 30, rows: 3, width: 7.6 },
  { upTo: 48, rows: 4, width: 6.2 },
];

/** The lobby's gravestones for `players` in join order: rows, back row first (so whoever just joined is up front),
 *  each stone's width in cqw, and how many more there are than fit. */
export function graveRows<T>(players: T[]) {
  const tier = GRAVE_TIERS.find((t) => players.length <= t.upTo) ?? GRAVE_TIERS[GRAVE_TIERS.length - 1];
  const shown = players.slice(0, tier.upTo);
  const per = Math.max(1, Math.ceil(shown.length / tier.rows));
  const rows: T[][] = [];
  for (let i = 0; i < shown.length; i += per) rows.push(shown.slice(i, i + per));
  return { rows, width: tier.width, more: players.length - shown.length };
}
