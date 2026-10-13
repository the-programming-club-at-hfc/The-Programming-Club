import { describe, expect, test } from "bun:test";
import { GROUP_PLAN, MATCH_MINIMUMS, PUZZLES, matchFacts, puzzleForLabel, puzzleSeed, qualifierFacts, stickerFacts } from "./puzzles";
import { WEEKS } from "./content";

// Fairness: every team's input must hit the same edge cases, so check them over a couple hundred seeds.
const SEEDS = Array.from({ length: 200 }, (_, i) => puzzleSeed("session", `team${i}`, i % 3));
const atLeast = (n: number, min: number) => expect(n >= min).toBe(true);
const [stickers, matches, qualifiers] = PUZZLES;

describe("every puzzle", () => {
  test("its example gives the example answers", () => {
    for (const p of PUZZLES) expect(p.solve(p.example)).toEqual(p.exampleAnswers);
  });

  test("the same seed always gives the same input, and different seeds different inputs", () => {
    for (const p of PUZZLES) {
      expect(p.generate(12345)).toBe(p.generate(12345));
      expect(new Set(SEEDS.slice(0, 20).map((s) => p.generate(s))).size).toBe(20);
    }
  });

  test("inputs are 50 to 300 lines with no blank lines, and the answers are never empty", () => {
    for (const p of PUZZLES)
      for (const seed of SEEDS.slice(0, 50)) {
        const input = p.generate(seed);
        const n = input.split("\n").length;
        atLeast(n, 50);
        atLeast(300, n);
        expect(input.split("\n").every((l) => l.trim() === l && l !== "")).toBe(true);
        const a = p.solve(input);
        expect(a.part1 !== "" && a.part2 !== "" && a.part1 !== a.part2).toBe(true);
      }
  });

  test("a trailing newline or Windows line endings don't change the answers", () => {
    for (const p of PUZZLES) {
      const input = p.generate(7);
      expect(p.solve(input.replace(/\n/g, "\r\n") + "\n")).toEqual(p.solve(input));
    }
  });

  test("seeds differ by night, team, and puzzle", () => {
    const s = puzzleSeed("a", "b", 0);
    expect(puzzleSeed("a", "b", 0)).toBe(s);
    expect(new Set([s, puzzleSeed("x", "b", 0), puzzleSeed("a", "x", 0), puzzleSeed("a", "b", 1)]).size).toBe(4);
  });

  test("each lineup round opens its own puzzle", () => {
    const labels = WEEKS.flatMap((w) => w.games).filter((l) => puzzleForLabel(l) !== undefined);
    expect(labels.map((l) => PUZZLES[puzzleForLabel(l)!].slot)).toEqual(["preview", "final1", "final2"]);
  });
});

describe("sticker swap", () => {
  test("every input has text traps, doubled packs, and repeat stickers", () => {
    for (const seed of SEEDS) {
      const f = stickerFacts(stickers.generate(seed));
      expect(f.packs).toBe(120);
      atLeast(f.textTraps, 30);
      atLeast(f.doubledPacks, 3);
      atLeast(f.triples, 3);
      atLeast(f.singleDigits, 5);
    }
  });

  test("comparing stickers as text always gets part 1 wrong", () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const input = stickers.generate(seed);
      const asText = input.split("\n").reduce((s, l) => s + Number(l.split(" ").reduce((a, b) => (b > a ? b : a))), 0);
      expect(String(asText) === stickers.solve(input).part1).toBe(false);
    }
  });
});

describe("comeback kings", () => {
  test("every input has every kind of match, numbered 1 to 200", () => {
    for (const seed of SEEDS) {
      const input = matches.generate(seed);
      const f = matchFacts(input);
      for (const [k, min] of Object.entries(MATCH_MINIMUMS)) atLeast(f[k as keyof typeof f], min);
      expect(input.split("\n").map((l) => Number(/^Match (\d+): [HA]+$|^Match (\d+): -$/.exec(l)?.slice(1).find(Boolean)))).toEqual(
        Array.from({ length: 200 }, (_, i) => i + 1),
      );
    }
  });
});

describe("road to the cup", () => {
  test("every input has 12 groups of 5, each team playing 8 matches, with the same mix of tiebreakers", () => {
    for (const seed of SEEDS) {
      const input = qualifiers.generate(seed);
      const f = qualifierFacts(input);
      expect(f.groups).toBe(12);
      expect(f.teams).toEqual(Array<number>(12).fill(5));
      expect([...f.kinds].sort()).toEqual([...GROUP_PLAN].sort());
      atLeast(f.naiveWrong, 2);
      atLeast(f.winsWrong, 1);
      atLeast(f.homeWrong, 1);
      const games = new Map<string, number>();
      for (const l of input.split("\n")) for (const t of [l.slice(3, 6), l.slice(-3)]) games.set(t, (games.get(t) ?? 0) + 1);
      expect(games.size).toBe(60);
      expect([...games.values()].every((n) => n === 8)).toBe(true);
    }
  });

  test("answers are 12 team codes", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const a = qualifiers.solve(qualifiers.generate(seed));
      expect(/^[A-Z]{36}$/.test(a.part1) && /^[A-Z]{36}$/.test(a.part2)).toBe(true);
    }
  });
});
