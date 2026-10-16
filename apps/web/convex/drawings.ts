import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireOfficer } from "./officers";
import { award, inTeamPool, openSession, requireOpenSession, sessionAttendance, sessionTeams } from "./lib";
import { cardStart, isOpen } from "./answers";
import { PICTIONARY } from "../src/lib/content";
import { COLORS, GUESS_MAX, H, INK_BLOCK, MAX_INK_POINTS, MAX_INK_ROWS, SIZES, W, blanks } from "../src/lib/draw";
import { checkGuess, drawAwardsFor, drawKey } from "../src/lib/grading";

// Tech Pictionary: the server picks who draws and the word, the drawer's phone and the officer tablet draw on the same
// picture, everyone else guesses on their phones, and the drawing is scored at the reveal (or when the night ends).
// The word only ever goes to the drawer's phone and to officers until the reveal: never into `live` or a public query.

/** The drawing on the TV, if any. */
export function drawCard(s: Doc<"sessions">) {
  const { mode, drawing } = s.screen;
  if (mode !== "draw" || drawing === undefined) return null;
  return { n: drawing, key: drawKey(drawing) };
}

// Guesses per player per drawing: at most one a second, and this many in all.
const GUESS_GAP_MS = 1000;
const MAX_GUESSES = 60;

/** A word's key in `shown`, so later nights can skip it like a card. */
const wordKey = (i: number) => `pictionary:${i}`;

const byToken = (ctx: QueryCtx, token: string) =>
  ctx.db
    .query("attendance")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();

const nameOf = async (ctx: QueryCtx, id: Id<"attendance">) => {
  const a = await ctx.db.get(id);
  return (a && (await ctx.db.get(a.playerId))?.name) ?? "Someone";
};

const tonight = (ctx: QueryCtx, sessionId: Id<"sessions">) =>
  ctx.db
    .query("drawings")
    .withIndex("by_session_n", (q) => q.eq("sessionId", sessionId))
    .collect();

const drawingAt = (ctx: QueryCtx, sessionId: Id<"sessions">, n: number) =>
  ctx.db
    .query("drawings")
    .withIndex("by_session_n", (q) => q.eq("sessionId", sessionId).eq("n", n))
    .unique();

/** Tonight's players who can draw (on a team, not officers running the night), with how many times each has drawn. */
async function drawers(ctx: QueryCtx, s: Doc<"sessions">, done: Doc<"drawings">[]) {
  return (await sessionAttendance(ctx, s._id))
    .filter((a) => inTeamPool(a) && a.teamId)
    .map((a) => ({ a, drawn: done.filter((d) => d.drawer === a._id).length }));
}

