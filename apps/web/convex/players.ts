import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { addToSession, inTeamPool, joinTeam, leaveTeam, requireOpenSession, teamFor, upgradeOldNight } from "./lib";
import { placeOf } from "../src/lib/grading";
import { isOfficerEmail, requireOfficer } from "./officers";
import { IDEA_MAX, cleanIdea } from "../src/lib/ideas";
import { isHfcEmail } from "../src/lib/season";

async function sessionByCode(ctx: QueryCtx, code: string) {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .first();
  if (!session || session.status !== "open") throw new ConvexError("That code isn’t live. Check the code on the TV.");
  return session;
}

const playerByEmail = (ctx: QueryCtx, email: string) =>
  ctx.db
    .query("players")
    .withIndex("by_email", (q) => q.eq("email", email.trim().toLowerCase()))
    .unique();

/** A Clerk account name we can use as a player name as is, or undefined (missing, or longer than names can be). */
const usableName = (name: string | undefined) => {
  const n = name?.trim().replace(/\s+/g, " ");
  return n && n.length <= 40 ? n : undefined;
};

/** The email of the account signed in on this phone, lowercased, or null. */
async function accountEmail(ctx: QueryCtx) {
  return (await ctx.auth.getUserIdentity())?.email?.toLowerCase() ?? null;
}

/** Saves a member's idea for the club, unless they've already shared the same one. */
async function saveIdea(ctx: MutationCtx, token: string, sessionId: Id<"sessions">, idea: string | undefined) {
  const text = cleanIdea(idea ?? "").slice(0, IDEA_MAX);
  if (!text) return;
  const a = await ctx.db
    .query("attendance")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!a) return;
  const ideas = await ctx.db
    .query("ideas")
    .withIndex("by_player", (q) => q.eq("playerId", a.playerId))
    .collect();
  if (!ideas.some((i) => i.text === text)) await ctx.db.insert("ideas", { playerId: a.playerId, sessionId, text, createdAt: Date.now() });
}

/** Members join with an HFC email (officers can use any address on OFFICER_EMAILS). */
function requireHfcEmail(email: string) {
  if (!isHfcEmail(email) && !isOfficerEmail(email))
    throw new ConvexError("Use your HawkMail (@hawkmail.hfcc.edu). The club is for currently enrolled HFC students.");
}

/** Marks a player's email as one that joins by signing in. */
async function claimAccount(ctx: MutationCtx, email: string) {
  const p = await playerByEmail(ctx, email);
  if (p && !p.account) await ctx.db.patch(p._id, { account: true });
}

/** Members join from their phone with tonight's code. No account needed. First-timers can share an idea for the club too. */
export const join = mutation({
  args: { code: v.string(), name: v.string(), email: v.string(), broughtBy: v.optional(v.string()), idea: v.optional(v.string()) },
  handler: async (ctx, { code, name, email, broughtBy, idea }) => {
    const session = await sessionByCode(ctx, code);
    requireHfcEmail(email);
    // Once someone has joined signed in, their email only works signed in, so nobody can take their spot by typing it.
    if ((await playerByEmail(ctx, email))?.account && (await accountEmail(ctx)) !== email.trim().toLowerCase())
      throw new ConvexError("That email joins by signing in. Tap “Sign in” below.");
    const token = await addToSession(ctx, session, name, email, broughtBy);
    await saveIdea(ctx, token, session._id, idea);
    return token;
  },
});

/** The account signed in on this phone, for one-tap joining: its email, and its name if we know one. */
export const account = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const email = identity?.email?.toLowerCase();
    if (!email) return null;
    const player = await playerByEmail(ctx, email);
    return { email, name: player?.name ?? usableName(identity?.name) ?? null, officer: isOfficerEmail(email), hfc: isHfcEmail(email) };
  },
});

