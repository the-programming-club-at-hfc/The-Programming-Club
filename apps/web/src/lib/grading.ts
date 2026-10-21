// Phone answers and automatic scoring for Bug Hunt, Output?, and Guess the Language, plus Fix it for real, puzzles,
// Wiki Race, and Tech Pictionary.
// Pure functions shared by Convex (convex/answers.ts) and the officer test page, so both score the same way.
// Keep imports relative: Convex bundles this file too.
import { BUGS, LANGS, OUTPUTS } from "./content";
import { PUZZLES } from "./puzzles";

export type GameId = "bug" | "output" | "relay" | "lang" | "fix" | "puzzle";
export type AnswerGame = "bug" | "output" | "lang";

export const isAnswerGame = (g: string | undefined): g is AnswerGame => g === "bug" || g === "output" || g === "lang";

export const cardKey = (game: GameId, index: number) => `${game}:${index}`;

const SECONDS = { output: 30, relay: 720, lang: 45, fix: 240 };

/** Seconds on the clock for a card. */
export const cardSeconds = (game: GameId, index: number) =>
  game === "bug" ? (BUGS[index].level === "hard" ? 120 : 90) : game === "puzzle" ? PUZZLES[index].minutes * 60 : SECONDS[game];

/** How long after the card goes up a lock still earns the early bonus. Output? has none. */
export const earlyMs = (game: AnswerGame, index: number) =>
  game === "bug" ? cardSeconds("bug", index) * 500 : game === "lang" ? 15_000 : 0;

