import { describe, expect, test } from "bun:test";
import { BUGS, LANGS, OUTPUTS, WIKI_RACES } from "./content";
import { FIXES } from "./fixes";
import { PUZZLES, puzzleSeed } from "./puzzles";
import {
  LANGUAGES,
  answerKey,
  answersOpen,
  awardsFor,
  cardSeconds,
  choices,
  clockLeft,
  fixAwardsFor,
  grade,
  isFreshStart,
  puzzleAwardsFor,
  sameOutput,
  searchLanguages,
  settle,
  showCard,
  submitAnswer,
  wikiAwardsFor,
  wikiKey,
  wikiPair,
  wikiPlaces,
} from "./grading";

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

describe("Fix it for real", () => {
  test("output comparison ignores trailing spaces and trailing blank lines, nothing else", () => {
    expect(sameOutput("Total candy: 11\n", "Total candy: 11")).toBe(true);
    expect(sameOutput("a  \nb\t\n\n\n", "a\nb")).toBe(true);
    expect(sameOutput("a\r\nb\r\n", "a\nb")).toBe(true);
    expect(sameOutput("", "")).toBe(true);
    expect(sameOutput(" a", "a")).toBe(false);
    expect(sameOutput("a\n\nb", "a\nb")).toBe(false);
    expect(sameOutput("\na", "a")).toBe(false);
    expect(sameOutput("Tip: 4.9", "Tip: 4.90")).toBe(false);
  });

  test("every card is 4 minutes, shows at least one example, and keeps at least one test hidden", () => {
    for (let i = 0; i < FIXES.length; i++) {
      expect(cardSeconds("fix", i)).toBe(240);
      expect(FIXES[i].tests.some((t) => t.show)).toBe(true);
      expect(FIXES[i].tests.some((t) => !t.show)).toBe(true);
    }
  });

  test("+3 for each fix, +2 more for the first one in", () => {
    const r = fixAwardsFor({
      index: 0,
      double: false,
      scored: ["bug:1"],
      fixes: [
        { id: "a", at: sec(50) },
        { id: "b", at: sec(20) },
        { id: "c", at: sec(90) },
      ],
    })!;
    expect(r.scored).toEqual(["bug:1", "fix:0"]);
    expect(r.awards).toEqual([
      { id: "a", first: false, points: 3 },
      { id: "b", first: true, points: 5 },
      { id: "c", first: false, points: 3 },
    ]);
  });

  test("an exact tie goes to whoever reported first", () => {
    const r = fixAwardsFor({
      index: 2,
      double: false,
      scored: [],
      fixes: [
        { id: "a", at: sec(30) },
        { id: "b", at: sec(30) },
      ],
    })!;
    expect(r.awards.map((a) => a.first)).toEqual([true, false]);
  });

  test("double points doubles both", () => {
    const r = fixAwardsFor({
      index: 0,
      double: true,
      scored: [],
      fixes: [
        { id: "a", at: sec(10) },
        { id: "b", at: sec(20) },
      ],
    })!;
    expect(r.awards.map((a) => a.points)).toEqual([10, 6]);
  });

  test("nobody fixed it: nothing to award, but the card still counts as scored", () => {
    const r = fixAwardsFor({ index: 1, double: true, scored: [], fixes: [] })!;
    expect(r.awards).toEqual([]);
    expect(r.scored).toEqual(["fix:1"]);
  });

  test("revealing twice scores once", () => {
    const fixes = [{ id: "a", at: sec(10) }];
    const first = fixAwardsFor({ index: 3, double: false, scored: [], fixes })!;
    expect(fixAwardsFor({ index: 3, double: false, scored: first.scored, fixes })).toBeNull();
  });
});

