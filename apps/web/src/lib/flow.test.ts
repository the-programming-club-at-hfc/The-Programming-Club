import { describe, expect, test } from "bun:test";
import { BUGS, WIKI_RACES } from "./content";
import { DEFAULT_PLAN } from "./schedule";
import { deckFor, freshLeft, nextCard, nextRace, puzzleTitle, revealable, roundOf, roundTitle, stepFor } from "./flow";
import { cardSeconds, wikiKey } from "./grading";
import { PUZZLES } from "./puzzles";

const round = (label: string, double = false, index = 0) => roundOf({ label, double }, index);

describe("lineup rounds", () => {
  test("every round in the default plan gets a kind, and decks get their difficulty", () => {
    const kinds = DEFAULT_PLAN.flatMap((w) => w.lineup.map((g, i) => roundOf(g, i)));
    expect(kinds.every((r) => ["deck", "wiki", "puzzle", "pictionary", "other"].includes(r.kind))).toBe(true);
    const spooky = round("Bug Hunt: easy & spooky");
    expect([spooky.kind, spooky.game, spooky.filters]).toEqual(["deck", "bug", ["spooky", "easy"]]);
    expect(round("Fix it for real, spooky").game).toBe("fix");
    expect(round("Wiki Race, CS edition").kind).toBe("wiki");
    expect(round("Tech Pictionary (warm-up)").kind).toBe("pictionary");
    expect(round("Meet the officers").kind).toBe("other");
  });

  test("the TV title says the round number and double points", () => {
    expect(roundTitle(round("Bug Hunt: hard", true, 3))).toBe("Round 4, double points: Bug Hunt: hard");
    expect(roundTitle(round("Output? (warm-up)"))).toBe("Round 1: Output? (warm-up)");
  });
});

describe("puzzle rounds", () => {
  test("each puzzle round plays the puzzle its label names", () => {
    const preview = round("Final round, double points: Advent-style puzzle (Final preview)", true);
    expect([preview.kind, preview.puzzle, preview.game]).toEqual(["puzzle", 0, undefined]);
    expect(round("Puzzle 1: easy, played as a relay").puzzle).toBe(1);
    expect(round("Final round, double points: Puzzle 2, medium").puzzle).toBe(2);
    expect(revealable(preview)).toBe(true);
  });

  test("Code Relay's last round and both rounds of the Final are puzzles, with their own clocks", () => {
    const plan = (title: string) => DEFAULT_PLAN.find((w) => w.title === title)!.lineup.map((g, i) => roundOf(g, i));
    const relay = plan("Code Relay");
    expect(relay.filter((r) => r.kind === "puzzle").map((r) => [r.index, r.puzzle])).toEqual([[relay.length - 1, 0]]);
    const final = plan("The Final");
    expect(final.map((r) => [r.kind, r.puzzle, r.double])).toEqual([
      ["puzzle", 1, false],
      ["puzzle", 2, true],
    ]);
    // 10:00 and 13:00 relays with chimes, then 26:00 for Puzzle 2.
    expect([0, 1, 2].map((i) => [cardSeconds("puzzle", i), !!PUZZLES[i].relay])).toEqual([
      [600, true],
      [780, true],
      [1560, false],
    ]);
  });

  test("a puzzle label that names no puzzle is run by hand", () => {
    expect(round("Puzzle hunt").kind).toBe("other");
  });

  test("the button names the puzzle", () => {
    expect([0, 1, 2].map(puzzleTitle)).toEqual(["Sticker Swap", "Comeback Kings", "Road to the Cup"]);
  });
});

describe("the next card", () => {
  const r = round("Bug Hunt: easy & spooky");
  const spooky = deckFor("bug", "spooky");
  const easy = deckFor("bug", "easy");

  test("picks the most specific difficulty first, skipping cards used on any night", () => {
    expect(nextCard(r, [], [])).toBe(spooky[0]);
    expect(nextCard(r, [`bug:${spooky[0]}`], [])).toBe(spooky[1]);
  });

  test("falls back to the next difficulty once the first runs out", () => {
    const used = spooky.map((i) => `bug:${i}`);
    expect(easy).toContain(nextCard(r, used, []));
    expect(BUGS[nextCard(r, used, [])!].spooky).toBe(undefined);
  });

  test("reuses a card from another night before repeating one from tonight", () => {
    const all = deckFor("bug", "all").map((i) => `bug:${i}`);
    expect(nextCard(r, all, [])).toBe(spooky[0]);
    expect(nextCard(r, all, all)).toBeNull();
  });

  test("counts the fresh cards left", () => {
    expect(freshLeft(r, [], [])).toBe(new Set([...spooky, ...easy]).size);
    expect(freshLeft(round("Wiki Race"), [], [])).toBe(0);
  });
});

