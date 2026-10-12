import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOfficer } from "./officers";
import { openSession, placeXpFor, requireOpenSession, sessionAttendance, sessionTeams } from "./lib";
import { screenV } from "./schema";

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O

/** Everything the TV and phones need. Names only: emails never leave officer queries. */
export const live = query({
  args: {},
  handler: async (ctx) => {
    const s = await openSession(ctx);
    if (!s) return null;
    const [teams, att] = await Promise.all([sessionTeams(ctx, s._id), sessionAttendance(ctx, s._id)]);
    const players = await Promise.all(att.map((a) => ctx.db.get(a.playerId)));
    const roster = att.map((a, i) => ({ name: players[i]?.name ?? "?", teamId: a.teamId ?? null, firstTime: a.firstTime }));
    return {
      _id: s._id,
      week: s.week,
      code: s.code,
      double: s.double,
      screen: s.screen,
      timer: s.timer,
      sound: s.sound ?? { music: true, volume: 0.8 },
      teams: teams
        .map((t) => ({ _id: t._id, name: t.name, score: t.score, members: roster.filter((r) => r.teamId === t._id).map((r) => r.name) }))
        .sort((a, b) => b.score - a.score),
      roster,
    };
  },
});

export const start = mutation({
  args: { week: v.number() },
  handler: async (ctx, { week }) => {
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
    });
  },
});

/** Close the night: award place XP from the final standings. */
export const end = mutation({
  args: {},
  handler: async (ctx) => {
    await requireOfficer(ctx);
    const s = await requireOpenSession(ctx);
    const teams = await sessionTeams(ctx, s._id);
    const xp = placeXpFor(teams);
    for (const a of await sessionAttendance(ctx, s._id)) {
      await ctx.db.patch(a._id, { placeXp: a.teamId ? (xp.get(a.teamId) ?? 0) : 0 });
    }
    await ctx.db.patch(s._id, { status: "ended", endedAt: Date.now() });
  },
});

/** Undo an accidental "End night". */
export const reopen = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    await requireOfficer(ctx);
    if (await openSession(ctx)) throw new ConvexError("Another night is already running.");
    await ctx.db.patch(sessionId, { status: "open", endedAt: undefined });
  },
});

export const setScreen = mutation({
  args: { screen: screenV },
  handler: async (ctx, { screen }) => {
    await requireOfficer(ctx);
    const s = await requireOpenSession(ctx);
    await ctx.db.patch(s._id, { screen });
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
    action: v.union(v.literal("set"), v.literal("toggle"), v.literal("reset"), v.literal("add"), v.literal("relay")),
    seconds: v.optional(v.number()),
    relay: v.optional(v.boolean()),
    autostart: v.optional(v.boolean()),
  },
  handler: async (ctx, { action, seconds, relay, autostart }) => {
    await requireOfficer(ctx);
    const s = await requireOpenSession(ctx);
    const now = Date.now();
    const t = { ...s.timer };
    const remaining = t.startedAt ? Math.max(0, t.remainingMs - (now - t.startedAt)) : t.remainingMs;
    switch (action) {
      case "set": {
        const ms = Math.round((seconds ?? 90) * 1000);
        Object.assign(t, { durationMs: ms, remainingMs: ms, startedAt: autostart ? now : undefined });
        if (relay !== undefined) t.relay = relay;
        break;
      }
      case "toggle":
        if (t.startedAt) Object.assign(t, { remainingMs: remaining, startedAt: undefined });
        else Object.assign(t, remaining > 0 ? { startedAt: now } : { remainingMs: t.durationMs, startedAt: now });
        break;
      case "reset":
        Object.assign(t, { remainingMs: t.durationMs, startedAt: undefined });
        break;
      case "add":
        Object.assign(t, t.startedAt ? { remainingMs: t.remainingMs + 30_000 } : { remainingMs: remaining + 30_000 });
        t.durationMs = Math.max(t.durationMs, remaining + 30_000);
        break;
      case "relay":
        t.relay = !t.relay;
        break;
    }
    await ctx.db.patch(s._id, { timer: t });
  },
});

/** Officer view of tonight: emails, bonuses, and power-up counts for Cup nights. */
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
    const weekOf = new Map((await ctx.db.query("sessions").collect()).map((x) => [x._id, x.week]));
    const half = s.week === 4 ? [1, 2, 3] : s.week === 6 ? [1, 2, 3, 4, 5] : null;

    const rows = await Promise.all(
      att.map(async (a) => {
        const p = await ctx.db.get(a.playerId);
        let powerups: number | null = null;
        if (half) {
          const history = await ctx.db
            .query("attendance")
            .withIndex("by_player", (q) => q.eq("playerId", a.playerId))
            .collect();
          const n = history.filter((h) => half.includes(weekOf.get(h.sessionId) ?? 0)).length;
          powerups = Math.max(1, Math.min(3, n));
        }
        return {
          _id: a._id,
          name: p?.name ?? "?",
          email: p?.email ?? "",
          teamId: a.teamId ?? null,
          firstTime: a.firstTime,
          broughtBy: a.broughtBy ?? null,
          bonusXp: a.bonusXp,
          powerups,
        };
      }),
    );
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return { session: s, rows, recent };
  },
});

/** Rows for the Student Activities sign-in sheet (Full Name, Email, Status/Title) plus team and XP. */
export const attendanceExport = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    await requireOfficer(ctx);
    const s = await ctx.db.get(sessionId);
    if (!s) throw new ConvexError("That night doesn’t exist.");
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
          xp: a.showXp + (a.placeXp ?? 0) + a.bonusXp,
        };
      }),
    );
    return { week: s.week, startedAt: s.startedAt, rows: rows.sort((a, b) => a.name.localeCompare(b.name)) };
  },
});
