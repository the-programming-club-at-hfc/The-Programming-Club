import { describe, expect, test } from "bun:test";
import { BUGS, LANGS, OUTPUTS } from "./content";
import { LANGUAGES, answersOpen, awardsFor, choices, clockLeft, grade, isFreshStart, searchLanguages, settle, showCard } from "./grading";

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
  const K = "bug:0";
  const base = { revealed: false, scored: false, endedAt: undefined, own: true, running: true, now: sec(100), grace: 2000 };

  test("open until the card's clock runs out, with a little grace", () => {
    expect(answersOpen({ ...base, remaining: 5000 })).toBe(true);
    expect(answersOpen({ ...base, remaining: -1000 })).toBe(true);
    expect(answersOpen({ ...base, remaining: -3000 })).toBe(false);
  });
  test("closed once revealed or scored", () => {
    expect(answersOpen({ ...base, revealed: true, remaining: 9000 })).toBe(false);
    expect(answersOpen({ ...base, scored: true, remaining: 9000 })).toBe(false);
  });
  test("a clock paused before 0:00, or one timing another screen, keeps answers open", () => {
    expect(answersOpen({ ...base, running: false, remaining: 30_000 })).toBe(true);
    expect(answersOpen({ ...base, own: false, remaining: -30_000 })).toBe(true);
  });
  test("a clock paused at 0:00 is closed", () => {
    expect(answersOpen({ ...base, running: false, remaining: 0 })).toBe(false);
  });
  test("once the card's clock ran out, pausing, resetting, or a new preset can't reopen it", () => {
    const endedAt = sec(90);
    // Reset or a preset without autostart: a full clock that isn't running.
    expect(answersOpen({ ...base, endedAt, running: false, remaining: 90_000 })).toBe(false);
    // A clock started for something else.
    expect(answersOpen({ ...base, endedAt, own: false, remaining: 720_000 })).toBe(false);
    // Answers already on their way still land.
    expect(answersOpen({ ...base, endedAt, now: sec(91), running: false, remaining: 0 })).toBe(true);
  });

  test("settle records when the card's own clock ran out, and only then", () => {
    const w = { key: K, at: T0 };
    const ran = { durationMs: 90_000, remainingMs: 90_000, startedAt: T0, card: K };
    expect(settle([w], ran, sec(80))).toEqual([w]);
    expect(settle([w], ran, sec(95))).toEqual([{ key: K, at: T0, endedAt: sec(90) }]);
    expect(settle([w], { ...ran, card: "relay:0" }, sec(95))).toEqual([w]);
    // Paused at 0:00.
    expect(settle([w], { durationMs: 90_000, remainingMs: 0, card: K }, sec(200))).toEqual([{ key: K, at: T0, endedAt: sec(200) }]);
    // Already recorded: kept.
    expect(settle([{ ...w, endedAt: sec(90) }], ran, sec(300))[0].endedAt).toBe(sec(90));
  });

  test("clockLeft goes below 0 on a running clock", () => {
    expect(clockLeft({ durationMs: 30_000, remainingMs: 30_000, startedAt: T0 }, sec(40))).toBe(-10_000);
    expect(clockLeft({ durationMs: 30_000, remainingMs: 12_000 }, sec(40))).toBe(12_000);
  });
});

describe("card windows across screens", () => {
  const A = "bug:0";
  const B = "output:3";

  test("a new card gets a fresh window", () => {
    expect(showCard({ played: [], up: A, now: T0 })).toEqual({ card: { key: A, at: T0 }, played: [] });
  });
  test("the same card staying up (like a reveal) keeps its window", () => {
    const card = { key: A, at: T0 };
    expect(showCard({ card, played: [], up: A, now: sec(50) }).card).toBe(card);
  });
  test("anything else going up clears the current card", () => {
    const r = showCard({ card: { key: A, at: T0 }, played: [], up: undefined, now: sec(50) });
    expect(r.card).toBe(undefined);
    expect(r.played).toEqual([{ key: A, at: T0 }]);
  });
  test("going A, B, then back to A picks A's window up again, so it isn't reset or reopened", () => {
    const a = { key: A, at: T0, endedAt: sec(90) };
    const toB = showCard({ card: a, played: [], up: B, now: sec(100) });
    expect(toB.card).toEqual({ key: B, at: sec(100) });
    const back = showCard({ ...toB, up: A, now: sec(200) });
    expect(back.card).toEqual(a);
    expect(back.played.map((w) => w.key)).toEqual([A, B]);
  });

  test("only a preset with autostart or Start from full is a fresh start, never +30s", () => {
    const full = { durationMs: 90_000, remainingMs: 90_000, startedAt: T0 };
    expect(isFreshStart("set", full, T0)).toBe(true);
    expect(isFreshStart("toggle", full, T0)).toBe(true);
    expect(isFreshStart("add", full, T0)).toBe(false);
    expect(isFreshStart("toggle", { ...full, remainingMs: 40_000 }, T0)).toBe(false);
    expect(isFreshStart("set", { ...full, startedAt: undefined }, T0)).toBe(false);
  });
});
