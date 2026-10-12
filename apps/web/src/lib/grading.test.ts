import { describe, expect, test } from "bun:test";
import { BUGS, LANGS, OUTPUTS } from "./content";
import { LANGUAGES, answersOpen, awardsFor, choices, grade, searchLanguages } from "./grading";

const T0 = 1_000_000;
const sec = (s: number) => T0 + s * 1000;
const wrongOf = <T>(list: T[], right: T) => list.find((x) => x !== right)!;

describe("decks", () => {
  test("every card has four different choices, in the same order every time", () => {
    for (const [game, size] of [
      ["bug", BUGS.length],
      ["output", OUTPUTS.length],
    ] as const) {
      for (let i = 0; i < size; i++) {
        const c = choices(game, i);
        expect(new Set(c).size).toBe(4);
        expect(choices(game, i)).toEqual(c);
      }
    }
  });

  test("the right answer isn't always in the same spot", () => {
    expect(new Set(OUTPUTS.map((o, i) => choices("output", i).indexOf(o.answer))).size > 1).toBe(true);
  });

  test("the language list spells every answer exactly like the deck", () => {
    for (const l of LANGS) for (const name of [l.lang, ...(l.also ?? [])]) expect(LANGUAGES).toContain(name);
  });

  test("search filters and finds nicknames", () => {
    expect(searchLanguages("")).toHaveLength(LANGUAGES.length);
    expect(searchLanguages("java")).toEqual(["Java", "JavaScript"]);
    expect(searchLanguages("js")).toContain("JavaScript");
    expect(searchLanguages("shell")).toContain("Bash");
  });
});

describe("Bug Hunt", () => {
  const i = BUGS.findIndex((b) => b.level === "easy" && b.lines.length === 1); // 90 s, so half time is 45 s
  const b = BUGS[i];
  const badLine = b.lines[0] === 1 ? 2 : 1;
  const badFix = b.wrong[0];

  test("right line and fix, locked early: 3 points", () => {
    expect(grade("bug", i, { line: b.lines[0], choice: b.fix, lockedAt: sec(40) }, T0)).toEqual({
      points: 3,
      correct: true,
      early: true,
      line: true,
      fix: true,
    });
  });

  test("right line and fix, locked late: 2 points", () => {
    expect(grade("bug", i, { line: b.lines[0], choice: b.fix, lockedAt: sec(50) }, T0).points).toBe(2);
  });

  test("right line, wrong fix, locked early: line and early bonus", () => {
    const g = grade("bug", i, { line: b.lines[0], choice: badFix, lockedAt: sec(10) }, T0);
    expect(g).toEqual({ points: 2, correct: false, early: true, line: true, fix: false });
  });

  test("wrong line never earns the early bonus", () => {
    expect(grade("bug", i, { line: badLine, choice: b.fix, lockedAt: sec(5) }, T0)).toEqual({
      points: 1,
      correct: false,
      early: false,
      line: false,
      fix: true,
    });
    expect(grade("bug", i, { line: badLine, choice: badFix, lockedAt: sec(5) }, T0).points).toBe(0);
  });

  test("no lock: the pick still counts, without the bonus", () => {
    expect(grade("bug", i, { line: b.lines[0], choice: b.fix }, T0)).toEqual({
      points: 2,
      correct: true,
      early: false,
      line: true,
      fix: true,
    });
    expect(grade("bug", i, { line: b.lines[0] }, T0).points).toBe(1);
    expect(grade("bug", i, {}, T0).points).toBe(0);
  });

  test("any of a card's accepted lines counts", () => {
    const j = BUGS.findIndex((x) => x.lines.length > 1);
    for (const line of BUGS[j].lines) expect(grade("bug", j, { line }, T0).line).toBe(true);
  });

  test("hard cards give 2 minutes, so half time is 60 seconds", () => {
    const h = BUGS.findIndex((x) => x.level === "hard");
    const pick = { line: BUGS[h].lines[0], choice: BUGS[h].fix };
    expect(grade("bug", h, { ...pick, lockedAt: sec(55) }, T0).early).toBe(true);
    expect(grade("bug", h, { ...pick, lockedAt: sec(65) }, T0).early).toBe(false);
  });
});

