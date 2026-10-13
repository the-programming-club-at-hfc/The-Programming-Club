// Running the night from one button on /host: which lineup round is up, what the button does next, and which card or
// race it puts up. Pure functions of the session (screen, round, cards shown), so a reload picks up where it left off.
import { BUGS, LANGS, OUTPUTS, RELAYS, WIKI_RACES } from "./content";
import { FIXES } from "./fixes";
import { PUZZLES, puzzleForLabel } from "./puzzles";
import { cardKey, isAnswerGame, wikiKey, wikiPair } from "./grading";
import type { GameId } from "./grading";
import { gamesIn } from "./schedule";
import type { LineupItem } from "./schedule";

export type Filter = "all" | "easy" | "medium" | "hard" | "spooky";

const SIZE: Record<GameId, number> = {
  bug: BUGS.length,
  output: OUTPUTS.length,
  relay: RELAYS.length,
  lang: LANGS.length,
  fix: FIXES.length,
  puzzle: PUZZLES.length,
};

/** The card numbers in a deck that match a difficulty filter. */
export function deckFor(game: GameId, filter: Filter) {
  const all = Array.from({ length: SIZE[game] }, (_, i) => i);
  if (filter === "all") return all;
  if (game === "bug") return all.filter((i) => (filter === "spooky" ? BUGS[i].spooky : BUGS[i].level === filter));
  if (game === "fix") return all.filter((i) => (filter === "spooky" ? FIXES[i].spooky : FIXES[i].level === filter));
  if (game === "relay") return all.filter((i) => RELAYS[i].level === filter);
  return all;
}

/** The difficulty words in a lineup entry, most specific first: "Bug Hunt: easy & spooky" is spooky, then easy. */
export const filtersFor = (label: string): Filter[] =>
  (["spooky", "easy", "medium", "hard"] as const).filter((f) => label.toLowerCase().includes(f));

/** How a round plays: a card deck, a Wiki Race, a puzzle, Tech Pictionary, or anything else (officers run it, then score). */
export type Kind = "deck" | "wiki" | "puzzle" | "pictionary" | "other";

export interface Round {
  index: number;
  label: string;
  double: boolean;
  kind: Kind;
  /** The deck, for a card round. */
  game?: GameId;
  filters: Filter[];
  /** The puzzle, for a puzzle round. */
  puzzle?: number;
}

const DECK_GAMES: GameId[] = ["bug", "output", "relay", "lang", "fix"];

export function roundOf(item: LineupItem, index: number): Round {
  const id = gamesIn(item.label)[0];
  const game = DECK_GAMES.find((g) => g === id);
  // A puzzle round plays the puzzle its label names (Code Relay Night's preview, or the Final's Puzzle 1 or 2).
  const puzzle = id === "puzzle" ? puzzleForLabel(item.label) : undefined;
  const kind: Kind = game
    ? "deck"
    : puzzle !== undefined
      ? "puzzle"
      : id === "wiki"
        ? "wiki"
        : id === "pictionary"
          ? "pictionary"
          : "other";
  return { index, label: item.label, double: item.double, kind, game, filters: game ? filtersFor(item.label) : [], puzzle };
}

/** What the TV says when a round starts. */
export const roundTitle = (r: Round) => `Round ${r.index + 1}${r.double ? ", double points" : ""}: ${r.label}`;

/** Cards with an answer to reveal (and score). Code Relay has none: the referee runs the tests. */
export const revealable = (r: Round) =>
  r.kind === "wiki" || r.kind === "puzzle" || (r.kind === "deck" && (isAnswerGame(r.game) || r.game === "fix"));

/** A puzzle's name for the button, e.g. "Road to the Cup". */
export const puzzleTitle = (i: number) =>
  PUZZLES[i].name.replace(/\b\w+/g, (w, at: number) =>
    at > 0 && ["a", "of", "the", "to"].includes(w) ? w : w[0].toUpperCase() + w.slice(1),
  );

/**
 * The next card for a round: the first one matching its difficulty that no night has used yet (practice nights
 * don't use cards up), then one that hasn't been up tonight, then any card from the deck not up tonight.
 */
