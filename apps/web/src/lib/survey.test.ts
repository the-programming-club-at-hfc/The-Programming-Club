import { expect, test } from "bun:test";
import { BLANK, NO_FILTERS, bestSlots, cleanAnswers, heat, matches, slotLabel, slotOf, surveyProblem, tally } from "./survey";
import type { SurveyResponse } from "./survey";

const ok = { ...BLANK, interests: ["ai"], experience: "new", frequency: "weekly", locations: ["campus"] };
const person = (over: Partial<SurveyResponse>): SurveyResponse => ({
  ...ok,
  name: "A",
  email: "a@x.test",
  nights: 0,
  updatedAt: 0,
  ...over,
});

test("required questions and known answers only", () => {
  expect(surveyProblem(ok)).toBeNull();
  expect(surveyProblem({ ...ok, interests: [] })).toBe("Pick at least one thing you want from the club.");
  expect(surveyProblem({ ...ok, experience: "wizard" })).toBe("Pick how much coding you’ve done.");
  expect(surveyProblem({ ...ok, free: [slotOf(0, 3)] })).toBe("Unknown time slot.");
  expect(surveyProblem({ ...ok, channels: ["fax"] })).toBe("Unknown answer.");
});

test("cleaned answers drop repeats and keep the form's order", () => {
  const c = cleanAnswers({
    ...ok,
    interests: ["social", "ai", "ai"],
    free: [slotOf(2, 17), slotOf(0, 9), slotOf(2, 17)],
    note: "  hi\r\n\n\n\nthere ",
  });
  expect(c.interests).toEqual(["ai", "social"]);
  expect(c.free).toEqual([slotOf(0, 9), slotOf(2, 17)]);
  expect(c.note).toBe("hi\n\nthere");
});

test("slot labels", () => {
  expect(slotLabel(slotOf(2, 17))).toBe("Wednesday, 5–6 p.m.");
  expect(slotLabel(slotOf(0, 11))).toBe("Monday, 11 a.m.–12 p.m.");
});

test("filters: any pick within a question, every question, and every picked hour", () => {
  const a = person({ email: "a", interests: ["ai", "web"], free: [slotOf(1, 16), slotOf(1, 17)], nights: 2 });
  const b = person({ email: "b", interests: ["games"], free: [slotOf(1, 16)] });
  const rows = [a, b];
  expect(rows.filter((r) => matches(r, { ...NO_FILTERS, interests: ["ai", "games"] }))).toHaveLength(2);
  expect(rows.filter((r) => matches(r, { ...NO_FILTERS, interests: ["games"], attended: ["came"] }))).toHaveLength(0);
  expect(rows.filter((r) => matches(r, { ...NO_FILTERS, free: [slotOf(1, 16), slotOf(1, 17)] }))).toEqual([a]);
  expect(tally(rows, "interests").find((t) => t.id === "ai")?.n).toBe(1);
  expect(bestSlots(heat(rows))).toEqual([
    { slot: slotOf(1, 16), n: 2 },
    { slot: slotOf(1, 17), n: 1 },
  ]);
});
