// The season plan: the defaults in content.ts and season.ts, with officer edits from the planner laid on top.
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import { GAMES, IDEAS, REMIX_MENU, WEEKS } from "./content";
import { WEEK_STARTS } from "./season";
import type { Idea, IdeaGroup, Week } from "./types";

export type LineupItem = { label: string; double: boolean };
export type WeekPlan = Week & { week: number; start: Date; cancelled: boolean; lineup: LineupItem[]; edited: boolean };
type Stored = FunctionReturnType<typeof api.schedule.weeks>[number];

const DOUBLE = "Final round, double points: ";
export const parseLine = (s: string): LineupItem =>
  s.startsWith(DOUBLE) ? { label: s.slice(DOUBLE.length), double: true } : { label: s, double: false };
export const lineText = (g: LineupItem) => (g.double ? DOUBLE + g.label : g.label);

export const DEFAULT_PLAN: WeekPlan[] = WEEKS.map((w, i) => ({
  ...w,
  week: i + 1,
  start: WEEK_STARTS[i],
  cancelled: false,
  lineup: w.games.map(parseLine),
  edited: false,
}));

export function mergePlan(stored: Stored[] | undefined): WeekPlan[] {
  return DEFAULT_PLAN.map((d) => {
    const s = stored?.find((x) => x.week === d.week);
    if (!s) return d;
    return {
      ...d,
      title: s.title,
      pitch: s.pitch,
      lesson: s.lesson,
      bonus: s.bonus,
      start: new Date(s.startsAt),
      cancelled: s.cancelled,
      lineup: s.lineup,
      games: s.lineup.map(lineText),
      edited: true,
    };
  });
}

/** The season plan for any page. Shows the defaults until the officer edits load. */
export function useSchedule() {
  const stored = useQuery(api.schedule.weeks);
  return useMemo(() => mergePlan(stored), [stored]);
}

const HOUR = 60 * 60 * 1000;

/** Index of the meeting that is live now or comes next, skipping cancelled weeks; null once the season is over. */
export function nextMeeting(plan: WeekPlan[], now = Date.now()): { i: number; live: boolean } | null {
  for (let i = 0; i < plan.length; i++) {
    if (plan[i].cancelled) continue;
    const start = plan[i].start.getTime();
    if (now < start + HOUR) return { i, live: now >= start };
  }
  return null;
}

/** 1-based week number officers most likely want to start tonight. */
export function likelyWeek(plan: WeekPlan[], now = Date.now()) {
  const n = nextMeeting(plan, now + 12 * HOUR);
  return n ? n.i + 1 : plan.length;
}

// How a lineup entry names each game. "Silent Relay" is Code Relay; "Bug Bounty" and "Fix it for real" are Bug Hunt
// variants. Fix it for real comes first so it opens its own deck on /host and shows its own tile.
const GAME_NAMES: [RegExp, string][] = [
  [/Fix it for real/, "fix"],
  [/Wiki Race/, "wiki"],
  [/Bug Hunt|Bug Bounty|Fix it for real/, "bug"],
  [/Relay/, "relay"],
  [/Output\?/, "output"],
  [/Pictionary/, "pictionary"],
  [/Guess the Language/, "lang"],
];

/** Which games a lineup entry refers to, e.g. "Final round, double points: Bug Hunt, hard" is Bug Hunt. */
export const gamesIn = (line: string) => GAME_NAMES.filter(([re]) => re.test(line)).map(([, id]) => id);

const PLANNED = [...DEFAULT_PLAN.flatMap((w) => w.lineup.map((g) => g.label)), ...REMIX_MENU];

/**
 * Each game's named variants from its rules, e.g. "Checkpoint: you must pass…" becomes
 * "Wiki Race: Checkpoint". Skipped when the plan already has it under another name ("Reverse Wiki Race").
 */
const VARIANTS = GAMES.flatMap((g) =>
  g.variants.flatMap((v) => {
    const name = v.split(":")[0].replace(/\s*\(.*\)$/, "");
    if (PLANNED.some((l) => l.includes(name) && gamesIn(l).includes(g.id))) return [];
    return [gamesIn(name).length ? name : `${g.name}: ${name}`];
  }),
);

/**
 * Everything officers can add to a night, grouped by game: each game on its own, every entry
 * from the original plan, the named variants from each game's rules, and the kickoff dot-vote menu.
 */
export const CATALOG: { id: string | null; name: string; items: string[] }[] = (() => {
  const all = new Set<string>([
    ...GAMES.map((g) => g.name),
    ...DEFAULT_PLAN.flatMap((w) => w.lineup.map((g) => g.label)),
    ...VARIANTS,
    ...REMIX_MENU,
  ]);
  const groups = GAMES.map((g) => ({ id: g.id, name: g.name, items: [] as string[] }));
  const other = { id: null, name: "Other", items: [] as string[] };
  for (const label of all) {
    const ids = gamesIn(label);
    (groups.find((g) => ids.includes(g.id)) ?? other).items.push(label);
  }
  return [...groups, other].filter((g) => g.items.length);
})();

/** The extra activities from the idea library, in their groups, with a color for each group. */
export const IDEA_GROUPS: { name: IdeaGroup; tile: string; ideas: Idea[] }[] = (
  [
    ["Coding challenges", "tile-sky"],
    ["Unplugged", "tile-meadow"],
    ["Game shows", "tile-sun"],
    ["Browser races", "tile-silver"],
    ["Build and demo", "tile-pine"],
  ] as const
).map(([name, tile]) => ({ name, tile, ideas: IDEAS.filter((i) => i.group === name) }));

/** The idea-library entry a lineup item refers to, if it is one. */
export const ideaFor = (label: string) => IDEAS.find((i) => i.name === label);
export const ideaTile = (label: string) => {
  const idea = ideaFor(label);
  return idea ? IDEA_GROUPS.find((g) => g.name === idea.group)?.tile : undefined;
};
