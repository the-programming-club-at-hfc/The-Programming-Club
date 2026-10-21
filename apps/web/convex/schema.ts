import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const gameV = v.union(
  v.literal("bug"),
  v.literal("output"),
  v.literal("relay"),
  v.literal("lang"),
  v.literal("fix"),
  v.literal("puzzle"),
);

// What the TV is showing. Cards are referenced by index into lib/content.ts.
export const screenV = v.object({
  mode: v.union(
    v.literal("lobby"),
    v.literal("scoreboard"),
    v.literal("timer"),
    v.literal("card"),
    v.literal("wiki"),
    v.literal("message"),
    // The kickoff deck, at `slide`.
    v.literal("slides"),
    // Tech Pictionary: drawing number `drawing` tonight, drawn live on phones and the officer tablet.
    v.literal("draw"),
  ),
  game: v.optional(gameV),
  index: v.optional(v.number()),
  revealed: v.optional(v.boolean()),
  // Fix it for real and puzzles: the hint is up on the TV, phones, and team computers.
  hint: v.optional(v.boolean()),
  wikiFrom: v.optional(v.string()),
  wikiTo: v.optional(v.string()),
  // Wiki Race, Fewest Clicks: teams send their click count instead of racing the clock.
  wikiClicks: v.optional(v.boolean()),
  // Wiki Race picked but not started: the TV shows only the /wiki address so teams get there, then Start reveals
  // the race and starts the clock for everyone at once.
  wikiReady: v.optional(v.boolean()),
  message: v.optional(v.string()),
  // Kickoff deck position (from 0), kept apart from `index` so the challenge on the go survives the slides going up.
  slide: v.optional(v.number()),
  // Tech Pictionary: tonight's drawing number (from 1), kept like a card's when the scoreboard or join screen goes up.
  drawing: v.optional(v.number()),
});

// Running when startedAt is set: remaining = remainingMs - (now - startedAt).
export const timerV = v.object({
  durationMs: v.number(),
  remainingMs: v.number(),
  startedAt: v.optional(v.number()),
  relay: v.boolean(),
  // The answerable card ("game:index") this run is timing, so a clock started for another screen never closes it.
  card: v.optional(v.string()),
  // Paused at `parkedAt` because its card left the TV mid-play (scores, join screen, a message): it runs again when the
  // card comes back.
  parked: v.optional(v.boolean()),
  parkedAt: v.optional(v.number()),
});

// One showing of an answerable card: when its clock started (early bonus) and when it ran out (answers stay closed).
// `double` is whether double points were on when the card first went up, for scoring it later (e.g. when the night ends).
export const cardWindowV = v.object({ key: v.string(), at: v.number(), endedAt: v.optional(v.number()), double: v.optional(v.boolean()) });

// One entry in a week's lineup, e.g. { label: "Bug Hunt: hard", double: true } for a double-points final round.
export const lineupItemV = v.object({ label: v.string(), double: v.boolean() });

