import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireOfficer } from "./officers";
import {
  addToSession,
  award,
  inTeamPool,
  newTeam,
  newTeamKey,
  openSession,
  requireOpenSession,
  sessionAttendance,
  sessionTeams,
  shuffle,
  soloName,
  teamByKey,
  teamFor,
  joinTeam,
  leaveTeam,
  unscoredCards,
  upgradeOldNight,
} from "./lib";
import { TEAM_NAMES } from "./teamNames";

/** Shuffle everyone into teams of `size` (sizes differ by at most one, nobody solo), or with size 1 put everyone on a
 *  team of their own, named after them. Remakes tonight's teams without losing points. Officers running the night stay off.
 *  Auto teams fill up to `size` from then on. */
export const make = mutation({
  args: { size: v.union(v.literal(1), v.literal(2), v.literal(3)) },
  handler: async (ctx, { size }) => {
    await requireOfficer(ctx);
    const s = await upgradeOldNight(ctx, await requireOpenSession(ctx));
    if ((await unscoredCards(ctx, s)).length) throw new ConvexError("Finish the round first: reveal its answers, then switch.");
    await ctx.db.patch(s._id, { teamSize: size });
    for (const t of await sessionTeams(ctx, s._id)) await ctx.db.delete(t._id);
    const all = await sessionAttendance(ctx, s._id);
    for (const a of all) if (a.teamId && !inTeamPool(a)) await ctx.db.patch(a._id, { teamId: undefined });
    const att = shuffle(all.filter(inTeamPool));
    if (!att.length) return;
    const n = size === 1 ? att.length : Math.max(1, size === 3 ? Math.ceil(att.length / 3) : Math.floor(att.length / 2));
    const names = size === 1 ? await soloNames(ctx, att) : shuffle(TEAM_NAMES);
    const ids = [];
    const keys: string[] = [];
    for (let i = 0; i < n; i++) {
      keys.push(newTeamKey(keys));
      ids.push(await ctx.db.insert("teams", { sessionId: s._id, name: names[i % names.length], score: 0, key: keys[i] }));
    }
    for (let i = 0; i < att.length; i++) await ctx.db.patch(att[i]._id, { teamId: ids[i % n] });
    // Nobody's points are lost: each new team starts from its players' average, and they keep their own totals.
    for (let i = 0; i < n; i++) {
      const pts = att.filter((_, j) => j % n === i).map((a) => a.points ?? 0);
      await ctx.db.patch(ids[i], { score: Math.round(pts.reduce((x, y) => x + y, 0) / pts.length) });
    }
  },
});

/** Solo team names for these players, in order: each one's own name, numbered when two share it. */
async function soloNames(ctx: QueryCtx, att: Doc<"attendance">[]) {
  const names: string[] = [];
  for (const a of att) names.push(soloName((await ctx.db.get(a.playerId))?.name ?? "Player", names));
  return names;
}

/** For a team computer: the team with this key tonight, or null. */
export const byKey = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const s = await openSession(ctx);
    const t = s && (await teamByKey(ctx, s._id, key));
    return t && { _id: t._id, name: t.name };
  },
});

export const add = mutation({
  args: {},
  handler: async (ctx) => {
    await requireOfficer(ctx);
    const s = await requireOpenSession(ctx);
    await newTeam(ctx, s._id);
  },
});

/** Auto teams on or off for tonight. Turning it on puts everyone still without a team onto one. */
export const setAuto = mutation({
  args: { on: v.boolean() },
  handler: async (ctx, { on }) => {
    await requireOfficer(ctx);
    const s = await requireOpenSession(ctx);
    await ctx.db.patch(s._id, { autoTeams: on ? undefined : false });
    if (!on) return;
    const session = { ...s, autoTeams: undefined };
    for (const a of await sessionAttendance(ctx, s._id))
      if (inTeamPool(a) && !a.teamId) {
        const name = (await ctx.db.get(a.playerId))?.name ?? "Player";
        await ctx.db.patch(a._id, { teamId: await teamFor(ctx, session, name) });
      }
  },
});

export const rename = mutation({
  args: { teamId: v.id("teams"), name: v.string() },
  handler: async (ctx, { teamId, name }) => {
    await requireOfficer(ctx);
    const n = name.trim().slice(0, 32);
    if (n) await ctx.db.patch(teamId, { name: n });
  },
});

export const remove = mutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    await requireOfficer(ctx);
    const s = await requireOpenSession(ctx);
    for (const a of await sessionAttendance(ctx, s._id)) if (a.teamId === teamId) await ctx.db.patch(a._id, { teamId: undefined });
    await ctx.db.delete(teamId);
  },
});

/** Positive points double while "Double points" is on. */
export const score = mutation({
  args: { teamId: v.id("teams"), delta: v.number() },
  handler: async (ctx, { teamId, delta }) => {
    await requireOfficer(ctx);
    const s = await requireOpenSession(ctx);
    const t = await ctx.db.get(teamId);
    if (!t || t.sessionId !== s._id) return;
    await award(ctx, teamId, delta > 0 && s.double ? delta * 2 : delta);
  },
});

export const resetScores = mutation({
  args: {},
  handler: async (ctx) => {
    await requireOfficer(ctx);
    const s = await requireOpenSession(ctx);
    for (const t of await sessionTeams(ctx, s._id)) await ctx.db.patch(t._id, { score: 0 });
    for (const a of await sessionAttendance(ctx, s._id)) if (a.points) await ctx.db.patch(a._id, { points: 0 });
    await ctx.db.patch(s._id, { double: false });
  },
});

export const move = mutation({
  args: { attendanceId: v.id("attendance"), teamId: v.union(v.id("teams"), v.null()) },
  handler: async (ctx, { attendanceId, teamId }) => {
    await requireOfficer(ctx);
    const a = await ctx.db.get(attendanceId);
    const session = a && (await ctx.db.get(a.sessionId));
    if (!a || !session || a.teamId === (teamId ?? undefined)) return;
    const s = await upgradeOldNight(ctx, session);
    const me = (await ctx.db.get(a._id))!;
    if (teamId) await joinTeam(ctx, s, me, teamId);
    else await leaveTeam(ctx, s, me);
    // Putting an officer on a team means they're playing tonight.
    if (a.officer) await ctx.db.patch(a._id, { playing: !!teamId });
  },
});

export const bonus = mutation({
  args: { attendanceId: v.id("attendance"), delta: v.number() },
  handler: async (ctx, { attendanceId, delta }) => {
    await requireOfficer(ctx);
    const a = await ctx.db.get(attendanceId);
    if (a) await ctx.db.patch(attendanceId, { bonusXp: Math.max(0, a.bonusXp + delta) });
  },
});

/** For anyone without a phone: an officer adds them by name and email. */
export const addPlayer = mutation({
  args: { name: v.string(), email: v.string() },
  handler: async (ctx, { name, email }) => {
    await requireOfficer(ctx);
    const s = await requireOpenSession(ctx);
    await addToSession(ctx, s, name, email);
  },
});

export const removePlayer = mutation({
  args: { attendanceId: v.id("attendance") },
  handler: async (ctx, { attendanceId }) => {
    await requireOfficer(ctx);
    const a = await ctx.db.get(attendanceId);
    const s = a && (await ctx.db.get(a.sessionId));
    if (a && s) await leaveTeam(ctx, s, a);
    await ctx.db.delete(attendanceId);
  },
});
