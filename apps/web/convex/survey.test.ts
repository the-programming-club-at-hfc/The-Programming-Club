// The member survey: signed-in HawkMail only, one response per member that they can change, and results for officers.
import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { BLANK } from "../src/lib/survey";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./officers.ts": () => import("./officers"),
  "./survey.ts": () => import("./survey"),
};

// Made-up addresses only: the repo is public.
const ADA = "ada@officers.test";
const SAM = "sam@hawkmail.hfcc.edu";
process.env.OFFICER_EMAILS = ADA;

const answers = { ...BLANK, interests: ["ai"], experience: "basics", frequency: "biweekly", locations: ["campus", "discord"], free: [65] };

const rejects = async (p: Promise<unknown>) => {
  const error = await p.then(
    () => null,
    (e: { data?: unknown }) => e,
  );
  return error ? String(error.data) : null;
};

test("members send and change their answers; officers see them and who hasn't answered", async () => {
  const t = convexTest(schema, modules);
  expect(await rejects(t.mutation(api.survey.save, { name: "Sam", ...answers }))).toContain("signed out");
  expect(await rejects(t.withIdentity({ email: "sam@gmail.com" }).mutation(api.survey.save, { name: "Sam", ...answers }))).toContain(
    "HawkMail",
  );

  const sam = t.withIdentity({ email: SAM.toUpperCase(), name: "Sam Lee" });
  expect((await sam.query(api.survey.mine, {}))?.answers).toBeNull();
  await sam.mutation(api.survey.save, { name: "Sam Lee", ...answers });
  await sam.mutation(api.survey.save, { name: "Sam Lee", ...answers, frequency: "weekly" });
  expect((await sam.query(api.survey.mine, {}))?.answers?.frequency).toBe("weekly");

  await t.run(async (ctx) => {
    await ctx.db.insert("players", { email: SAM, name: "Sam Lee", createdAt: 0 });
    await ctx.db.insert("players", { email: "kim@hawkmail.hfcc.edu", name: "Kim", createdAt: 0 });
    await ctx.db.insert("players", { email: ADA, name: "Ada", createdAt: 0 });
  });
  expect(await rejects(sam.query(api.survey.results, {}))).toBe("Only club officers can do that.");
  const results = await t.withIdentity({ email: ADA }).query(api.survey.results, {});
  expect(results.responses).toHaveLength(1);
  expect(results.responses[0].email).toBe(SAM);
  expect(results.waiting.map((w) => w.name)).toEqual(["Kim"]);
});
