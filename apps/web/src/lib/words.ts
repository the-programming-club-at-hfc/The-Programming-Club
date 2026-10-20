// Team copy that reads right on any night. Nights are solo by default, where every player is a team of one, so "your
// team" becomes "you" and the team computer is just your computer. Pick the set with teamWords(live.teamSize === 1).

const TEAMS = {
  solo: false,
  // Phrases to build sentences with.
  You: "Your team",
  you: "your team",
  Your: "Your team’s",
  team: "team",
  teams: "teams",
  everyone: "every team",
  computer: "team computer",
  Computer: "Team computer",
  computers: "team computers",
  Computers: "Team computers",
  first: "First team",
  noTeams: "No teams yet.",
  /** Who picked or tapped on a phone. */
  who: (by?: string, fallback = "Someone") => by ?? fallback,

  // Phones.
  /** Over the team name. */
  yourTeam: "Your team",
  /** The team key, only for a lab computer at /hello-world/fix: the join page does it all, phone or laptop. */
  key: "On a lab computer at /hello-world/fix? Team key:",
  waiting: "You’re in. Teams get picked in a minute.",
  teamUp: "Want to team up with a friend? Ask an officer to switch your team.",
  lockAll: "Lock in for the whole team",
  lockLine: "Lock in this line for the whole team",
  lockedBy: (by?: string) => `Locked in by ${by ?? "your team"}`,
  final: "That’s final for your team.",
  nobodyPicked: "Nobody has picked yet. Anyone on your team can.",
  canChange: "Anyone on your team can change the pick until someone locks it in.",
  madeIt: "We made it!",
  yesMadeIt: "Yes, we made it",
  notThere: "Undo: we’re not there yet",
  sendFor: " for your team",
  anyoneTaps: "Anyone on your team can tap it",

  // The TV and the kickoff deck.
  openOn: "Team computers, open",
  scoreboardEmpty: "Teams show up here once officers make them.",
  joinEmpty: "Teams show up here as people join.",
  makeTeams: "make teams",
  findSeats: "Find your teammates.",
  seats: "Joining puts you on a team. It’s on your phone and listed below. Sit together, one computer per team.",
  perComputer: "Teams of 2–3, one computer per team.",

  // The team computer (/hello-world/fix).
  whichTeam: "which team is this?",
  notMade: "Teams aren’t made yet. Your team key shows up on your phones once the game starts.",
  typeKey: "Type the team key from any teammate’s phone",
  keyLabel: "Team key",
  wrongKey: "That key isn’t a team tonight. Check a teammate’s phone and try again.",
  switchTeam: "Switch team",

  // The host console.
  autoOn: (size: number) => `Everyone who joins lands on a team of up to ${size}.`,
  autoOff: "Joiners wait without a team until you make teams. Late joiners then go on the smallest team.",
  emptyAuto: "No teams yet. They fill in as people join.",
  emptyManual: "No teams yet. Once people have joined, make teams and they’ll see theirs on their phones.",
  keyTitle: "Team computer key (also on the team’s phones)",
  nobodyPlaying: "No teams yet. Make teams (or turn on Auto teams) under Teams & scores so phones can play.",
};

const SOLO: typeof TEAMS = {
  solo: true,
  You: "You",
  you: "you",
  Your: "Your",
  team: "player",
  teams: "players",
  everyone: "everyone",
  computer: "computer",
  Computer: "Your computer",
  computers: "computers",
  Computers: "Computers",
  first: "First",
  noTeams: "Nobody yet.",
  who: () => "You",

  yourTeam: "Playing solo",
  key: "On a lab computer at /hello-world/fix? Your key:",
  waiting: "You’re in. The game starts in a minute.",
  teamUp: "",
  lockAll: "Lock it in",
  lockLine: "Lock in this line",
  lockedBy: () => "Locked in",
  final: "That’s final.",
  nobodyPicked: "Nothing picked yet.",
  canChange: "You can change your pick until you lock it in.",
  madeIt: "I made it!",
  yesMadeIt: "Yes, I made it",
  notThere: "Undo: I’m not there yet",
  sendFor: "",
  anyoneTaps: "Tap it",

  openOn: "On your computer, open",
  scoreboardEmpty: "Players show up here as they join.",
  joinEmpty: "Players show up here as they join.",
  makeTeams: "pick Solo",
  findSeats: "Grab a computer.",
  seats: "Tonight everyone plays solo. Your score is on your phone and listed below. One computer each.",
  perComputer: "Everyone plays solo, one computer each.",

  whichTeam: "who’s playing here?",
  notMade: "Nobody’s playing yet. Your key shows up on your phone once the game starts.",
  typeKey: "Type the key from your phone",
  keyLabel: "Your key",
  wrongKey: "That key isn’t anyone’s tonight. Check your phone and try again.",
  switchTeam: "Switch player",

  autoOn: () => "Everyone who joins plays on their own.",
  autoOff: "Joiners wait until you press Solo. Late joiners then play on their own.",
  emptyAuto: "Nobody yet. Players show up here as they join.",
  emptyManual: "Nobody playing yet. Once people have joined, press Solo and they’re in.",
  keyTitle: "Computer key (also on their phone)",
  nobodyPlaying: "Nobody’s playing yet. Pick Solo (or turn on Auto teams) under Teams & scores so phones can play.",
};

export type TeamWords = typeof TEAMS;

export const teamWords = (solo = false): TeamWords => (solo ? SOLO : TEAMS);
