// A whole game night against an in-memory Convex: officers and students signing in and joining, teams, every way
// points come in, and the XP when the night ends. The scoring rules themselves are tested in src/lib/grading.test.ts.
import { beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { placeXpFor } from "./lib";
import { answersFor } from "./puzzles";
import { BUGS, LANGS, OUTPUTS } from "../src/lib/content";
import { LANGUAGES, choices } from "../src/lib/grading";
import { COLORS, SIZES } from "../src/lib/draw";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./answers.ts": () => import("./answers"),
  "./drawings.ts": () => import("./drawings"),
  "./fixes.ts": () => import("./fixes"),
  "./officers.ts": () => import("./officers"),
  "./players.ts": () => import("./players"),
  "./puzzles.ts": () => import("./puzzles"),
  "./sessions.ts": () => import("./sessions"),
  "./stats.ts": () => import("./stats"),
  "./teams.ts": () => import("./teams"),
  "./wiki.ts": () => import("./wiki"),
};

// Made-up addresses only: the repo is public.
const ADA = "ada@officers.test";
const GRACE = "grace@officers.test";
process.env.OFFICER_EMAILS = `${ADA}, Grace@Officers.TEST`;

const T0 = Date.UTC(2026, 9, 14, 22);
let now = T0;
const at = (s: number) => setSystemTime(new Date((now = T0 + s * 1000)));
const later = (s: number) => setSystemTime(new Date((now += s * 1000)));

const student = (i: number) => ({ name: `Student ${i}`, email: `s${i}@hawkmail.hfcc.edu` });

function setup() {
  const t = convexTest(schema, modules);
  const officer = t.withIdentity({ email: ADA });
  const signedInStudent = t.withIdentity({ email: student(1).email });
  const attendance = () => t.run((ctx) => ctx.db.query("attendance").collect());
  const teams = () => t.run((ctx) => ctx.db.query("teams").collect());
  const score = async (id: Id<"teams">) => (await t.run((ctx) => ctx.db.get(id)))!.score;

  async function startNight(week = 1, practice?: boolean) {
    await officer.mutation(api.sessions.start, { week, practice });
    return (await officer.query(api.sessions.joinCode, {}))!;
  }
  const join = (code: string, p: { name: string; email: string }) => t.mutation(api.players.join, { code, ...p });

  /** Starts a night, joins `n` students, and makes teams of 2. Returns each team with its members' tokens. */
  async function nightWithTeams(n: number, week = 1) {
    const code = await startNight(week);
    const tokens = [];
    for (let i = 1; i <= n; i++) tokens.push(await join(code, student(i)));
    await officer.mutation(api.teams.make, { size: 2 });
    const att = await attendance();
    const list = (await teams()).map((team) => ({
      ...team,
      tokens: att.filter((a) => a.teamId === team._id).map((a) => a.token),
    }));
    return { code, teams: list };
  }

  const show = (screen: Doc<"sessions">["screen"]) => officer.mutation(api.sessions.setScreen, { screen });

  // "Just hosting": an officer off the teams to run the night. Officers check in playing.
  const host = (token: string) => t.mutation(api.players.setPlaying, { token, playing: false });
  return { t, officer, signedInStudent, attendance, teams, score, startNight, join, nightWithTeams, show, host };
}

beforeEach(() => at(0));

describe("signing in", () => {
  test("officers are recognized by OFFICER_EMAILS, in any case; students and guests aren't", async () => {
    const { t, officer, signedInStudent } = setup();
    expect(await t.query(api.officers.me, {})).toEqual({ signedIn: false, officer: false, email: null });
    expect(await signedInStudent.query(api.officers.me, {})).toEqual({ signedIn: true, officer: false, email: student(1).email });
    expect((await officer.query(api.officers.me, {})).officer).toBe(true);
    expect((await t.withIdentity({ email: "GRACE@officers.test" }).query(api.officers.me, {})).officer).toBe(true);
  });

  test("only officers can run the night or see the join code", async () => {
    const { t, officer, signedInStudent, startNight } = setup();
    await expect(t.mutation(api.sessions.start, { week: 1 })).rejects.toThrow("Only club officers");
    await expect(signedInStudent.mutation(api.sessions.start, { week: 1 })).rejects.toThrow("Only club officers");
    const code = await startNight();
    expect(code).toHaveLength(4);
    await expect(signedInStudent.query(api.sessions.joinCode, {})).rejects.toThrow("Only club officers");
    await expect(signedInStudent.mutation(api.teams.make, { size: 2 })).rejects.toThrow("Only club officers");
    await expect(signedInStudent.query(api.sessions.host, {})).rejects.toThrow("Only club officers");
    // The public TV query never carries the code.
    expect(JSON.stringify(await t.query(api.sessions.live, {}))).not.toContain(code);
    // Starting again while a night is open returns the same night.
    expect(await officer.mutation(api.sessions.start, { week: 1 })).toBe((await t.query(api.sessions.live, {}))!._id);
  });
});

describe("joining", () => {
  test("students join with the code from the TV, no account needed", async () => {
    const { t, startNight, join, attendance } = setup();
    const code = await startNight();
    await expect(join("ZZZZ", student(1))).rejects.toThrow("That code isn’t live");
    await expect(join(code, { name: "Sam", email: "sam@gmail.com" })).rejects.toThrow("Use your HawkMail");
    const token = await join(` ${code.toLowerCase()} `, student(1));
    const [a] = await attendance();
    expect(a.firstTime).toBe(true);
    expect(a.showXp).toBe(3);
    expect(a.officer).toBe(undefined);
    // Joining again returns the same spot, and nobody can rename a classmate.
    expect(await join(code, { name: "Someone Else", email: " S1@HAWKMAIL.hfcc.edu " })).toBe(token);
    expect((await t.query(api.players.me, { token }))!.name).toBe("Student 1");
    expect(await attendance()).toHaveLength(1);
  });

  test("officers check in playing, signed in or by typing their email, and Just hosting takes them off the teams", async () => {
    const { t, officer, signedInStudent, startNight, join, attendance, host } = setup();
    const code = await startNight();
    await expect(signedInStudent.mutation(api.players.checkInOfficer, { name: "Student 1" })).rejects.toThrow("Only club officers");
    const ada = await officer.mutation(api.players.checkInOfficer, { name: "Ada" });
    // An officer's phone checks in its own account, never an email typed on it: someone else signs out and joins.
    const row = (await attendance()).find((a) => a.token === ada)!;
    expect((await t.run((ctx) => ctx.db.get(row.playerId)))!.email).toBe(ADA);
    // Grace isn't signed in on her phone, so she uses the normal join form.
    const grace = await join(code, { name: "Grace", email: GRACE });
    for (const token of [ada, grace]) {
      const me = (await t.query(api.players.me, { token }))!;
      expect([me.officer, me.playing, !!me.team]).toEqual([true, true, true]);
      await host(token);
    }
    expect((await attendance()).map((a) => [a.officer, a.playing, a.teamId])).toEqual([
      [true, false, undefined],
      [true, false, undefined],
    ]);
    // Students aren't officers, so they get no Playing / Just hosting switch, and the server refuses one anyway.
    const ann = await join(code, student(1));
    const me = (await t.query(api.players.me, { token: ann }))!;
    expect([me.officer, me.playing, !!me.team]).toEqual([false, false, true]);
    await expect(t.mutation(api.players.setPlaying, { token: ann, playing: false })).rejects.toThrow("Only officers");
  });

  test("first time means no earlier real night: practice nights don't count", async () => {
    const { officer, startNight, join, attendance } = setup();
    let code = await startNight(1, true);
    await join(code, student(1));
    await officer.mutation(api.sessions.end, {});
    code = await startNight(1);
    await join(code, student(1));
    await join(code, student(2));
    await officer.mutation(api.sessions.end, {});
    code = await startNight(2);
    await join(code, student(1));
    await join(code, student(3));
    const rows = (await attendance()).map((a) => a.firstTime);
    expect(rows).toEqual([true, true, true, false, true]);
  });
});

