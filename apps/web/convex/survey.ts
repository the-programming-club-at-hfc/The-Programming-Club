import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { isOfficerEmail, requireOfficer } from "./officers";
import { cleanAnswers, surveyProblem } from "../src/lib/survey";
import { isHfcEmail } from "../src/lib/season";

const answersV = {
  interests: v.array(v.string()),
  experience: v.string(),
  languages: v.array(v.string()),
  frequency: v.string(),
  locations: v.array(v.string()),
  free: v.array(v.number()),
  barriers: v.array(v.string()),
  channels: v.array(v.string()),
  note: v.string(),
};

const responseOf = (ctx: QueryCtx, email: string) =>
  ctx.db
    .query("survey")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

const playerOf = (ctx: QueryCtx, email: string) =>
  ctx.db
    .query("players")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

const answersOf = ({ interests, experience, languages, frequency, locations, free, barriers, channels, note }: Doc<"survey">) => ({
  interests,
  experience,
  languages,
  frequency,
  locations,
  free,
  barriers,
  channels,
  note,
});

/** The member signed in on this page: who they are, and their answers if they've sent some. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const email = identity?.email?.toLowerCase();
    if (!email) return null;
    const row = await responseOf(ctx, email);
    const name = row?.name ?? (await playerOf(ctx, email))?.name ?? identity?.name?.trim().slice(0, 40) ?? "";
    return {
      email,
      hfc: isHfcEmail(email) || isOfficerEmail(email),
      name,
      answers: row && answersOf(row),
      updatedAt: row?.updatedAt ?? null,
    };
  },
});

/** Sends the signed-in member's answers, replacing any they sent before. */
export const save = mutation({
  args: { name: v.string(), ...answersV },
  handler: async (ctx, { name: rawName, ...raw }) => {
    const email = (await ctx.auth.getUserIdentity())?.email?.toLowerCase();
    if (!email) throw new ConvexError("You’re signed out. Sign in with your HawkMail to send your answers.");
    if (!isHfcEmail(email) && !isOfficerEmail(email))
      throw new ConvexError("Sign in with your HawkMail (@hawkmail.hfcc.edu). The club is for HFC students.");
    const name = rawName.trim().replace(/\s+/g, " ");
    if (name.length < 1 || name.length > 40) throw new ConvexError("Enter your name (up to 40 characters).");
    const problem = surveyProblem(raw);
    if (problem) throw new ConvexError(problem);
    const answers = cleanAnswers(raw);
    const now = Date.now();
    const row = await responseOf(ctx, email);
    if (row) await ctx.db.patch(row._id, { name, ...answers, updatedAt: now });
    else await ctx.db.insert("survey", { email, name, ...answers, createdAt: now, updatedAt: now });
  },
});

/** Officers: every response with how many real meetings that member came to, and the members who haven't answered yet. */
export const results = query({
  args: {},
  handler: async (ctx) => {
    await requireOfficer(ctx);
    const [rows, players, sessions, attendance] = await Promise.all([
      ctx.db.query("survey").collect(),
      ctx.db.query("players").collect(),
      ctx.db.query("sessions").collect(),
      ctx.db.query("attendance").collect(),
    ]);
    const real = new Set(sessions.filter((s) => !s.practice).map((s) => s._id));
    const nights = new Map<string, number>();
    for (const a of attendance) if (real.has(a.sessionId) && !a.officer) nights.set(a.playerId, (nights.get(a.playerId) ?? 0) + 1);
    const byEmail = new Map(players.map((p) => [p.email, p]));
    const nightsOf = (email: string) => {
      const p = byEmail.get(email);
      return p ? (nights.get(p._id) ?? 0) : 0;
    };
    const answered = new Set(rows.map((r) => r.email));
    return {
      responses: rows
        .map((r) => ({ name: r.name, email: r.email, ...answersOf(r), nights: nightsOf(r.email), updatedAt: r.updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt),
      // Everyone who's joined a game night, minus officers. They're who the survey email goes to.
      waiting: players
        .filter((p) => !answered.has(p.email) && !isOfficerEmail(p.email))
        .map((p) => ({ name: p.name, email: p.email, nights: nightsOf(p.email) }))
        .sort((a, b) => b.nights - a.nights || a.name.localeCompare(b.name)),
    };
  },
});