describe("Output?", () => {
  const o = OUTPUTS[0];
  test("+1 for the right answer, no speed bonus", () => {
    expect(grade("output", 0, { choice: o.answer, lockedAt: sec(1) }, T0)).toEqual({ points: 1, correct: true, early: false });
    expect(grade("output", 0, { choice: o.answer }, T0).points).toBe(1);
  });
  test("0 for a wrong or missing answer", () => {
    expect(grade("output", 0, { choice: o.wrong[0], lockedAt: sec(1) }, T0)).toEqual({ points: 0, correct: false, early: false });
    expect(grade("output", 0, {}, T0).points).toBe(0);
  });
});

describe("Guess the Language", () => {
  const i = LANGS.findIndex((l) => l.lang === "JavaScript");
  test("right and locked in the first 15 seconds: 2 points", () => {
    expect(grade("lang", i, { choice: "JavaScript", lockedAt: sec(15) }, T0)).toEqual({ points: 2, correct: true, early: true });
  });
  test("right but later, or never locked: 1 point", () => {
    expect(grade("lang", i, { choice: "JavaScript", lockedAt: sec(16) }, T0).points).toBe(1);
    expect(grade("lang", i, { choice: "JavaScript" }, T0).points).toBe(1);
  });
  test("wrong and early: nothing", () => {
    expect(grade("lang", i, { choice: wrongOf(LANGUAGES, "JavaScript"), lockedAt: sec(2) }, T0)).toEqual({
      points: 0,
      correct: false,
      early: false,
    });
  });
  test("accepted alternates count", () => {
    expect(grade("lang", i, { choice: "TypeScript" }, T0).correct).toBe(true);
    expect(
      grade(
        "lang",
        LANGS.findIndex((l) => l.lang === "C"),
        { choice: "C++" },
        T0,
      ).correct,
    ).toBe(true);
    expect(
      grade(
        "lang",
        LANGS.findIndex((l) => l.lang === "C++"),
        { choice: "C" },
        T0,
      ).correct,
    ).toBe(false);
  });
});

describe("scoring a reveal", () => {
  const answers = [
    { id: "a", pick: { choice: OUTPUTS[0].answer, lockedAt: sec(3) } },
    { id: "b", pick: { choice: OUTPUTS[0].wrong[1] } },
  ];
  const base = { game: "output" as const, index: 0, start: T0, answers };

  test("awards each team and records the card as scored", () => {
    const r = awardsFor({ ...base, double: false, scored: ["bug:2"] })!;
    expect(r.scored).toEqual(["bug:2", "output:0"]);
    expect(r.awards.map((a) => [a.id, a.points])).toEqual([
      ["a", 1],
      ["b", 0],
    ]);
  });

  test("double points doubles every award", () => {
    const bug = BUGS.findIndex((b) => b.level === "easy");
    const r = awardsFor({
      game: "bug",
      index: bug,
      start: T0,
      double: true,
      scored: [],
      answers: [{ id: "a", pick: { line: BUGS[bug].lines[0], choice: BUGS[bug].fix, lockedAt: sec(1) } }],
    })!;
    expect(r.awards[0].points).toBe(6);
    expect(r.awards[0].grade.points).toBe(3);
  });

  test("revealing, hiding, and revealing again scores once", () => {
    const first = awardsFor({ ...base, double: false, scored: [] })!;
    expect(awardsFor({ ...base, double: false, scored: first.scored })).toBeNull();
  });
});

describe("answer window", () => {
  const live = { revealed: false, scored: false, cardAt: T0, grace: 2000 };
  test("open until the card's clock runs out, with a little grace", () => {
    expect(answersOpen({ ...live, timer: { startedAt: sec(1) }, remaining: 5000 })).toBe(true);
    expect(answersOpen({ ...live, timer: { startedAt: sec(1) }, remaining: -1000 })).toBe(true);
    expect(answersOpen({ ...live, timer: { startedAt: sec(1) }, remaining: -3000 })).toBe(false);
  });
  test("closed once revealed or scored", () => {
    expect(answersOpen({ ...live, revealed: true, timer: {}, remaining: 9000 })).toBe(false);
    expect(answersOpen({ ...live, scored: true, timer: {}, remaining: 9000 })).toBe(false);
  });
  test("a paused clock, or one left over from the last card, keeps answers open", () => {
    expect(answersOpen({ ...live, timer: {}, remaining: 0 })).toBe(true);
    expect(answersOpen({ ...live, timer: { startedAt: T0 - 60_000 }, remaining: -30_000 })).toBe(true);
  });
});
