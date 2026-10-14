import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireOfficer } from "./officers";
import { openSession, requireOpenSession, sessionTeams } from "./lib";
import { cardStart, isOpen } from "./answers";
import { wikiAwardsFor, wikiKey, wikiPlaces } from "../src/lib/grading";

// Wiki Race: any teammate taps "We made it!" on a phone (Fewest Clicks: sends the click count), the referee checks it on
// /host, and the race is scored when it ends. The scoring rules live in src/lib/grading.ts so the test page scores the same way.

/** The Wiki Race on the TV, if any. */
export function wikiCard(s: Doc<"sessions">) {
  const { mode, wikiFrom, wikiTo, wikiClicks } = s.screen;
  if (mode !== "wiki" || !wikiFrom || !wikiTo) return null;
  return { key: wikiKey(wikiFrom, wikiTo), clicks: !!wikiClicks };
}

/** Tonight's rows for a race, leaving out teams that no longer exist. Finishes come first, in the order they came in. */
async function raceRows(ctx: QueryCtx, s: Doc<"sessions">, card: string) {
  const [teams, rows] = await Promise.all([
    sessionTeams(ctx, s._id),
    ctx.db
      .query("races")
      .withIndex("by_session_card", (q) => q.eq("sessionId", s._id).eq("card", card))
      .collect(),
  ]);
  const names = new Map(teams.map((t) => [t._id, t.name]));
  const finished = rows
    .filter((r) => names.has(r.teamId) && r.at !== undefined)
    .sort((a, b) => a.at! - b.at! || a._creationTime - b._creationTime)
    .map((r) => ({ ...r, at: r.at!, name: names.get(r.teamId)! }));
  return { teams, rows, finished };
}

/** The finishes that count so far (not turned down by the referee), for live places and for scoring. */
const counted = <T extends { ok?: boolean }>(finished: T[]) => finished.filter((r) => r.ok !== false);

/** The team behind a phone, checked against the race on the TV. */
async function teamRace(ctx: MutationCtx, token: string, card: string) {
  const a = await ctx.db
    .query("attendance")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  const s = a && (await ctx.db.get(a.sessionId));
  if (!a || !s || s.status !== "open") throw new ConvexError("This night has ended.");
  if (!a.teamId) throw new ConvexError("You’re not on a team yet.");
  const w = wikiCard(s);
  if (!w || w.key !== card) throw new ConvexError("That race isn’t up anymore.");
  if (s.screen.revealed || (s.scored ?? []).includes(w.key)) throw new ConvexError("This race is over.");
  const name = (await ctx.db.get(a.playerId))?.name ?? "Someone";
  const row = await ctx.db
    .query("races")
    .withIndex("by_team_card", (q) => q.eq("teamId", a.teamId!).eq("card", card))
    .unique();
  return { s, w, teamId: a.teamId, name, row };
}

/** "We made it!" for the whole team. The first tap counts; after the referee says "not yet," the next one starts over. */
export const finish = mutation({
  args: { token: v.string(), card: v.string(), clicks: v.optional(v.number()) },
  handler: async (ctx, { token, card, clicks }) => {
    const { s, w, teamId, name, row } = await teamRace(ctx, token, card);
    if (s.screen.wikiReady) throw new ConvexError("The race hasn’t started yet.");
    if (!isOpen(s, w.key)) throw new ConvexError("Time’s up. The race is closed.");
    if (w.clicks && (clicks === undefined || !Number.isInteger(clicks) || clicks < 1 || clicks > 999))
      throw new ConvexError("Enter your click count, like 7.");
    if (row?.at !== undefined && row.ok !== false) return;
    const patch = { at: Date.now(), by: name, clicks: w.clicks ? clicks : undefined, ok: undefined };
    if (row) await ctx.db.patch(row._id, patch);
    else await ctx.db.insert("races", { sessionId: s._id, teamId, card, ...patch });
  },
});

