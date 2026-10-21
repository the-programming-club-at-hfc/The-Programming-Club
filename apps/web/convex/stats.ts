import { query } from "./_generated/server";
import { bonusList, inTeamPool } from "./lib";
import { isOfficerEmail } from "./officers";

/** Season high scores: XP per player with each night's show-up, place, and bonus XP (and what each bonus was for). Names only.
 *  Practice nights don't count, and officers only when they played. */
export const leaderboard = query({
  args: {},
  handler: async (ctx) => {
    const sessions = (await ctx.db.query("sessions").collect()).filter((s) => !s.practice);
    const weekOf = new Map(sessions.map((s) => [s._id, s.week]));
    const byPlayer = new Map<
      string,
      { week: number; show: number; place: number; bonus: number; bonuses: { xp: number; why: string }[] }[]
    >();
    for (const a of await ctx.db.query("attendance").collect()) {
      const week = weekOf.get(a.sessionId);
      if (week === undefined || !inTeamPool(a)) continue;
      byPlayer.set(a.playerId, [
        ...(byPlayer.get(a.playerId) ?? []),
        { week, show: a.showXp, place: a.placeXp ?? 0, bonus: a.bonusXp, bonuses: bonusList(a) },
      ]);
    }
    const players = await ctx.db.query("players").collect();
    return players
      .filter((p) => byPlayer.has(p._id))
      .map((p) => {
        const nights = byPlayer.get(p._id)!.sort((a, b) => a.week - b.week);
        const xp = nights.reduce((n, x) => n + x.show + x.place + x.bonus, 0);
        // Officers and the advisor (OFFICER_EMAILS) wear Officer instead of Founder or Rookie. Only the flag leaves, never the email.
        const officer = isOfficerEmail(p.email);
        const first = nights[0].week;
        return { name: p.name, xp, weeks: nights.length, officer, founder: !officer && first === 1, rookie: !officer && first > 1, nights };
      })
      .sort((a, b) => b.xp - a.xp || b.weeks - a.weeks || a.name.localeCompare(b.name));
  },
});