describe("teams", () => {
  test("Make teams splits students evenly and leaves hosting officers out", async () => {
    const { t, officer, startNight, join, attendance, teams, host } = setup();
    const code = await startNight();
    for (let i = 1; i <= 7; i++) await join(code, student(i));
    await host(await officer.mutation(api.players.checkInOfficer, { name: "Ada" }));
    await host(await join(code, { name: "Grace", email: GRACE }));

    for (const [size, count, sizes] of [
      [3, 3, [2, 2, 3]],
      [2, 3, [2, 2, 3]],
    ] as const) {
      await officer.mutation(api.teams.make, { size });
      const list = await teams();
      const att = await attendance();
      expect(list).toHaveLength(count);
      expect(list.map((tm) => att.filter((a) => a.teamId === tm._id).length).sort()).toEqual([...sizes]);
      expect(att.filter((a) => a.officer).map((a) => a.teamId)).toEqual([undefined, undefined]);
      expect(new Set(list.map((tm) => tm.key)).size).toBe(count);
      for (const tm of list) expect(/^[A-HJ-NP-Z]{4}$/.test(tm.key!)).toBe(true);
    }

    // The TV's roster and team lists are students only.
    const live = (await t.query(api.sessions.live, {}))!;
    expect(live.roster).toHaveLength(7);
    const names = [...live.roster.map((r) => r.name), ...live.teams.flatMap((tm) => tm.members)];
    expect(names.some((n) => n === "Ada" || n === "Grace")).toBe(false);
    expect(live.teams.flatMap((tm) => tm.members)).toHaveLength(7);
  });

  test("late joiners: students go on the smallest team with room, hosting officers stay off", async () => {
    const { officer, startNight, join, attendance, teams, host } = setup();
    const code = await startNight();
    for (let i = 1; i <= 7; i++) await join(code, student(i));
    await officer.mutation(api.teams.make, { size: 3 }); // 3 + 2 + 2
    await join(code, student(8));
    await host(await join(code, { name: "Grace", email: GRACE }));
    const att = await attendance();
    const sizes = (await teams()).map((tm) => att.filter((a) => a.teamId === tm._id).length);
    expect(sizes.sort()).toEqual([2, 3, 3]);
    expect(att.find((a) => a.officer)!.teamId).toBe(undefined);
  });

  test("solo by default: each joiner gets a team of their own, named after them", async () => {
    const { t, officer, startNight, join, attendance, teams, host } = setup();
    const code = await startNight();
    for (let i = 1; i <= 3; i++) await join(code, student(i));
    // Same name, different person: numbered so the TV can tell them apart.
    await join(code, { name: "Student 1", email: "other1@hawkmail.hfcc.edu" });
    await host(await join(code, { name: "Grace", email: GRACE }));
    const ada = await officer.mutation(api.players.checkInOfficer, { name: "Ada" });
    await host(ada);
    const live = (await t.query(api.sessions.live, {}))!;
    expect([live.autoTeams, live.teamSize]).toEqual([true, 1]);
    expect(live.teams.map((tm) => [tm.name, tm.members]).sort(([a], [b]) => (a < b ? -1 : 1))).toEqual([
      ["Student 1", ["Student 1"]],
      ["Student 1 2", ["Student 1"]],
      ["Student 2", ["Student 2"]],
      ["Student 3", ["Student 3"]],
    ]);
    expect((await attendance()).filter((a) => a.officer).map((a) => a.teamId)).toEqual([undefined, undefined]);
    expect(new Set((await teams()).map((tm) => tm.key)).size).toBe(4);
    // Playing puts an officer on a team of their own too.
    await t.mutation(api.players.setPlaying, { token: ada, playing: true });
    const team = (await t.query(api.players.me, { token: ada }))!.team!;
    expect([team.name, team.members]).toEqual(["Ada", ["Ada"]]);
  });

  test("Make teams with size 1: everyone solo with their own points, and late joiners get their own", async () => {
    const { t, officer, startNight, join, attendance, teams, host } = setup();
    const code = await startNight();
    for (let i = 1; i <= 5; i++) await join(code, student(i));
    await host(await officer.mutation(api.players.checkInOfficer, { name: "Ada" }));
    await officer.mutation(api.teams.make, { size: 2 });
    expect(await teams()).toHaveLength(2);
    const scored = (await teams())[0]._id;
    await officer.mutation(api.teams.score, { teamId: scored, delta: 3 });
    const players = await t.run((ctx) => ctx.db.query("players").collect());
    const onScored = new Set(
      (await attendance()).filter((a) => a.teamId === scored).map((a) => players.find((p) => p._id === a.playerId)!.name),
    );

    await officer.mutation(api.teams.make, { size: 1 });
    const live = (await t.query(api.sessions.live, {}))!;
    expect(live.teamSize).toBe(1);
    expect(live.teams.map((tm) => [tm.name, tm.members, tm.score]).sort()).toEqual(
      [1, 2, 3, 4, 5].map((i) => [`Student ${i}`, [`Student ${i}`], onScored.has(`Student ${i}`) ? 3 : 0]),
    );
    expect((await attendance()).find((a) => a.officer)!.teamId).toBe(undefined);
    await join(code, student(6));
    expect((await t.query(api.sessions.live, {}))!.teams.find((tm) => tm.name === "Student 6")!.members).toEqual(["Student 6"]);
  });

  test("switching modes never loses points: teams start from their players' average, solo gives each their own back", async () => {
    const { t, officer, startNight, join, attendance, teams } = setup();
    const code = await startNight();
    for (let i = 1; i <= 4; i++) await join(code, student(i));
    const lookup = async () => {
      const players = await t.run((ctx) => ctx.db.query("players").collect());
      const byName = new Map(players.map((p) => [p.name, p._id]));
      const att = await attendance();
      return (name: string) => att.find((a) => a.playerId === byName.get(name))!;
    };
    const teamOf = async (name: string) => (await lookup())(name).teamId!;
    for (const [name, pts] of [
      ["Student 1", 8],
      ["Student 2", 4],
      ["Student 3", 3],
      ["Student 4", 1],
    ] as const)
      await officer.mutation(api.teams.score, { teamId: await teamOf(name), delta: pts });

    await officer.mutation(api.teams.make, { size: 2 });
    const pairs = await teams();
    expect(pairs).toHaveLength(2);
    const of = await lookup();
    for (const team of pairs) {
      const pts = (await attendance()).filter((a) => a.teamId === team._id).map((a) => a.points ?? 0);
      expect(team.score).toBe(Math.round((pts[0] + pts[1]) / 2));
    }
    // Points as a pair go to both players.
    await officer.mutation(api.teams.score, { teamId: of("Student 1").teamId!, delta: 2 });

    await officer.mutation(api.teams.make, { size: 1 });
    const live = (await t.query(api.sessions.live, {}))!;
    const back = Object.fromEntries(live.teams.map((tm) => [tm.name, tm.score]));
    const mate = [2, 3, 4].map((i) => `Student ${i}`).find((n) => of(n).teamId === of("Student 1").teamId)!;
    expect(back["Student 1"]).toBe(10);
    expect(back[mate]).toBe({ "Student 2": 4, "Student 3": 3, "Student 4": 1 }[mate]! + 2);

    await officer.mutation(api.teams.resetScores, {});
    expect((await attendance()).every((a) => !a.points)).toBe(true);
  });

  test("teams can't be remade mid-round: answers in but not revealed lock the mode until the reveal", async () => {
    const { t, officer, nightWithTeams, show } = setup();
    const { teams } = await nightWithTeams(4);
    await show({ mode: "card", game: "output", index: 0 });
    expect((await t.query(api.sessions.live, {}))!.unrevealed).toEqual([]);
    await t.mutation(api.answers.pick, { token: teams[0].tokens[0], card: "output:0", choice: OUTPUTS[0].answer });
    // Still locked after the card leaves the TV unrevealed.
    await show({ mode: "scoreboard" });
    expect((await t.query(api.sessions.live, {}))!.unrevealed).toEqual(["output:0"]);
    await expect(officer.mutation(api.teams.make, { size: 1 })).rejects.toThrow("Finish the round first");

    await show({ mode: "card", game: "output", index: 0, revealed: true });
    expect((await t.query(api.sessions.live, {}))!.unrevealed).toEqual([]);
    await officer.mutation(api.teams.make, { size: 1 });
  });

  test("Play tonight off and back on, solo: the officer's own points come back, and no empty team is left behind", async () => {
    const { t, officer, startNight, join, teams } = setup();
    const code = await startNight();
    await join(code, student(1));
    const ada = await officer.mutation(api.players.checkInOfficer, { name: "Ada" });
    await t.mutation(api.players.setPlaying, { token: ada, playing: true });
    const mine = async () => (await t.query(api.players.me, { token: ada }))!.team;
    await officer.mutation(api.teams.score, { teamId: (await mine())!._id, delta: 4 });

    await t.mutation(api.players.setPlaying, { token: ada, playing: false });
    expect((await teams()).map((tm) => tm.name)).toEqual(["Student 1"]);
    await t.mutation(api.players.setPlaying, { token: ada, playing: true });
    expect([(await mine())!.name, (await mine())!.score]).toEqual(["Ada", 4]);
    expect(await teams()).toHaveLength(2);
  });

  test("taking a solo player off their team: no empty team left behind, but not while their answers wait for a reveal", async () => {
    const { t, officer, startNight, join, attendance, teams, show } = setup();
    const code = await startNight();
    const tokens = [await join(code, student(1)), await join(code, student(2)), await join(code, student(3))];
    const row = async (i: number) => (await attendance()).find((a) => a.token === tokens[i])!;
    await show({ mode: "card", game: "output", index: 0 });
    await t.mutation(api.answers.pick, { token: tokens[0], card: "output:0", choice: OUTPUTS[0].answer });
    await expect(officer.mutation(api.teams.move, { attendanceId: (await row(0))._id, teamId: null })).rejects.toThrow(
      "Finish the round first",
    );
    await show({ mode: "card", game: "output", index: 0, revealed: true });

    // The host's team picker: onto someone else's team, then off to no team.
    await officer.mutation(api.teams.move, { attendanceId: (await row(0))._id, teamId: (await row(1)).teamId! });
    expect((await teams()).map((tm) => tm.name).sort()).toEqual(["Student 2", "Student 3"]);
    await officer.mutation(api.teams.move, { attendanceId: (await row(1))._id, teamId: null });
    expect((await teams()).map((tm) => tm.name).sort()).toEqual(["Student 2", "Student 3"]); // Student 1 is still on it
    await officer.mutation(api.teams.removePlayer, { attendanceId: (await row(2))._id });
    expect((await teams()).map((tm) => tm.name)).toEqual(["Student 2"]);
  });

  test("Auto teams back on: a player taken off their team gets a team starting from their own points", async () => {
    const { officer, startNight, join, attendance, teams } = setup();
    const code = await startNight();
    const token = await join(code, student(1));
    const row = async () => (await attendance()).find((a) => a.token === token)!;
    await officer.mutation(api.teams.score, { teamId: (await row()).teamId!, delta: 5 });
    await officer.mutation(api.teams.move, { attendanceId: (await row())._id, teamId: null });
    await officer.mutation(api.teams.setAuto, { on: false });
    await officer.mutation(api.teams.setAuto, { on: true });
    expect((await teams()).map((tm) => [tm.name, tm.score])).toEqual([["Student 1", 5]]);
  });

  test("Remove team waits for the round: a team with answers in can't be removed until the reveal", async () => {
    const { t, officer, startNight, join, teams, show } = setup();
    const code = await startNight();
    const token = await join(code, student(1));
    await show({ mode: "card", game: "output", index: 0 });
    await t.mutation(api.answers.pick, { token, card: "output:0", choice: OUTPUTS[0].answer });
    const [team] = await teams();
    await expect(officer.mutation(api.teams.remove, { teamId: team._id })).rejects.toThrow("Finish the round first");
    await show({ mode: "card", game: "output", index: 0, revealed: true });
    await officer.mutation(api.teams.remove, { teamId: team._id });
    expect(await teams()).toHaveLength(0);
  });

  test("Play tonight off on a team night leaves the partner's team as it is", async () => {
    const { t, officer, startNight, join, attendance, teams } = setup();
    const code = await startNight();
    await join(code, student(1));
    await officer.mutation(api.teams.make, { size: 2 });
    const ada = await officer.mutation(api.players.checkInOfficer, { name: "Ada" });
    await t.mutation(api.players.setPlaying, { token: ada, playing: true });
    const team = (await attendance()).find((a) => a.token === ada)!.teamId!;
    await officer.mutation(api.teams.score, { teamId: team, delta: 3 });
    await t.mutation(api.players.setPlaying, { token: ada, playing: false });
    expect((await teams()).map((tm) => [tm._id, tm.score])).toEqual([[team, 3]]);
  });

  test("the TV's final standings are the night that ended last, even an older one ended again", async () => {
    const { t, officer, startNight, join, attendance } = setup();
    await join(await startNight(1), student(1));
    await officer.mutation(api.sessions.end, {});
    const week1 = (await attendance())[0].sessionId;
    later(60);
    await join(await startNight(2), student(2));
    await officer.mutation(api.sessions.end, {});
    later(60);
    await officer.mutation(api.sessions.reopen, { sessionId: week1 });
    await officer.mutation(api.sessions.end, {});
    expect((await t.query(api.sessions.final, {}))!.week).toBe(1);
  });

  test("auto teams fill teams up to the last Make teams size", async () => {
    const { t, officer, startNight, join, attendance, teams, host } = setup();
    const code = await startNight();
    // Picking teams of 2 before anyone joins sets the night's size.
    await officer.mutation(api.teams.make, { size: 2 });
    for (let i = 1; i <= 7; i++) await join(code, student(i));
    await host(await join(code, { name: "Grace", email: GRACE }));
    const att = await attendance();
    const sizes = (await teams()).map((tm) => att.filter((a) => a.teamId === tm._id).length);
    expect(sizes.sort()).toEqual([1, 2, 2, 2]);
    expect(att.find((a) => a.officer)!.teamId).toBe(undefined);
    const live = (await t.query(api.sessions.live, {}))!;
    expect([live.autoTeams, live.teamSize]).toEqual([true, 2]);
    // Teams of 3 reshuffles the 7 into 3, 2, 2, and late joiners then fill teams up to 3.
    await officer.mutation(api.teams.make, { size: 3 });
    expect((await t.query(api.sessions.live, {}))!.teamSize).toBe(3);
    await join(code, student(8));
    await join(code, student(9));
    const after = await attendance();
    expect((await teams()).map((tm) => after.filter((a) => a.teamId === tm._id).length).sort()).toEqual([3, 3, 3]);
  });

  test("with auto teams off, joiners wait for Make teams; turning it back on places them", async () => {
    // [size, teams for 4 players, teams once a 5th joins with auto off again: smallest team, or their own when solo]
    for (const [size, count, late] of [
      [2, 2, 2],
      [1, 4, 5],
    ] as const) {
      const { t, officer, startNight, join, attendance, teams } = setup();
      const code = await startNight();
      await officer.mutation(api.teams.make, { size });
      await officer.mutation(api.teams.setAuto, { on: false });
      for (let i = 1; i <= 4; i++) await join(code, student(i));
      expect(await teams()).toHaveLength(0);
      expect((await t.query(api.sessions.live, {}))!.autoTeams).toBe(false);
      await expect(t.mutation(api.teams.setAuto, { on: true })).rejects.toThrow("Only club officers");
      await officer.mutation(api.teams.setAuto, { on: true });
      expect((await attendance()).every((a) => a.teamId)).toBe(true);
      expect(await teams()).toHaveLength(count);
      await officer.mutation(api.teams.setAuto, { on: false });
      await join(code, student(5));
      expect((await attendance()).every((a) => a.teamId)).toBe(true);
      expect(await teams()).toHaveLength(late);
    }
  });

  test("Play tonight puts an officer on a team, and off again", async () => {
    const { t, officer, startNight, join, attendance } = setup();
    const code = await startNight();
    const tokens = [];
    for (let i = 1; i <= 4; i++) tokens.push(await join(code, student(i)));
    const ada = await officer.mutation(api.players.checkInOfficer, { name: "Ada" });
    await officer.mutation(api.teams.make, { size: 2 });

    await expect(t.mutation(api.players.setPlaying, { token: tokens[0], playing: true })).rejects.toThrow("Only officers");
    await t.mutation(api.players.setPlaying, { token: ada, playing: true });
    let me = (await t.query(api.players.me, { token: ada }))!;
    expect([me.playing, me.team?.members.includes("Ada")]).toEqual([true, true]);
    expect((await t.query(api.sessions.live, {}))!.roster.map((r) => r.name)).toContain("Ada");

    // A playing officer stays in when teams are made again.
    await officer.mutation(api.teams.make, { size: 2 });
    expect((await attendance()).find((a) => a.officer)!.teamId).not.toBe(undefined);

    await t.mutation(api.players.setPlaying, { token: ada, playing: false });
    me = (await t.query(api.players.me, { token: ada }))!;
    expect([me.playing, me.team]).toEqual([false, null]);
    await officer.mutation(api.teams.make, { size: 2 });
    expect((await attendance()).find((a) => a.officer)!.teamId).toBe(undefined);
    expect((await t.query(api.sessions.live, {}))!.roster.map((r) => r.name)).not.toContain("Ada");

    // Moving an officer onto a team from /host means they're playing; moving them off means they aren't.
    const row = (await attendance()).find((a) => a.officer)!;
    const team = (await t.query(api.sessions.live, {}))!.teams[0]._id;
    await officer.mutation(api.teams.move, { attendanceId: row._id, teamId: team });
    expect((await attendance()).find((a) => a.officer)!.playing).toBe(true);
    await officer.mutation(api.teams.move, { attendanceId: row._id, teamId: null });
    expect((await attendance()).find((a) => a.officer)!.playing).toBe(false);
  });

  test("an officer who isn't playing can't answer for a team", async () => {
    const { t, officer, nightWithTeams, show, host } = setup();
    await nightWithTeams(4);
    const ada = await officer.mutation(api.players.checkInOfficer, { name: "Ada" });
    await host(ada);
    await show({ mode: "card", game: "output", index: 0 });
    await expect(t.mutation(api.answers.pick, { token: ada, card: "output:0", choice: OUTPUTS[0].answer })).rejects.toThrow(
      "not on a team",
    );
  });
});

