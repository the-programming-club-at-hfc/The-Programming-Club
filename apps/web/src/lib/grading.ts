// Phone answers and automatic scoring for Bug Hunt, Output?, and Guess the Language.
// Pure functions shared by Convex (convex/answers.ts) and the officer test page, so both score the same way.
// Keep imports relative: Convex bundles this file too.
import { BUGS, LANGS, OUTPUTS } from "./content";

export type GameId = "bug" | "output" | "relay" | "lang";
export type AnswerGame = "bug" | "output" | "lang";

export const isAnswerGame = (g: string | undefined): g is AnswerGame => g === "bug" || g === "output" || g === "lang";

export const cardKey = (game: GameId, index: number) => `${game}:${index}`;

/** Seconds on the clock for a card. */
export const cardSeconds = (game: GameId, index: number) =>
  game === "bug" ? (BUGS[index].level === "hard" ? 120 : 90) : game === "output" ? 30 : game === "relay" ? 720 : 45;

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

/** Server leeway after 0:00 for answers already on their way. */
export const GRACE_MS = 2000;

/**
 * Whether teams can still pick or lock. Answers close at the reveal, or when the clock that started
 * with this card runs out (`remaining` may go below 0 on the server). A paused clock keeps them open.
 */
export function answersOpen(o: {
  revealed: boolean;
  scored: boolean;
  cardAt: number | undefined;
  timer: { startedAt?: number };
  remaining: number;
  grace: number;
}) {
  if (o.revealed || o.scored) return false;
  const started = o.timer.startedAt;
  if (started === undefined || o.cardAt === undefined || started < o.cardAt) return true;
  return o.remaining > -o.grace;
}
