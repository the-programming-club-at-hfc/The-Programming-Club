import { query } from "./_generated/server";
import { openSession } from "./lib";
import { requireOfficer } from "./officers";

/** The officer dashboard: tonight at a glance, every night's turnout, season totals, and event interest.
 *  Practice nights only show up as "live"; they stay out of turnout and totals. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireOfficer(ctx);
    const interestIn = (event: string) =>
      ctx.db
        .query("interest")
        .withIndex("by_event_voter", (q) => q.eq("event", event))
        .collect();
    const [allSessions, allAttendance, live, hackInterest, conferenceInterest] = await Promise.all([
      ctx.db.query("sessions").collect(),
      ctx.db.query("attendance").collect(),
      openSession(ctx),
      interestIn("hack-the-nest-2026"),
      interestIn("ai-business-conference-2026"),
    ]);

    const sessions = allSessions.filter((s) => !s.practice);
    const real = new Set(sessions.map((s) => s._id));
    const attendance = allAttendance.filter((a) => real.has(a.sessionId));
    const nights = sessions
      .map((s) => {
        const att = attendance.filter((a) => a.sessionId === s._id);
        return {
          _id: s._id,
          week: s.week,
          startedAt: s.startedAt,
          live: s.status === "open",
          headcount: att.length,
          firstTimers: att.filter((a) => a.firstTime).length,
        };
      })
      .sort((a, b) => b.startedAt - a.startedAt);

    const weeksPerPlayer = new Map<string, number>();
    for (const a of attendance) weeksPerPlayer.set(a.playerId, (weeksPerPlayer.get(a.playerId) ?? 0) + 1);
    const ended = nights.filter((n) => !n.live);

    return {
      live: live && {
        week: live.week,
        code: live.code,
        startedAt: live.startedAt,
        joined: allAttendance.filter((a) => a.sessionId === live._id).length,
        practice: !!live.practice,
      },
      nights,
      totals: {
        members: weeksPerPlayer.size,
        returning: [...weeksPerPlayer.values()].filter((n) => n > 1).length,
        checkIns: attendance.length,
        average: ended.length ? Math.round(ended.reduce((n, x) => n + x.headcount, 0) / ended.length) : 0,
      },
      hackInterest: hackInterest.length,
      conferenceInterest: conferenceInterest.length,
    };
  },
});