// A shuffle for ties that's the same every time for drawing n, so /host can say who New drawing will pick.
const tie = (id: string, n: number) => {
  let h = 2166136261;
  for (const c of `${id}:${n}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};

/** Who draws drawing n: from the team that has drawn least tonight, the player who has drawn least, ties shuffled. */
function nextDrawer(pool: { a: Doc<"attendance">; drawn: number }[], n: number) {
  const team = (p: (typeof pool)[number]) => pool.filter((o) => o.a.teamId === p.a.teamId).reduce((x, o) => x + o.drawn, 0);
  const first = [...pool].sort((x, y) => team(x) - team(y) || x.drawn - y.drawn || tie(x.a._id, n) - tie(y.a._id, n)).at(0);
  return first ? first.a : null;
}

/** A word nobody has had tonight, preferring one no earlier night used. Kept in `shown` so it never comes back tonight. */
async function newWord(ctx: MutationCtx, s: Doc<"sessions">) {
  const shown = (await ctx.db.get(s._id))?.shown ?? [];
  // Practice nights don't use words up.
  const earlier = new Set(
    (await ctx.db.query("sessions").collect()).flatMap((x) => (x.practice || x._id === s._id ? [] : (x.shown ?? []))),
  );
  const left = PICTIONARY.map((_, i) => i).filter((i) => !shown.includes(wordKey(i)));
  const fresh = left.filter((i) => !earlier.has(wordKey(i)));
  const pool = fresh.length ? fresh : left;
  if (!pool.length) throw new ConvexError("That’s every word in the deck for tonight.");
  const i = pool[Math.floor(Math.random() * pool.length)];
  await ctx.db.patch(s._id, { shown: [...shown, wordKey(i)] });
  return PICTIONARY[i];
}

async function clearInk(ctx: MutationCtx, drawingId: Id<"drawings">) {
  for (const r of await ctx.db
    .query("strokes")
    .withIndex("by_drawing", (q) => q.eq("drawingId", drawingId))
    .collect())
    await ctx.db.delete(r._id);
}

const lastInk = (ctx: QueryCtx, drawingId: Id<"drawings">) =>
  ctx.db
    .query("strokes")
    .withIndex("by_drawing", (q) => q.eq("drawingId", drawingId))
    .order("desc")
    .first();

/**
 * The guessing teams that got a drawing, in order: each team's first right guess, leaving out teams that are gone and
 * the drawer's own. Also tonight's teams and the drawer's team.
 */
async function gotIt(ctx: QueryCtx, s: Doc<"sessions">, d: Doc<"drawings">) {
  const [teams, rows, drawer] = await Promise.all([
    sessionTeams(ctx, s._id),
    ctx.db
      .query("guesses")
      .withIndex("by_session_card", (q) => q.eq("sessionId", s._id).eq("card", d.key))
      .collect(),
    ctx.db.get(d.drawer),
  ]);
  const drawerTeam = teams.find((t) => t._id === drawer?.teamId)?._id ?? null;
  const names = new Map(teams.map((t) => [t._id, t.name]));
  const right = rows
    .filter((r) => r.at !== undefined && names.has(r.teamId) && r.teamId !== drawerTeam)
    .sort((a, b) => a.at! - b.at! || a._creationTime - b._creationTime);
  const got = right
    .filter((r, i) => right.findIndex((o) => o.teamId === r.teamId) === i)
    .map((r) => ({ ...r, at: r.at!, name: names.get(r.teamId)! }));
  return { teams, drawerTeam, got };
}

/** The drawing on the TV, for the drawer's phone (by its token) or an officer (no token), the only ones who draw on it. */
async function myDrawing(ctx: MutationCtx, drawingId: Id<"drawings">, token: string | undefined) {
  const d = await ctx.db.get(drawingId);
  const s = d && (await ctx.db.get(d.sessionId));
  if (!d || !s || s.status !== "open") throw new ConvexError("This night has ended.");
  if (token === undefined) await requireOfficer(ctx);
  else if ((await byToken(ctx, token))?._id !== d.drawer) throw new ConvexError("It’s someone else’s turn to draw.");
  if (drawCard(s)?.key !== d.key) throw new ConvexError("That drawing isn’t up anymore.");
  return { d, s };
}

const over = (s: Doc<"sessions">, key: string) => !!s.screen.revealed || (s.scored ?? []).includes(key);

/** A new drawing: the next drawer in turn and a fresh word. Then /host puts it on the TV and starts its clock. */
export const start = mutation({
  args: {},
  handler: async (ctx) => {
    await requireOfficer(ctx);
    const s = await requireOpenSession(ctx);
    const done = await tonight(ctx, s._id);
    const n = done.reduce((m, d) => Math.max(m, d.n), 0) + 1;
    const drawer = nextDrawer(await drawers(ctx, s, done), n);
    if (!drawer) throw new ConvexError("Nobody’s playing yet, so nobody can draw.");
    await ctx.db.insert("drawings", { sessionId: s._id, n, key: drawKey(n), drawer: drawer._id, word: await newWord(ctx, s) });
    return n;
  },
});

/** Hand the drawing to someone else, with a new word and a clean canvas (the old drawer saw the old word). */
export const switchDrawer = mutation({
  args: { drawingId: v.id("drawings"), attendanceId: v.id("attendance") },
  handler: async (ctx, { drawingId, attendanceId }) => {
    const { d, s } = await myDrawing(ctx, drawingId, undefined);
    if (over(s, d.key)) throw new ConvexError("This drawing is over.");
    const a = await ctx.db.get(attendanceId);
    if (!a || a.sessionId !== s._id || !inTeamPool(a) || !a.teamId) throw new ConvexError("Pick someone who’s playing tonight.");
    await ctx.db.patch(d._id, { drawer: a._id, word: await newWord(ctx, s) });
    await clearInk(ctx, d._id);
    for (const g of await ctx.db
      .query("guesses")
      .withIndex("by_session_card", (q) => q.eq("sessionId", s._id).eq("card", d.key))
      .collect())
      await ctx.db.delete(g._id);
  },
});

/** A new word for the drawing on a clean canvas, from the drawer's phone or an officer. Not once someone has it. */
export const skip = mutation({
  args: { drawingId: v.id("drawings"), token: v.optional(v.string()) },
  handler: async (ctx, { drawingId, token }) => {
    const { d, s } = await myDrawing(ctx, drawingId, token);
    if (over(s, d.key)) throw new ConvexError("This drawing is over.");
    if ((await gotIt(ctx, s, d)).got.length) throw new ConvexError("Someone already got this one, so it stays.");
    await ctx.db.patch(d._id, { word: await newWord(ctx, s) });
    await clearInk(ctx, d._id);
  },
});

/** About 100ms of a stroke. The drawer's phone and the officer tablet can both draw at once. */
export const ink = mutation({
  args: {
    drawingId: v.id("drawings"),
    token: v.optional(v.string()),
    stroke: v.string(),
    color: v.string(),
    size: v.number(),
    points: v.array(v.number()),
  },
  handler: async (ctx, { drawingId, token, stroke, color, size, points }) => {
    const { d, s } = await myDrawing(ctx, drawingId, token);
    if (!isOpen(s, d.key)) throw new ConvexError("Time’s up. Pens down.");
    if (!COLORS.includes(color) || !SIZES.includes(size) || stroke.length > 40) throw new ConvexError("Pick a pen from the choices.");
    if (
      !points.length ||
      points.length % 2 ||
      points.length > MAX_INK_POINTS ||
      points.some((x, i) => !Number.isInteger(x) || x < 0 || x > (i % 2 ? H : W))
    )
      throw new ConvexError("That ink is off the canvas.");
    const seq = ((await lastInk(ctx, d._id))?.seq ?? -1) + 1;
    if (seq >= MAX_INK_ROWS) throw new ConvexError("The canvas is full. Undo or clear to keep drawing.");
    await ctx.db.insert("strokes", { drawingId: d._id, stroke, seq, color, size, points });
  },
});

/** Take back the last stroke on the drawing, whichever device drew it. */
export const undo = mutation({
  args: { drawingId: v.id("drawings"), token: v.optional(v.string()) },
  handler: async (ctx, { drawingId, token }) => {
    const { d, s } = await myDrawing(ctx, drawingId, token);
    if (!isOpen(s, d.key)) throw new ConvexError("Time’s up. Pens down.");
    const last = await lastInk(ctx, d._id);
    if (!last) return;
    for (const r of await ctx.db
      .query("strokes")
      .withIndex("by_stroke", (q) => q.eq("drawingId", d._id).eq("stroke", last.stroke))
      .collect())
      await ctx.db.delete(r._id);
  },
});

export const clear = mutation({
  args: { drawingId: v.id("drawings"), token: v.optional(v.string()) },
  handler: async (ctx, { drawingId, token }) => {
    const { d, s } = await myDrawing(ctx, drawingId, token);
    if (!isOpen(s, d.key)) throw new ConvexError("Time’s up. Pens down.");
    await clearInk(ctx, d._id);
  },
});

/** How many ink blocks a drawing has, so screens know which blocks to read. */
export const inkBlocks = query({
  args: { drawingId: v.id("drawings") },
  handler: async (ctx, { drawingId }) => {
    const last = await lastInk(ctx, drawingId);
    return last ? Math.floor(last.seq / INK_BLOCK) + 1 : 0;
  },
});

/** One block of a drawing's ink, in order. Anyone can read it: the picture is on the TV. */
export const inkBlock = query({
  args: { drawingId: v.id("drawings"), block: v.number() },
  handler: async (ctx, { drawingId, block }) =>
    (
      await ctx.db
        .query("strokes")
        .withIndex("by_drawing", (q) =>
          q
            .eq("drawingId", drawingId)
            .gte("seq", block * INK_BLOCK)
            .lt("seq", (block + 1) * INK_BLOCK),
        )
        .collect()
    ).map((r) => ({ _id: r._id, stroke: r.stroke, color: r.color, size: r.size, points: r.points })),
});

/** A guess from a phone: "right" locks the player's team in, "close" is only for them, and wrong guesses go nowhere. */
export const guess = mutation({
  args: { token: v.string(), card: v.string(), text: v.string() },
  handler: async (ctx, { token, card, text }) => {
    const a = await byToken(ctx, token);
    const s = a && (await ctx.db.get(a.sessionId));
    if (!a || !s || s.status !== "open") throw new ConvexError("This night has ended.");
    if (!a.teamId) throw new ConvexError("You’re not playing this round.");
    const teamId = a.teamId;
    const c = drawCard(s);
    const d = c?.key === card ? await drawingAt(ctx, s._id, c.n) : null;
    if (!d) throw new ConvexError("That drawing isn’t up anymore.");
    if (!isOpen(s, d.key)) throw new ConvexError("Time’s up. Guesses are closed.");
    if (d.drawer === a._id) throw new ConvexError("You’re the one drawing!");
    if ((await ctx.db.get(d.drawer))?.teamId === teamId) throw new ConvexError("Your team is drawing this one.");
    const t = text.trim();
    if (!t) throw new ConvexError("Type a guess first.");
    if (t.length > GUESS_MAX) throw new ConvexError("That guess is too long.");
    const rows = await ctx.db
      .query("guesses")
      .withIndex("by_team_card", (q) => q.eq("teamId", teamId).eq("card", card))
      .collect();
    if (rows.some((r) => r.at !== undefined)) throw new ConvexError("Already got it!");
    const mine = rows.find((r) => r.attendanceId === a._id);
    const now = Date.now();
    if (mine && now - mine.lastAt < GUESS_GAP_MS) throw new ConvexError("Easy: one guess a second.");
    if (mine && mine.tries >= MAX_GUESSES) throw new ConvexError("That’s plenty of guesses for this one.");
    const kind = checkGuess(t, d.word);
    const patch = { tries: (mine?.tries ?? 0) + 1, lastAt: now, ...(kind === "right" && { at: now }) };
    if (mine) await ctx.db.patch(mine._id, patch);
    else await ctx.db.insert("guesses", { sessionId: s._id, teamId, attendanceId: a._id, card, ...patch });
    return kind;
  },
});

/**
 * For the TV, phones, and the tablet: the drawing on the TV, who's drawing, the word as blanks, and who has got it in
 * order. The word itself only once it's revealed, then every team's points once it's scored.
 */
export const board = query({
  args: {},
  handler: async (ctx) => {
    const s = await openSession(ctx);
    const c = s && drawCard(s);
    const d = s && c && (await drawingAt(ctx, s._id, c.n));
    if (!s || !d) return null;
    const { teams, drawerTeam, got } = await gotIt(ctx, s, d);
    const scored = (s.scored ?? []).includes(d.key);
    const t0 = cardStart(s, d.key);
    const points = new Map((d.results ?? []).map((r) => [r.teamId, r.points]));
    return {
      _id: d._id,
      key: d.key,
      drawer: await nameOf(ctx, d.drawer),
      drawerTeam,
      blanks: blanks(d.word),
      word: over(s, d.key) ? d.word : null,
      guessing: teams.filter((t) => t._id !== drawerTeam).length,
      got: await Promise.all(
        got.map(async (g) => ({
          teamId: g.teamId,
          name: g.name,
          by: await nameOf(ctx, g.attendanceId),
          ms: t0 === undefined ? null : Math.max(0, g.at - t0),
        })),
      ),
      scored,
      results: scored
        ? teams
            .map((t) => ({ teamId: t._id, name: t.name, points: points.get(t._id) ?? 0, drawer: t._id === drawerTeam }))
            .sort((a, b) => b.points - a.points)
        : null,
    };
  },
});

/** A phone's view of the drawing on the TV: the word if it's the drawer, otherwise whether its team has got it. */
export const mine = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const a = await byToken(ctx, token);
    const s = a && (await ctx.db.get(a.sessionId));
    const c = s && s.status === "open" && drawCard(s);
    const d = a && s && c && (await drawingAt(ctx, s._id, c.n));
    if (!a || !s || !d) return null;
    if (d.drawer === a._id) return { key: d.key, drawer: true as const, word: d.word };
    const { drawerTeam, got } = await gotIt(ctx, s, d);
    const i = got.findIndex((g) => g.teamId === a.teamId);
    return {
      key: d.key,
      drawer: false as const,
      teammate: !!a.teamId && a.teamId === drawerTeam,
      place: i === -1 ? null : i + 1,
      by: i === -1 ? null : got[i].attendanceId === a._id ? null : await nameOf(ctx, got[i].attendanceId),
      points: d.results?.find((r) => r.teamId === a.teamId)?.points ?? null,
    };
  },
});

/** For /host and the officer tablet: the drawing up (with its word), who's next, the players, and how many have drawn. */
export const host = query({
  args: {},
  handler: async (ctx) => {
    await requireOfficer(ctx);
    const s = await openSession(ctx);
    if (!s) return null;
    const done = await tonight(ctx, s._id);
    const pool = await drawers(ctx, s, done);
    const players = await Promise.all(pool.map(async (p) => ({ _id: p.a._id, name: await nameOf(ctx, p.a._id) })));
    const next = nextDrawer(pool, done.reduce((m, d) => Math.max(m, d.n), 0) + 1);
    // The drawing stays with the screen, so it's still here while the scoreboard or join screen is up.
    const d = s.screen.drawing === undefined ? undefined : done.find((x) => x.n === s.screen.drawing);
    return {
      next: next && players.find((p) => p._id === next._id)!,
      drawn: pool.filter((p) => p.drawn > 0).length,
      players: players.sort((a, b) => a.name.localeCompare(b.name)),
      current: d && {
        _id: d._id,
        key: d.key,
        n: d.n,
        word: d.word,
        drawer: d.drawer,
        drawerName: await nameOf(ctx, d.drawer),
        over: over(s, d.key),
      },
    };
  },
});

/** Score one drawing, once per drawing per night. Returns the scored list. */
async function scoreDrawing(ctx: MutationCtx, s: Doc<"sessions">, n: number, scored: string[], double: boolean) {
  const d = await drawingAt(ctx, s._id, n);
  if (!d) return scored;
  const { teams, drawerTeam, got } = await gotIt(ctx, s, d);
  const r = drawAwardsFor({
    key: d.key,
    double,
    scored,
    drawer: drawerTeam,
    guessing: teams.filter((t) => t._id !== drawerTeam).length,
    got: got.map((g) => g.teamId),
  });
  if (!r) return scored;
  for (const { team, points } of r.awards) await award(ctx, team, points);
  await ctx.db.patch(d._id, { results: r.awards.map((x) => ({ teamId: x.team, points: x.points })) });
  await ctx.db.patch(s._id, { scored: r.scored });
  return r.scored;
}

/** Score the revealed drawing. Called by sessions.setScreen. */
export async function scoreDrawReveal(ctx: MutationCtx, s: Doc<"sessions">) {
  const c = drawCard(s);
  if (c && s.screen.revealed) await scoreDrawing(ctx, s, c.n, s.scored ?? [], s.double);
}

/** Score every drawing up tonight that was never revealed, so ending the night never loses a guess. Called by sessions.end. */
export async function scoreUnrevealedDrawings(ctx: MutationCtx, s: Doc<"sessions">) {
  let scored = s.scored ?? [];
  // Each drawing keeps the double points it went up with, like puzzles.
  for (const w of [...(s.played ?? []), ...(s.card ? [s.card] : [])])
    if (w.key.startsWith("draw:")) scored = await scoreDrawing(ctx, s, Number(w.key.slice(5)), scored, w.double ?? s.double);
}