describe("the next Wiki Race", () => {
  test("the first race nobody has run, with the clock style from the round", () => {
    expect(nextRace(round("Wiki Race: Classic"), [], [])).toEqual({ ...WIKI_RACES[0], clicks: false });
    const used = [wikiKey(WIKI_RACES[0].from, WIKI_RACES[0].to)];
    expect(nextRace(round("Wiki Race: Fewest Clicks"), used, []).from).toBe(WIKI_RACES[1].from);
    expect(nextRace(round("Wiki Race: Fewest Clicks"), [], []).clicks).toBe(true);
  });

  test("CS edition only races to computer science targets", () => {
    const r = nextRace(round("Wiki Race, CS edition"), [], []);
    expect(WIKI_RACES.find((w) => w.from === r.from && w.to === r.to)?.cs).toBe(true);
  });

  test("Reverse swaps tonight's last race, then races a new pair backwards", () => {
    const r = round("Reverse Wiki Race");
    expect(nextRace(r, [], ["bug:1", "wiki:Pizza>Moon"])).toEqual({ from: "Moon", to: "Pizza", clicks: false });
    const again = nextRace(r, [], ["wiki:Pizza>Moon", "wiki:Moon>Pizza"]);
    expect(again).toEqual({ from: WIKI_RACES[1].to, to: WIKI_RACES[1].from, clicks: false });
  });
});

describe("the big button", () => {
  const bug = round("Bug Hunt: medium");
  const step = (r: ReturnType<typeof round> | null, screen: Parameters<typeof stepFor>[0]["screen"], teams = 3) =>
    stepFor({ round: r, screen, teams });

  test("a card round: start, show, reveal, scores, then another or the next round", () => {
    expect(step(null, { mode: "lobby" })).toBe("start");
    expect(step(bug, { mode: "message" })).toBe("show");
    expect(step(bug, { mode: "card", game: "bug" })).toBe("reveal");
    expect(step(bug, { mode: "card", game: "bug", revealed: true })).toBe("scores");
    expect(step(bug, { mode: "scoreboard", game: "bug", revealed: true })).toBe("choose");
  });

  test("the join screen, big timer, or scores mid-card still lead to the reveal, so nothing goes unscored", () => {
    expect(step(bug, { mode: "scoreboard", game: "bug" })).toBe("reveal");
    expect(step(bug, { mode: "lobby", game: "bug" })).toBe("reveal");
    expect(step(bug, { mode: "timer", game: "bug", revealed: true })).toBe("scores");
    expect(step(round("Wiki Race"), { mode: "lobby", wikiFrom: "Pizza" })).toBe("reveal");
  });

  test("another game's card leads to this round's", () => {
    expect(step(bug, { mode: "card", game: "output", revealed: true })).toBe("show");
  });

  test("Code Relay has no answer to reveal", () => {
    const relay = round("Code Relay: round 1");
    expect(step(relay, { mode: "card", game: "relay" })).toBe("scores");
    expect(step(relay, { mode: "timer", game: "relay" })).toBe("scores");
    expect(step(relay, { mode: "scoreboard", game: "relay" })).toBe("choose");
  });

  test("a Wiki Race: show, end and score, scores, then another", () => {
    const wiki = round("Wiki Race: Classic");
    expect(step(wiki, { mode: "message" })).toBe("show");
    expect(step(wiki, { mode: "wiki", wikiFrom: "Pizza" })).toBe("reveal");
    expect(step(wiki, { mode: "wiki", wikiFrom: "Pizza", revealed: true })).toBe("scores");
    expect(step(wiki, { mode: "scoreboard", wikiFrom: "Pizza", revealed: true })).toBe("choose");
  });

  test("Tech Pictionary: a drawing on the big timer, then scores", () => {
    const p = round("Tech Pictionary (warm-up)");
    expect(step(p, { mode: "message" })).toBe("show");
    expect(step(p, { mode: "timer" })).toBe("scores");
    expect(step(p, { mode: "scoreboard" })).toBe("choose");
  });

  test("a puzzle: show it, the hint once it unlocks, reveal and score, scores, then the next round", () => {
    const p = round("Final round, double points: Puzzle 2, medium", true, 1);
    const up = { mode: "card", game: "puzzle", index: 2 };
    expect(step(p, { mode: "message" })).toBe("show");
    expect(step(p, up)).toBe("reveal");
    expect(stepFor({ round: p, screen: up, teams: 3, hintReady: true })).toBe("hint");
    expect(stepFor({ round: p, screen: { ...up, hint: true }, teams: 3, hintReady: true })).toBe("reveal");
    expect(step(p, { ...up, revealed: true })).toBe("scores");
    expect(step(p, { ...up, mode: "scoreboard", revealed: true })).toBe("next");
  });

  test("a puzzle comes back for its reveal, and last round's puzzle leads to this one", () => {
    const p = round("Final round, double points: Puzzle 2, medium", true, 1);
    expect(step(p, { mode: "scoreboard", game: "puzzle", index: 2 })).toBe("reveal");
    expect(step(p, { mode: "card", game: "puzzle", index: 1 })).toBe("show");
    expect(step(p, { mode: "scoreboard", game: "puzzle", index: 1, revealed: true })).toBe("show");
  });

  test("anything else: scores, then the next round (straight on with no teams)", () => {
    const other = round("Meet the officers");
    expect(step(other, { mode: "message" })).toBe("scores");
    expect(step(other, { mode: "scoreboard" })).toBe("next");
    expect(step(other, { mode: "message" }, 0)).toBe("next");
  });
});
