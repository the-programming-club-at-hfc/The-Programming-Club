import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const gameV = v.union(v.literal("bug"), v.literal("output"), v.literal("relay"), v.literal("lang"), v.literal("fix"));

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
  // Fix it for real: the card's hint is up on the TV, phones, and team computers.
  hint: v.optional(v.boolean()),
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
  // The answerable card ("game:index") this run is timing, so a clock started for another screen never closes it.
  card: v.optional(v.string()),
});

// One showing of an answerable card: when its clock started (early bonus) and when it ran out (answers stay closed).
export const cardWindowV = v.object({ key: v.string(), at: v.number(), endedAt: v.optional(v.number()) });

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
    // The answerable card on the TV and its window. Cleared when anything else goes up.
    card: v.optional(cardWindowV),
    // Windows of answerable cards that left the screen tonight, so coming back to one picks its window up again.
    played: v.optional(v.array(cardWindowV)),
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
    // The new-member "what should the club do?" prompt on the phone: answered or skipped, so it never comes back.
    ideaPrompt: v.optional(v.union(v.literal("sent"), v.literal("skipped"))),
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

  // Fix it for real: a team's working fix, reported by its team computer once every test passed. See convex/fixes.ts.
  fixes: defineTable({
    sessionId: v.id("sessions"),
    teamId: v.id("teams"),
    card: v.string(),
    // Server time the fix came in.
    at: v.number(),
    code: v.string(),
    // Set when the card is revealed. `points` includes double points.
    result: v.optional(v.object({ points: v.number(), first: v.boolean() })),
  })
    .index("by_session_card", ["sessionId", "card"])
    .index("by_team_card", ["teamId", "card"]),

  // What new members would like the club to do, from the one-time prompt on their phone. See convex/ideas.ts.
  ideas: defineTable({
    playerId: v.id("players"),
    sessionId: v.id("sessions"),
    text: v.string(),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

  // Anonymous "I'm interested" hearts on events, one per browser (a random id kept in localStorage).
  interest: defineTable({
    event: v.string(),
    voter: v.string(),
  }).index("by_event_voter", ["event", "voter"]),
});
