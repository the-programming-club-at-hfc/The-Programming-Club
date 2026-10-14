// Advent of Code–style puzzles: the double-points final on Code Relay and both rounds of the Final.
// Each team gets its own input from a seed, solves it on its team computer in any language, and types the answers in.
// Two parts per puzzle; part 2 twists part 1 and shows up once part 1 is right. Original puzzles: nothing here comes
// from Advent of Code. Convex imports this file too (to check answers), so keep it plain TypeScript with relative imports.
import type { Level } from "./types";

export interface PuzzleAnswers {
  part1: string;
  part2: string;
}

export interface Puzzle {
  name: string;
  level: Level;
  /** Minutes on the clock. */
  minutes: number;
  /** Played as a relay: one keyboard per team, drivers swap at every 2-minute chime. */
  relay?: boolean;
  /** The lineup round it belongs to, so playing that round from /host opens this puzzle. */
  slot: "preview" | "final1" | "final2";
  /** The setup, a few short sentences. `backticks` show as code. */
  story: string;
  part1: string;
  /** Shown once a team has part 1 right. */
  part2: string;
  example: string;
  /** The example's answers, exactly what solve(example) returns. */
  exampleAnswers: PuzzleAnswers;
  /** How the example gets its answers, one sentence per part. */
  exampleWhy: [string, string];
  /** A nudge per part, shown when an officer puts the hint up. */
  hint: [string, string];
  /** A short Python solution to both parts, shown after the reveal. */
  solution: string;
  /** The team's puzzle input. The same seed always gives the same input. */
  generate: (seed: number) => string;
  /** The reference answers for an input. */
  solve: (input: string) => PuzzleAnswers;
}

