import { query } from "./_generated/server";
import { liveCard } from "./answers";
import { openSession, sessionTeams } from "./lib";

/**
 * For the TV's haunted Bug Hunt: when each team locked its line and its fix, so the room sees who's done. Only times,
 * never a pick. Null unless a Bug Hunt card is on the TV.
 */
export const locks = query({
  args: {},
  handler: async (ctx) => {
    const s = await openSession(ctx);
    const c = s && liveCard(s);
    if (!s || !c || c.game !== "bug") return null;
    const [teams, rows] = await Promise.all([
      sessionTeams(ctx, s._id),
      ctx.db
        .query("answers")
        .withIndex("by_session_card", (q) => q.eq("sessionId", s._id).eq("card", c.key))
        .collect(),
    ]);
    const byTeam = new Map(rows.map((r) => [r.teamId, r]));
    return {
      card: c.key,
      teams: teams.map((t) => ({
        _id: t._id,
        name: t.name,
        lineAt: byTeam.get(t._id)?.lineLockedAt ?? null,
        fixAt: byTeam.get(t._id)?.lockedAt ?? null,
      })),
    };
  },
});
