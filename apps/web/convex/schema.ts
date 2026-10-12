import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const gameV = v.union(v.literal("bug"), v.literal("output"), v.literal("relay"), v.literal("lang"));

// What the TV is showing. Cards are referenced by index into lib/content.ts.
export const screenV = v.object({
  mode: v.union(
    v.literal("lobby"),
    v.literal("scoreboard"),
    v.literal("timer"),
    v.literal("card"),
    v.literal("wiki"),
    v.literal("message"),
  ),
  game: v.optional(gameV),
  index: v.optional(v.number()),
  revealed: v.optional(v.boolean()),
  wikiFrom: v.optional(v.string()),
  wikiTo: v.optional(v.string()),
  message: v.optional(v.string()),
});

// Running when startedAt is set: remaining = remainingMs - (now - startedAt).
export const timerV = v.object({
  durationMs: v.number(),
  remainingMs: v.number(),
  startedAt: v.optional(v.number()),
  relay: v.boolean(),
});

// One entry in a week's lineup, e.g. { label: "Bug Hunt: hard", double: true } for a double-points final round.
export const lineupItemV = v.object({ label: v.string(), double: v.boolean() });

export default defineSchema({
  // Officer edits to the season plan. Weeks without a row use the defaults in src/lib/content.ts.
  weeks: defineTable({
    week: v.number(),
    title: v.string(),
    pitch: v.string(),
    lesson: v.optional(v.string()),
    bonus: v.optional(v.string()),
    startsAt: v.number(),
    cancelled: v.boolean(),
    lineup: v.array(lineupItemV),
    updatedBy: v.string(),
    updatedAt: v.number(),
  }).index("by_week", ["week"]),

  sessions: defineTable({
    week: v.number(),
    code: v.string(),
    status: v.union(v.literal("open"), v.literal("ended")),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    double: v.boolean(),
    screen: screenV,
    timer: timerV,
    // Cards put on the TV tonight, as "game:index", so later nights can skip them.
    shown: v.optional(v.array(v.string())),
    // TV music, set from the host console. Missing means music on at 80% volume.
    sound: v.optional(v.object({ music: v.boolean(), volume: v.number() })),
    // The answerable card on the TV ("game:index") and when its clock started, for the early-lock bonus.
    card: v.optional(v.object({ key: v.string(), at: v.number() })),
    // Cards already scored from phone answers tonight, so revealing again never scores twice.
    scored: v.optional(v.array(v.string())),
    // A rehearsal: left out of attendance, XP, stats, and the attendance export.
    practice: v.optional(v.boolean()),
  })
    .index("by_status", ["status"])
    .index("by_code", ["code"]),

  players: defineTable({
    email: v.string(),
    name: v.string(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  attendance: defineTable({
    sessionId: v.id("sessions"),
    playerId: v.id("players"),
    teamId: v.optional(v.id("teams")),
    token: v.string(),
    joinedAt: v.number(),
    firstTime: v.boolean(),
    broughtBy: v.optional(v.string()),
    showXp: v.number(),
    placeXp: v.optional(v.number()),
    bonusXp: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_player", ["playerId"])
    .index("by_token", ["token"])
    .index("by_session_player", ["sessionId", "playerId"]),

  teams: defineTable({
    sessionId: v.id("sessions"),
    name: v.string(),
    score: v.number(),
  }).index("by_session", ["sessionId"]),

  // A team's phone answer to one card (Bug Hunt, Output?, Guess the Language). See src/lib/grading.ts.
  answers: defineTable({
    sessionId: v.id("sessions"),
    teamId: v.id("teams"),
    card: v.string(),
    line: v.optional(v.number()),
    lineBy: v.optional(v.string()),
    lineLockedAt: v.optional(v.number()),
    lineLockedBy: v.optional(v.string()),
    choice: v.optional(v.string()),
    choiceBy: v.optional(v.string()),
    lockedAt: v.optional(v.number()),
    lockedBy: v.optional(v.string()),
    // Set when the card is revealed. `points` includes double points.
    result: v.optional(
      v.object({
        points: v.number(),
        correct: v.boolean(),
        early: v.boolean(),
        line: v.optional(v.boolean()),
        fix: v.optional(v.boolean()),
      }),
    ),
  })
    .index("by_session_card", ["sessionId", "card"])
    .index("by_team_card", ["teamId", "card"]),

  // Anonymous "I'm interested" hearts on events, one per browser (a random id kept in localStorage).
  interest: defineTable({
    event: v.string(),
    voter: v.string(),
  }).index("by_event_voter", ["event", "voter"]),
});
