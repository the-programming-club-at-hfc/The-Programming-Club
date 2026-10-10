import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { addToSession } from "./lib";

/** Members join from their phone with tonight's code. No account needed. */
export const join = mutation({
  args: { code: v.string(), name: v.string(), email: v.string(), broughtBy: v.optional(v.string()) },
  handler: async (ctx, { code, name, email, broughtBy }) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
      .first();
    if (!session || session.status !== "open") throw new ConvexError("That code isn’t live. Check the code on the TV.");
    return addToSession(ctx, session, name, email, broughtBy);
  },
});

/** A member's own view: their team, its rank, and their XP so far. */
export const me = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const a = await ctx.db
      .query("attendance")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!a) return null;
    const [session, player] = await Promise.all([ctx.db.get(a.sessionId), ctx.db.get(a.playerId)]);
    if (!session || !player) return null;

    const history = await ctx.db
      .query("attendance")
      .withIndex("by_player", (q) => q.eq("playerId", a.playerId))
      .collect();
    const seasonXp = history.reduce((n, h) => n + h.showXp + (h.placeXp ?? 0) + h.bonusXp, 0);

    let team = null;
    if (a.teamId) {
      const teams = await ctx.db
        .query("teams")
        .withIndex("by_session", (q) => q.eq("sessionId", a.sessionId))
        .collect();
      const mine = teams.find((t) => t._id === a.teamId);
      if (mine) {
        const mates = await ctx.db
          .query("attendance")
          .withIndex("by_session", (q) => q.eq("sessionId", a.sessionId))
          .collect();
        const names = await Promise.all(
          mates.filter((m) => m.teamId === mine._id).map(async (m) => (await ctx.db.get(m.playerId))?.name ?? "?"),
        );
        team = {
          name: mine.name,
          score: mine.score,
          rank: 1 + teams.filter((t) => t.score > mine.score).length,
          of: teams.length,
          members: names,
        };
      }
    }
    return { name: player.name, ended: session.status === "ended", week: session.week, team, seasonXp, weeks: history.length };
  },
});