/** A team's seed for a puzzle on a night: the same on the server and on the team computer. */
export function puzzleSeed(sessionId: string, teamId: string, index: number) {
  let h = 2166136261;
  for (const c of `${sessionId}:${teamId}:${index}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** A small seeded random number generator (mulberry32), so inputs are the same everywhere. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  const shuffle = <T>(xs: T[]) => {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = int(0, i);
      [xs[i], xs[j]] = [xs[j], xs[i]];
    }
    return xs;
  };
  /** An index into `weights`, picked with those relative chances. */
  const weighted = (weights: number[]) => {
    let r = next() * weights.reduce((s, w) => s + w, 0);
    for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) < 0) return i;
    return weights.length - 1;
  };
  return { int, shuffle, weighted };
}

const lines = (input: string) =>
  input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

/** Rejection sampling with a safety cap. Every generator's tests run it over hundreds of seeds. */
function until<T>(make: () => T, ok: (x: T) => boolean): T {
  for (let i = 0; i < 100_000; i++) {
    const x = make();
    if (ok(x)) return x;
  }
  throw new Error("Couldn’t generate a puzzle input.");
}

// ---- Sticker Swap (Code Relay) ---------------------------------------

const stickerPacks = (input: string) => lines(input).map((l) => l.split(/\s+/).map(Number));

/** What the stickers input guarantees, checked by the generator and the tests. */
export function stickerFacts(input: string) {
  const packs = stickerPacks(input);
  const count = new Map<number, number>();
  for (const n of packs.flat()) count.set(n, (count.get(n) ?? 0) + 1);
  return {
    packs: packs.length,
    // Packs where comparing the numbers as text picks the wrong shiny ("9" > "120").
    textTraps: packs.filter((p) => String(Math.max(...p)) !== p.map(String).reduce((a, b) => (b > a ? b : a))).length,
    // Packs with the same sticker twice.
    doubledPacks: packs.filter((p) => new Set(p).size < p.length).length,
    // Stickers found three or more times.
    triples: [...count.values()].filter((c) => c >= 3).length,
    singleDigits: packs.flat().filter((n) => n < 10).length,
  };
}

function generateStickers(seed: number) {
  const r = rng(seed);
  return until(
    () => {
      const packs = Array.from({ length: 120 }, () => Array.from({ length: r.int(3, 7) }, () => r.int(1, 250)));
      // A few packs with the same sticker twice.
      for (const p of r.shuffle([...packs.keys()]).slice(0, 4)) packs[p][r.int(1, packs[p].length - 1)] = packs[p][0];
      return packs.map((p) => p.join(" ")).join("\n");
    },
    (input) => {
      const f = stickerFacts(input);
      return f.textTraps >= 30 && f.doubledPacks >= 3 && f.triples >= 3 && f.singleDigits >= 5;
    },
  );
}

function solveStickers(input: string): PuzzleAnswers {
  const packs = stickerPacks(input);
  const seen = new Set<number>();
  let swap = 0;
  for (const n of packs.flat()) {
    if (seen.has(n)) swap += n;
    else seen.add(n);
  }
  return { part1: String(packs.reduce((s, p) => s + Math.max(...p), 0)), part2: String(swap) };
}

// ---- Comeback Kings (Final, puzzle 1) --------------------------------------

/** One logged match: the score, and how far behind each team ever was. */
function replay(goals: string) {
  let home = 0;
  let away = 0;
  let homeDown = 0;
  let awayDown = 0;
  for (const g of goals) {
    if (g === "H") home++;
    else if (g === "A") away++;
    homeDown = Math.max(homeDown, away - home);
    awayDown = Math.max(awayDown, home - away);
  }
  const winner = home > away ? "home" : away > home ? "away" : null;
  const down = winner === "home" ? homeDown : winner === "away" ? awayDown : 0;
  return { home, away, winner, comeback: down > 0, down };
}

const matchLog = (input: string) =>
  lines(input).map((l) => {
    const [name, goals] = l.split(":");
    return { number: Number(name.replace(/\D/g, "")), goals: goals.trim() };
  });

type MatchKind = "nil" | "draw" | "homeComeback" | "awayComeback" | "bigComeback" | "homeHeld" | "awayHeld" | "any";

/** Which of the guaranteed kinds a match is. "Held" is a win where the other team scored but the winner was never behind. */
function matchKinds(goals: string): MatchKind[] {
  const m = replay(goals);
  const kinds: MatchKind[] = ["any"];
  if (goals === "-") kinds.push("nil");
  else if (!m.winner) kinds.push("draw");
  else if (m.comeback) kinds.push(m.winner === "home" ? "homeComeback" : "awayComeback", ...(m.down >= 2 ? ["bigComeback" as const] : []));
  else if (Math.min(m.home, m.away) > 0) kinds.push(m.winner === "home" ? "homeHeld" : "awayHeld");
  return kinds;
}

/** At least this many matches of each kind in every input. */
export const MATCH_MINIMUMS: Record<Exclude<MatchKind, "any">, number> = {
  nil: 6,
  draw: 12,
  homeComeback: 10,
  awayComeback: 10,
  bigComeback: 4,
  homeHeld: 8,
  awayHeld: 8,
};

export function matchFacts(input: string) {
  const counts = Object.fromEntries(Object.keys(MATCH_MINIMUMS).map((k) => [k, 0])) as Record<keyof typeof MATCH_MINIMUMS, number>;
  for (const { goals } of matchLog(input)) for (const k of matchKinds(goals)) if (k !== "any") counts[k]++;
  return counts;
}

function generateMatches(seed: number) {
  const r = rng(seed);
  const plan: MatchKind[] = Object.entries(MATCH_MINIMUMS).flatMap(([k, n]) => Array<MatchKind>(n).fill(k as MatchKind));
  while (plan.length < 200) plan.push("any");
  r.shuffle(plan);
  const randomGoals = () => {
    const n = r.weighted([4, 7, 8, 7, 5, 3, 2, 1]);
    return n === 0 ? "-" : Array.from({ length: n }, () => (r.int(0, 1) ? "H" : "A")).join("");
  };
  return plan.map((kind, i) => `Match ${i + 1}: ${until(randomGoals, (g) => matchKinds(g).includes(kind))}`).join("\n");
}

function solveMatches(input: string): PuzzleAnswers {
  let homeWins = 0;
  let comebacks = 0;
  for (const { number, goals } of matchLog(input)) {
    const m = replay(goals);
    if (m.winner === "home") homeWins += number;
    if (m.comeback) comebacks += number;
  }
  return { part1: String(homeWins), part2: String(comebacks) };
}

// ---- Road to the Cup (Final, puzzle 2) -------------------------------------

// Three-letter codes for the qualifying teams. Every input uses 60 of them.
const CODES =
  "ALB ALG AND ARG ARM AUS AUT AZE BEL BIH BOL BRA BUL CAN CHI CIV CMR COL CRC CRO CZE DEN ECU EGY ENG ESP EST FIN FRA GEO GER GHA GRE HUN IRL ISL ISR ITA JAM JPN KOR LTU LUX LVA MAR MEX MLT NED NGA NIR NOR NZL PAN PAR PER POL POR QAT ROU SCO SEN SRB SUI SVK SVN SWE TUN TUR UKR URU USA WAL".split(
    " ",
  );

interface Row {
  team: string;
  pts: number;
  gf: number;
  ga: number;
  wins: number;
  homePts: number;
}

/** Every group's table, ranked by points, then goal difference, then goals scored. Groups in order, A first. */
function tables(input: string) {
  const groups = new Map<string, Map<string, Row>>();
  for (const line of lines(input)) {
    const m = /^(\w+):\s*(\w+)\s+(\d+)-(\d+)\s+(\w+)$/.exec(line);
    if (!m) throw new Error(`Can’t read “${line}”.`);
    const [, group, home, hs, as, away] = m;
    const g = groups.get(group) ?? new Map<string, Row>();
    groups.set(group, g);
    const row = (team: string) => {
      if (!g.has(team)) g.set(team, { team, pts: 0, gf: 0, ga: 0, wins: 0, homePts: 0 });
      return g.get(team)!;
    };
    const [h, a, hg, ag] = [row(home), row(away), Number(hs), Number(as)];
    h.gf += hg;
    h.ga += ag;
    a.gf += ag;
    a.ga += hg;
    const [hp, ap] = hg > ag ? [3, 0] : hg < ag ? [0, 3] : [1, 1];
    h.pts += hp;
    a.pts += ap;
    h.homePts += hp;
    h.wins += Number(hp === 3);
    a.wins += Number(ap === 3);
  }
  const rank = (rows: Row[]) => [...rows].sort((x, y) => y.pts - x.pts || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf);
  return [...groups.keys()]
    .sort()
    .map((name) => ({ name, rows: [...groups.get(name)!.values()], ranked: rank([...groups.get(name)!.values()]) }));
}

type GroupKind = "plain" | "gd" | "gdTrap" | "gf";

/**
 * How second place is decided in a group: on points (plain), on goal difference (gd; gdTrap when the team with the
 * better goal difference scored fewer goals, so skipping goal difference gives the wrong team), or on goals scored (gf).
 * Null if the group doesn't count: a tie for first on points, or second and third level on everything.
 */
function groupKind(ranked: Row[]): GroupKind | null {
  const [a, b, c] = ranked;
  if (a.pts === b.pts) return null;
  if (b.pts > c.pts) return "plain";
  const gd = (x: Row) => x.gf - x.ga;
  if (gd(b) > gd(c)) return b.gf < c.gf ? "gdTrap" : "gd";
  return b.gf > c.gf ? "gf" : null;
}

/** Every input has groups of each kind, in these numbers. */
export const GROUP_PLAN: GroupKind[] = ["gd", "gd", "gdTrap", "gdTrap", "gf", "gf", "gf", "plain", "plain", "plain", "plain", "plain"];

export function qualifierFacts(input: string) {
  const ts = tables(input);
  const kinds = ts.map((t) => groupKind(t.ranked));
  const first = (rows: Row[], score: (r: Row) => number) => rows.reduce((best, r) => (score(r) > score(best) ? r : best));
  return {
    groups: ts.length,
    teams: ts.map((t) => t.rows.length),
    kinds,
    // Ties for second where sorting on points alone (keeping teams in the order they first show up) gets it wrong.
    naiveWrong: ts.filter((t, i) => kinds[i] !== "plain" && t.ranked[1].team !== [...t.rows].sort((x, y) => y.pts - x.pts)[1].team).length,
    // Groups where counting wins instead of points, or only home games, picks the wrong winner.
    winsWrong: ts.filter((t) => first(t.rows, (r) => r.wins).team !== t.ranked[0].team).length,
    homeWrong: ts.filter((t) => first(t.rows, (r) => r.homePts).team !== t.ranked[0].team).length,
  };
}

function generateQualifiers(seed: number) {
  const r = rng(seed);
  const goals = () => r.weighted([30, 33, 20, 10, 5, 2]);
  // Each team plays every other team home and away: five rounds (one team rests each round), then the return legs.
  const rounds: [number, number][][] = [];
  for (let k = 0; k < 5; k++) {
    const ring = [0, 1, 2, 3, 4, 5].map((s) => (s === 5 ? 5 : (s + k) % 5));
    rounds.push(
      [
        [ring[0], ring[5]],
        [ring[1], ring[4]],
        [ring[2], ring[3]],
      ].filter(([x, y]) => x !== 5 && y !== 5) as [number, number][],
    );
  }
  const make = () => {
    const codes = r.shuffle([...CODES]);
    const groups = r.shuffle([...GROUP_PLAN]).map((kind, g) => {
      const name = String.fromCharCode(65 + g);
      const teams = codes.slice(g * 5, g * 5 + 5);
      // First legs: who's at home is random; return legs swap it.
      const legs = rounds.map((round) => round.map(([x, y]) => (r.int(0, 1) ? [x, y] : [y, x])));
      const fixtures = [...legs, ...legs.map((round) => round.map(([x, y]) => [y, x]))];
      return until(
        () => {
          const played = fixtures.map((round) => round.map(([x, y]) => `${name}: ${teams[x]} ${goals()}-${goals()} ${teams[y]}`));
          return { played, kind: groupKind(tables(played.flat().join("\n"))[0].ranked) };
        },
        (x) => x.kind === kind,
      ).played;
    });
    // Rounds in order; within a round the groups play in any order.
    return Array.from({ length: 10 }, (_, k) => r.shuffle(groups.flatMap((g) => g[k])))
      .flat()
      .join("\n");
  };
  return until(make, (input) => {
    const f = qualifierFacts(input);
    return f.naiveWrong >= 2 && f.winsWrong >= 1 && f.homeWrong >= 1;
  });
}

function solveQualifiers(input: string): PuzzleAnswers {
  const ts = tables(input);
  return { part1: ts.map((t) => t.ranked[0].team).join(""), part2: ts.map((t) => t.ranked[1].team).join("") };
}

// ---- The deck --------------------------------------------------------------

export const PUZZLES: Puzzle[] = [
  {
    name: "sticker swap",
    level: "easy",
    minutes: 10,
    relay: true,
    slot: "preview",
    story:
      "Your team is filling the Hello, World Cup sticker album, and the packs you opened this week are everywhere. Each line of your puzzle input is one pack: the numbers on the stickers inside, separated by spaces, in the order you pulled them out.",
    part1:
      "Every pack has one shiny: the sticker with the highest number in that pack. Find the shiny in every pack and add up their numbers. What do you get?",
    part2:
      "Swap time. Go through the packs from top to bottom, and each pack from left to right. The first time you see a sticker number, it goes in the album. Every copy after that goes in your swap pile. What do the numbers in your swap pile add up to?",
    example: "4 12 9\n30 4 7 4\n12 5",
    exampleAnswers: { part1: "54", part2: "20" },
    exampleWhy: [
      "The shinies are 12, 30, and 12, and 12 + 30 + 12 = 54.",
      "The second and third 4 and the second 12 go in the swap pile, and 4 + 4 + 12 = 20.",
    ],
    hint: [
      "Turn each sticker into a number with int() before you look for the biggest one. As text, “9” beats “12”.",
      "Keep a set of the stickers you’ve seen. If a sticker is already in it, add it to the swap pile; if not, add it to the set.",
    ],
    solution: `lines = open("input.txt").read().splitlines()

# Part 1: add up the highest sticker in each pack
total = 0
for line in lines:
    stickers = [int(n) for n in line.split()]
    total += max(stickers)
print("Part 1:", total)

# Part 2: any sticker we've seen before goes in the swap pile
seen = set()
swap = 0
for line in lines:
    for n in line.split():
        n = int(n)
        if n in seen:
            swap += n
        else:
            seen.add(n)
print("Part 2:", swap)`,
    generate: generateStickers,
    solve: solveStickers,
  },
  {
    name: "comeback kings",
    level: "easy",
    minutes: 13,
    relay: true,
    slot: "final1",
    story:
      "The stadium’s old scoreboard never saved final scores. It only logged each goal as it went in: H for the home team, A for the away team. Each line of your input is one match. `Match 12: HAAH` means the home team scored first, then the away team scored twice, then the home team scored again. A match with no goals is logged as `-`.",
    part1:
      "The home fans want bragging rights. Find every match the home team won (it scored more goals). What do their match numbers add up to?",
    part2:
      "Now the highlight reel: comebacks. A comeback is a match won by a team that was losing at some point during it. Draws never count. What do the match numbers of all the comebacks add up to?",
    example: "Match 1: HHA\nMatch 2: AHH\nMatch 3: -\nMatch 4: HAAAHH\nMatch 5: AAHHH\nMatch 6: HA\nMatch 7: AHAA\nMatch 8: HHAAA",
    exampleAnswers: { part1: "8", part2: "15" },
    exampleWhy: [
      "The home team won matches 1, 2, and 5, and 1 + 2 + 5 = 8.",
      "In match 2 the home team was down 0–1, in match 5 it was down 0–2, and in match 8 the away team was down 0–2, and all three came back to win: 2 + 5 + 8 = 15. Match 4 ends 3–3, so it doesn’t count.",
    ],
    hint: [
      'Split each line at “: ” to get the match number and the goals. Then goals.count("H") is the home team’s score.',
      "Replay each match one goal at a time, keeping the score as you go, and remember whether the home team or the away team was ever behind.",
    ],
    solution: `part1 = 0
part2 = 0
for line in open("input.txt").read().splitlines():
    name, goals = line.split(": ")
    number = int(name.split()[1])

    # Replay the match goal by goal
    home = 0
    away = 0
    home_behind = False
    away_behind = False
    for goal in goals:
        if goal == "H":
            home += 1
        elif goal == "A":
            away += 1
        if home < away:
            home_behind = True
        if away < home:
            away_behind = True

    if home > away:
        part1 += number
    if (home > away and home_behind) or (away > home and away_behind):
        part2 += number

print("Part 1:", part1)
print("Part 2:", part2)`,
    generate: generateMatches,
    solve: solveMatches,
  },
  {
    name: "road to the cup",
    level: "medium",
    minutes: 26,
    slot: "final2",
    story:
      "Before the Cup comes qualifying: 60 teams in 12 groups of 5, A to L. Everyone in a group plays everyone else twice, home and away. A win is worth 3 points, a draw 1, and a loss 0. Each line of your input is one result, in the order the matches were played: `C: MEX 2-1 JPN` means that in group C, MEX (at home) beat JPN 2–1.",
    part1:
      "Each group’s winner, the team with the most points, goes to the Cup. (In your input there’s never a tie for first.) Write down every group’s winner in group order, A to L, all run together: if MEX won group A and JPN won group B, your answer starts MEXJPN. (Spaces or commas between them are fine.)",
    part2:
      "Second place goes to the play-offs, and second place is often a tie on points. Break ties the FIFA way: most points, then the best goal difference (goals scored minus goals let in), then the most goals scored. Your input never needs more than that. Write down every group’s runner-up in group order, all run together.",
    example:
      "A: BRA 2-0 ARG\nB: JPN 1-0 KOR\nA: ARG 1-1 URU\nB: KOR 2-2 AUS\nA: URU 0-1 BRA\nB: AUS 2-1 JPN\nA: ARG 1-3 BRA\nB: KOR 0-2 JPN\nA: URU 0-3 ARG\nB: AUS 0-1 KOR\nA: BRA 0-1 URU\nB: JPN 2-0 AUS",
    exampleAnswers: { part1: "BRAJPN", part2: "ARGAUS" },
    exampleWhy: [
      "The example has two groups of three. BRA wins group A with 9 points and JPN wins group B with 9, so the answer is BRAJPN.",
      "In group A, ARG and URU both have 4 points, but ARG’s goal difference is −1 and URU’s is −3. In group B, KOR and AUS both have 4 points and a goal difference of −2, but AUS scored 4 goals to KOR’s 3. So the answer is ARGAUS.",
    ],
    hint: [
      "Keep a dictionary of points for every team, and another that remembers each group’s teams. Then, for each group in order, find the team with the most points.",
      "Python sorts tuples one item at a time. Sort each group’s teams by (points, goal difference, goals scored) with reverse=True, and take the second one.",
    ],
    solution: `points = {}
scored = {}
let_in = {}
groups = {}

for line in open("input.txt").read().splitlines():
    group, match = line.split(": ")
    home, score, away = match.split()
    home_goals, away_goals = [int(g) for g in score.split("-")]

    for team in (home, away):
        if team not in points:
            points[team] = 0
            scored[team] = 0
            let_in[team] = 0
            if group not in groups:
                groups[group] = []
            groups[group].append(team)

    scored[home] += home_goals
    let_in[home] += away_goals
    scored[away] += away_goals
    let_in[away] += home_goals
    if home_goals > away_goals:
        points[home] += 3
    elif home_goals < away_goals:
        points[away] += 3
    else:
        points[home] += 1
        points[away] += 1

def rank(team):
    return (points[team], scored[team] - let_in[team], scored[team])

part1 = ""
part2 = ""
for group in sorted(groups):
    table = sorted(groups[group], key=rank, reverse=True)
    part1 += table[0]
    part2 += table[1]
print("Part 1:", part1)
print("Part 2:", part2)`,
    generate: generateQualifiers,
    solve: solveQualifiers,
  },
];

/** The puzzle a lineup round plays, e.g. "Final round, double points: Puzzle 2, medium" is the Final's second puzzle. */
export function puzzleForLabel(label: string) {
  const slot = /preview/i.test(label) ? "preview" : /puzzle 1/i.test(label) ? "final1" : /puzzle 2/i.test(label) ? "final2" : null;
  const i = PUZZLES.findIndex((p) => p.slot === slot);
  return i === -1 ? undefined : i;
}