// A tiny seeded shuffle, so every phone shows a card's choices in the same order.
function seeded(key: string) {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** The four choices for an Output? answer, a Bug Hunt fix, or a language, in the same shuffled order everywhere. */
export function choices(game: AnswerGame, index: number) {
  const all =
    game === "bug"
      ? [BUGS[index].fix, ...BUGS[index].wrong]
      : game === "output"
        ? [OUTPUTS[index].answer, ...OUTPUTS[index].wrong]
        : [LANGS[index].lang, ...LANGS[index].decoys];
  const rand = seeded(cardKey(game, index));
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

/** The language names Guess the Language cards may use (answers, answers that also count, decoys), so a typo can't slip in. */
export const LANGUAGES = [
  "Assembly",
  "Bash",
  "C",
  "C#",
  "C++",
  "CSS",
  "Dart",
  "Elixir",
  "Go",
  "Haskell",
  "HTML",
  "Java",
  "JavaScript",
  "Julia",
  "Kotlin",
  "Lua",
  "MATLAB",
  "Objective-C",
  "Perl",
  "PHP",
  "PowerShell",
  "Python",
  "R",
  "Ruby",
  "Rust",
  "Scala",
  "SQL",
  "Swift",
  "TypeScript",
];

/** A team's answer to one card. Times are server milliseconds. */
export interface Pick {
  /** Bug Hunt: the tapped line, 1-based. */
  line?: number;
  /** Bug Hunt: when the line was locked. The fix choices open after that. */
  lineLockedAt?: number;
  /** The Output? answer, the language, or the Bug Hunt fix. */
  choice?: string;
  /** When the team locked its answer (Bug Hunt: the fix step, so both steps). */
  lockedAt?: number;
}

export interface Grade {
  points: number;
  correct: boolean;
  /** Earned the early-lock bonus. */
  early: boolean;
  /** Bug Hunt only. */
  line?: boolean;
  fix?: boolean;
}

/**
 * Points for one team's answer. `start` is when the card's clock started.
 * Bug Hunt: +1 right line, +1 right fix, +1 if both steps were locked before half time and the line is right.
 * Output?: +1 if right. Guess the Language: +1 if right, +1 more if locked in the first 15 seconds.
 * An unlocked pick still counts when time runs out, but never earns the early bonus.
 */
export function grade(game: AnswerGame, index: number, pick: Pick, start: number): Grade {
  const inTime = pick.lockedAt !== undefined && pick.lockedAt <= start + earlyMs(game, index);
  if (game === "bug") {
    const b = BUGS[index];
    const line = pick.line !== undefined && b.lines.includes(pick.line);
    const fix = pick.choice === b.fix;
    const early = line && inTime;
    return { points: Number(line) + Number(fix) + Number(early), correct: line && fix, early, line, fix };
  }
  const right =
    game === "output"
      ? pick.choice === OUTPUTS[index].answer
      : pick.choice !== undefined && [LANGS[index].lang, ...(LANGS[index].also ?? [])].includes(pick.choice);
  const early = right && game === "lang" && inTime;
  return { points: right ? 1 + Number(early) : 0, correct: right, early };
}

/**
 * What to award when a card is revealed: each answer's grade and points (doubled on a double-points round).
 * Returns null if the card was already scored tonight, so revealing twice never scores twice.
 */
export function awardsFor<T>(o: {
  game: AnswerGame;
  index: number;
  start: number;
  double: boolean;
  scored: string[];
  answers: { id: T; pick: Pick }[];
}) {
  const key = cardKey(o.game, o.index);
  if (o.scored.includes(key)) return null;
  return {
    scored: [...o.scored, key],
    awards: o.answers.map(({ id, pick }) => {
      const g = grade(o.game, o.index, pick, o.start);
      return { id, grade: g, points: o.double ? g.points * 2 : g.points };
    }),
  };
}

// ---- Fix it for real ------------------------------------------------------

/** Program output as the tests compare it: trailing spaces on each line and trailing blank lines don't matter. */
export const tidyOutput = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n+$/, "");

export const sameOutput = (actual: string, expected: string) => tidyOutput(actual) === tidyOutput(expected);

/** Points for fixing a Fix it for real card in time, and the extra for the first team to fix it. */
export const FIX_POINTS = 3;
export const FIRST_FIX_BONUS = 2;

/**
 * What to award when a Fix it for real card is revealed. `fixes` are the teams that fixed it before it closed, with
 * server times, in the order they reported (so an exact tie goes to whoever reported first). +3 each, +2 more for the
 * first, all doubled on a double-points round. Returns null if the card was already scored tonight.
 */
export function fixAwardsFor<T>(o: { index: number; double: boolean; scored: string[]; fixes: { id: T; at: number }[] }) {
  const key = cardKey("fix", o.index);
  if (o.scored.includes(key)) return null;
  const first = o.fixes.reduce((best, f, i) => (f.at < o.fixes[best].at ? i : best), 0);
  return {
    scored: [...o.scored, key],
    awards: o.fixes.map(({ id }, i) => {
      const points = FIX_POINTS + (i === first ? FIRST_FIX_BONUS : 0);
      return { id, first: i === first, points: o.double ? points * 2 : points };
    }),
  };
}

// ---- Puzzles ---------------------------------------------------------------

/** Points per star: part 1, part 2, and the extra for the first team to each star. */
export const PART1_POINTS = 3;
export const PART2_POINTS = 5;
export const FIRST_STAR_BONUS = 2;
/** How long a wrong answer locks a team out of answering. */
export const LOCKOUT_MS = 30_000;

/** An answer as it's compared: case, spaces, and punctuation don't matter, so "MEX, JPN" matches "MEXJPN". */
export const answerKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A team's progress on a puzzle. Times are server milliseconds. */
export interface Stars {
  part1At?: number;
  part2At?: number;
  lockedUntil?: number;
  wrong: number;
}

export type Submission =
  | { kind: "right"; stars: Stars }
  | { kind: "wrong"; stars: Stars }
  /** Still locked out from a wrong answer. Nothing changes. */
  | { kind: "locked"; waitMs: number }
  /** That part already has its star. Nothing changes. */
  | { kind: "done" }
  /** Part 2 before part 1. Nothing changes. */
  | { kind: "early" };

/**
 * Checks one answer. A wrong answer locks the team out for LOCKOUT_MS, and answers during a lockout aren't checked.
 * `expected` is only called when the answer is checked, since that means generating and solving the team's input.
 */
export function submitAnswer(stars: Stars, part: 1 | 2, answer: string, expected: () => string, now: number): Submission {
  if ((part === 1 ? stars.part1At : stars.part2At) !== undefined) return { kind: "done" };
  if (part === 2 && stars.part1At === undefined) return { kind: "early" };
  if (stars.lockedUntil !== undefined && now < stars.lockedUntil) return { kind: "locked", waitMs: stars.lockedUntil - now };
  if (answerKey(answer) !== "" && answerKey(answer) === answerKey(expected()))
    return { kind: "right", stars: { ...stars, [part === 1 ? "part1At" : "part2At"]: now } };
  return { kind: "wrong", stars: { ...stars, wrong: stars.wrong + 1, lockedUntil: now + LOCKOUT_MS } };
}

/** Position of the earliest time in a list, or -1 if there's none. An exact tie goes to whoever is first in the list. */
const earliest = (times: (number | undefined)[]) =>
  times.reduce<number>((best, t, i) => (t !== undefined && (best === -1 || t < times[best]!) ? i : best), -1);

/** Which teams were first to each star, as positions in the list (-1 if nobody has it yet). */
export const firstStars = (teams: { part1At?: number; part2At?: number }[]) => ({
  first1: earliest(teams.map((t) => t.part1At)),
  first2: earliest(teams.map((t) => t.part2At)),
});

/**
 * What to award when a puzzle is scored: +3 per part-1 star, +5 per part-2 star, +2 more for the first team to each
 * star, all doubled on a double-points round. `teams` are in the order their rows were made, so an exact tie goes to
 * whoever got there first. Returns null if the puzzle was already scored tonight.
 */
export function puzzleAwardsFor<T>(o: {
  index: number;
  double: boolean;
  scored: string[];
  teams: { id: T; part1At?: number; part2At?: number }[];
}) {
  const key = cardKey("puzzle", o.index);
  if (o.scored.includes(key)) return null;
  const { first1, first2 } = firstStars(o.teams);
  return {
    scored: [...o.scored, key],
    awards: o.teams.map(({ id, part1At, part2At }, i) => {
      const points =
        (part1At !== undefined ? PART1_POINTS : 0) +
        (part2At !== undefined ? PART2_POINTS : 0) +
        (i === first1 ? FIRST_STAR_BONUS : 0) +
        (i === first2 ? FIRST_STAR_BONUS : 0);
      return { id, first1: i === first1, first2: i === first2, points: o.double ? points * 2 : points };
    }),
  };
}

// ---- The answer window, shared by every team-answered game ----------------

/** Server leeway after 0:00 for answers already on their way. */
export const GRACE_MS = 2000;

/** One showing of an answerable card: when its clock started (for the early bonus) and when it ran out, if it has. */
export interface CardWindow {
  key: string;
  at: number;
  endedAt?: number;
  /** Double points were on when the card first went up. */
  double?: boolean;
  /** The card's own clock, kept while another card is up: time left, its full length, and whether it was running. */
  left?: { ms: number; of: number; running: boolean };
}

/** The shared clock. `card` is the card this run is timing; a clock started for another screen doesn't count. */
export interface Clock {
  durationMs: number;
  remainingMs: number;
  startedAt?: number;
  card?: string;
  /** Paused because its card left the TV mid-play (at `parkedAt`); it runs again when the card comes back. */
  parked?: boolean;
  parkedAt?: number;
}

/** Milliseconds left at `now`. Goes below 0 once a running clock has run out. */
export const clockLeft = (t: Clock, now: number) => (t.startedAt === undefined ? t.remainingMs : t.remainingMs - (now - t.startedAt));

/** Record when a card's clock ran out, so pausing, resetting, or leaving the card afterwards can't reopen it. */
export const settle = (windows: CardWindow[], t: Clock, now: number) =>
  windows.map((w) =>
    w.endedAt !== undefined || t.card !== w.key || clockLeft(t, now) > 0
      ? w
      : { ...w, endedAt: t.startedAt !== undefined ? t.startedAt + t.remainingMs : now },
  );

/**
 * The windows after the screen changes. The card leaving the screen keeps its window in `played`, and a card that
 * comes back picks its own window up again, so going away and back never restarts its early bonus or reopens it.
 */
export function showCard(o: { card?: CardWindow; played: CardWindow[]; up?: string; now: number; double?: boolean }) {
  if (o.card?.key === o.up) return { card: o.card, played: o.played };
  const leaving = o.card;
  const played = leaving ? [...o.played.filter((w) => w.key !== leaving.key), leaving] : o.played;
  return { card: o.up ? (played.find((w) => w.key === o.up) ?? { key: o.up, at: o.now, double: o.double }) : undefined, played };
}

/**
 * The clock as the TV changes. A card's (or drawing's) running clock parks when the card leaves the TV for a screen
 * with no card (scores, the join screen, slides, a message), since nobody can answer it meanwhile, and runs again when
 * the card comes back unrevealed; another card going up instead ends the parking. `to` is the answerable card going
 * up; `hold` keeps the clock running (the big timer shows it, and a Wiki Race goes on on team computers). The early
 * bonus still counts from when the card first went up.
 */
export function parkClock<T extends Clock>(t: T, o: { to?: string; hold: boolean; revealed: boolean; now: number }): T {
  if (!o.hold && o.to === undefined && t.card && t.startedAt !== undefined && clockLeft(t, o.now) > 0)
    return { ...t, remainingMs: clockLeft(t, o.now), startedAt: undefined, parked: true, parkedAt: o.now };
  if (t.parked && o.to === t.card) return { ...t, startedAt: o.revealed ? undefined : o.now, parked: undefined, parkedAt: undefined };
  if (t.parked && o.to !== undefined) return { ...t, parked: undefined, parkedAt: undefined };
  return t;
}

/**
 * Card to card: the leaving card takes its clock along in its window, and a card coming back gets its own clock back,
 * so it still closes at 0:00 and keeps its early-bonus start. A clock that already ran out stays out (its `endedAt`), and
 * `hold` (a Wiki Race, which goes on on team computers) keeps the clock where it is.
 */
export function swapClock<T extends Clock>(
  t: T,
  o: { card?: CardWindow; played: CardWindow[]; up?: string; hold: boolean; revealed: boolean; now: number },
): { timer: T; card?: CardWindow; played: CardWindow[] } {
  let { card, played } = o;
  let timer = t;
  const ms = clockLeft(t, o.now);
  if (!o.hold && o.up && t.card && t.card !== o.up && ms > 0 && played.some((w) => w.key === t.card)) {
    const left = { ms, of: t.durationMs, running: t.startedAt !== undefined || !!t.parked };
    played = played.map((w) => (w.key === t.card ? { ...w, left } : w));
    timer = { ...timer, remainingMs: ms, startedAt: undefined, card: undefined, parked: undefined, parkedAt: undefined };
  }
  const back = card?.left;
  if (card && back) {
    timer = {
      ...timer,
      durationMs: back.of,
      remainingMs: back.ms,
      startedAt: back.running && !o.revealed ? o.now : undefined,
      card: card.key,
      parked: undefined,
      parkedAt: undefined,
    };
    const key = card.key;
    card = { ...card, left: undefined };
    played = played.map((w) => (w.key === key ? { ...w, left: undefined } : w));
  }
  return { timer, card, played };
}

/** A clock that starts from full for the card on screen: a preset with autostart, or Start from full. Never +30s. */
export const isFreshStart = (action: string, t: Clock, now: number) =>
  (action === "set" || action === "toggle") && t.startedAt === now && t.remainingMs === t.durationMs;

/**
 * Whether teams can still pick or lock. Answers close at the reveal, or once this card's own clock runs out
 * (`remaining` may go below 0 on the server, and `grace` covers answers already on their way). A clock paused before
 * 0:00, or one that belongs to another screen, keeps them open; once the card's clock has run out, they stay closed.
 */
export function answersOpen(o: {
  revealed: boolean;
  scored: boolean;
  /** When this card's clock ran out, if it has (kept through pauses and resets). */
  endedAt: number | undefined;
  /** The clock is timing this card. */
  own: boolean;
  running: boolean;
  remaining: number;
  now: number;
  grace: number;
}) {
  if (o.revealed || o.scored) return false;
  if (o.endedAt !== undefined && o.now > o.endedAt + o.grace) return false;
  if (!o.own) return true;
  // Paused: open while time is left, or within the grace after the recorded run-out.
  return o.running ? o.remaining > -o.grace : o.remaining > 0 || o.endedAt !== undefined;
}

// ---- Wiki Race ------------------------------------------------------------

/** A Wiki Race's key, like a card's: "wiki:Pizza>Moon". */
export const wikiKey = (from: string, to: string) => `wiki:${from}>${to}`;

/** The start and target articles in a Wiki Race key. */
export const wikiPair = (key: string) => {
  const [from = "", to = ""] = key.slice("wiki:".length).split(">");
  return { from, to };
};

/** Seconds on the clock for a Wiki Race: 5 minutes, or 6 for Fewest Clicks. */
export const wikiSeconds = (clicks: boolean) => (clicks ? 360 : 300);

/** Points for 1st, 2nd, and 3rd, for any other team that finishes, and for playing. */
export const WIKI_PLACES = [5, 4, 3];
export const WIKI_FINISHED = 2;
export const WIKI_PLAYED = 1;

/** Points for a finishing place, or for playing (null: didn't finish). Before double points. */
export const wikiPoints = (place: number | null) => (place === null ? WIKI_PLAYED : (WIKI_PLACES[place - 1] ?? WIKI_FINISHED));

/**
 * Each finish's place. A race goes by server time (an exact tie goes to whoever is first in the list); Fewest Clicks
 * goes by the lowest count, and teams with the same count share the place.
 */
export function wikiPlaces(finishes: { at: number; clicks?: number }[], clicks: boolean) {
  if (clicks) {
    const n = (f: { clicks?: number }) => f.clicks ?? Infinity;
    return finishes.map((f) => 1 + finishes.filter((o) => n(o) < n(f)).length);
  }
  const order = finishes.map((_, i) => i).sort((a, b) => finishes[a].at - finishes[b].at || a - b);
  return finishes.map((_, i) => order.indexOf(i) + 1);
}

/**
 * What to award when a Wiki Race is scored: every team gets points for its place, or 1 for playing if it didn't finish
 * (or the referee turned its finish down), all doubled on a double-points round. `finishes` are the finishes the
 * referee didn't turn down, all made before time ran out. Returns null if the race was already scored tonight.
 */
export function wikiAwardsFor<T>(o: {
  key: string;
  clicks: boolean;
  double: boolean;
  scored: string[];
  teams: T[];
  finishes: { team: T; at: number; clicks?: number }[];
}) {
  if (o.scored.includes(o.key)) return null;
  const places = wikiPlaces(o.finishes, o.clicks);
  return {
    scored: [...o.scored, o.key],
    awards: o.teams.map((team) => {
      const i = o.finishes.findIndex((f) => f.team === team);
      const place = i === -1 ? null : places[i];
      const points = wikiPoints(place);
      return { team, place, points: o.double ? points * 2 : points };
    }),
  };
}

// ---- Tech Pictionary -------------------------------------------------------

/** Seconds on the clock for a drawing. */
export const DRAW_SECONDS = 75;

/** A drawing's key, like a card's: "draw:3" is tonight's third drawing. */
export const drawKey = (n: number) => `draw:${n}`;

/** A guess (or the word) as it's compared: case, spaces, and punctuation don't matter. */
export const guessKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Letters to add, drop, or change to turn one string into the other. */
export function editDistance(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + Number(a[i - 1] !== b[j - 1]));
    prev = row;
  }
  return prev[b.length];
}

