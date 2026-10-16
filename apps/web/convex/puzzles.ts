import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireOfficer } from "./officers";
import { award, openSession, requireOpenSession, sessionTeams, teamByKey, teamByToken } from "./lib";
import { cardStart, isOpen } from "./answers";
import { PUZZLES, puzzleSeed } from "../src/lib/puzzles";
import { LOCKOUT_MS, cardKey, firstStars, puzzleAwardsFor, submitAnswer } from "../src/lib/grading";

// Puzzles: each team gets its own input (from a seed), solves it, and types the answers in on a join page (phone or
// laptop) or a lab computer signed in with the team key.
// Answers are checked here by generating the team's input again and running the shared solver.
// The scoring rules live in src/lib/grading.ts so the officer test page scores the same way.

/** The puzzle on the TV, if any. */
export function puzzleCard(s: Doc<"sessions">) {
  const { mode, game, index } = s.screen;
  if (mode !== "card" || game !== "puzzle" || index === undefined || !PUZZLES[index]) return null;
  return { index, key: cardKey("puzzle", index) };
}

const keyIndex = (key: string) => (key.startsWith("puzzle:") ? Number(key.slice(7)) : undefined);

/** A team's answers to a puzzle tonight, from its own input. */
export function answersFor(sessionId: Id<"sessions">, teamId: Id<"teams">, index: number) {
  const p = PUZZLES[index];
  return p.solve(p.generate(puzzleSeed(sessionId, teamId, index)));
}

/** Tonight's star rows for a puzzle, oldest first, with the team's name, leaving out teams that no longer exist. */
async function cardStars(ctx: QueryCtx, s: Doc<"sessions">, card: string) {
  const [teams, rows] = await Promise.all([
    sessionTeams(ctx, s._id),
    ctx.db
      .query("stars")
      .withIndex("by_session_card", (q) => q.eq("sessionId", s._id).eq("card", card))
      .collect(),
  ]);
  const names = new Map(teams.map((t) => [t._id, t.name]));
  return { teams, rows: rows.filter((r) => names.has(r.teamId)).map((r) => ({ ...r, name: names.get(r.teamId)! })) };
}

/** Checks a team's answer to the puzzle on the TV. Wrong answers lock the team out for 30 seconds. */
async function answerPuzzle(
  ctx: MutationCtx,
  s: Doc<"sessions">,
  teamId: Id<"teams">,
  { card, part, answer }: { card: string; part: 1 | 2; answer: string },
) {
  const c = puzzleCard(s);
  if (!c || c.key !== card) throw new ConvexError("That puzzle isn’t up anymore.");
  if (!isOpen(s, c.key)) throw new ConvexError("Time’s up. Answers are closed for this puzzle.");
  if (!answer.trim()) throw new ConvexError("Type your answer first.");
  if (answer.length > 200) throw new ConvexError("That answer is too long.");
  const row = await ctx.db
    .query("stars")
    .withIndex("by_team_card", (q) => q.eq("teamId", teamId).eq("card", card))
    .unique();
  const now = Date.now();
  const stars = { part1At: row?.part1At, part2At: row?.part2At, lockedUntil: row?.lockedUntil, wrong: row?.wrong ?? 0 };
  const r = submitAnswer(stars, part, answer, () => answersFor(s._id, teamId, c.index)[`part${part}`], now);
  if (r.kind === "early") throw new ConvexError("Solve part 1 first.");
  if (r.kind === "locked") throw new ConvexError(`Wait ${Math.ceil(r.waitMs / 1000)}s, then try again.`);
  if (r.kind === "done") return { right: true, waitMs: 0 };
  const patch = { ...r.stars, lastWrong: r.kind === "wrong" ? answer.trim() : row?.lastWrong };
  if (row) await ctx.db.patch(row._id, patch);
  else await ctx.db.insert("stars", { sessionId: s._id, teamId, card, ...patch });
  return { right: r.kind === "right", waitMs: r.kind === "wrong" ? LOCKOUT_MS : 0 };
}

const answerArgs = { card: v.string(), part: v.union(v.literal(1), v.literal(2)), answer: v.string() };

/** A lab computer sends an answer, signed in with the team key from the team's phones. */
export const submit = mutation({
  args: { teamKey: v.string(), ...answerArgs },
  handler: async (ctx, { teamKey, ...a }) => {
    const s = await requireOpenSession(ctx);
    const team = await teamByKey(ctx, s._id, teamKey);
    if (!team) throw new ConvexError("That team key isn’t playing tonight. Enter the key from your phones again.");
    return answerPuzzle(ctx, s, team._id, a);
  },
});

