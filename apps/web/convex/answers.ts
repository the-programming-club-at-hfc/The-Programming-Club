import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireOfficer } from "./officers";
import { openSession, sessionTeams } from "./lib";
import { BUGS } from "../src/lib/content";
import { GRACE_MS, LANGUAGES, answersOpen, awardsFor, cardKey, choices, isAnswerGame } from "../src/lib/grading";

// Phone answers for Bug Hunt, Output?, and Guess the Language: one answer per team, scored on reveal.
// The rules live in src/lib/grading.ts so the officer test page scores the same way.

/** The answerable card on the TV, if any. */
export function liveCard(s: Doc<"sessions">) {
  const { mode, game, index } = s.screen;
  if (mode !== "card" || !isAnswerGame(game) || index === undefined) return null;
  return { game, index, key: cardKey(game, index) };
}

/** When the card's clock started: when it went up, or when the timer was started for it. */
export const cardStart = (s: Doc<"sessions">, key: string) => (s.card?.key === key ? s.card.at : undefined);

function isOpen(s: Doc<"sessions">, key: string) {
  const t = s.timer;
  return answersOpen({
    revealed: !!s.screen.revealed,
    scored: (s.scored ?? []).includes(key),
    cardAt: cardStart(s, key),
    timer: t,
    remaining: t.startedAt ? t.remainingMs - (Date.now() - t.startedAt) : t.remainingMs,
    grace: GRACE_MS,
  });
}

const answerFor = (ctx: QueryCtx, teamId: Doc<"teams">["_id"], card: string) =>
  ctx.db
    .query("answers")
    .withIndex("by_team_card", (q) => q.eq("teamId", teamId).eq("card", card))
    .unique();

const cardAnswers = (ctx: QueryCtx, s: Doc<"sessions">, card: string) =>
  ctx.db
    .query("answers")
    .withIndex("by_session_card", (q) => q.eq("sessionId", s._id).eq("card", card))
    .collect();

/** A team's pick as phones see it: no lock times, just who did what. */
const view = (r: Doc<"answers"> | null) =>
  r && {
    line: r.line,
    lineBy: r.lineBy,
    lineLocked: r.lineLockedAt !== undefined,
    lineLockedBy: r.lineLockedBy,
    choice: r.choice,
    choiceBy: r.choiceBy,
    locked: r.lockedAt !== undefined,
    lockedBy: r.lockedBy,
  };

/** The player behind a phone, checked against the card on the TV and the answer window. */
async function teamAnswer(ctx: MutationCtx, token: string, card: string) {
  const a = await ctx.db
    .query("attendance")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  const s = a && (await ctx.db.get(a.sessionId));
  if (!a || !s || s.status !== "open") throw new ConvexError("This night has ended.");
  if (!a.teamId) throw new ConvexError("You’re not on a team yet.");
  const c = liveCard(s);
  if (!c || c.key !== card) throw new ConvexError("That card isn’t up anymore.");
  if (!isOpen(s, c.key)) throw new ConvexError("Answers are closed for this card.");
  const name = (await ctx.db.get(a.playerId))?.name ?? "Someone";
  return { s, c, teamId: a.teamId, name, row: await answerFor(ctx, a.teamId, c.key) };
}

/** Change the team's pick: a Bug Hunt line, or a choice (Output? answer, language, or Bug Hunt fix). */
export const pick = mutation({
  args: { token: v.string(), card: v.string(), line: v.optional(v.number()), choice: v.optional(v.string()) },
  handler: async (ctx, { token, card, line, choice }) => {
    const { s, c, teamId, name, row } = await teamAnswer(ctx, token, card);
    let patch;
    if (line !== undefined) {
      if (c.game !== "bug" || !Number.isInteger(line) || line < 1 || line > BUGS[c.index].code.split("\n").length)
        throw new ConvexError("Pick a line from the card.");
      if (row?.lineLockedAt !== undefined) throw new ConvexError("Your team already locked in a line.");
      patch = { line, lineBy: name };
    } else if (choice !== undefined) {
      if (!(c.game === "lang" ? LANGUAGES : choices(c.game, c.index)).includes(choice)) throw new ConvexError("Pick one of the choices.");
      if (c.game === "bug" && row?.lineLockedAt === undefined) throw new ConvexError("Lock in a line first.");
      if (row?.lockedAt !== undefined) throw new ConvexError("Your team already locked in.");
      patch = { choice, choiceBy: name };
    } else return;
    if (row) await ctx.db.patch(row._id, patch);
    else await ctx.db.insert("answers", { sessionId: s._id, teamId, card, ...patch });
  },
});

