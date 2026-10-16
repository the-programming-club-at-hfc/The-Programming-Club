import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireOfficer } from "./officers";
import {
  CODE_LETTERS,
  inTeamPool,
  unscoredCards,
  openSession,
  placeXpFor,
  requireOpenSession,
  sessionAttendance,
  sessionTeams,
  upgradeOldNight,
} from "./lib";
import { screenV } from "./schema";
import { scoreReveal } from "./answers";
import { scoreFixReveal, timedCard } from "./fixes";
import { scorePuzzleReveal, scoreUnrevealedPuzzles } from "./puzzles";
import { scoreWikiReveal } from "./wiki";
import { drawCard, scoreDrawReveal, scoreUnrevealedDrawings } from "./drawings";
import type { Doc } from "./_generated/dataModel";
import { clockLeft, isFreshStart, settle, showCard, wikiKey } from "../src/lib/grading";
import type { CardWindow } from "../src/lib/grading";

/** The card (or race, or drawing) on the TV that teams answer against the clock. */
const upCard = (s: Doc<"sessions">) => timedCard(s) ?? drawCard(s);

/** The card windows with the clock's run-out time recorded, before anything changes the clock or the screen. */
function settled(s: Doc<"sessions">, now: number) {
  return { card: s.card && settle([s.card], s.timer, now)[0], played: settle(s.played ?? [], s.timer, now) };
}

/** Everything the TV and phones need. Names only: emails never leave officer queries, and the join code
 *  stays off this public query so nobody can join without seeing the TV in the room. */
export const live = query({
  args: {},
  handler: async (ctx) => {
    const s = await openSession(ctx);
    if (!s) return null;
    const [teams, all] = await Promise.all([sessionTeams(ctx, s._id), sessionAttendance(ctx, s._id)]);
    // Officers running the night aren't players on the TV.
    const att = all.filter(inTeamPool);
    const players = await Promise.all(att.map((a) => ctx.db.get(a.playerId)));
    const roster = att.map((a, i) => ({ name: players[i]?.name ?? "?", teamId: a.teamId ?? null, firstTime: a.firstTime }));
    return {
      _id: s._id,
      week: s.week,
      double: s.double,
      screen: s.screen,
      timer: s.timer,
      sound: s.sound ?? { music: true, volume: 0.8 },
      card: s.card ?? null,
      scored: s.scored ?? [],
      practice: !!s.practice,
      round: s.round ?? null,
      autoTeams: s.autoTeams !== false,
      teamSize: s.teamSize ?? 2,
      // Cards with answers in that haven't been revealed yet ("game:index" or a race): teams stay put until they are.
      unrevealed: await unscoredCards(ctx, s),
      teams: teams
        .map((t) => ({ _id: t._id, name: t.name, score: t.score, members: roster.filter((r) => r.teamId === t._id).map((r) => r.name) }))
        .sort((a, b) => b.score - a.score),
      roster,
    };
  },
});

/** The last night that ended: final standings and the place XP each team's players earned (none on practice nights).
 *  Names only, like `live`. The TV shows it after End night, and phones look up their XP for it. */
export const final = query({
  args: {},
  handler: async (ctx) => {
    // The night that ended last, which isn't the newest one when an older night was reopened and ended again.
    const ended = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "ended"))
      .collect();
    const s = ended.reduce<(typeof ended)[number] | null>((a, b) => (!a || (b.endedAt ?? 0) > (a.endedAt ?? 0) ? b : a), null);
    if (!s) return null;
    const [teams, att] = await Promise.all([sessionTeams(ctx, s._id), sessionAttendance(ctx, s._id)]);
    // What End night stored, the same numbers phones and /scores show.
    const roster = await Promise.all(
      att
        .filter((a) => a.teamId)
        .map(async (a) => ({ name: (await ctx.db.get(a.playerId))?.name ?? "?", teamId: a.teamId, xp: a.placeXp ?? 0 })),
    );
    return {
      _id: s._id,
      week: s.week,
      endedAt: s.endedAt ?? s.startedAt,
      practice: !!s.practice,
      solo: s.teamSize === 1,
      teams: teams
        .map((t) => {
          const members = roster.filter((r) => r.teamId === t._id);
          // Teammates share their place XP unless teams were remade mid-night; then each player's shows by their name.
          const same = members.every((m) => m.xp === members[0].xp);
          return {
            _id: t._id,
            name: t.name,
            score: t.score,
            xp: s.practice ? undefined : same ? (members[0]?.xp ?? 0) : undefined,
            members: members.map((m) => (s.practice || same ? m.name : `${m.name} +${m.xp}`)),
          };
        })
        .sort((a, b) => b.score - a.score),
    };
  },
});

/** Tonight's join code, for officer screens only (the TV, /host, and the kickoff slides). */
export const joinCode = query({
  args: {},
  handler: async (ctx) => {
    await requireOfficer(ctx);
    return (await openSession(ctx))?.code ?? null;
  },
});