/** A player's join page sends an answer, from a phone or a laptop. */
export const submitByToken = mutation({
  args: { token: v.string(), ...answerArgs },
  handler: async (ctx, { token, ...a }) => {
    const { s, teamId } = await teamByToken(ctx, token);
    return answerPuzzle(ctx, s, teamId, a);
  },
});

/**
 * For the TV, phones, and team computers: every team's stars on the puzzle on the TV, with times on the puzzle's clock
 * and points once it's scored. Never answers. Teams with the most stars come first, then whoever got them sooner.
 */
export const board = query({
  args: {},
  handler: async (ctx) => {
    const s = await openSession(ctx);
    const c = s && puzzleCard(s);
    if (!s || !c) return null;
    const { teams, rows } = await cardStars(ctx, s, c.key);
    const start = cardStart(s, c.key);
    // The puzzle's window starts when it goes up, so `start` is always there while it's on the TV.
    const ms = (at: number | undefined) => (at === undefined ? null : Math.max(0, at - (start ?? at)));
    const { first1, first2 } = firstStars(rows);
    const list = teams.map((t) => {
      const i = rows.findIndex((r) => r.teamId === t._id);
      const r = i === -1 ? undefined : rows[i];
      return {
        teamId: t._id,
        name: t.name,
        part1Ms: ms(r?.part1At),
        part2Ms: ms(r?.part2At),
        first1: i !== -1 && i === first1,
        first2: i !== -1 && i === first2,
        lockedUntil: r?.lockedUntil ?? null,
        result: r?.result ?? null,
      };
    });
    const stars = (x: (typeof list)[number]) => Number(x.part1Ms !== null) + Number(x.part2Ms !== null);
    const last = (x: (typeof list)[number]) => x.part2Ms ?? x.part1Ms ?? Infinity;
    list.sort((a, b) => stars(b) - stars(a) || last(a) - last(b));
    return { card: c.key, scored: (s.scored ?? []).includes(c.key), teams: list };
  },
});

/** For /host: the board plus each team's wrong answers. */
export const host = query({
  args: {},
  handler: async (ctx) => {
    await requireOfficer(ctx);
    const s = await openSession(ctx);
    const c = s && puzzleCard(s);
    if (!s || !c) return null;
    const { rows } = await cardStars(ctx, s, c.key);
    return { card: c.key, wrong: rows.map((r) => ({ teamId: r.teamId, wrong: r.wrong, lastWrong: r.lastWrong ?? null })) };
  },
});

/** For /host, on request: every team's right answers, to settle "but our answer is right!". */
export const answers = query({
  args: {},
  handler: async (ctx) => {
    await requireOfficer(ctx);
    const s = await openSession(ctx);
    const c = s && puzzleCard(s);
    if (!s || !c) return null;
    const teams = await sessionTeams(ctx, s._id);
    return { card: c.key, teams: teams.map((t) => ({ teamId: t._id, name: t.name, ...answersFor(s._id, t._id, c.index) })) };
  },
});

/** Score one puzzle from tonight's stars, once per puzzle per night. Returns the scored list. */
async function scorePuzzle(ctx: MutationCtx, s: Doc<"sessions">, index: number, scored: string[], double = s.double) {
  const { rows } = await cardStars(ctx, s, cardKey("puzzle", index));
  const r = puzzleAwardsFor({ index, double, scored, teams: rows.map((row) => ({ ...row, id: row })) });
  if (!r) return scored;
  for (const { id: row, first1, first2, points } of r.awards) {
    const team = await ctx.db.get(row.teamId);
    if (!team) continue;
    await ctx.db.patch(row._id, { result: { points, first1, first2 } });
    await award(ctx, team._id, points);
  }
  await ctx.db.patch(s._id, { scored: r.scored });
  return r.scored;
}

/** Score the revealed puzzle. Called by sessions.setScreen. */
export async function scorePuzzleReveal(ctx: MutationCtx, s: Doc<"sessions">) {
  const c = puzzleCard(s);
  if (c && s.screen.revealed) await scorePuzzle(ctx, s, c.index, s.scored ?? []);
}

/** Score every puzzle played tonight that was never revealed, so ending the night never loses stars. Called by sessions.end. */
export async function scoreUnrevealedPuzzles(ctx: MutationCtx, s: Doc<"sessions">) {
  let scored = s.scored ?? [];
  // Each puzzle keeps the double points it was played with, not whatever is on when the night ends.
  for (const w of [...(s.played ?? []), ...(s.card ? [s.card] : [])]) {
    const i = keyIndex(w.key);
    if (i !== undefined && PUZZLES[i]) scored = await scorePuzzle(ctx, s, i, scored, w.double ?? s.double);
  }
}
