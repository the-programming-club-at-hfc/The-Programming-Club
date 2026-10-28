import { expect, test } from "bun:test";
import { BUGS, WEEKS } from "./content";
import { graveRows } from "./spooky";

test("only Spooky Bugs is the spooky night", () => {
  expect(WEEKS.filter((w) => w.theme === "spooky").map((w) => w.title)).toEqual(["Spooky Bugs"]);
});

test("verified spooky news cards link to HTTPS sources", () => {
  // Khoj's advisory was disclosed in June, not September; leave its news unlinked until the copy is reviewed.
  for (const i of [19, 20, 21, 23]) expect(BUGS[i].newsUrl?.startsWith("https://")).toBe(true);
  for (const b of BUGS.filter((bug) => bug.newsUrl)) {
    expect(Boolean(b.news)).toBe(true);
    expect(new URL(b.newsUrl!).protocol).toBe("https:");
  }
});

test("graveRows keeps every stone on the ground, in join order", () => {
  for (let n = 0; n <= 60; n++) {
    const players = Array.from({ length: n }, (_, i) => i);
    const { rows, width, more } = graveRows(players);
    expect(rows.flat()).toEqual(players.slice(0, n - more));
    expect(more).toBe(Math.max(0, n - 48));
    for (const row of rows) expect(row.length * width * 1.1 <= 86).toBe(true);
    if (rows.length) expect(width * 1.2 * (1 + (rows.length - 1) * 0.7) <= 24).toBe(true);
  }
});

test("graveRows fills a row before starting the next", () => {
  expect(graveRows([1]).rows).toEqual([[1]]);
  expect(graveRows(Array(6).fill(0)).rows.map((r) => r.length)).toEqual([6]);
  expect(graveRows(Array(15).fill(0)).rows.map((r) => r.length)).toEqual([8, 7]);
  expect(graveRows(Array(30).fill(0)).rows.map((r) => r.length)).toEqual([10, 10, 10]);
});