/** Lock the team's pick. Final for the whole team. Bug Hunt locks the line first, then the fix. */
export const lock = mutation({
  args: { token: v.string(), card: v.string(), step: v.union(v.literal("line"), v.literal("answer")) },
  handler: async (ctx, { token, card, step }) => {
    const { c, name, row } = await teamAnswer(ctx, token, card);
    if (step === "line") {
      if (c.game !== "bug" || row?.line === undefined) throw new ConvexError("Pick a line first.");
      if (row.lineLockedAt === undefined) await ctx.db.patch(row._id, { lineLockedAt: Date.now(), lineLockedBy: name });
    } else {
      if (row?.choice === undefined) throw new ConvexError("Pick an answer first.");
      if (row.lockedAt === undefined) await ctx.db.patch(row._id, { lockedAt: Date.now(), lockedBy: name });
    }
  },
});

/** A phone's view of its team's answer to the card on the TV, and its result after the reveal. */
export const mine = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const a = await ctx.db
      .query("attendance")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    const s = a && (await ctx.db.get(a.sessionId));
    if (!a?.teamId || !s || s.status !== "open") return null;
    const c = liveCard(s);
    if (!c) return null;
    const row = await answerFor(ctx, a.teamId, c.key);
    return { card: c.key, pick: view(row), result: row?.result ?? null };
  },
});

/** For the TV: how many teams have locked in, and after the reveal, who got what. Never shows picks early. */
export const board = query({
  args: {},
  handler: async (ctx) => {
    const s = await openSession(ctx);
    const c = s && liveCard(s);
    if (!s || !c) return null;
    const [teams, rows] = await Promise.all([sessionTeams(ctx, s._id), cardAnswers(ctx, s, c.key)]);
    const byTeam = new Map(rows.map((r) => [r.teamId, r]));
    const scored = (s.scored ?? []).includes(c.key);
    return {
      card: c.key,
      teams: teams.length,
      locked: teams.filter((t) => byTeam.get(t._id)?.lockedAt !== undefined).length,
      results: scored
        ? teams
            .map((t) => ({ _id: t._id, name: t.name, result: byTeam.get(t._id)?.result ?? null }))
            .sort((x, y) => (y.result?.points ?? 0) - (x.result?.points ?? 0))
        : null,
    };
  },
});

/** For /host: each team's status on the card, its pick and lock time, and points after the reveal. */
export const host = query({
  args: {},
  handler: async (ctx) => {
    await requireOfficer(ctx);
    const s = await openSession(ctx);
    const c = s && liveCard(s);
    if (!s || !c) return null;
    const [teams, rows] = await Promise.all([sessionTeams(ctx, s._id), cardAnswers(ctx, s, c.key)]);
    const start = cardStart(s, c.key);
    return {
      card: c.key,
      scored: (s.scored ?? []).includes(c.key),
      teams: teams.map((t) => {
        const r = rows.find((x) => x.teamId === t._id) ?? null;
        return {
          _id: t._id,
          name: t.name,
          pick: view(r),
          result: r?.result ?? null,
          lockMs: r?.lockedAt !== undefined && start !== undefined ? r.lockedAt - start : null,
        };
      }),
    };
  },
});

/** Score the revealed card from tonight's phone answers, once per card per night. Called by sessions.setScreen. */
export async function scoreReveal(ctx: MutationCtx, s: Doc<"sessions">) {
  const c = liveCard(s);
  if (!c || !s.screen.revealed) return;
  const rows = await cardAnswers(ctx, s, c.key);
  const r = awardsFor({
    game: c.game,
    index: c.index,
    start: cardStart(s, c.key) ?? 0,
    double: s.double,
    scored: s.scored ?? [],
    answers: rows.map((row) => ({ id: row, pick: row })),
  });
  if (!r) return;
  for (const { id: row, grade, points } of r.awards) {
    const team = await ctx.db.get(row.teamId);
    if (!team || team.sessionId !== s._id) continue;
    await ctx.db.patch(row._id, { result: { ...grade, points } });
    if (points) await ctx.db.patch(team._id, { score: team.score + points });
  }
  await ctx.db.patch(s._id, { scored: r.scored });
}
