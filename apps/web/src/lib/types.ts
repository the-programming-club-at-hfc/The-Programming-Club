export type WeekKind = "kickoff" | "match" | "cup" | "wrap";

export interface Week {
  kind: WeekKind;
  title: string;
  pitch: string;
  lesson?: string;
  games: string[];
  bonus?: string;
  note?: string;
  /** XP for showing up that week (doubled on Boss Battle). */
  showXp: number;
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
