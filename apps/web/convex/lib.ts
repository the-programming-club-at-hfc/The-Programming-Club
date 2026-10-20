import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { WEEKS } from "../src/lib/content";
import { isOfficerEmail } from "./officers";
import { TEAM_NAMES } from "./teamNames";
import { placeOf } from "../src/lib/grading";

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

/** The night and team a join page speaks for (a phone, or a laptop joined with the same HawkMail), from its token. */
export async function teamByToken(ctx: QueryCtx, token: string) {
  const a = await ctx.db
    .query("attendance")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  const s = a && (await ctx.db.get(a.sessionId));
  if (!a || !s || s.status !== "open") throw new ConvexError("This night has ended.");
  if (!a.teamId) throw new ConvexError("You’re not on a team yet.");
  return { s, teamId: a.teamId };
}

/** Whether this check-in goes into teams and season XP: everyone except officers who are running the night. */
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

/** A solo player's team name: their own, numbered if another team already has it tonight ("Alex 2"). */
export const soloName = (name: string, taken: string[]) => {
  let n = name;
  for (let i = 2; taken.includes(n); i++) n = `${name} ${i}`;
  return n;
};

/** A new, empty team with its own name and team key. Given a player's name, a solo team named after them. */
export async function newTeam(ctx: MutationCtx, sessionId: Id<"sessions">, player?: string) {
  const teams = await sessionTeams(ctx, sessionId);
  const taken = teams.map((t) => t.name);
  return ctx.db.insert("teams", {
    sessionId,
    name: player ? soloName(player, taken) : unusedName(taken),
    score: 0,
    key: newTeamKey(teams.map((t) => t.key)),
  });
}

/**
 * Where a student who just joined goes. With auto teams (the default): on a solo night (also the default), a team of
 * their own named after them; otherwise the smallest team that isn't full (tonight's Make teams size), or a new one.
 * With auto teams off, no team until officers have made teams, then the smallest one (or their own, solo).
 */
export async function teamFor(ctx: MutationCtx, session: Doc<"sessions">, name: string) {
  const teams = await sessionTeams(ctx, session._id);
  const auto = session.autoTeams !== false;
  const full = session.teamSize ?? 2;
  if (full === 1) return auto || teams.length ? newTeam(ctx, session._id, name) : undefined;
  const att = await sessionAttendance(ctx, session._id);
  const size = (t: Id<"teams">) => att.filter((a) => a.teamId === t).length;
  const open = auto ? teams.filter((t) => size(t._id) < full) : teams;
  if (open.length) return open.reduce((best, t) => (size(t._id) < size(best._id) ? t : best))._id;
  return auto ? newTeam(ctx, session._id) : undefined;
}

/** Add a player to the session (or return their existing spot), on a team as teamFor decides.
 *  Officers (signed in, or by an email on OFFICER_EMAILS) check in playing, like everyone else; "Just hosting" on their
 *  join page takes them off the teams. */
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

  const teamId = await teamFor(ctx, session, player.name);

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
    ...(officer && { officer: true, playing: true }),
  });
  return token;
}

/** Tonight's cards that teams have answered, raced, fixed, starred, or guessed but that haven't been scored yet. Their rows
 *  belong to tonight's teams, so teams can't be remade until these are revealed. */
export async function unscoredCards(ctx: QueryCtx, s: Doc<"sessions">) {
  const keys = [...new Set([...(s.played ?? []), ...(s.card ? [s.card] : [])].map((w) => w.key))].filter(
    (k) => !(s.scored ?? []).includes(k),
  );
  const open = [];
  for (const card of keys)
    for (const table of ["answers", "fixes", "stars", "races", "guesses"] as const)
      if (
        await ctx.db
          .query(table)
          .withIndex("by_session_card", (q) => q.eq("sessionId", s._id).eq("card", card))
          .first()
      ) {
        open.push(card);
        break;
      }
  return open;
}

/** Nights from before players kept their own points: each player's points were their team's, and a night with no
 *  teamSize was a team night. Fill both in before anything that scores, moves players, or hands out place XP. */
export async function upgradeOldNight(ctx: MutationCtx, s: Doc<"sessions">) {
  if (s.playerPoints) return s;
  const teams = new Map((await sessionTeams(ctx, s._id)).map((t) => [t._id, t.score]));
  for (const a of await sessionAttendance(ctx, s._id)) if (a.teamId) await ctx.db.patch(a._id, { points: teams.get(a.teamId) ?? 0 });
  const up = { playerPoints: true, teamSize: s.teamSize ?? 2 } as const;
  await ctx.db.patch(s._id, up);
  return { ...s, ...up };
}

export const ROUND_OPEN = "Finish the round first: reveal the card they answered, then try again.";

/** Whether a team has answers, fixes, stars, a finish, or guesses in on a card tonight that hasn't been scored yet. */
export async function hasUnscored(ctx: QueryCtx, s: Doc<"sessions">, teamId: Id<"teams">) {
  for (const table of ["answers", "fixes", "stars", "races", "guesses"] as const)
    for (const row of await ctx.db
      .query(table)
      .withIndex("by_team_card", (q) => q.eq("teamId", teamId))
      .collect())
      if (!(s.scored ?? []).includes(row.card)) return true;
  return false;
}

/** Take a player off their team, keeping their own points. A team left empty goes too, so a solo player's old team
 *  never sits on the board (with their points) without them. */
export async function leaveTeam(ctx: MutationCtx, s: Doc<"sessions">, a: Doc<"attendance">) {
  if (!a.teamId) return;
  const empty = !(await sessionAttendance(ctx, s._id)).some((o) => o.teamId === a.teamId && o._id !== a._id);
  // Their answers in on a card not yet revealed would score nobody.
  if (empty && (await hasUnscored(ctx, s, a.teamId))) throw new ConvexError(ROUND_OPEN);
  await ctx.db.patch(a._id, { teamId: undefined });
  if (empty) await ctx.db.delete(a.teamId);
}

/** Put a player on a team (off theirs first). Alone on it, the team starts from the points they already earned. */
export async function joinTeam(ctx: MutationCtx, s: Doc<"sessions">, a: Doc<"attendance">, teamId: Id<"teams">) {
  await leaveTeam(ctx, s, a);
  await ctx.db.patch(a._id, { teamId });
  if ((await sessionAttendance(ctx, s._id)).filter((o) => o.teamId === teamId).length === 1)
    await ctx.db.patch(teamId, { score: a.points ?? 0 });
}

/** Add points to a team and to each player on it now, so a player's points survive teams being remade. */
export async function award(ctx: MutationCtx, teamId: Id<"teams">, points: number) {
  const team = await ctx.db.get(teamId);
  const s = team && (await ctx.db.get(team.sessionId));
  if (!team || !s || !points) return;
  await upgradeOldNight(ctx, s);
  await ctx.db.patch(team._id, { score: team.score + points });
  for (const a of await sessionAttendance(ctx, team.sessionId))
    if (a.teamId === team._id) await ctx.db.patch(a._id, { points: (a.points ?? 0) + points });
}

/** Place XP from each player's own points tonight: +3, +2, +1 for 1st to 3rd. 0 points, or no team, earns nothing. */
export function placeXpFor(att: Doc<"attendance">[]) {
  const all = att.filter((a) => a.teamId).map((a) => a.points ?? 0);
  const xp = new Map<Id<"attendance">, number>();
  for (const a of att) {
    const pts = a.points ?? 0;
    xp.set(a._id, a.teamId && pts > 0 ? ([0, 3, 2, 1][placeOf(pts, all)] ?? 0) : 0);
  }
  return xp;
}