describe("points", () => {
  test("Output?: right answers score on the reveal, once", async () => {
    const { t, nightWithTeams, show, score } = setup();
    const { teams } = await nightWithTeams(6);
    const [a, b, c] = teams;
    const card = "output:0";
    await show({ mode: "card", game: "output", index: 0 });
    const wrong = choices("output", 0).find((x) => x !== OUTPUTS[0].answer)!;
    await t.mutation(api.answers.pick, { token: a.tokens[0], card, choice: wrong });
    // A teammate changes the team's pick, then locks it.
    await t.mutation(api.answers.pick, { token: a.tokens[1], card, choice: OUTPUTS[0].answer });
    await t.mutation(api.answers.lock, { token: a.tokens[1], card, step: "answer" });
    await expect(t.mutation(api.answers.pick, { token: a.tokens[0], card, choice: wrong })).rejects.toThrow("already locked in");
    await t.mutation(api.answers.pick, { token: b.tokens[0], card, choice: wrong }); // never locked: still counts

    const board = (await t.query(api.answers.board, {}))!;
    expect([board.locked, board.results]).toEqual([1, null]);

    await show({ mode: "card", game: "output", index: 0, revealed: true });
    expect([await score(a._id), await score(b._id), await score(c._id)]).toEqual([1, 0, 0]);
    expect((await t.query(api.answers.mine, { token: a.tokens[0] }))!.result).toEqual({ points: 1, correct: true, early: false });
    // Revealing again, or going away and back, never scores twice.
    await show({ mode: "scoreboard" });
    await show({ mode: "card", game: "output", index: 0, revealed: true });
    expect(await score(a._id)).toBe(1);
    await expect(t.mutation(api.answers.pick, { token: c.tokens[0], card, choice: wrong })).rejects.toThrow("closed");
  });

  test("Bug Hunt on double points: line, fix, and the early bonus, all doubled", async () => {
    const { t, officer, nightWithTeams, show, score } = setup();
    const { teams } = await nightWithTeams(6);
    const [a, b, c] = teams;
    const bug = BUGS[0]; // easy: 90s, early bonus in the first 45s
    const card = "bug:0";
    const wrongLine = bug.lines[0] === 1 ? 2 : 1;
    await officer.mutation(api.sessions.setDouble, { on: true });
    await show({ mode: "card", game: "bug", index: 0 });
    const answer = async (tokens: string[], line: number, fix: string) => {
      await t.mutation(api.answers.pick, { token: tokens[0], card, line });
      await t.mutation(api.answers.lock, { token: tokens[0], card, step: "line" });
      await t.mutation(api.answers.pick, { token: tokens[1], card, choice: fix });
      await t.mutation(api.answers.lock, { token: tokens[1], card, step: "answer" });
    };
    await expect(t.mutation(api.answers.pick, { token: a.tokens[0], card, choice: bug.fix })).rejects.toThrow("Lock in a line first");
    later(10);
    await answer(b.tokens, bug.lines[0], bug.fix); // all right, early: 3 × 2
    await answer(a.tokens, wrongLine, bug.fix); // fix only: 1 × 2
    later(50);
    await answer(c.tokens, bug.lines[0], bug.fix); // right but late: 2 × 2
    await show({ mode: "card", game: "bug", index: 0, revealed: true });
    expect([await score(a._id), await score(b._id), await score(c._id)]).toEqual([2, 6, 4]);
  });

  test("Guess the Language: +1 more for locking in the first 15 seconds", async () => {
    const { t, nightWithTeams, show, score } = setup();
    const { teams } = await nightWithTeams(6);
    const [a, b, c] = teams;
    const card = "lang:0";
    await show({ mode: "card", game: "lang", index: 0 });
    const lock = async (tokens: string[], choice: string) => {
      await t.mutation(api.answers.pick, { token: tokens[0], card, choice });
      await t.mutation(api.answers.lock, { token: tokens[0], card, step: "answer" });
    };
    later(10);
    await lock(a.tokens, LANGS[0].lang);
    later(10);
    await lock(b.tokens, LANGS[0].lang);
    await lock(
      c.tokens,
      LANGUAGES.find((l) => l !== LANGS[0].lang && !LANGS[0].also?.includes(l))!,
    );
    await show({ mode: "card", game: "lang", index: 0, revealed: true });
    expect([await score(a._id), await score(b._id), await score(c._id)]).toEqual([2, 1, 0]);
  });

  test("answers close when the card's clock runs out, after a 2s grace", async () => {
    const { t, officer, nightWithTeams, show } = setup();
    const { teams } = await nightWithTeams(4);
    const card = "output:1";
    await show({ mode: "card", game: "output", index: 1 });
    await officer.mutation(api.sessions.timer, { action: "set", seconds: 30, autostart: true });
    later(31);
    await t.mutation(api.answers.pick, { token: teams[0].tokens[0], card, choice: OUTPUTS[1].answer });
    later(2);
    await expect(t.mutation(api.answers.pick, { token: teams[1].tokens[0], card, choice: OUTPUTS[1].answer })).rejects.toThrow("closed");
    // Pausing or resetting the clock afterwards doesn't reopen it.
    await officer.mutation(api.sessions.timer, { action: "reset" });
    await expect(t.mutation(api.answers.pick, { token: teams[1].tokens[0], card, choice: OUTPUTS[1].answer })).rejects.toThrow("closed");
  });

  test("a card's clock parks while the scores or a message are up, and runs again when the card comes back", async () => {
    const { t, officer, nightWithTeams, show } = setup();
    const { teams } = await nightWithTeams(4);
    const card = "output:1";
    const pick = () => t.mutation(api.answers.pick, { token: teams[0].tokens[0], card, choice: OUTPUTS[1].answer });
    const timer = async () => {
      const { remainingMs, startedAt, parked } = (await t.query(api.sessions.live, {}))!.timer;
      return { remainingMs, startedAt, parked };
    };
    await show({ mode: "card", game: "output", index: 1 });
    await officer.mutation(api.sessions.timer, { action: "set", seconds: 30, autostart: true });
    later(10);
    await show({ ...(await t.query(api.sessions.live, {}))!.screen, mode: "scoreboard" });
    expect(await timer()).toEqual({ remainingMs: 20_000, startedAt: undefined, parked: true });
    // A big message keeps the card under it, so it's still the one to come back to.
    later(60);
    await show({ ...(await t.query(api.sessions.live, {}))!.screen, mode: "message", message: "Pizza's here" });
    const { game, index } = (await t.query(api.sessions.live, {}))!.screen;
    expect([game, index]).toEqual(["output", 1]);
    await show({ ...(await t.query(api.sessions.live, {}))!.screen, mode: "card" });
    expect(await timer()).toEqual({ remainingMs: 20_000, startedAt: now, parked: undefined });
    await pick();
    later(23);
    await expect(pick()).rejects.toThrow("closed");
  });

  test("the big timer keeps the clock running; Start while parked keeps the clock on its card", async () => {
    const { t, officer, nightWithTeams, show } = setup();
    const { teams } = await nightWithTeams(4);
    const card = "output:1";
    const live = async () => (await t.query(api.sessions.live, {}))!;
    await show({ mode: "card", game: "output", index: 1 });
    await officer.mutation(api.sessions.timer, { action: "set", seconds: 30, autostart: true });
    later(5);
    // The big timer shows the card's clock: it keeps running.
    await show({ ...(await live()).screen, mode: "timer" });
    expect((await live()).timer.startedAt).not.toBe(undefined);
    later(5);
    await show({ ...(await live()).screen, mode: "scoreboard" });
    later(60);
    await show({ ...(await live()).screen, mode: "card" });
    // Start pressed while it's parked: it runs off the TV but still closes the card at 0:00.
    later(5);
    await show({ ...(await live()).screen, mode: "scoreboard" });
    await officer.mutation(api.sessions.timer, { action: "toggle" });
    expect((await live()).timer.card).toBe(card);
    later(17);
    await show({ ...(await live()).screen, mode: "card" });
    await expect(t.mutation(api.answers.pick, { token: teams[0].tokens[0], card, choice: OUTPUTS[1].answer })).rejects.toThrow("closed");
  });

  test("a parked card that comes back for its reveal stays stopped", async () => {
    const { t, officer, nightWithTeams, show } = setup();
    await nightWithTeams(4);
    await show({ mode: "card", game: "output", index: 1 });
    await officer.mutation(api.sessions.timer, { action: "set", seconds: 30, autostart: true });
    later(5);
    await show({ mode: "lobby", game: "output", index: 1 });
    await show({ mode: "card", game: "output", index: 1, revealed: true });
    const { remainingMs, startedAt, parked } = (await t.query(api.sessions.live, {}))!.timer;
    expect({ remainingMs, startedAt, parked }).toEqual({ remainingMs: 25_000, startedAt: undefined, parked: undefined });
  });

  test("Fix it for real: +3 per team that fixed it, +2 more for the first, through the team key", async () => {
    const { t, officer, nightWithTeams, show, score } = setup();
    const { teams } = await nightWithTeams(6);
    const [a, b, c] = teams;
    const card = "fix:0";
    await show({ mode: "card", game: "fix", index: 0 });
    await expect(t.mutation(api.fixes.report, { teamKey: "NOPE", card, code: "x" })).rejects.toThrow("team key");
    later(20);
    await t.mutation(api.fixes.report, { teamKey: b.key!.toLowerCase(), card, code: "print(1)" });
    later(20);
    await t.mutation(api.fixes.report, { teamKey: a.key!, card, code: "print(2)" });
    await t.mutation(api.fixes.report, { teamKey: b.key!, card, code: "print(3)" }); // later reports are ignored
    const board = (await t.query(api.fixes.board, {}))!;
    expect(board.fixed.map((f) => [f.name, f.ms])).toEqual([
      [b.name, 20_000],
      [a.name, 40_000],
    ]);
    expect(JSON.stringify(board)).not.toContain("print(");
    await expect(t.query(api.fixes.host, {})).rejects.toThrow("Only club officers");
    await show({ mode: "card", game: "fix", index: 0, revealed: true });
    expect([await score(a._id), await score(b._id), await score(c._id)]).toEqual([3, 5, 0]);
    expect((await officer.query(api.fixes.host, {}))!.teams.find((x) => x._id === b._id)!.code).toBe("print(1)");
  });

  test("puzzles: stars per part, first-star bonuses, a 30s lockout, and scoring when the night ends", async () => {
    const { t, officer, nightWithTeams, show, score } = setup();
    const { teams } = await nightWithTeams(6);
    const [a, b, c] = teams;
    const card = "puzzle:0";
    const sessionId = (await t.query(api.sessions.live, {}))!._id;
    const right = (team: (typeof teams)[number]) => answersFor(sessionId, team._id, 0);
    await show({ mode: "card", game: "puzzle", index: 0 });
    const submit = (team: (typeof teams)[number], part: 1 | 2, answer: string) =>
      t.mutation(api.puzzles.submit, { teamKey: team.key!, card, part, answer });

    // Every team's input is different, so another team's answer doesn't work.
    expect(right(a).part1).not.toBe(right(b).part1);
    await expect(submit(a, 2, right(a).part2)).rejects.toThrow("Solve part 1 first");
    later(60);
    expect(await submit(a, 1, right(a).part1)).toEqual({ right: true, waitMs: 0 });
    expect(await submit(b, 1, right(a).part1)).toEqual({ right: false, waitMs: 30_000 });
    await expect(submit(b, 1, right(b).part1)).rejects.toThrow("Wait 30s");
    later(30);
    expect(await submit(b, 1, ` ${right(b).part1.toUpperCase()} `)).toEqual({ right: true, waitMs: 0 });
    later(60);
    expect(await submit(a, 2, right(a).part2)).toEqual({ right: true, waitMs: 0 });

    const board = (await t.query(api.puzzles.board, {}))!;
    expect(board.teams.map((x) => [x.name, x.part1Ms, x.part2Ms, x.first1, x.first2])).toEqual([
      [a.name, 60_000, 150_000, true, true],
      [b.name, 90_000, null, false, false],
      [c.name, null, null, false, false],
    ]);

    // Never revealed: ending the night still scores it. a: 3 + 5 + 2 + 2, b: 3.
    await show({ mode: "scoreboard" });
    await officer.mutation(api.sessions.end, {});
    expect([await score(a._id), await score(b._id), await score(c._id)]).toEqual([12, 3, 0]);
    const stars = await t.run((ctx) => ctx.db.query("stars").collect());
    expect(stars.find((s) => s.teamId === b._id)!.wrong).toBe(1);
  });

  test("a puzzle keeps the double points it went up with", async () => {
    const { t, officer, nightWithTeams, show, score } = setup();
    const { teams } = await nightWithTeams(4);
    const sessionId = (await t.query(api.sessions.live, {}))!._id;
    await officer.mutation(api.sessions.setRound, { round: 5, double: true });
    await show({ mode: "card", game: "puzzle", index: 0 });
    await t.mutation(api.puzzles.submit, {
      teamKey: teams[0].key!,
      card: "puzzle:0",
      part: 1,
      answer: answersFor(sessionId, teams[0]._id, 0).part1,
    });
    await officer.mutation(api.sessions.setDouble, { on: false });
    await officer.mutation(api.sessions.end, {});
    expect(await score(teams[0]._id)).toBe((3 + 2) * 2);
  });

  test("puzzles from the join page: a token answers for the whole team, with the same lockout as the team key", async () => {
    const { t, nightWithTeams, show, score, join } = setup();
    const { code, teams } = await nightWithTeams(4);
    const sessionId = (await t.query(api.sessions.live, {}))!._id;
    // A laptop joined with the same HawkMail gets the phone's spot, so it answers for the same team.
    const laptop = await join(code, student(1));
    const a = teams.find((tm) => tm.tokens.includes(laptop))!;
    const b = teams.find((tm) => tm !== a)!;
    const mate = a.tokens.find((tk) => tk !== laptop)!;
    const right = (team: (typeof teams)[number]) => answersFor(sessionId, team._id, 0);
    const card = "puzzle:0";
    const submit = (token: string, part: 1 | 2, answer: string) => t.mutation(api.puzzles.submitByToken, { token, card, part, answer });

    await expect(submit(laptop, 1, right(a).part1)).rejects.toThrow("isn’t up anymore");
    await show({ mode: "card", game: "puzzle", index: 0 });
    await expect(submit("nope", 1, "1")).rejects.toThrow("This night has ended");
    later(30);
    expect(await submit(laptop, 1, right(b).part1)).toEqual({ right: false, waitMs: 30_000 });
    // The lockout is the team's: a teammate's phone and a lab computer with the team key wait too.
    await expect(submit(mate, 1, right(a).part1)).rejects.toThrow("Wait 30s");
    await expect(t.mutation(api.puzzles.submit, { teamKey: a.key!, card, part: 1, answer: right(a).part1 })).rejects.toThrow("Wait 30s");
    later(30);
    expect(await submit(mate, 1, right(a).part1)).toEqual({ right: true, waitMs: 0 });
    later(10);
    expect(await submit(laptop, 2, right(a).part2)).toEqual({ right: true, waitMs: 0 });

    const board = (await t.query(api.puzzles.board, {}))!;
    expect(board.teams.map((x) => [x.name, x.part1Ms, x.part2Ms])).toEqual([
      [a.name, 60_000, 70_000],
      [b.name, null, null],
    ]);
    await show({ mode: "card", game: "puzzle", index: 0, revealed: true });
    expect([await score(a._id), await score(b._id)]).toEqual([3 + 5 + 2 + 2, 0]);
    await expect(submit(mate, 2, right(a).part2)).rejects.toThrow("Time’s up");
  });

  test("puzzles from the join page on a solo night: each player answers for themselves, from their own input", async () => {
    const { t, officer, startNight, join, show, score, host } = setup();
    const code = await startNight();
    const [ann, ben] = [await join(code, student(1)), await join(code, student(2))];
    const ada = await officer.mutation(api.players.checkInOfficer, { name: "Ada" });
    await host(ada);
    const live = (await t.query(api.sessions.live, {}))!;
    const teamOf = async (token: string) => (await t.query(api.players.me, { token }))!.team!._id;
    const [annTeam, benTeam] = [await teamOf(ann), await teamOf(ben)];
    const right = (teamId: Id<"teams">) => answersFor(live._id, teamId, 0);
    const card = "puzzle:0";
    const submit = (token: string, answer: string) => t.mutation(api.puzzles.submitByToken, { token, card, part: 1, answer });

    await show({ mode: "card", game: "puzzle", index: 0 });
    expect(right(annTeam).part1).not.toBe(right(benTeam).part1);
    later(20);
    expect(await submit(ann, right(benTeam).part1)).toEqual({ right: false, waitMs: 30_000 });
    expect(await submit(ben, right(benTeam).part1)).toEqual({ right: true, waitMs: 0 });
    await expect(submit(ann, right(annTeam).part1)).rejects.toThrow("Wait 30s");
    // An officer running the night has no team to answer for.
    await expect(submit(ada, right(annTeam).part1)).rejects.toThrow("not on a team");
    later(30);
    expect(await submit(ann, right(annTeam).part1)).toEqual({ right: true, waitMs: 0 });
    await show({ mode: "card", game: "puzzle", index: 0, revealed: true });
    expect([await score(annTeam), await score(benTeam)]).toEqual([3, 3 + 2]);
  });

  test("Fix it for real from the join page on a laptop: reported by token, alongside lab computers with the team key", async () => {
    const { t, officer, nightWithTeams, show, score } = setup();
    const { teams } = await nightWithTeams(4);
    const [a, b] = teams;
    const card = "fix:0";
    const report = (token: string, code: string) => t.mutation(api.fixes.reportByToken, { token, card, code });
    await show({ mode: "card", game: "fix", index: 0 });
    await expect(report("nope", "x")).rejects.toThrow("This night has ended");
    later(20);
    await report(b.tokens[1], "print(1)");
    later(20);
    await t.mutation(api.fixes.report, { teamKey: a.key!, card, code: "print(2)" });
    await report(b.tokens[0], "print(3)"); // later reports from the team are ignored
    expect((await t.query(api.fixes.board, {}))!.fixed.map((f) => [f.name, f.ms])).toEqual([
      [b.name, 20_000],
      [a.name, 40_000],
    ]);
    await show({ mode: "card", game: "fix", index: 0, revealed: true });
    expect([await score(a._id), await score(b._id)]).toEqual([3, 5]);
    expect((await officer.query(api.fixes.host, {}))!.teams.find((x) => x._id === b._id)!.code).toBe("print(1)");
    await expect(report(a.tokens[0], "print(4)")).rejects.toThrow("Time’s up");
  });

  test("Wiki Race: 5, 4, 3 by place, 1 for playing, and the referee can turn a finish down", async () => {
    const { t, officer, nightWithTeams, show, score } = setup();
    const { teams } = await nightWithTeams(8);
    const [a, b, c, d] = teams;
    const race = { mode: "wiki", wikiFrom: "Pizza", wikiTo: "Moon" } as const;
    const card = "wiki:Pizza>Moon";
    await show(race);
    later(60);
    await t.mutation(api.wiki.finish, { token: b.tokens[0], card });
    later(10);
    await t.mutation(api.wiki.finish, { token: a.tokens[1], card });
    // A mistaken tap can be taken back before the referee checks it.
    await t.mutation(api.wiki.finish, { token: d.tokens[0], card });
    await t.mutation(api.wiki.undo, { token: d.tokens[1], card });
    later(10);
    await t.mutation(api.wiki.finish, { token: c.tokens[0], card });
    await officer.mutation(api.wiki.check, { teamId: a._id, card, ok: false });
    await officer.mutation(api.wiki.check, { teamId: b._id, card, ok: true });
    await expect(t.mutation(api.wiki.undo, { token: b.tokens[0], card })).rejects.toThrow("already checked");
    const live = (await t.query(api.wiki.board, {}))!;
    expect(live.finished.map((f) => [f.name, f.place])).toEqual([
      [b.name, 1],
      [a.name, null],
      [c.name, 2],
    ]);
    await show({ ...race, revealed: true });
    expect([await score(a._id), await score(b._id), await score(c._id), await score(d._id)]).toEqual([1, 5, 4, 1]);
    await expect(t.mutation(api.wiki.finish, { token: d.tokens[0], card })).rejects.toThrow("race is over");
  });

  test("Wiki Race get-ready: no finishes or scoring until Start", async () => {
    const { t, nightWithTeams, show, score } = setup();
    const { teams } = await nightWithTeams(4);
    const [a] = teams;
    const race = { mode: "wiki", wikiFrom: "Pizza", wikiTo: "Moon" } as const;
    const card = "wiki:Pizza>Moon";
    await show({ ...race, wikiReady: true });
    await expect(t.mutation(api.wiki.finish, { token: a.tokens[0], card })).rejects.toThrow("hasn’t started");
    await show({ ...race, wikiReady: true, revealed: true });
    expect(await score(a._id)).toBe(0);
    // Started, the race takes finishes and scores as usual.
    await show(race);
    await t.mutation(api.wiki.finish, { token: a.tokens[0], card });
    await show({ ...race, revealed: true });
    expect(await score(a._id)).toBe(5);
  });

  test("Wiki Race Start after the scoreboard went up mid get-ready: the clock still times the race", async () => {
    const { t, officer, nightWithTeams, show } = setup();
    const { teams } = await nightWithTeams(4);
    const race = { mode: "wiki", wikiFrom: "Pizza", wikiTo: "Moon", wikiReady: true } as const;
    const card = "wiki:Pizza>Moon";
    await show(race);
    later(60);
    await show({ ...race, mode: "scoreboard" });
    // What Start does (useStartRace in src/components/next.tsx): get-ready back up, the clock, then the race.
    await show(race);
    await officer.mutation(api.sessions.timer, { action: "set", seconds: 300, relay: false, autostart: true });
    await show({ ...race, wikiReady: undefined });
    later(30);
    await t.mutation(api.wiki.finish, { token: teams[0].tokens[0], card });
    expect((await t.query(api.wiki.board, {}))!.finished[0].ms).toBe(30_000);
    later(300);
    await expect(t.mutation(api.wiki.finish, { token: teams[1].tokens[0], card })).rejects.toThrow("Time’s up");
  });

  test("the officer score buttons: only gains double on double points", async () => {
    const { officer, signedInStudent, nightWithTeams, score } = setup();
    const { teams } = await nightWithTeams(4);
    const id = teams[0]._id;
    await expect(signedInStudent.mutation(api.teams.score, { teamId: id, delta: 5 })).rejects.toThrow("Only club officers");
    await officer.mutation(api.teams.score, { teamId: id, delta: 1 });
    await officer.mutation(api.sessions.setDouble, { on: true });
    await officer.mutation(api.teams.score, { teamId: id, delta: 1 });
    await officer.mutation(api.teams.score, { teamId: id, delta: -1 });
    expect(await score(id)).toBe(2);
  });
});

