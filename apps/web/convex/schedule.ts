import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireOfficer } from "./officers";
import { lineupItemV } from "./schema";

const WEEKS_IN_SEASON = 8;

const byWeek = (ctx: MutationCtx, week: number) =>
  ctx.db
    .query("weeks")
    .withIndex("by_week", (q) => q.eq("week", week))
    .unique();

/** Officer edits to the season plan. Public: every page reads it, so it leaves out who made each edit. */
export const weeks = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("weeks").collect();
    return rows.map(({ week, title, pitch, lesson, bonus, startsAt, cancelled, lineup }) => ({
      week,
      title,
      pitch,
      lesson,
      bonus,
      startsAt,
      cancelled,
      lineup,
    }));
  },
});

const clean = (s: string | undefined, max: number) => {
  const t = s?.trim() ?? "";
  if (t.length > max) throw new ConvexError(`Keep it under ${max} characters.`);
  return t;
};

export const save = mutation({
  args: {
    week: v.number(),
    title: v.string(),
    pitch: v.string(),
    lesson: v.optional(v.string()),
    bonus: v.optional(v.string()),
    startsAt: v.number(),
    cancelled: v.boolean(),
    lineup: v.array(lineupItemV),
  },
  handler: async (ctx, a) => {
    const email = await requireOfficer(ctx);
    if (!Number.isInteger(a.week) || a.week < 1 || a.week > WEEKS_IN_SEASON) throw new ConvexError("That week doesn’t exist.");
    const title = clean(a.title, 80);
    if (!title) throw new ConvexError("Give the week a title.");
    if (a.lineup.length > 12) throw new ConvexError("A night can have at most 12 games.");
    const lineup = a.lineup.map((g) => ({ label: clean(g.label, 80), double: g.double })).filter((g) => g.label);
    const doc = {
      week: a.week,
      title,
      pitch: clean(a.pitch, 400),
      lesson: clean(a.lesson, 400) || undefined,
      bonus: clean(a.bonus, 300) || undefined,
      startsAt: a.startsAt,
      cancelled: a.cancelled,
      lineup,
      updatedBy: email,
      updatedAt: Date.now(),
    };
    const existing = await byWeek(ctx, a.week);
    if (existing) await ctx.db.replace(existing._id, doc);
    else await ctx.db.insert("weeks", doc);
  },
});

/** Throw away a week's edits and go back to the original plan. */
export const reset = mutation({
  args: { week: v.number() },
  handler: async (ctx, { week }) => {
    await requireOfficer(ctx);
    const existing = await byWeek(ctx, week);
    if (existing) await ctx.db.delete(existing._id);
  },
});
