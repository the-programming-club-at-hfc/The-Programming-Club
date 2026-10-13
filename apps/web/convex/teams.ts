import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireOfficer } from "./officers";
import { addToSession, inTeamPool, requireOpenSession, sessionAttendance, sessionTeams, shuffle } from "./lib";
import { TEAM_NAMES } from "./teamNames";

const unusedName = (taken: string[]) => shuffle(TEAM_NAMES).find((n) => !taken.includes(n)) ?? `Team ${taken.length + 1}`;

/** Shuffle everyone into teams of `size` (sizes differ by at most one, nobody solo). Resets tonight's teams.
 *  Officers running the night stay off the teams. */
export const make = mutation({
  args: { size: v.union(v.literal(2), v.literal(3)) },
  handler: async (ctx, { size }) => {
    await requireOfficer(ctx);
    const s = await requireOpenSession(ctx);
    for (const t of await sessionTeams(ctx, s._id)) await ctx.db.delete(t._id);
    const all = await sessionAttendance(ctx, s._id);
    for (const a of all) if (a.teamId && !inTeamPool(a)) await ctx.db.patch(a._id, { teamId: undefined });
    const att = shuffle(all.filter(inTeamPool));
    if (!att.length) return;
    const n = Math.max(1, size === 3 ? Math.ceil(att.length / 3) : Math.floor(att.length / 2));
    const names = shuffle(TEAM_NAMES);
    const ids = [];
    for (let i = 0; i < n; i++) ids.push(await ctx.db.insert("teams", { sessionId: s._id, name: names[i % names.length], score: 0 }));
    for (let i = 0; i < att.length; i++) await ctx.db.patch(att[i]._id, { teamId: ids[i % n] });
  },
});

export const add = mutation({
  args: {},
  handler: async (ctx) => {
    await requireOfficer(ctx);
    const s = await requireOpenSession(ctx);
    const taken = (await sessionTeams(ctx, s._id)).map((t) => t.name);
    await ctx.db.insert("teams", { sessionId: s._id, name: unusedName(taken), score: 0 });
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
    await ctx.db.patch(teamId, { score: t.score + (delta > 0 && s.double ? delta * 2 : delta) });
  },
});

export const resetScores = mutation({
  args: {},
  handler: async (ctx) => {
    await requireOfficer(ctx);
    const s = await requireOpenSession(ctx);
    for (const t of await sessionTeams(ctx, s._id)) await ctx.db.patch(t._id, { score: 0 });
    await ctx.db.patch(s._id, { double: false });
  },
});

export const move = mutation({
  args: { attendanceId: v.id("attendance"), teamId: v.union(v.id("teams"), v.null()) },
  handler: async (ctx, { attendanceId, teamId }) => {
    await requireOfficer(ctx);
    const a = await ctx.db.get(attendanceId);
    if (!a) return;
    // Putting an officer on a team means they're playing tonight.
    await ctx.db.patch(attendanceId, { teamId: teamId ?? undefined, ...(a.officer && { playing: !!teamId }) });
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
    await ctx.db.delete(attendanceId);
  },
});
