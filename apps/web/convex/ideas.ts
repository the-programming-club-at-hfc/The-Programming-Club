import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { requireOfficer } from "./officers";
import { IDEA_MAX, cleanIdea } from "../src/lib/ideas";

/** The phone's player, if they still get the one-time idea prompt: first time (no earlier real night) and never answered or skipped it.
 *  Practice nights use the same rule, so a brand-new member who first shows up at one is asked there, once. */
async function asked(ctx: QueryCtx, token: string) {
  const a = await ctx.db
    .query("attendance")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  const player = a && (await ctx.db.get(a.playerId));
  return a?.firstTime && player && !player.ideaPrompt ? { a, player } : null;
}

/** Whether this phone should show "One quick question". */
export const prompt = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => !!(await asked(ctx, token)),
});

export const send = mutation({
  args: { token: v.string(), text: v.string() },
  handler: async (ctx, { token, text }) => {
    const me = await asked(ctx, token);
    if (!me) throw new ConvexError("Thanks, we already have your answer.");
    const t = cleanIdea(text);
    if (!t) throw new ConvexError("Write an idea first, or tap Skip.");
    if (t.length > IDEA_MAX) throw new ConvexError(`Keep it under ${IDEA_MAX} characters.`);
    await ctx.db.insert("ideas", { playerId: me.player._id, sessionId: me.a.sessionId, text: t, createdAt: Date.now() });
    await ctx.db.patch(me.player._id, { ideaPrompt: "sent" });
  },
});

export const skip = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await asked(ctx, token);
    if (me) await ctx.db.patch(me.player._id, { ideaPrompt: "skipped" });
  },
});

/** Officers: every idea, newest first, with the member's name. */
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
