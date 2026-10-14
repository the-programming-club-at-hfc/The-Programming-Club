import { query } from "./_generated/server";
import { inTeamPool } from "./lib";

/** Season high scores: XP per player, names only. Practice nights don't count, and officers only when they played. */
export const leaderboard = query({
  args: {},
  handler: async (ctx) => {
    const sessions = (await ctx.db.query("sessions").collect()).filter((s) => !s.practice);
    const weekOf = new Map(sessions.map((s) => [s._id, s.week]));
    const byPlayer = new Map<string, { xp: number; weeks: number; firstWeek: number }>();
    for (const a of await ctx.db.query("attendance").collect()) {
      if (!weekOf.has(a.sessionId) || !inTeamPool(a)) continue;
      const cur = byPlayer.get(a.playerId) ?? { xp: 0, weeks: 0, firstWeek: 99 };
      cur.xp += a.showXp + (a.placeXp ?? 0) + a.bonusXp;
      cur.weeks += 1;
      cur.firstWeek = Math.min(cur.firstWeek, weekOf.get(a.sessionId) ?? 99);
      byPlayer.set(a.playerId, cur);
    }
    const players = await ctx.db.query("players").collect();
    return players
      .filter((p) => byPlayer.has(p._id))
      .map((p) => {
        const s = byPlayer.get(p._id)!;
        return { name: p.name, xp: s.xp, weeks: s.weeks, founder: s.firstWeek === 1, rookie: s.firstWeek > 1 };
      })
      .sort((a, b) => b.xp - a.xp || b.weeks - a.weeks || a.name.localeCompare(b.name));
  },
});
