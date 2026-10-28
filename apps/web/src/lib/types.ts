export type WeekKind = "kickoff" | "match" | "cup" | "showcase" | "wrap";

export interface Week {
  kind: WeekKind;
  title: string;
  pitch: string;
  games: string[];
  bonus?: string;
  note?: string;
  /** XP for showing up that week. */
  showXp: number;
  /** A night dressed up: "spooky" turns the TV's lobby into a graveyard. It's played on computers, so no QR code, and
   *  phones get a nudge toward one. */
  theme?: "spooky";
}

export interface Agenda {
  t: string;
  len: number;
  what: string;
  detail: string;
}

export interface Game {
  id: string;
  name: string;
  gist: string;
  need: string;
  time: string;
  steps: string[];
  scoring: string;
  variants: string[];
  tip: string;
}

export interface Xp {
  pts: string;
  what: string;
  note: string;
}

export interface Award {
  name: string;
  how: string;
}

export type Level = "easy" | "medium" | "hard";

export interface Bug {
  level: Level;
  spooky?: boolean;
  code: string;
  /** Shown on reveal; may mention alternatives. */
  line: string;
  /** Line numbers (1-based) that count as a correct tap. */
  lines: number[];
  fix: string;
  /** Three plausible wrong fixes, shown with `fix` as phone choices. */
  wrong: [string, string, string];
  why: string;
  /** The card's title on screen, e.g. "quart" or "key in the logs". */
  name?: string;
  /** The language the code is in. Python when unset. */
  lang?: string;
  /** One line under the title on what the code does, so players know what "working" means. */
  context?: string;
  /** For a made-up card: the real news it's based on, shown on reveal. */
  news?: string;
  /** For a real bug: the advisory it was cut from. The code is the project's own, just before the fix. */
  source?: BugSource;
}

export interface BugSource {
  project: string;
  /** What the project is, in a few words. */
  blurb: string;
  cve: string;
  /** The advisory page. */
  url: string;
  /** YYYY-MM-DD. */
  published: string;
  severity: string;
  /** The fix commit. */
  commit: string;
  /** What the real fix changed, shown on reveal. */
  realFix: string;
}

export interface OutputQ {
  code: string;
  answer: string;
  /** Three plausible wrong answers, shown with `answer` as phone choices. */
  wrong: [string, string, string];
  why: string;
  tiebreak?: boolean;
}

export interface LangQ {
  lang: string;
  code: string;
  /** What gives it away, shown on reveal. */
  tell: string;
  /** Other answers that also count, e.g. TypeScript for a snippet that is valid in both. */
  also?: string[];
  /** Three look-alike wrong answers, shown beside `lang` as the four choices. Never one of `also`. */
  decoys: [string, string, string];
}

export interface Relay {
  name: string;
  level: Level;
  task: string;
  tests: [string, string][];
}

export interface WikiRace {
  from: string;
  to: string;
  cs?: boolean;
}

export type IdeaGroup = "Coding challenges" | "Unplugged" | "Game shows" | "Browser races" | "Build and demo";

/** An extra activity officers can drop into a night from the season planner. */
export interface Idea {
  name: string;
  group: IdeaGroup;
  how: string;
  time: string;
  need: string;
  /** Where to play it, or where the format comes from. */
  link?: string;
  /** Works well as a Cup-night round. */
  cup?: boolean;
  /** Something to check before the night, e.g. that a site loads on the lab computers. */
  check?: string;
}