describe("puzzles", () => {
  const right = () => "MEXJPN";

  test("clocks come from the deck: 10 and 13 minutes for the relays, 26 for the Final's second puzzle", () => {
    expect(PUZZLES.map((_, i) => cardSeconds("puzzle", i))).toEqual([600, 780, 1560]);
  });

  test("answers match without caring about case, spaces, or commas", () => {
    expect(answerKey(" mex, JPN ")).toBe("mexjpn");
    expect(answerKey("1,234\n")).toBe("1234");
    expect(submitAnswer({ wrong: 0 }, 1, "Mex Jpn", right, T0)).toEqual({ kind: "right", stars: { wrong: 0, part1At: T0 } });
  });

  test("a wrong answer locks the team out for 30 seconds, and answers in that time aren't even checked", () => {
    const r = submitAnswer({ wrong: 0 }, 1, "MEXBRA", right, T0);
    expect(r).toEqual({ kind: "wrong", stars: { wrong: 1, lockedUntil: sec(30) } });
    const locked = r.kind === "wrong" ? r.stars : { wrong: 0 };
    let checked = 0;
    const counted = () => {
      checked++;
      return "MEXJPN";
    };
    expect(submitAnswer(locked, 1, "MEXJPN", counted, sec(29))).toEqual({ kind: "locked", waitMs: 1000 });
    expect(checked).toBe(0);
    expect(submitAnswer(locked, 1, "MEXJPN", counted, sec(30))).toEqual({
      kind: "right",
      stars: { wrong: 1, lockedUntil: sec(30), part1At: sec(30) },
    });
    expect(checked).toBe(1);
  });

  test("a second wrong answer starts a fresh 30 seconds", () => {
    const r = submitAnswer({ wrong: 1, lockedUntil: sec(30) }, 1, "nope", right, sec(45));
    expect(r).toEqual({ kind: "wrong", stars: { wrong: 2, lockedUntil: sec(75) } });
  });

  test("an empty answer is wrong, not a free pass", () => {
    expect(submitAnswer({ wrong: 0 }, 1, " , ", () => "", T0).kind).toBe("wrong");
  });

  test("part 2 needs part 1 first, and a star can't be earned twice", () => {
    expect(submitAnswer({ wrong: 0 }, 2, "MEXJPN", right, T0)).toEqual({ kind: "early" });
    const one = { wrong: 0, part1At: T0 };
    expect(submitAnswer(one, 1, "anything", right, sec(5))).toEqual({ kind: "done" });
    expect(submitAnswer(one, 2, "MEXJPN", right, sec(5))).toEqual({ kind: "right", stars: { ...one, part2At: sec(5) } });
  });

  test("+3 per part 1 star, +5 per part 2 star, +2 more for the first team to each", () => {
    const r = puzzleAwardsFor({
      index: 2,
      double: false,
      scored: ["fix:0"],
      teams: [
        { id: "a", part1At: sec(60), part2At: sec(400) },
        { id: "b", part1At: sec(30) },
        { id: "c", part1At: sec(90), part2At: sec(300) },
        { id: "d" },
      ],
    })!;
    expect(r.scored).toEqual(["fix:0", "puzzle:2"]);
    expect(r.awards).toEqual([
      { id: "a", first1: false, first2: false, points: 8 },
      { id: "b", first1: true, first2: false, points: 5 },
      { id: "c", first1: false, first2: true, points: 10 },
      { id: "d", first1: false, first2: false, points: 0 },
    ]);
  });

  test("double points doubles everything, and one team can be first to both", () => {
    const r = puzzleAwardsFor({ index: 0, double: true, scored: [], teams: [{ id: "a", part1At: sec(10), part2At: sec(20) }] })!;
    expect(r.awards).toEqual([{ id: "a", first1: true, first2: true, points: 24 }]);
  });

  test("an exact tie goes to whoever's row came first", () => {
    const r = puzzleAwardsFor({
      index: 1,
      double: false,
      scored: [],
      teams: [
        { id: "a", part1At: sec(30) },
        { id: "b", part1At: sec(30) },
      ],
    })!;
    expect(r.awards.map((a) => a.first1)).toEqual([true, false]);
  });

  test("scoring twice scores once", () => {
    const teams = [{ id: "a", part1At: sec(10) }];
    const first = puzzleAwardsFor({ index: 1, double: false, scored: [], teams })!;
    expect(puzzleAwardsFor({ index: 1, double: false, scored: first.scored, teams })).toBeNull();
  });

  test("the deck's own answers earn the stars, and part 1's answer never passes for part 2", () => {
    for (const [i, p] of PUZZLES.entries()) {
      const input = p.generate(puzzleSeed("night", "team", i));
      const a = p.solve(input);
      expect(submitAnswer({ wrong: 0 }, 1, a.part1, () => p.solve(input).part1, T0).kind).toBe("right");
      expect(submitAnswer({ wrong: 0, part1At: T0 }, 2, a.part2, () => p.solve(input).part2, T0).kind).toBe("right");
      expect(submitAnswer({ wrong: 0, part1At: T0 }, 2, a.part1, () => p.solve(input).part2, T0).kind).toBe("wrong");
    }
  });
});

