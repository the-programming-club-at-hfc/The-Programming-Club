import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { WEEKS } from "../src/lib/content";
import { isOfficerEmail } from "./officers";
import { TEAM_NAMES } from "./teamNames";

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

export const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O
const randomCode = () => Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join("");

/** A team key no other team has tonight. */
export const newTeamKey = (taken: (string | undefined)[]) => {
  let key = randomCode();
  while (taken.includes(key)) key = randomCode();
  return key;
};

/** The team a team computer speaks for, from the key on the team's phones. */
export async function teamByKey(ctx: QueryCtx, sessionId: Id<"sessions">, key: string) {
  const k = key.trim().toUpperCase();
  return (await sessionTeams(ctx, sessionId)).find((t) => t.key === k) ?? null;
}

/** Whether this check-in goes into teams: everyone except officers who are running the night. */
export const inTeamPool = (a: Doc<"attendance">) => !a.officer || !!a.playing;

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

export const unusedName = (taken: string[]) => shuffle(TEAM_NAMES).find((n) => !taken.includes(n)) ?? `Team ${taken.length + 1}`;

/** A new, empty team with its own name and team key. */
export async function newTeam(ctx: MutationCtx, sessionId: Id<"sessions">) {
  const teams = await sessionTeams(ctx, sessionId);
  return ctx.db.insert("teams", {
    sessionId,
    name: unusedName(teams.map((t) => t.name)),
    score: 0,
    key: newTeamKey(teams.map((t) => t.key)),
  });
}

/** Auto teams fill each team up to this, then start a new one. */
const AUTO_TEAM_SIZE = 3;

/**
 * Where a student who just joined goes. With auto teams (the default), the smallest team that isn't full, or a new
 * one. With auto teams off, the smallest team once officers have made teams, and no team before that.
 */
export async function teamFor(ctx: MutationCtx, session: Doc<"sessions">) {
  const teams = await sessionTeams(ctx, session._id);
  const att = await sessionAttendance(ctx, session._id);
  const size = (t: Id<"teams">) => att.filter((a) => a.teamId === t).length;
  const auto = session.autoTeams !== false;
  const open = auto ? teams.filter((t) => size(t._id) < AUTO_TEAM_SIZE) : teams;
  if (open.length) return open.reduce((best, t) => (size(t._id) < size(best._id) ? t : best))._id;
  return auto ? newTeam(ctx, session._id) : undefined;
}

/** Add a player to the session (or return their existing spot), on a team as teamFor decides.
 *  Officers (signed in, or by an email on OFFICER_EMAILS) check in to run the night, off the teams. */
export async function addToSession(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  name: string,
  email: string,
  broughtBy?: string,
  signedInOfficer = false,
) {
  const p = cleanPlayer(name, email);
  const officer = signedInOfficer || isOfficerEmail(p.email);
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
  if (existing) {
    if (officer && !existing.officer) await ctx.db.patch(existing._id, { officer: true, playing: !!existing.teamId });
    return existing.token;
  }

  // First time means no earlier real night; practice nights don't count.
  const history = await ctx.db
    .query("attendance")
    .withIndex("by_player", (q) => q.eq("playerId", player._id))
    .collect();
  const prior = (await Promise.all(history.map((h) => ctx.db.get(h.sessionId)))).some((s) => s && !s.practice);

  const teamId = officer ? undefined : await teamFor(ctx, session);

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
    ...(officer && { officer: true, playing: false }),
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