export function nextCard(r: Round, used: string[], tonight: string[]): number | null {
  const game = r.game;
  if (r.kind !== "deck" || !game) return null;
  const fresh = (i: number) => !tonight.includes(cardKey(game, i)) && !used.includes(cardKey(game, i));
  const notTonight = (i: number) => !tonight.includes(cardKey(game, i));
  const picked = r.filters.length ? r.filters.map((f) => deckFor(game, f)) : [deckFor(game, "all")];
  for (const lists of [picked, [deckFor(game, "all")]])
    for (const ok of [fresh, notTonight])
      for (const list of lists) {
        const i = list.find(ok);
        if (i !== undefined) return i;
      }
  return null;
}

/** Cards in a round's difficulty that no night has used yet. */
export function freshLeft(r: Round, used: string[], tonight: string[]) {
  const game = r.game;
  if (r.kind !== "deck" || !game) return 0;
  const lists = r.filters.length ? r.filters.map((f) => deckFor(game, f)) : [deckFor(game, "all")];
  return new Set(lists.flat().filter((i) => !used.includes(cardKey(game, i)) && !tonight.includes(cardKey(game, i)))).size;
}

/**
 * The next Wiki Race for a round. "CS edition" races to computer science targets, "Fewest Clicks" counts clicks, and
 * "Reverse" swaps tonight's last race (then races backwards). Otherwise, the first race nobody has run, then one not
 * run tonight.
 */
export function nextRace(r: Round, used: string[], tonight: string[]) {
  const clicks = /fewest clicks/i.test(r.label);
  const reverse = /reverse/i.test(r.label);
  const key = (w: { from: string; to: string }) => wikiKey(w.from, w.to);
  const last = tonight.filter((k) => k.startsWith("wiki:")).at(-1);
  if (reverse && last) {
    const { from, to } = wikiPair(last);
    if (!tonight.includes(wikiKey(to, from))) return { from: to, to: from, clicks };
  }
  const pool = (/\bCS\b|computer science/i.test(r.label) ? WIKI_RACES.filter((w) => w.cs) : WIKI_RACES).map((w) =>
    reverse ? { from: w.to, to: w.from } : { from: w.from, to: w.to },
  );
  const w = pool.find((x) => !used.includes(key(x)) && !tonight.includes(key(x))) ?? pool.find((x) => !tonight.includes(key(x))) ?? pool[0];
  return { ...w, clicks };
}

/** The part of the TV screen the flow reads. */
export interface ScreenState {
  mode: string;
  game?: string;
  index?: number;
  revealed?: boolean;
  hint?: boolean;
  wikiFrom?: string;
}

/**
 * What the big button does next:
 * start a round → show a card (race, drawing) → reveal → show scores → another one, or the next round.
 * A puzzle round plays its one puzzle: show it → show the hint once it unlocks → reveal → show scores → next round.
 * Rounds that aren't games (like "Meet the officers") just show scores, then move on.
 */
export type Step = "start" | "show" | "hint" | "reveal" | "scores" | "choose" | "next";

export function stepFor(o: {
  round: Round | null;
  screen: ScreenState;
  teams: number;
  /** A puzzle's hint has unlocked (half its time is gone) and the puzzle isn't over yet. */
  hintReady?: boolean;
}): Step {
  const r = o.round;
  const s = o.screen;
  if (!r) return "start";
  if (r.kind === "puzzle") {
    // Like a card, the puzzle comes back for its reveal after the join screen, big timer, or scores went up.
    if (s.game !== "puzzle" || s.index !== r.puzzle) return "show";
    if (!s.revealed) return o.hintReady && !s.hint ? "hint" : "reveal";
    return s.mode === "scoreboard" ? "next" : "scores";
  }
  if (r.kind === "deck" || r.kind === "wiki") {
    // The TV's screen buttons keep the card (or race) when the join screen, big timer, or scores go up, so a card
    // that's still unrevealed always comes back for its reveal and is never skipped unscored.
    const mine = r.kind === "deck" ? s.game === r.game : !!s.wikiFrom;
    if (!mine) return "show";
    if (!s.revealed && revealable(r)) return "reveal";
    return s.mode === "scoreboard" ? "choose" : "scores";
  }
  if (r.kind === "pictionary") return s.mode === "timer" ? "scores" : s.mode === "scoreboard" ? "choose" : "show";
  return s.mode === "scoreboard" || o.teams === 0 ? "next" : "scores";
}
