import { query } from "./_generated/server";
import { requireOfficer } from "./officers";

/** Officers: every idea, newest first, with the member's name. Ideas come in with the join form (players.join). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireOfficer(ctx);
    const ideas = await ctx.db.query("ideas").withIndex("by_createdAt").order("desc").collect();
    return Promise.all(
      ideas.map(async (i) => ({
        _id: i._id,
        name: (await ctx.db.get(i.playerId))?.name ?? "?",
        createdAt: i.createdAt,
        text: i.text,
      })),
    );
  },
});