describe("ending the night", () => {
  test("place XP: 3, 2, 1 by each player's own points; ties share a place and don't skip the next", () => {
    const xp = (...points: number[]) => {
      const att = points.map((p, i) => ({ _id: `a${i}`, teamId: `t${i}`, points: p }) as unknown as Doc<"attendance">);
      return att.map((a) => placeXpFor(att).get(a._id));
    };
    expect(xp(9, 5, 2, 1)).toEqual([3, 2, 1, 0]);
    expect(xp(13, 13, 11, 9, 4)).toEqual([3, 3, 2, 1, 0]);
    expect(xp(4, 0, 0)).toEqual([3, 0, 0]);
  });

  test("place XP by rank (ties share), nothing for 0 points or for officers running the night, who stay off the leaderboard", async () => {
    const { t, officer, nightWithTeams, attendance, score, host } = setup();
    const { code, teams } = await nightWithTeams(8);
    const [a, b, c, d] = teams;
    const ada = await officer.mutation(api.players.checkInOfficer, { name: "Ada" });
    await host(ada);
    const grace = await t.mutation(api.players.join, { code, name: "Grace", email: GRACE, broughtBy: "Student 1" });
    await t.mutation(api.players.setPlaying, { token: grace, playing: true }); // a new team, with 0 points
    // c and d tie for 3rd with 0 points, which earns nothing.
    await officer.mutation(api.teams.score, { teamId: a._id, delta: 10 });
    await officer.mutation(api.teams.score, { teamId: b._id, delta: 10 });
    const bonusRow = (await attendance()).find((x) => x.token === d.tokens[0])!;
    await officer.mutation(api.teams.bonus, { attendanceId: bonusRow._id, delta: 2 });
    await officer.mutation(api.sessions.end, {});

    const att = await attendance();
    const xpOf = (token: string) => att.find((x) => x.token === token)!.placeXp;
    expect([a, b, c, d].map((tm) => tm.tokens.map(xpOf))).toEqual([
      [3, 3],
      [3, 3],
      [0, 0],
      [0, 0],
    ]);
    expect(xpOf(ada)).toBe(0);
    expect(await score(d._id)).toBe(0);

    // The TV's final standings: each team's points and place XP, names only.
    const final = (await t.query(api.sessions.final, {}))!;
    expect(final.teams.map((tm) => [tm.score, tm.xp])).toEqual([
      [10, 3],
      [10, 3],
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
    expect(JSON.stringify(final)).not.toContain("@");

    const board = await t.query(api.stats.leaderboard, {});
    // Ada ran the night; Grace played, so she counts like everyone else.
    expect(board).toHaveLength(9);
    expect(board.some((r) => r.name === "Ada")).toBe(false);
    expect(board.find((r) => r.name === "Grace")!.xp).toBe(3);
    expect(board[0].xp).toBe(3 + 3);
    // Teams c, d, and Grace's scored nothing, so their players get show XP plus any bonus.
    expect(board.filter((r) => r.xp === 3 + 2)).toHaveLength(1);
    expect(board.filter((r) => r.xp === 3)).toHaveLength(4);
    expect((await t.query(api.players.me, { token: ada }))!.seasonXp).toBe(0);
    expect((await t.query(api.players.me, { token: grace }))!.seasonXp).toBe(3);
    // Phones after End night: what tonight earned, nothing for an officer who ran it.
    expect((await t.query(api.players.me, { token: a.tokens[0] }))!.tonight).toEqual({ show: 3, place: 3, bonus: 0 });
    expect((await t.query(api.players.me, { token: d.tokens[0] }))!.tonight).toEqual({ show: 3, place: 0, bonus: 2 });
    expect((await t.query(api.players.me, { token: ada }))!.tonight).toBe(null);
    expect((await t.query(api.players.me, { token: a.tokens[0] }))!.seasonXp).toBe(6);

    // Officers still count for attendance.
    const sessionId = att[0].sessionId;
    const sheet = await officer.query(api.sessions.attendanceExport, { sessionId });
    expect(sheet.rows).toHaveLength(10);
    expect(sheet.rows.filter((r) => r.status === "HFC student")).toHaveLength(8);
    // Who brought whom stays on the sheet after the night, for the +2 friend XP.
    expect(sheet.rows.find((r) => r.name === "Grace")!.broughtBy).toBe("Student 1");
  });

  test("place XP on a solo night: each player's own rank, ties share without skipping", async () => {
    const { t, officer, startNight, join, attendance } = setup();
    const code = await startNight();
    const tokens = [];
    for (let i = 1; i <= 5; i++) tokens.push(await join(code, student(i)));
    const live = (await t.query(api.sessions.live, {}))!;
    const team = (i: number) => live.teams.find((tm) => tm.name === student(i).name)!._id;
    for (const [i, pts] of [
      [1, 5],
      [2, 5],
      [3, 2],
      [4, 1],
    ])
      await officer.mutation(api.teams.score, { teamId: team(i), delta: pts });
    await officer.mutation(api.sessions.end, {});
    const att = await attendance();
    expect(tokens.map((tk) => att.find((a) => a.token === tk)!.placeXp)).toEqual([3, 3, 2, 1, 0]);
    expect((await t.query(api.stats.leaderboard, {})).map((r) => r.xp)).toEqual([6, 6, 5, 4, 3]);
  });

  test("a night that switched solo to teams: place XP still goes by each player's own points", async () => {
    const { t, officer, startNight, join, attendance } = setup();
    const code = await startNight();
    const tokens = [];
    for (let i = 1; i <= 4; i++) tokens.push(await join(code, student(i)));
    const solo = (await t.query(api.sessions.live, {}))!.teams;
    for (const [i, pts] of [
      [1, 8],
      [2, 4],
      [3, 3],
      [4, 1],
    ])
      await officer.mutation(api.teams.score, { teamId: solo.find((tm) => tm.name === student(i).name)!._id, delta: pts });
    await officer.mutation(api.teams.make, { size: 2 });
    await officer.mutation(api.sessions.end, {});

    const att = await attendance();
    expect(tokens.map((tk) => att.find((a) => a.token === tk)!.placeXp)).toEqual([3, 2, 1, 0]);
    // Teammates with different place XP show it by their names on the TV.
    const final = (await t.query(api.sessions.final, {}))!;
    for (const tm of final.teams) {
      expect(tm.xp).toBe(undefined);
      expect(tm.members.every((m) => /\+\d$/.test(m))).toBe(true);
    }
  });

  /** A team night as the code before player points left it: team scores only, and teamSize only if Make teams ran. */
  async function oldNight(keepSize: boolean) {
    const ctx = setup();
    const { code, teams } = await ctx.nightWithTeams(4);
    await ctx.officer.mutation(api.teams.score, { teamId: teams[0]._id, delta: 5 });
    await ctx.officer.mutation(api.teams.score, { teamId: teams[1]._id, delta: 2 });
    await ctx.t.run(async (db) => {
      for (const a of await db.db.query("attendance").collect()) await db.db.patch(a._id, { points: undefined });
      for (const s of await db.db.query("sessions").collect())
        await db.db.patch(s._id, { playerPoints: undefined, ...(!keepSize && { teamSize: undefined }) });
    });
    return { ...ctx, code, teams };
  }

  test("a night from before player points: reopening and ending it again keeps its place XP, and it stays a team night", async () => {
    for (const keepSize of [false, true]) {
      const { t, officer, attendance, join, code } = await oldNight(keepSize);
      await t.run(async (db) => {
        // Ended by the old code: place XP stored from team standings.
        for (const s of await db.db.query("sessions").collect()) await db.db.patch(s._id, { status: "ended", endedAt: Date.now() });
        const teams = await db.db.query("teams").collect();
        for (const a of await db.db.query("attendance").collect()) {
          const score = teams.find((tm) => tm._id === a.teamId)?.score ?? 0;
          await db.db.patch(a._id, { placeXp: score === 5 ? 3 : score === 2 ? 2 : 0 });
        }
      });
      const before = (await attendance()).map((a) => [a.token, a.placeXp]);
      // The TV shows what End night stored.
      expect((await t.query(api.sessions.final, {}))!.teams.map((tm) => tm.xp)).toEqual([3, 2]);

      await officer.mutation(api.sessions.reopen, { sessionId: (await attendance())[0].sessionId });
      expect((await t.query(api.sessions.live, {}))!.teamSize).toBe(2);
      await join(code, student(5)); // teams of 2 are full: a new team, not one named after them
      expect((await t.query(api.sessions.live, {}))!.teams.map((tm) => tm.name)).not.toContain("Student 5");
      await officer.mutation(api.sessions.end, {});
      const after = new Map((await attendance()).map((a) => [a.token, a.placeXp]));
      for (const [token, xp] of before) expect(after.get(token as string)).toBe(xp);
    }
  });

  test("a night from before player points that's still open: removing a team keeps its players' points", async () => {
    const { officer, attendance, teams } = await oldNight(false);
    await officer.mutation(api.teams.remove, { teamId: teams[0]._id });
    const att = await attendance();
    expect(teams[0].tokens.map((tk) => att.find((a) => a.token === tk)!.points)).toEqual([5, 5]);
  });

  test("a night from before player points that's still open: scoring first doesn't lose the old points", async () => {
    const { officer, attendance, teams } = await oldNight(false);
    // The trailing team gets +4: 6 to the leaders' 5.
    await officer.mutation(api.teams.score, { teamId: teams[1]._id, delta: 4 });
    await officer.mutation(api.sessions.end, {});
    const att = await attendance();
    const xpOf = (i: number) => teams[i].tokens.map((tk) => att.find((a) => a.token === tk)!.placeXp);
    expect([xpOf(0), xpOf(1)]).toEqual([
      [2, 2],
      [3, 3],
    ]);
  });

  test("practice nights stay out of XP, the leaderboard, and the attendance sheet", async () => {
    const { t, officer, startNight, join, attendance } = setup();
    const code = await startNight(1, true);
    const token = await join(code, student(1));
    await officer.mutation(api.sessions.end, {});
    expect(await t.query(api.stats.leaderboard, {})).toEqual([]);
    expect((await t.query(api.sessions.final, {}))!.teams.every((tm) => tm.xp === undefined)).toBe(true);
    expect((await t.query(api.players.me, { token }))!.seasonXp).toBe(0);
    await expect(officer.query(api.sessions.attendanceExport, { sessionId: (await attendance())[0].sessionId })).rejects.toThrow(
      "Practice nights",
    );
  });

  test("XP adds up across nights", async () => {
    const { t, officer, startNight, join } = setup();
    for (const week of [1, 2]) {
      const code = await startNight(week);
      await join(code, student(1));
      await join(code, student(2));
      await officer.mutation(api.teams.make, { size: 2 });
      const live = (await t.query(api.sessions.live, {}))!;
      await officer.mutation(api.teams.score, { teamId: live.teams[0]._id, delta: 1 });
      await officer.mutation(api.sessions.end, {});
    }
    const [row] = await t.query(api.stats.leaderboard, {});
    expect([row.xp, row.weeks, row.founder]).toEqual([2 * (3 + 3), 2, true]);
    // Each night's breakdown, for /scores. Names only: no emails on this public query.
    expect(row.nights).toEqual([1, 2].map((week) => ({ week, show: 3, place: 3, bonus: 0 })));
    expect(JSON.stringify(await t.query(api.stats.leaderboard, {}))).not.toContain("@");
  });
});

describe("Tech Pictionary", () => {
  /** A solo night with `n` students. Returns their tokens. */
  async function soloNight(o: ReturnType<typeof setup>, n: number) {
    const code = await o.startNight(2);
    const tokens = [];
    for (let i = 1; i <= n; i++) tokens.push(await o.join(code, student(i)));
    return tokens;
  }

  /** What /host's New drawing does: pick the drawer and word, put it on the TV, start its clock. `word` sets the word. */
  async function newDrawing(o: ReturnType<typeof setup>, word?: string) {
    const n = await o.officer.mutation(api.drawings.start, {});
    await o.show({ mode: "draw", drawing: n });
    await o.officer.mutation(api.sessions.timer, { action: "set", seconds: 75, autostart: true });
    const d = (await o.officer.query(api.drawings.host, {}))!.current!;
    if (word) await o.t.run((ctx) => ctx.db.patch(d._id, { word }));
    const drawer = (await o.attendance()).find((a) => a._id === d.drawer)!;
    return { n, key: d.key, id: d._id, word: word ?? d.word, drawer };
  }

  const reveal = (o: ReturnType<typeof setup>, n: number) => o.show({ mode: "draw", drawing: n, revealed: true });

  test("the word never reaches the TV or a guesser: only the drawer's phone and officers", async () => {
    const o = setup();
    const tokens = await soloNight(o, 4);
    // A set word: a random one could be "key", which every JSON reply has as a field name.
    const d = await newDrawing(o, "spreadsheet");
    const guesser = tokens.find((tk) => tk !== d.drawer.token)!;
    const word = JSON.stringify(d.word);
    expect(JSON.stringify(await o.t.query(api.sessions.live, {}))).not.toContain(word);
    const board = (await o.t.query(api.drawings.board, {}))!;
    expect([board.word, board.blanks.length]).toEqual([null, d.word.length]);
    expect(JSON.stringify(board)).not.toContain(word);
    expect(JSON.stringify(await o.t.query(api.drawings.mine, { token: guesser }))).not.toContain(word);
    expect((await o.t.query(api.drawings.mine, { token: d.drawer.token }))!).toEqual({ key: d.key, drawer: true, word: d.word });
    await expect(o.signedInStudent.query(api.drawings.host, {})).rejects.toThrow("Only club officers");
    // Nobody else can draw on it or skip its word.
    const ink = { drawingId: d.id, rev: 0, stroke: "s", color: COLORS[0], size: SIZES[0], points: [10, 10] };
    await expect(o.t.mutation(api.drawings.ink, { ...ink, token: guesser })).rejects.toThrow("someone else’s turn");
    await expect(o.t.mutation(api.drawings.ink, ink)).rejects.toThrow("Only club officers");
    await expect(o.t.mutation(api.drawings.skip, { drawingId: d.id, token: guesser })).rejects.toThrow("someone else’s turn");
    // The reveal puts it up for everyone.
    await reveal(o, d.n);
    expect((await o.t.query(api.drawings.board, {}))!.word).toBe(d.word);
  });

  test("guesses: wrong, close, and right, one a second, then 3 and 2 for the first two and 3 for the drawer", async () => {
    const o = setup();
    const tokens = await soloNight(o, 4);
    const d = await newDrawing(o, "keyboard");
    const [a, b, c] = tokens.filter((tk) => tk !== d.drawer.token);
    const guess = (token: string, text: string) => o.t.mutation(api.drawings.guess, { token, card: d.key, text });
    later(5);
    expect(await guess(a, "printer")).toBe("wrong");
    later(2);
    expect(await guess(a, "keybord")).toBe("close");
    await expect(guess(a, "keyboard")).rejects.toThrow("one guess every 2 seconds");
    await expect(guess(a, "x".repeat(61))).rejects.toThrow("too long");
    later(2);
    expect(await guess(a, " Key-Boards ")).toBe("right");
    await expect(guess(a, "keyboard")).rejects.toThrow("Already got it");
    await expect(guess(d.drawer.token, "keyboard")).rejects.toThrow("the one drawing");
    later(5);
    expect(await guess(b, "KEYBOARD")).toBe("right");
    // Guesses in hold the teams until the reveal.
    await expect(o.officer.mutation(api.teams.make, { size: 2 })).rejects.toThrow("Finish the round first");

    const board = (await o.t.query(api.drawings.board, {}))!;
    expect(board.got.map((g) => [g.by, g.ms])).toEqual([
      ["Student " + (tokens.indexOf(a) + 1), 9_000],
      ["Student " + (tokens.indexOf(b) + 1), 14_000],
    ]);
    expect([board.guessing, board.results]).toEqual([3, null]);
    expect((await o.t.query(api.drawings.mine, { token: b }))!).toEqual({
      key: d.key,
      drawer: false,
      teammate: false,
      place: 2,
      by: null,
      points: null,
    });

    // 2 of 3 guessing players got it, so the drawer gets 3. Revealing again, or going away and back, never scores twice.
    await reveal(o, d.n);
    await o.show({ mode: "scoreboard", drawing: d.n, revealed: true });
    await reveal(o, d.n);
    const points = async (token: string) => (await o.t.query(api.players.me, { token }))!.team!.score;
    expect(await Promise.all([a, b, c, d.drawer.token].map(points))).toEqual([3, 2, 0, 3]);
    expect((await o.t.query(api.drawings.mine, { token: a }))!.points).toBe(3);
    await expect(guess(c, "keyboard")).rejects.toThrow("Time’s up");
  });

  test("team nights: the drawer's team sits it out, and each team's first right guess counts", async () => {
    const o = setup();
    const { teams } = await o.nightWithTeams(6, 2);
    const d = await newDrawing(o, "cloud");
    const mine = teams.find((tm) => tm._id === d.drawer.teamId)!;
    const [x, y] = teams.filter((tm) => tm !== mine);
    const guess = (token: string, text: string) => o.t.mutation(api.drawings.guess, { token, card: d.key, text });
    const mate = mine.tokens.find((tk) => tk !== d.drawer.token)!;
    await expect(guess(mate, "cloud")).rejects.toThrow("Your team is drawing");
    expect((await o.t.query(api.drawings.mine, { token: mate }))!.teammate).toBe(true);
    expect(await guess(x.tokens[0], "clouds")).toBe("right");
    await expect(guess(x.tokens[1], "cloud")).rejects.toThrow("Already got it");
    expect((await o.t.query(api.drawings.mine, { token: x.tokens[1] }))!.place).toBe(1);
    // 1 of 2 guessing teams is half, so the drawer's team gets 3.
    await reveal(o, d.n);
    expect([await o.score(x._id), await o.score(y._id), await o.score(mine._id)]).toEqual([3, 0, 3]);
  });

  test("a drawing never revealed scores when the night ends, with the double points it went up with, and only once", async () => {
    const o = setup();
    const tokens = await soloNight(o, 3);
    const first = await newDrawing(o, "robot");
    const guesser = tokens.find((tk) => tk !== first.drawer.token)!;
    await o.t.mutation(api.drawings.guess, { token: guesser, card: first.key, text: "robot" });
    await reveal(o, first.n);
    await o.officer.mutation(api.sessions.setDouble, { on: true });
    const second = await newDrawing(o, "drone");
    const other = tokens.find((tk) => tk !== second.drawer.token)!;
    await o.t.mutation(api.drawings.guess, { token: other, card: second.key, text: "drone" });
    await o.officer.mutation(api.sessions.setDouble, { on: false });
    await o.show({ mode: "scoreboard", drawing: second.n });
    expect((await o.t.query(api.sessions.live, {}))!.unrevealed).toEqual([second.key]);
    await o.officer.mutation(api.sessions.end, {});
    // First: 3 + 3 (1 of 2 is half). Second, doubled: 6 + 6.
    const att = await o.attendance();
    const pts = (tk: string) => att.find((x) => x.token === tk)!.points ?? 0;
    const want = new Map<string, number>();
    for (const [tk, p] of [
      [guesser, 3],
      [first.drawer.token, 3],
      [other, 6],
      [second.drawer.token, 6],
    ] as const)
      want.set(tk, (want.get(tk) ?? 0) + p);
    expect(tokens.map(pts)).toEqual(tokens.map((tk) => want.get(tk) ?? 0));
  });

  test("drawers take turns, fewest drawings first and across teams; words never repeat; the host can switch drawers", async () => {
    const o = setup();
    const tokens = await soloNight(o, 3);
    const drawn = [];
    for (let i = 0; i < 4; i++) drawn.push(await newDrawing(o));
    expect(new Set(drawn.slice(0, 3).map((d) => d.drawer._id)).size).toBe(3);
    expect(new Set(drawn.map((d) => d.word)).size).toBe(4);
    const host = (await o.officer.query(api.drawings.host, {}))!;
    expect([host.drawn, host.players.length]).toEqual([3, 3]);
    expect(tokens).toHaveLength(3);

    // Switching hands it over with a new word and a clean canvas.
    const d = drawn[3];
    await o.t.mutation(api.drawings.ink, {
      drawingId: d.id,
      rev: 0,
      token: d.drawer.token,
      stroke: "s",
      color: COLORS[1],
      size: SIZES[1],
      points: [1, 2],
    });
    const to = (await o.attendance()).find((a) => a._id !== d.drawer._id)!;
    await o.officer.mutation(api.drawings.switchDrawer, { drawingId: d.id, attendanceId: to._id });
    const after = (await o.officer.query(api.drawings.host, {}))!.current!;
    expect(after.drawer).toBe(to._id);
    expect(drawn.map((x) => x.word)).not.toContain(after.word);
    expect(await o.t.query(api.drawings.inkBlocks, { drawingId: d.id })).toBe(0);
    // Ink drawn for the old word, still on its way, never lands on the new canvas.
    const tablet = { drawingId: d.id, stroke: "t", color: COLORS[1], size: SIZES[1], points: [3, 4] };
    await o.officer.mutation(api.drawings.ink, { ...tablet, rev: 0 });
    expect(await o.t.query(api.drawings.inkBlocks, { drawingId: d.id })).toBe(0);
    await o.officer.mutation(api.drawings.ink, { ...tablet, rev: after.rev });
    expect(await o.t.query(api.drawings.inkBlocks, { drawingId: d.id })).toBe(1);
    // Once someone has it, the drawer stays, and so do their points.
    const guesser = (await o.attendance()).find((a) => a._id !== to._id)!;
    await o.t.mutation(api.drawings.guess, { token: guesser.token, card: d.key, text: after.word });
    await expect(o.officer.mutation(api.drawings.switchDrawer, { drawingId: d.id, attendanceId: guesser._id })).rejects.toThrow(
      "drawer stays",
    );
    expect((await o.t.query(api.drawings.board, {}))!.got).toHaveLength(1);

    // Team nights go team by team.
    const p = setup();
    await p.nightWithTeams(4, 2);
    const one = await newDrawing(p);
    const two = await newDrawing(p);
    const three = await newDrawing(p);
    const four = await newDrawing(p);
    expect([one.drawer.teamId === two.drawer.teamId, three.drawer.teamId === four.drawer.teamId]).toEqual([false, false]);
    expect(new Set([one, two, three, four].map((x) => x.drawer._id)).size).toBe(4);
  });

  test("ink: rows from the drawer's phone and the officer tablet, undo, clear, skip, and pens down at time", async () => {
    const o = setup();
    const tokens = await soloNight(o, 3);
    const d = await newDrawing(o, "mouse");
    // From the drawer's phone, or the officer tablet (signed in, no token).
    const ink = (stroke: string, points: number[], tablet = false, rev = 0) =>
      tablet
        ? o.officer.mutation(api.drawings.ink, { drawingId: d.id, rev, stroke, color: COLORS[0], size: SIZES[0], points })
        : o.t.mutation(api.drawings.ink, { drawingId: d.id, rev, token: d.drawer.token, stroke, color: COLORS[0], size: SIZES[0], points });
    await ink("a", [0, 0, 10, 10]);
    await ink("a", [10, 10, 20, 20]);
    await ink("b", [500, 300]);
    await ink("c", [1000, 750], true);
    await expect(ink("d", [1001, 0])).rejects.toThrow("off the canvas");
    await expect(ink("d", [1, 2, 3])).rejects.toThrow("off the canvas");
    await expect(
      o.t.mutation(api.drawings.ink, {
        drawingId: d.id,
        rev: 0,
        token: d.drawer.token,
        stroke: "d",
        color: "#00ff00",
        size: SIZES[0],
        points: [1, 1],
      }),
    ).rejects.toThrow("Pick a pen");
    const rows = async () => (await o.t.query(api.drawings.inkBlock, { drawingId: d.id, block: 0 })).map((r) => r.stroke);
    expect(await rows()).toEqual(["a", "a", "b", "c"]);
    // Each device undoes its own stroke: the phone's "b" goes, the tablet's later "c" stays.
    await o.t.mutation(api.drawings.undo, { drawingId: d.id, token: d.drawer.token, stroke: "b" });
    expect(await rows()).toEqual(["a", "a", "c"]);
    await o.officer.mutation(api.drawings.undo, { drawingId: d.id, stroke: "c" });
    expect(await rows()).toEqual(["a", "a"]);
    // Ink still on its way for an undone stroke never lands.
    await ink("b", [510, 310]);
    expect(await rows()).toEqual(["a", "a"]);
    // Clear, with this device's newest stroke whose first ink hasn't landed yet: none of it comes back afterwards.
    await o.t.mutation(api.drawings.clear, { drawingId: d.id, token: d.drawer.token, mine: ["a", "late"] });
    await ink("a", [20, 20, 30, 30]);
    await ink("late", [40, 40]);
    expect(await o.t.query(api.drawings.inkBlocks, { drawingId: d.id })).toBe(0);
    await ink("new", [50, 50]);
    expect(await rows()).toEqual(["new"]);

    // Skip: a new word on a clean canvas, until someone gets it.
    await ink("e", [5, 5]);
    await o.t.mutation(api.drawings.skip, { drawingId: d.id, token: d.drawer.token });
    const word = (await o.t.query(api.drawings.mine, { token: d.drawer.token }))!;
    expect(word.drawer && word.word !== "mouse").toBe(true);
    expect(await rows()).toEqual([]);
    // A stroke still on its way from before the skip is dropped; the new word's ink lands.
    await ink("e", [6, 6], true);
    await ink("f", [7, 7], true, 1);
    expect(await rows()).toEqual(["f"]);
    const guesser = tokens.find((tk) => tk !== d.drawer.token)!;
    await o.t.mutation(api.drawings.guess, { token: guesser, card: d.key, text: word.drawer ? word.word : "" });
    await expect(o.t.mutation(api.drawings.skip, { drawingId: d.id, token: d.drawer.token })).rejects.toThrow("already got this one");

    later(78);
    await expect(ink("f", [1, 1])).rejects.toThrow("Pens down");
  });

  test("time's up: no skipping the word", async () => {
    const o = setup();
    await soloNight(o, 3);
    const d = await newDrawing(o);
    later(78);
    await expect(o.t.mutation(api.drawings.skip, { drawingId: d.id, token: d.drawer.token })).rejects.toThrow("Time’s up");
  });

  test("officers see the word, so a playing officer can draw but not guess", async () => {
    const o = setup();
    await soloNight(o, 2);
    const ada = await o.officer.mutation(api.players.checkInOfficer, { name: "Ada" });
    await o.t.mutation(api.players.setPlaying, { token: ada, playing: true });
    // If Ada drew the first one, start another so she's a guesser.
    let d = await newDrawing(o, "laptop");
    if (d.drawer.token === ada) d = await newDrawing(o, "laptop");
    await expect(o.t.mutation(api.drawings.guess, { token: ada, card: d.key, text: "laptop" })).rejects.toThrow("draw but don’t guess");
    // She's still in the drawing rotation.
    const drawers = new Set([d.drawer._id]);
    for (let i = 0; i < 3; i++) drawers.add((await newDrawing(o)).drawer._id);
    expect(drawers.has((await o.attendance()).find((a) => a.token === ada)!._id)).toBe(true);
  });

  test("playing officers can't guess, so they don't count toward half the room for the drawer's bonus", async () => {
    const o = setup();
    const code = await o.startNight(2);
    const tokens = [];
    for (let i = 1; i <= 3; i++) tokens.push(await o.join(code, student(i)));
    // Two officers playing: one signed in, one by typing an officer email. Each is a team of their own.
    await o.officer.mutation(api.players.checkInOfficer, { name: "Ada" });
    await o.join(code, { name: "Grace", email: GRACE });
    let d = await newDrawing(o, "mouse");
    while (d.drawer.officer) d = await newDrawing(o, "mouse");
    const board = (await o.t.query(api.drawings.board, {}))!;
    // Two students can guess; the officers' teams aren't counted.
    expect(board.guessing).toBe(2);
    const guesser = tokens.find((tk) => tk !== d.drawer.token)!;
    await o.t.mutation(api.drawings.guess, { token: guesser, card: d.key, text: "mouse" });
    await reveal(o, d.n);
    // 1 of 2 is half, so the drawer gets 3, not 2.
    expect((await o.t.query(api.players.me, { token: d.drawer.token }))!.team!.score).toBe(3);
  });

  test("a drawer's phone gets two skips a drawing; an officer can always skip; malformed stroke ids are turned away", async () => {
    const o = setup();
    await soloNight(o, 3);
    const d = await newDrawing(o);
    const skip = (token?: string) => o.t.mutation(api.drawings.skip, { drawingId: d.id, token });
    await skip(d.drawer.token);
    await skip(d.drawer.token);
    await expect(skip(d.drawer.token)).rejects.toThrow("two skips");
    await o.officer.mutation(api.drawings.skip, { drawingId: d.id });
    const long = "x".repeat(41);
    await expect(o.t.mutation(api.drawings.undo, { drawingId: d.id, token: d.drawer.token, stroke: long })).rejects.toThrow("not a stroke");
    await expect(o.t.mutation(api.drawings.clear, { drawingId: d.id, token: d.drawer.token, mine: [long] })).rejects.toThrow("strokes");
  });

  test("an officer can give the drawer their own word, on a clean canvas, until someone has it", async () => {
    const o = setup();
    const tokens = await soloNight(o, 3);
    const d = await newDrawing(o);
    const guesser = tokens.find((tk) => tk !== d.drawer.token)!;
    const own = (word: string) => o.officer.mutation(api.drawings.ownWord, { drawingId: d.id, word });
    const ink = { drawingId: d.id, rev: 0, stroke: "s1", color: COLORS[0], size: SIZES[0], points: [10, 10] };
    await o.t.mutation(api.drawings.ink, { ...ink, token: d.drawer.token });
    await expect(o.signedInStudent.mutation(api.drawings.ownWord, { drawingId: d.id, word: "lasagna" })).rejects.toThrow(
      "Only club officers",
    );
    await expect(own(" ! ")).rejects.toThrow("Type a word");
    await expect(own("x".repeat(31))).rejects.toThrow("Type a word");
    await own("  Stack   Overflow ");
    expect((await o.t.query(api.drawings.mine, { token: d.drawer.token }))!.word).toBe("Stack Overflow");
    expect((await o.t.query(api.drawings.board, {}))!.blanks).toBe("_____ ________");
    expect(await o.t.run((ctx) => ctx.db.query("strokes").collect())).toEqual([]);
    later(5);
    expect(await o.t.mutation(api.drawings.guess, { token: guesser, card: d.key, text: "stackoverflow" })).toBe("right");
    await expect(own("lasagna")).rejects.toThrow("Someone already got this one");
  });

  test("an officer's own word: accents fold to plain letters, short tech words work, and guesses start over", async () => {
    const o = setup();
    const tokens = await soloNight(o, 3);
    const d = await newDrawing(o);
    const guesser = tokens.find((tk) => tk !== d.drawer.token)!;
    const own = (word: string) => o.officer.mutation(api.drawings.ownWord, { drawingId: d.id, word });
    const guess = (text: string) => o.t.mutation(api.drawings.guess, { token: guesser, card: d.key, text });
    await expect(own("日本")).rejects.toThrow("plain letters");
    await own("Moore’s law");
    expect((await o.t.query(api.drawings.mine, { token: d.drawer.token }))!.word).toBe("Moore's law");
    await own("C++");
    expect((await o.t.query(api.drawings.board, {}))!.blanks).toBe("_++");
    expect(await guess("python")).toBe("wrong");
    await own("Café");
    expect((await o.t.query(api.drawings.board, {}))!.blanks).toBe("____");
    expect(await o.t.run((ctx) => ctx.db.query("guesses").collect())).toEqual([]);
    later(5);
    expect(await guess("cafe")).toBe("right");
  });

  test("moving the drawer to a team that already got it doesn't take that team's guess away", async () => {
    const o = setup();
    const { teams } = await o.nightWithTeams(6, 2);
    const d = await newDrawing(o, "printer");
    const mine = teams.find((tm) => tm._id === d.drawer.teamId)!;
    const x = teams.find((tm) => tm !== mine)!;
    expect(await o.t.mutation(api.drawings.guess, { token: x.tokens[0], card: d.key, text: "printer" })).toBe("right");
    await o.officer.mutation(api.teams.move, { attendanceId: d.drawer._id, teamId: x._id });
    expect((await o.t.query(api.drawings.board, {}))!.got.map((g) => g.teamId)).toEqual([x._id]);
    // The drawing stays with the team it went up with: x keeps its 3, and the drawer's points go to that team.
    await reveal(o, d.n);
    expect([await o.score(x._id), await o.score(mine._id)]).toEqual([3, 3]);
  });

  test("a drawing left behind scores when another drawing, card, or round goes up, so teams aren't stuck", async () => {
    const o = setup();
    const tokens = await soloNight(o, 3);
    const first = await newDrawing(o, "robot");
    const g1 = tokens.find((tk) => tk !== first.drawer.token)!;
    await o.t.mutation(api.drawings.guess, { token: g1, card: first.key, text: "robot" });
    // The scoreboard keeps it: still waiting for its reveal.
    await o.show({ mode: "scoreboard", drawing: first.n });
    expect((await o.t.query(api.sessions.live, {}))!.unrevealed).toEqual([first.key]);
    // Another drawing going up scores it.
    const second = await newDrawing(o, "drone");
    expect((await o.t.query(api.sessions.live, {}))!.unrevealed).toEqual([]);
    const points = async (token: string) => (await o.t.query(api.players.me, { token }))!.team!.score;
    expect([await points(g1), await points(first.drawer.token)]).toEqual([3, 3]);
    // So does a card.
    const g2 = tokens.find((tk) => tk !== second.drawer.token && tk !== g1) ?? g1;
    await o.t.mutation(api.drawings.guess, { token: g2, card: second.key, text: "drone" });
    await o.show({ mode: "card", game: "output", index: 0 });
    expect((await o.t.query(api.sessions.live, {}))!.unrevealed).toEqual([]);
    await o.officer.mutation(api.teams.make, { size: 1 });
    // And nothing scores twice at the end of the night.
    const before = (await o.attendance()).map((a) => a.points);
    await o.officer.mutation(api.sessions.end, {});
    expect((await o.attendance()).map((a) => a.points)).toEqual(before);
  });
});
