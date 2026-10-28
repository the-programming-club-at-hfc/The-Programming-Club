// The haunted TV's lock-ins: who has locked a line and a fix on the Bug Hunt card, and never what they picked.
import { beforeEach, expect, setSystemTime, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { BUGS } from "../src/lib/content";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./answers.ts": () => import("./answers"),
  "./haunted.ts": () => import("./haunted"),
  "./officers.ts": () => import("./officers"),
  "./players.ts": () => import("./players"),
  "./sessions.ts": () => import("./sessions"),
  "./teams.ts": () => import("./teams"),
};

// Made-up addresses only: the repo is public.
const ADA = "ada@officers.test";
process.env.OFFICER_EMAILS = ADA;

const T0 = Date.UTC(2026, 9, 28, 21);
let now = T0;
const later = (s: number) => setSystemTime(new Date((now += s * 1000)));
beforeEach(() => setSystemTime(new Date((now = T0))));

test("lock times per team on a Bug Hunt card, no picks, and nothing for other games", async () => {
  const t = convexTest(schema, modules);
  const officer = t.withIdentity({ email: ADA });
  await officer.mutation(api.sessions.start, { week: 1 });
  const code = (await officer.query(api.sessions.joinCode, {}))!;
  for (let i = 1; i <= 4; i++) await t.mutation(api.players.join, { code, name: `Student ${i}`, email: `s${i}@hawkmail.hfcc.edu` });
  await officer.mutation(api.teams.make, { size: 2 });
  const att = await t.run((ctx) => ctx.db.query("attendance").collect());
  const tokenOf = (teamId: string) => att.find((a) => a.teamId === teamId)!.token;

  expect(await t.query(api.haunted.locks, {})).toBeNull();
  await officer.mutation(api.sessions.setScreen, { screen: { mode: "card", game: "output", index: 0 } });
  expect(await t.query(api.haunted.locks, {})).toBeNull();

  const card = "bug:0";
  const bug = BUGS[0];
  await officer.mutation(api.sessions.setScreen, { screen: { mode: "card", game: "bug", index: 0 } });
  const [a, b] = (await t.query(api.haunted.locks, {}))!.teams;
  expect([a.lineAt, a.fixAt, b.lineAt, b.fixAt]).toEqual([null, null, null, null]);

  // A picked line doesn't count until it's locked.
  later(5);
  await t.mutation(api.answers.pick, { token: tokenOf(a._id), card, line: bug.lines[0] });
  expect((await t.query(api.haunted.locks, {}))!.teams[0].lineAt).toBeNull();
  await t.mutation(api.answers.lock, { token: tokenOf(a._id), card, step: "line" });
  const lineAt = now;
  later(5);
  await t.mutation(api.answers.pick, { token: tokenOf(a._id), card, choice: bug.fix });
  await t.mutation(api.answers.lock, { token: tokenOf(a._id), card, step: "answer" });
  const locks = (await t.query(api.haunted.locks, {}))!;
  expect(locks.card).toBe(card);
  expect(locks.teams).toEqual([
    { _id: a._id, name: a.name, lineAt, fixAt: now },
    { _id: b._id, name: b.name, lineAt: null, fixAt: null },
  ]);
  expect(JSON.stringify(locks)).not.toContain(bug.fix);
});
