// Phone answers and automatic scoring for Bug Hunt, Output?, and Guess the Language, plus Fix it for real.
// Pure functions shared by Convex (convex/answers.ts) and the officer test page, so both score the same way.
// Keep imports relative: Convex bundles this file too.
import { BUGS, LANGS, OUTPUTS } from "./content";

export type GameId = "bug" | "output" | "relay" | "lang" | "fix";
export type AnswerGame = "bug" | "output" | "lang";

export const isAnswerGame = (g: string | undefined): g is AnswerGame => g === "bug" || g === "output" || g === "lang";

export const cardKey = (game: GameId, index: number) => `${game}:${index}`;

const SECONDS = { output: 30, relay: 720, lang: 45, fix: 240 };

/** Seconds on the clock for a card. */
export const cardSeconds = (game: GameId, index: number) => (game === "bug" ? (BUGS[index].level === "hard" ? 120 : 90) : SECONDS[game]);

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

/** The four choices for an Output? answer or a Bug Hunt fix, in the same shuffled order everywhere. */
export function choices(game: "bug" | "output", index: number) {
  const all = game === "bug" ? [BUGS[index].fix, ...BUGS[index].wrong] : [OUTPUTS[index].answer, ...OUTPUTS[index].wrong];
  const rand = seeded(cardKey(game, index));
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

/** Every language in the Guess the Language list: each card's answer plus decoys. */
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

// Other names people type, so the search still finds them.
const AKA: Record<string, string> = {
  Assembly: "asm",
  Bash: "shell sh zsh",
  "C#": "c sharp csharp",
  "C++": "cpp c plus plus",
  Go: "golang",
  JavaScript: "js",
  "Objective-C": "objc",
  Python: "py",
  TypeScript: "ts",
};

/** Languages matching a search, best matches (names that start with it) first. */
export function searchLanguages(q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return LANGUAGES;
  const hits = LANGUAGES.filter((l) => l.toLowerCase().includes(s) || (AKA[l] ?? "").split(" ").some((a) => a.startsWith(s)));
  return [...hits.filter((l) => l.toLowerCase().startsWith(s)), ...hits.filter((l) => !l.toLowerCase().startsWith(s))];
}

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

// ---- The answer window, shared by every team-answered game ----------------

/** Server leeway after 0:00 for answers already on their way. */
export const GRACE_MS = 2000;

/** One showing of an answerable card: when its clock started (for the early bonus) and when it ran out, if it has. */
export interface CardWindow {
  key: string;
  at: number;
  endedAt?: number;
}

/** The shared clock. `card` is the card this run is timing; a clock started for another screen doesn't count. */
export interface Clock {
  durationMs: number;
  remainingMs: number;
  startedAt?: number;
  card?: string;
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
export function showCard(o: { card?: CardWindow; played: CardWindow[]; up?: string; now: number }) {
  if (o.card?.key === o.up) return { card: o.card, played: o.played };
  const leaving = o.card;
  const played = leaving ? [...o.played.filter((w) => w.key !== leaving.key), leaving] : o.played;
  return { card: o.up ? (played.find((w) => w.key === o.up) ?? { key: o.up, at: o.now }) : undefined, played };
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
