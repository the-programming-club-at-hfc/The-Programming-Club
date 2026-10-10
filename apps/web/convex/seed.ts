import { ConvexError } from "convex/values";
import { internalMutation } from "./_generated/server";
import { addToSession, placeXpFor, sessionAttendance } from "./lib";

const NAMES = [
  "Ada Lovelace",
  "Alan Turing",
  "Grace Hopper",
  "Linus Torvalds",
  "Margaret Hamilton",
  "Dennis Ritchie",
  "Barbara Liskov",
  "Ken Thompson",
];

/** Sample data for a fresh dev deployment: one finished week-1 night with three teams. `bunx convex run seed:run` */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await ctx.db.query("players").first())
      throw new ConvexError("This deployment already has players. Seed only runs on an empty one.");
    const now = Date.now();
    const sessionId = await ctx.db.insert("sessions", {
      week: 1,
      code: "DEMO",
      status: "open",
      startedAt: now,
      double: false,
      screen: { mode: "lobby" },
      timer: { durationMs: 90_000, remainingMs: 90_000, relay: false },
    });
    const teamIds = [];
    for (const [name, score] of [
      ["Null Pointers", 12],
      ["Off By One", 9],
      ["Segfaults", 5],
    ] as const) {
      teamIds.push(await ctx.db.insert("teams", { sessionId, name, score }));
    }
    const session = (await ctx.db.get(sessionId))!;
    for (const name of NAMES) await addToSession(ctx, session, name, `${name.split(" ")[0].toLowerCase()}@example.com`);

    const teams = await Promise.all(teamIds.map((id) => ctx.db.get(id)));
    const xp = placeXpFor(teams.filter((t) => t !== null));
    for (const a of await sessionAttendance(ctx, sessionId)) await ctx.db.patch(a._id, { placeXp: a.teamId ? (xp.get(a.teamId) ?? 0) : 0 });
    await ctx.db.patch(sessionId, { status: "ended", endedAt: now });
  },
});
