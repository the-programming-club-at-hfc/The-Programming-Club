import { expect, test } from "bun:test";
import { DEFAULT_PLAN, likelyWeek } from "./schedule";

const at = (s: string) => new Date(s).getTime();

test("likelyWeek keeps a week until the morning after its meeting", () => {
  expect(likelyWeek(DEFAULT_PLAN, at("2026-10-14T12:00:00-04:00"))).toBe(1);
  expect(likelyWeek(DEFAULT_PLAN, at("2026-10-14T21:00:00-04:00"))).toBe(1);
  expect(likelyWeek(DEFAULT_PLAN, at("2026-10-15T07:00:00-04:00"))).toBe(2);
});