export const start = mutation({
  args: { week: v.number(), practice: v.optional(v.boolean()) },
  handler: async (ctx, { week, practice }) => {
    await requireOfficer(ctx);
    const existing = await openSession(ctx);
    if (existing) return existing._id;
    let code = "";
    do {
      code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join("");
    } while (
      await ctx.db
        .query("sessions")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first()
    );
    return ctx.db.insert("sessions", {
      week,
      code,
      status: "open",
      startedAt: Date.now(),
      double: false,
      screen: { mode: "lobby" },
      timer: { durationMs: 90_000, remainingMs: 90_000, relay: false },
      practice: practice || undefined,
      teamSize: 1,
      playerPoints: true,
    });
  },
});

/** Close the night: score any puzzle or drawing that was never revealed, then award place XP from the final standings. */
export const end = mutation({
  args: {},
  handler: async (ctx) => {
    await requireOfficer(ctx);
    const s = await upgradeOldNight(ctx, await requireOpenSession(ctx));
    await scoreUnrevealedPuzzles(ctx, s);
    // Read again: scoring puzzles added to `scored`.
    await scoreUnrevealedDrawings(ctx, (await ctx.db.get(s._id))!);
    const att = await sessionAttendance(ctx, s._id);
    const xp = placeXpFor(att);
    for (const a of att) await ctx.db.patch(a._id, { placeXp: xp.get(a._id) ?? 0 });
    await ctx.db.patch(s._id, { status: "ended", endedAt: Date.now() });
  },
});

/** Undo an accidental "End night". */
export const reopen = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    await requireOfficer(ctx);
    if (await openSession(ctx)) throw new ConvexError("Another night is already running.");
    const s = await ctx.db.get(sessionId);
    if (s) await upgradeOldNight(ctx, s);
    await ctx.db.patch(sessionId, { status: "open", endedAt: undefined });
  },
});

/** Put something on the TV, keeping each card's answer window, and score a reveal. */
async function putScreen(ctx: MutationCtx, s: Doc<"sessions">, screen: Doc<"sessions">["screen"]) {
  const card =
    screen.mode === "card" && screen.game && screen.index !== undefined
      ? `${screen.game}:${screen.index}`
      : screen.mode === "wiki" && screen.wikiFrom && screen.wikiTo
        ? wikiKey(screen.wikiFrom, screen.wikiTo)
        : null;
  const shown = s.shown ?? [];
  const next = { ...s, screen, shown: card && !shown.includes(card) ? [...shown, card] : shown };
  // Each answerable card keeps its own window; anything else going up clears the current one.
  const now = Date.now();
  const w = showCard({ ...settled(s, now), up: upCard(next)?.key, now, double: s.double });
  Object.assign(next, { card: w.card, played: w.played });
  await ctx.db.patch(s._id, { screen, shown: next.shown, card: w.card, played: w.played });
  // Revealing scores phone answers, Fix it for real fixes, puzzle stars, a Wiki Race, or a drawing, once per card.
  await scoreReveal(ctx, next);
  await scoreFixReveal(ctx, next);
  await scorePuzzleReveal(ctx, next);
  await scoreWikiReveal(ctx, next);
  await scoreDrawReveal(ctx, next);
}

export const setScreen = mutation({
  args: { screen: screenV },
  handler: async (ctx, { screen }) => {
    await requireOfficer(ctx);
    await putScreen(ctx, await requireOpenSession(ctx), screen);
  },
});

/**
 * Play a lineup round: double points follow the round (on for a double-points round, off otherwise). With a title,
 * the round's name goes up on the TV too.
 */
export const setRound = mutation({
  args: { round: v.number(), double: v.boolean(), title: v.optional(v.string()) },
  handler: async (ctx, { round, double, title }) => {
    await requireOfficer(ctx);
    const s = await requireOpenSession(ctx);
    await ctx.db.patch(s._id, { round, double });
    if (title) await putScreen(ctx, { ...s, round, double }, { mode: "message", message: title.slice(0, 120) });
  },
});

export const setDouble = mutation({
  args: { on: v.boolean() },
  handler: async (ctx, { on }) => {
    await requireOfficer(ctx);
    const s = await requireOpenSession(ctx);
    await ctx.db.patch(s._id, { double: on });
  },
});

export const setSound = mutation({
  args: { music: v.optional(v.boolean()), volume: v.optional(v.number()) },
  handler: async (ctx, { music, volume }) => {
    await requireOfficer(ctx);
    const s = await requireOpenSession(ctx);
    const cur = s.sound ?? { music: true, volume: 0.8 };
    await ctx.db.patch(s._id, {
      sound: { music: music ?? cur.music, volume: volume === undefined ? cur.volume : Math.max(0, Math.min(1, volume)) },
    });
  },
});