/** A signed-in member joins with tonight's code as their account: no typing their email, and nobody else can use it. */
export const joinSignedIn = mutation({
  args: { code: v.string(), name: v.optional(v.string()), broughtBy: v.optional(v.string()), idea: v.optional(v.string()) },
  handler: async (ctx, { code, name, broughtBy, idea }) => {
    const identity = await ctx.auth.getUserIdentity();
    const email = identity?.email?.toLowerCase();
    if (!email) throw new ConvexError("You’re signed out. Sign in again, or join with your name and HawkMail.");
    const session = await sessionByCode(ctx, code);
    requireHfcEmail(email);
    // An existing player keeps their name (addToSession), so `name` only matters the first time.
    const known = (await playerByEmail(ctx, email))?.name;
    const token = await addToSession(ctx, session, known ?? name ?? usableName(identity?.name) ?? "", email, broughtBy);
    await claimAccount(ctx, email);
    await saveIdea(ctx, token, session._id, idea);
    return token;
  },
});

/** A signed-in officer checks in to run the night: counted present, off the teams. */
export const checkInOfficer = mutation({
  args: { name: v.string(), email: v.string() },
  handler: async (ctx, { name, email }) => {
    const officerEmail = await requireOfficer(ctx);
    const session = await requireOpenSession(ctx);
    const token = await addToSession(ctx, session, name, email, undefined, true);
    // The sign-in proves the account's own email; a typed HawkMail can differ, so only that one is claimed.
    if (email.trim().toLowerCase() === officerEmail) await claimAccount(ctx, officerEmail);
    return token;
  },
});

/** An officer's "Play tonight" switch: on puts them on a team the way joining does, off takes them back off the teams. */
export const setPlaying = mutation({
  args: { token: v.string(), playing: v.boolean() },
  handler: async (ctx, { token, playing }) => {
    const a = await ctx.db
      .query("attendance")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    const session = a && (await ctx.db.get(a.sessionId));
    if (!a?.officer || session?.status !== "open") throw new ConvexError("Only officers can switch that, during the night.");
    const s = await upgradeOldNight(ctx, session);
    const me = (await ctx.db.get(a._id))!;
    if (!playing) await leaveTeam(ctx, s, me);
    else if (!me.teamId) {
      const teamId = await teamFor(ctx, s, (await ctx.db.get(a.playerId))?.name ?? "Player");
      if (teamId) await joinTeam(ctx, s, me, teamId);
    }
    await ctx.db.patch(a._id, { playing });
  },
});

/** A member's own view: their team, its rank, their XP so far, and tonight's. */
export const me = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const a = await ctx.db
      .query("attendance")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!a) return null;
    const [session, player] = await Promise.all([ctx.db.get(a.sessionId), ctx.db.get(a.playerId)]);
    if (!session || !player) return null;

    // Practice nights don't count toward season XP, and officer check-ins only when they played (same as the leaderboard).
    const all = await ctx.db
      .query("attendance")
      .withIndex("by_player", (q) => q.eq("playerId", a.playerId))
      .collect();
    const nights = await Promise.all(all.map((h) => ctx.db.get(h.sessionId)));
    const history = all.filter((h, i) => nights[i] && !nights[i].practice && inTeamPool(h));
    const seasonXp = history.reduce((n, h) => n + h.showXp + (h.placeXp ?? 0) + h.bonusXp, 0);

    let team = null;
    if (a.teamId) {
      const teams = await ctx.db
        .query("teams")
        .withIndex("by_session", (q) => q.eq("sessionId", a.sessionId))
        .collect();
      const mine = teams.find((t) => t._id === a.teamId);
      if (mine) {
        const mates = await ctx.db
          .query("attendance")
          .withIndex("by_session", (q) => q.eq("sessionId", a.sessionId))
          .collect();
        const names = await Promise.all(
          mates.filter((m) => m.teamId === mine._id).map(async (m) => (await ctx.db.get(m.playerId))?.name ?? "?"),
        );
        team = {
          _id: mine._id,
          name: mine.name,
          key: mine.key ?? null,
          score: mine.score,
          rank: placeOf(
            mine.score,
            teams.map((t) => t.score),
          ),
          of: teams.length,
          members: names,
        };
      }
    }
    return {
      name: player.name,
      ended: session.status === "ended",
      week: session.week,
      practice: !!session.practice,
      officer: !!a.officer,
      playing: !!a.playing,
      team,
      seasonXp,
      weeks: history.length,
      // This night's XP by the same rules (place XP lands when the night ends); null when it doesn't count.
      tonight: !session.practice && inTeamPool(a) ? { show: a.showXp, place: a.placeXp ?? 0, bonus: a.bonusXp } : null,
    };
  },
});
