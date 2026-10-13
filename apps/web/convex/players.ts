import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { addToSession } from "./lib";
import { IDEA_MAX, cleanIdea } from "../src/lib/ideas";

/** Members join from their phone with tonight's code. No account needed. First-timers can share an idea for the club too. */
export const join = mutation({
  args: { code: v.string(), name: v.string(), email: v.string(), broughtBy: v.optional(v.string()), idea: v.optional(v.string()) },
  handler: async (ctx, { code, name, email, broughtBy, idea }) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
      .first();
    if (!session || session.status !== "open") throw new ConvexError("That code isn’t live. Check the code on the TV.");
    const token = await addToSession(ctx, session, name, email, broughtBy);
    // Saved even for a returning member: ideas are welcome.
    const text = cleanIdea(idea ?? "").slice(0, IDEA_MAX);
    if (text) {
      const a = await ctx.db
        .query("attendance")
        .withIndex("by_token", (q) => q.eq("token", token))
        .unique();
      if (a) await ctx.db.insert("ideas", { playerId: a.playerId, sessionId: session._id, text, createdAt: Date.now() });
    }
    return token;
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

    // Practice nights don't count toward season XP.
    const all = await ctx.db
      .query("attendance")
      .withIndex("by_player", (q) => q.eq("playerId", a.playerId))
      .collect();
    const nights = await Promise.all(all.map((h) => ctx.db.get(h.sessionId)));
    const history = all.filter((_, i) => nights[i] && !nights[i].practice);
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
          _id: mine._id,
          name: mine.name,
          score: mine.score,
          rank: 1 + teams.filter((t) => t.score > mine.score).length,
          of: teams.length,
          members: names,
        };
      }
    }
    return {
      name: player.name,
      ended: session.status === "ended",
      week: session.week,
      practice: !!session.practice,
      team,
      seasonXp,
      weeks: history.length,
    };
  },
});