/**
 * Checks a guess against the word. Plurals count ("bugs", "viruses", "glasses"), and so does the singular of a plural
 * word ("headphone"), but never a word cut short ("viru", "glas"). One or two letters off is "close" (it doesn't count,
 * and only the guesser sees it); short words only get one, so "So close!" never gives a three-letter word away.
 */
export function checkGuess(guess: string, word: string): "right" | "close" | "wrong" {
  const g = guessKey(guess);
  const w = guessKey(word);
  if (!g) return "wrong";
  // "bugs" takes "bug", but a short word like "JS" never takes "J".
  const plural = w.length >= 4 && /s$/.test(w) && !/(ss|us)$/.test(w);
  if ([w, `${w}s`, `${w}es`].includes(g) || (plural && g === w.slice(0, -1))) return "right";
  return editDistance(g, w) <= (w.length >= 5 ? 2 : 1) ? "close" : "wrong";
}

/** Points for the first team to guess a drawing, every other team that does, and the drawer's team. */
export const FIRST_GUESS_POINTS = 3;
export const GUESS_POINTS = 2;
export const DRAWER_POINTS = 2;
export const DRAWER_HALF_POINTS = 3;

/**
 * What to award when a drawing is scored. `got` are the guessing teams that got it, in order. The first gets 3 and
 * every other 2; the drawer's team gets 2 if anyone got it, 3 if at least half of the `guessing` teams did. All
 * doubled on a double-points round. Returns null if the drawing was already scored tonight.
 */
export function drawAwardsFor<T>(o: { key: string; double: boolean; scored: string[]; drawer: T | null; guessing: number; got: T[] }) {
  if (o.scored.includes(o.key)) return null;
  const x = (p: number) => (o.double ? p * 2 : p);
  const awards = o.got.map((team, i) => ({ team, points: x(i === 0 ? FIRST_GUESS_POINTS : GUESS_POINTS) }));
  if (o.drawer !== null && o.got.length)
    awards.push({ team: o.drawer, points: x(o.got.length * 2 >= o.guessing ? DRAWER_HALF_POINTS : DRAWER_POINTS) });
  return { scored: [...o.scored, o.key], awards };
}

/** Place among `all` scores: ties share a place without skipping the next (13, 13, 11 is 1st, 1st, 2nd), so teammates,
 *  who always tie, never push the next team down. */
export const placeOf = (score: number, all: number[]) => 1 + new Set(all.filter((o) => o > score)).size;