export default defineSchema({
  // Officer edits to the season plan. Weeks without a row use the defaults in src/lib/content.ts.
  weeks: defineTable({
    week: v.number(),
    title: v.string(),
    pitch: v.string(),
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
    // The lineup round being played (0-based), so /host's Next button picks up where it left off.
    round: v.optional(v.number()),
    // false when officers turned auto teams off for tonight. Missing means on: joiners land on a team of up to teamSize.
    autoTeams: v.optional(v.boolean()),
    // Solo (1), where every player is a team of one named after them, or teams of 2 or 3, from tonight's last Make
    // teams; auto teams fill up to it. New nights start solo; missing means a night from before solo mode: teams of 2.
    teamSize: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3))),
    // Players' own points (attendance.points) are kept. Missing on nights from before that; see lib.upgradeOldNight.
    playerPoints: v.optional(v.boolean()),
  })
    .index("by_status", ["status"])
    .index("by_code", ["code"]),

  players: defineTable({
    email: v.string(),
    name: v.string(),
    createdAt: v.number(),
    // Joined while signed in with this email, so joining with it now takes that sign-in (nobody can type it in instead).
    account: v.optional(v.boolean()),
    // Unused: left from the old after-join idea prompt, kept only because a few dev docs still have it set.
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
    // Points this player earned tonight, kept when teams are remade (teams.make starts each team from its members' average).
    points: v.optional(v.number()),
    // An officer's check-in: counts for attendance but stays out of teams and the leaderboard unless they opt in to play.
    officer: v.optional(v.boolean()),
    playing: v.optional(v.boolean()),
  })
    .index("by_session", ["sessionId"])
    .index("by_player", ["playerId"])
    .index("by_token", ["token"])
    .index("by_session_player", ["sessionId", "playerId"]),

  teams: defineTable({
    sessionId: v.id("sessions"),
    name: v.string(),
    score: v.number(),
    // Typed into the team computer (/hello-world/fix) so it can send answers for this team. Shown on the team's phones.
    key: v.optional(v.string()),
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

  // What new members would like the club to do, from the optional box on the join form (players.join). See convex/ideas.ts.
  ideas: defineTable({
    playerId: v.id("players"),
    sessionId: v.id("sessions"),
    text: v.string(),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_player", ["playerId"]),

  // Puzzles: a team's stars on one puzzle, from answers typed on its team computer. See convex/puzzles.ts.
  stars: defineTable({
    sessionId: v.id("sessions"),
    teamId: v.id("teams"),
    card: v.string(),
    // Server times of each part's right answer.
    part1At: v.optional(v.number()),
    part2At: v.optional(v.number()),
    // A wrong answer locks the team out until then.
    lockedUntil: v.optional(v.number()),
    wrong: v.number(),
    // The last wrong answer, for officers.
    lastWrong: v.optional(v.string()),
    // Set when the puzzle is scored. `points` includes double points.
    result: v.optional(v.object({ points: v.number(), first1: v.boolean(), first2: v.boolean() })),
  })
    .index("by_session_card", ["sessionId", "card"])
    .index("by_team_card", ["teamId", "card"]),

  // A team's Wiki Race: its "We made it!" from a phone, the referee's check, and its points. See convex/wiki.ts.
  races: defineTable({
    sessionId: v.id("sessions"),
    teamId: v.id("teams"),
    card: v.string(),
    // Server time the team finished, and who tapped. Unset for a team that didn't finish (added when scored).
    at: v.optional(v.number()),
    by: v.optional(v.string()),
    // Fewest Clicks: the team's count.
    clicks: v.optional(v.number()),
    // The referee's check: true it counts, false not there yet. Unset until checked.
    ok: v.optional(v.boolean()),
    // Set when the race is scored. `points` includes double points; no place means the team didn't finish.
    result: v.optional(v.object({ points: v.number(), place: v.optional(v.number()) })),
  })
    .index("by_session_card", ["sessionId", "card"])
    .index("by_team_card", ["teamId", "card"]),

  // Tech Pictionary: one drawing tonight, keyed "draw:<n>" like a card. The word is secret until the reveal: only the
  // drawer's phone and officers ever read it. See convex/drawings.ts.
  drawings: defineTable({
    sessionId: v.id("sessions"),
    n: v.number(),
    key: v.string(),
    drawer: v.id("attendance"),
    // The drawer's team when the drawing went up (or was handed over), so moving the drawer to another team mid-drawing
    // can't turn a team that already guessed it into the drawer's.
    team: v.optional(v.id("teams")),
    word: v.string(),
    // Goes up each time the word changes (skip, switch drawer), so ink from before never lands on the new canvas.
    rev: v.optional(v.number()),
    // Skips from the drawer's phone; a new drawer starts at 0.
    skips: v.optional(v.number()),
    // Strokes undone or cleared, so ink still on its way for them is dropped instead of drawing fragments back.
    gone: v.optional(v.array(v.string())),
    // Set when the drawing is scored, for every team that got points. `points` includes double points.
    results: v.optional(v.array(v.object({ teamId: v.id("teams"), points: v.number() }))),
  }).index("by_session_n", ["sessionId", "n"]),

  // A drawing's ink: one row per ~100ms of a stroke, so no doc grows with the picture. Points are flat [x, y, x, y, …]
  // ints on the 1000 × 750 canvas (src/lib/draw.ts). `seq` orders rows within the drawing.
  strokes: defineTable({
    drawingId: v.id("drawings"),
    stroke: v.string(),
    seq: v.number(),
    color: v.string(),
    size: v.number(),
    points: v.array(v.number()),
  }).index("by_drawing", ["drawingId", "seq"]),

  // A player's guesses on one drawing: how many and when (for the rate limit), and when they got it right. Wrong guesses
  // themselves are never kept.
  guesses: defineTable({
    sessionId: v.id("sessions"),
    teamId: v.id("teams"),
    attendanceId: v.id("attendance"),
    card: v.string(),
    tries: v.number(),
    lastAt: v.number(),
    at: v.optional(v.number()),
  })
    .index("by_session_card", ["sessionId", "card"])
    .index("by_team_card", ["teamId", "card"])
    .index("by_attendance_card", ["attendanceId", "card"]),

  // Anonymous "I'm interested" hearts on events, one per browser (a random id kept in localStorage).
  interest: defineTable({
    event: v.string(),
    voter: v.string(),
  }).index("by_event_voter", ["event", "voter"]),
});