describe("Wiki Race", () => {
  const key = wikiKey("Pizza", "Moon");
  const teams = ["a", "b", "c", "d", "e", "f"];
  const base = { key, clicks: false, double: false, scored: [], teams };
  const points = (r: ReturnType<typeof wikiAwardsFor<string>>) => Object.fromEntries(r!.awards.map((a) => [a.team, a.points]));

  test("keys round-trip, and no article name has the separator", () => {
    expect(wikiPair(key)).toEqual({ from: "Pizza", to: "Moon" });
    for (const r of WIKI_RACES) expect(wikiPair(wikiKey(r.from, r.to))).toEqual({ from: r.from, to: r.to });
  });

  test("5, 4, 3 by finishing time, 2 for any other finish, 1 for playing", () => {
    const r = wikiAwardsFor({
      ...base,
      finishes: [
        { team: "c", at: sec(90) },
        { team: "a", at: sec(30) },
        { team: "e", at: sec(200) },
        { team: "b", at: sec(60) },
      ],
    });
    expect(points(r)).toEqual({ a: 5, b: 4, c: 3, d: 1, e: 2, f: 1 });
    expect(r!.awards.find((a) => a.team === "e")!.place).toBe(4);
    expect(r!.awards.find((a) => a.team === "d")!.place).toBeNull();
    expect(r!.scored).toEqual([key]);
  });

  test("an exact tie in time goes to whoever came in first", () => {
    expect(wikiPlaces([{ at: sec(5) }, { at: sec(5) }, { at: sec(1) }], false)).toEqual([2, 3, 1]);
  });

  test("Fewest Clicks goes by the lowest count, not time, and equal counts share the place", () => {
    const r = wikiAwardsFor({
      ...base,
      clicks: true,
      finishes: [
        { team: "a", at: sec(10), clicks: 9 },
        { team: "b", at: sec(200), clicks: 4 },
        { team: "c", at: sec(100), clicks: 6 },
        { team: "d", at: sec(50), clicks: 6 },
        { team: "e", at: sec(20), clicks: 12 },
      ],
    });
    expect(points(r)).toEqual({ a: 2, b: 5, c: 4, d: 4, e: 2, f: 1 });
  });

  test("double points doubles everything, including playing", () => {
    const r = wikiAwardsFor({ ...base, double: true, finishes: [{ team: "a", at: sec(1) }] });
    expect(points(r)).toEqual({ a: 10, b: 2, c: 2, d: 2, e: 2, f: 2 });
  });

  test("nobody finished: everyone gets 1 for playing", () => {
    expect(points(wikiAwardsFor({ ...base, finishes: [] }))).toEqual({ a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 });
  });

  test("scoring twice scores once", () => {
    const finishes = [{ team: "a", at: sec(1) }];
    const first = wikiAwardsFor({ ...base, finishes })!;
    expect(wikiAwardsFor({ ...base, scored: first.scored, finishes })).toBeNull();
  });
});
