import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireOfficer } from "./officers";
import { openSession, requireOpenSession, sessionTeams } from "./lib";
import { cardStart, isOpen, liveCard } from "./answers";
import { puzzleCard } from "./puzzles";
import { FIXES } from "../src/lib/fixes";
import { cardKey, fixAwardsFor } from "../src/lib/grading";

// Fix it for real: each team's computer runs the tests in the browser and reports here once they all pass.
// The scoring rules live in src/lib/grading.ts so the officer test page scores the same way.

/** The Fix it for real card on the TV, if any. */
export function fixCard(s: Doc<"sessions">) {
  const { mode, game, index } = s.screen;
  if (mode !== "card" || game !== "fix" || index === undefined || !FIXES[index]) return null;
  return { index, key: cardKey("fix", index) };
}

/** The card on the TV that teams answer against the clock: a phone-answered card, a Fix it for real card, or a puzzle. */
export const timedCard = (s: Doc<"sessions">) => liveCard(s) ?? fixCard(s) ?? puzzleCard(s);

/** Tonight's fixes for a card in the order they came in, leaving out teams that no longer exist. */
async function cardFixes(ctx: QueryCtx, s: Doc<"sessions">, card: string) {
  const [teams, rows] = await Promise.all([
    sessionTeams(ctx, s._id),
    ctx.db
      .query("fixes")
      .withIndex("by_session_card", (q) => q.eq("sessionId", s._id).eq("card", card))
      .collect(),
  ]);
  const names = new Map(teams.map((t) => [t._id, t.name]));
  const fixed = rows
    .filter((r) => names.has(r.teamId))
    .sort((a, b) => a.at - b.at || a._creationTime - b._creationTime)
    .map((r) => ({ ...r, name: names.get(r.teamId)! }));
  return { teams, fixed };
}

/** A team computer reports that its fix passes every test. The first report per team counts; later ones are ignored. */
export const report = mutation({
  args: { teamId: v.id("teams"), card: v.string(), code: v.string() },
  handler: async (ctx, { teamId, card, code }) => {
    const s = await requireOpenSession(ctx);
    const team = await ctx.db.get(teamId);
    if (!team || team.sessionId !== s._id) throw new ConvexError("That team isn’t playing tonight. Pick your team again.");
    const c = fixCard(s);
    if (!c || c.key !== card) throw new ConvexError("That card isn’t up anymore.");
    if (!isOpen(s, c.key)) throw new ConvexError("Time’s up. Fixes are closed for this card.");
    if (code.length > 20_000) throw new ConvexError("That program is too long.");
    const row = await ctx.db
      .query("fixes")
      .withIndex("by_team_card", (q) => q.eq("teamId", teamId).eq("card", card))
      .unique();
    if (!row) await ctx.db.insert("fixes", { sessionId: s._id, teamId, card, at: Date.now(), code });
  },
});

/** For the TV, phones, and team computers: who has fixed the card on the TV, in order, and their points once scored. No code. */
export const board = query({
  args: {},
  handler: async (ctx) => {
    const s = await openSession(ctx);
    const c = s && fixCard(s);
    if (!s || !c) return null;
    const { teams, fixed } = await cardFixes(ctx, s, c.key);
    const start = cardStart(s, c.key);
    return {
      card: c.key,
      teams: teams.length,
      scored: (s.scored ?? []).includes(c.key),
      fixed: fixed.map((r) => ({
        teamId: r.teamId,
        name: r.name,
        ms: start === undefined ? null : Math.max(0, r.at - start),
        result: r.result ?? null,
      })),
    };
  },
});

/** For /host: every team's status on the card, with the code that passed. */
export const host = query({
  args: {},
  handler: async (ctx) => {
    await requireOfficer(ctx);
    const s = await openSession(ctx);
    const c = s && fixCard(s);
    if (!s || !c) return null;
    const { teams, fixed } = await cardFixes(ctx, s, c.key);
    const start = cardStart(s, c.key);
    return {
      card: c.key,
      scored: (s.scored ?? []).includes(c.key),
      teams: teams.map((t) => {
        const r = fixed.find((x) => x.teamId === t._id);
        return {
          _id: t._id,
          name: t.name,
          fixed: !!r,
          first: !!r && fixed[0] === r,
          ms: r && start !== undefined ? Math.max(0, r.at - start) : null,
          code: r?.code ?? null,
          result: r?.result ?? null,
        };
      }),
    };
  },
});

/** Score the revealed Fix it for real card, once per card per night. Called by sessions.setScreen. */
export async function scoreFixReveal(ctx: MutationCtx, s: Doc<"sessions">) {
  const c = fixCard(s);
  if (!c || !s.screen.revealed) return;
  const { fixed } = await cardFixes(ctx, s, c.key);
  const r = fixAwardsFor({
    index: c.index,
    double: s.double,
    scored: s.scored ?? [],
    fixes: fixed.map((row) => ({ id: row, at: row.at })),
  });
  if (!r) return;
  for (const { id: row, first, points } of r.awards) {
    const team = await ctx.db.get(row.teamId);
    if (!team) continue;
    await ctx.db.patch(row._id, { result: { points, first } });
    await ctx.db.patch(team._id, { score: team.score + points });
  }
  await ctx.db.patch(s._id, { scored: r.scored });
}