/** Take back a "We made it!" tapped by mistake, until the referee has checked it. */
export const undo = mutation({
  args: { token: v.string(), card: v.string() },
  handler: async (ctx, { token, card }) => {
    const { row } = await teamRace(ctx, token, card);
    if (!row) return;
    if (row.ok === true) throw new ConvexError("The referee already checked it, so it stays.");
    await ctx.db.delete(row._id);
  },
});

/** The referee's check on a team's finish: it counts (true), not there yet (false), or unchecked (null). */
export const check = mutation({
  args: { teamId: v.id("teams"), card: v.string(), ok: v.union(v.boolean(), v.null()) },
  handler: async (ctx, { teamId, card, ok }) => {
    await requireOfficer(ctx);
    const s = await requireOpenSession(ctx);
    const w = wikiCard(s);
    if (!w || w.key !== card) throw new ConvexError("That race isn’t up anymore.");
    if ((s.scored ?? []).includes(w.key)) throw new ConvexError("This race is already scored. Use the score buttons to fix anything.");
    const row = await ctx.db
      .query("races")
      .withIndex("by_team_card", (q) => q.eq("teamId", teamId).eq("card", card))
      .unique();
    if (!row || row.at === undefined) throw new ConvexError("That team hasn’t finished.");
    await ctx.db.patch(row._id, { ok: ok ?? undefined });
  },
});

/**
 * For the TV, phones, and /host: the race on the TV, the finishes in order with their times, live places, and the
 * referee's checks, then every team's points once it's scored.
 */
export const board = query({
  args: {},
  handler: async (ctx) => {
    const s = await openSession(ctx);
    const w = s && wikiCard(s);
    if (!s || !w) return null;
    const { teams, rows, finished } = await raceRows(ctx, s, w.key);
    const start = cardStart(s, w.key);
    const ok = counted(finished);
    const places = wikiPlaces(ok, w.clicks);
    const results = new Map(rows.map((r) => [r.teamId, r.result]));
    return {
      card: w.key,
      clicks: w.clicks,
      teams: teams.length,
      scored: (s.scored ?? []).includes(w.key),
      finished: finished.map((r) => ({
        teamId: r.teamId,
        name: r.name,
        by: r.by ?? null,
        ms: start === undefined ? null : Math.max(0, r.at - start),
        clicks: r.clicks ?? null,
        ok: r.ok ?? null,
        place: r.ok === false ? null : places[ok.indexOf(r)],
        result: r.result ?? null,
      })),
      // Every team, best first, once scored.
      results: (s.scored ?? []).includes(w.key)
        ? teams
            .map((t) => ({ teamId: t._id, name: t.name, result: results.get(t._id) ?? null }))
            .sort((a, b) => (b.result?.points ?? 0) - (a.result?.points ?? 0) || (a.result?.place ?? 99) - (b.result?.place ?? 99))
        : null,
    };
  },
});

/** Score the ended race, once per race per night: by place, or 1 for playing. Called by sessions.setScreen on reveal. */
export async function scoreWikiReveal(ctx: MutationCtx, s: Doc<"sessions">) {
  const w = wikiCard(s);
  if (!w || !s.screen.revealed) return;
  const { teams, rows, finished } = await raceRows(ctx, s, w.key);
  const r = wikiAwardsFor<Id<"teams">>({
    key: w.key,
    clicks: w.clicks,
    double: s.double,
    scored: s.scored ?? [],
    teams: teams.map((t) => t._id),
    finishes: counted(finished).map((f) => ({ team: f.teamId, at: f.at, clicks: f.clicks })),
  });
  if (!r) return;
  for (const { team: teamId, place, points } of r.awards) {
    const team = teams.find((t) => t._id === teamId)!;
    const row = rows.find((x) => x.teamId === teamId);
    const result = { points, place: place ?? undefined };
    if (row) await ctx.db.patch(row._id, { result });
    else await ctx.db.insert("races", { sessionId: s._id, teamId, card: w.key, result });
    await ctx.db.patch(team._id, { score: team.score + points });
  }
  await ctx.db.patch(s._id, { scored: r.scored });
}
