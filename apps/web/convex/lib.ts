import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { WEEKS } from "../src/lib/content";

export const openSession = (ctx: QueryCtx) =>
  ctx.db
    .query("sessions")
    .withIndex("by_status", (q) => q.eq("status", "open"))
    .order("desc")
    .first();

export async function requireOpenSession(ctx: QueryCtx) {
  const s = await openSession(ctx);
  if (!s) throw new ConvexError("No game is running. Start tonight’s week first.");
  return s;
}

export const sessionTeams = (ctx: QueryCtx, sessionId: Id<"sessions">) =>
  ctx.db
    .query("teams")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();

export const sessionAttendance = (ctx: QueryCtx, sessionId: Id<"sessions">) =>
  ctx.db
    .query("attendance")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();

export const randomToken = () => Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 8)).join("");

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanPlayer(name: string, email: string) {
  const n = name.trim().replace(/\s+/g, " ");
  const e = email.trim().toLowerCase();
  if (n.length < 1 || n.length > 40) throw new ConvexError("Enter your name (up to 40 characters).");
  if (!EMAIL.test(e)) throw new ConvexError("Enter a valid email, like jsmith@hawkmail.hfcc.edu.");
  return { name: n, email: e };
}

/** Add a player to the session (or return their existing spot). Late joiners go on the smallest team. */
export async function addToSession(ctx: MutationCtx, session: Doc<"sessions">, name: string, email: string, broughtBy?: string) {
  const p = cleanPlayer(name, email);
  let player = await ctx.db
    .query("players")
    .withIndex("by_email", (q) => q.eq("email", p.email))
    .unique();
  // An existing player keeps their name, so nobody can rename a classmate by typing their email.
  if (!player) {
    const id = await ctx.db.insert("players", { ...p, createdAt: Date.now() });
    player = (await ctx.db.get(id))!;
  }

  const existing = await ctx.db
    .query("attendance")
    .withIndex("by_session_player", (q) => q.eq("sessionId", session._id).eq("playerId", player._id))
    .unique();
  if (existing) return existing.token;

  const prior = await ctx.db
    .query("attendance")
    .withIndex("by_player", (q) => q.eq("playerId", player._id))
    .first();

  const teams = await sessionTeams(ctx, session._id);
  let teamId: Id<"teams"> | undefined;
  if (teams.length) {
    const att = await sessionAttendance(ctx, session._id);
    const size = (t: Id<"teams">) => att.filter((a) => a.teamId === t).length;
    teamId = teams.reduce((best, t) => (size(t._id) < size(best._id) ? t : best))._id;
  }

  const token = randomToken();
  await ctx.db.insert("attendance", {
    sessionId: session._id,
    playerId: player._id,
    teamId,
    token,
    joinedAt: Date.now(),
    firstTime: !prior,
    broughtBy: broughtBy?.trim().slice(0, 40) || undefined,
    showXp: WEEKS[session.week - 1]?.showXp ?? 3,
    bonusXp: 0,
  });
  return token;
}

/** Place XP by team rank; ties share the higher place. Teams with 0 points earn nothing. */
export function placeXpFor(teams: Doc<"teams">[]) {
  const xp = new Map<Id<"teams">, number>();
  for (const t of teams) {
    const rank = 1 + teams.filter((o) => o.score > t.score).length;
    xp.set(t._id, t.score > 0 ? ([0, 3, 2, 1][rank] ?? 0) : 0);
  }
  return xp;
}