export const timer = mutation({
  args: {
    action: v.union(v.literal("set"), v.literal("toggle"), v.literal("pause"), v.literal("reset"), v.literal("add"), v.literal("relay")),
    seconds: v.optional(v.number()),
    relay: v.optional(v.boolean()),
    autostart: v.optional(v.boolean()),
  },
  handler: async (ctx, { action, seconds, relay, autostart }) => {
    await requireOfficer(ctx);
    const s = await requireOpenSession(ctx);
    const now = Date.now();
    const t = { ...s.timer };
    const remaining = Math.max(0, clockLeft(t, now));
    const card = upCard(s)?.key;
    let { card: w, played } = settled(s, now);
    switch (action) {
      case "set": {
        const ms = Math.round((seconds ?? 90) * 1000);
        Object.assign(t, { durationMs: ms, remainingMs: ms, startedAt: autostart ? now : undefined, card: autostart ? card : undefined });
        if (relay !== undefined) t.relay = relay;
        break;
      }
      case "toggle":
        if (t.startedAt) Object.assign(t, { remainingMs: remaining, startedAt: undefined });
        else Object.assign(t, remaining > 0 ? { startedAt: now } : { remainingMs: t.durationMs, startedAt: now }, { card });
        break;
      // Stop a running clock, and only that (the Next button pauses at the reveal).
      case "pause":
        if (t.startedAt) Object.assign(t, { remainingMs: remaining, startedAt: undefined });
        break;
      case "reset":
        Object.assign(t, { remainingMs: t.durationMs, startedAt: undefined });
        break;
      case "add": {
        // Restart from now so +30s also works after the clock has hit 0:00. That's more time for the card, so its
        // answers reopen, but it never restarts the early-bonus window.
        Object.assign(t, { remainingMs: remaining + 30_000, startedAt: t.startedAt ? now : undefined });
        t.durationMs = Math.max(t.durationMs, remaining + 30_000);
        const more = (x: CardWindow) => (x.key === t.card ? { ...x, endedAt: undefined } : x);
        w = w && more(w);
        played = played.map(more);
        break;
      }
      case "relay":
        t.relay = !t.relay;
        break;
    }
    // A fresh clock on an answerable card restarts its window: early-bonus clock and closing time. It keeps its double points.
    if (w && card === w.key && !(s.scored ?? []).includes(card) && isFreshStart(action, t, now))
      w = { key: card, at: now, double: w.double };
    await ctx.db.patch(s._id, { timer: t, card: w, played });
  },
});

/** Officer view of tonight: players, emails, teams, and bonuses. */
export const host = query({
  args: {},
  handler: async (ctx) => {
    await requireOfficer(ctx);
    const s = await openSession(ctx);
    const recent = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "ended"))
      .order("desc")
      .take(12);
    if (!s) return { session: null, recent };

    const att = await sessionAttendance(ctx, s._id);
    // Practice nights don't use up cards.
    const all = await ctx.db.query("sessions").collect();
    const used = [...new Set(all.flatMap((x) => (x.practice ? [] : (x.shown ?? []))))];

    const rows = await Promise.all(
      att.map(async (a) => {
        const p = await ctx.db.get(a.playerId);
        return {
          _id: a._id,
          name: p?.name ?? "?",
          email: p?.email ?? "",
          teamId: a.teamId ?? null,
          firstTime: a.firstTime,
          broughtBy: a.broughtBy ?? null,
          bonusXp: a.bonusXp,
          officer: !!a.officer,
        };
      }),
    );
    rows.sort((a, b) => a.name.localeCompare(b.name));
    const keys = Object.fromEntries((await sessionTeams(ctx, s._id)).map((t) => [t._id, t.key ?? null]));
    return { session: s, rows, recent, used, keys };
  },
});

/** Rows for the Student Activities sign-in sheet (Full Name, Email, Status/Title) plus team and XP. */
export const attendanceExport = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    await requireOfficer(ctx);
    const s = await ctx.db.get(sessionId);
    if (!s) throw new ConvexError("That night doesn’t exist.");
    if (s.practice) throw new ConvexError("Practice nights don’t count for attendance, so there’s nothing to export.");
    const teams = new Map((await sessionTeams(ctx, sessionId)).map((t) => [t._id, t.name]));
    const att = await sessionAttendance(ctx, sessionId);
    const rows = await Promise.all(
      att.map(async (a) => {
        const p = await ctx.db.get(a.playerId);
        const email = p?.email ?? "";
        return {
          name: p?.name ?? "",
          email,
          status: email.endsWith("@hawkmail.hfcc.edu") ? "HFC student" : email.endsWith("@hfcc.edu") ? "HFC staff" : "Guest",
          team: a.teamId ? (teams.get(a.teamId) ?? "") : "",
          firstTime: a.firstTime,
          broughtBy: a.broughtBy ?? "",
          xp: a.showXp + (a.placeXp ?? 0) + a.bonusXp,
        };
      }),
    );
    return { week: s.week, startedAt: s.startedAt, rows: rows.sort((a, b) => a.name.localeCompare(b.name)) };
  },
});
