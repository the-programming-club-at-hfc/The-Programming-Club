import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";

// Events that take hearts. Add an id here when a new event app goes on the home page.
const EVENTS = new Set(["hack-the-nest-2026"]);

const check = (event: string, voter: string) => {
  if (!EVENTS.has(event)) throw new ConvexError("Unknown event.");
  if (!/^[\w-]{8,64}$/.test(voter)) throw new ConvexError("Bad voter id.");
};

const mineFor = (ctx: QueryCtx, event: string, voter: string) =>
  ctx.db
    .query("interest")
    .withIndex("by_event_voter", (q) => q.eq("event", event).eq("voter", voter))
    .unique();

/** How many people are interested, and whether this browser is one of them. */
export const get = query({
  args: { event: v.string(), voter: v.string() },
  handler: async (ctx, { event, voter }) => {
    check(event, voter);
    const all = await ctx.db
      .query("interest")
      .withIndex("by_event_voter", (q) => q.eq("event", event))
      .collect();
    return { count: all.length, mine: all.some((r) => r.voter === voter) };
  },
});

export const toggle = mutation({
  args: { event: v.string(), voter: v.string() },
  handler: async (ctx, { event, voter }) => {
    check(event, voter);
    const mine = await mineFor(ctx, event, voter);
    if (mine) await ctx.db.delete(mine._id);
    else await ctx.db.insert("interest", { event, voter });
  },
});
