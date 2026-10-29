// The member survey (/survey) and its results for officers (/survey/results): the questions, their checks, and the
// tallies behind the charts. The mutation in convex/survey.ts checks answers with the same lists.

type Option = { id: string; label: string; hint?: string };

export const INTERESTS = [
  { id: "games", label: "Coding game nights" },
  { id: "ai", label: "Building with AI" },
  { id: "web", label: "Websites & apps" },
  { id: "gamedev", label: "Making games" },
  { id: "project", label: "A team project for my résumé" },
  { id: "hackathons", label: "Hackathons & competitions" },
  { id: "interviews", label: "Interview & LeetCode prep" },
  { id: "career", label: "Internships & careers" },
  { id: "speakers", label: "Guest speakers" },
  { id: "security", label: "Cybersecurity & CTFs" },
  { id: "classes", label: "Help with CS classes" },
  { id: "social", label: "Hanging out with other coders" },
] as const satisfies Option[];

// Ordered from least to most, so charts keep this order instead of sorting by count.
export const EXPERIENCE = [
  { id: "new", label: "Brand new", hint: "Never written code" },
  { id: "basics", label: "Some basics", hint: "A class or some tutorials" },
  { id: "built", label: "Built a few things", hint: "Projects for class or for fun" },
  { id: "confident", label: "Confident", hint: "I build things on my own" },
] as const satisfies Option[];

export const LANGUAGES = [
  { id: "python", label: "Python" },
  { id: "js", label: "JavaScript / TypeScript" },
  { id: "java", label: "Java" },
  { id: "c", label: "C / C++" },
  { id: "csharp", label: "C#" },
  { id: "web", label: "HTML & CSS" },
  { id: "sql", label: "SQL" },
  { id: "other", label: "Something else" },
] as const satisfies Option[];

export const FREQUENCY = [
  { id: "weekly", label: "Every week" },
  { id: "biweekly", label: "Every other week" },
  { id: "monthly", label: "Once a month" },
  { id: "events", label: "Just special events" },
] as const satisfies Option[];

export const LOCATIONS = [
  { id: "campus", label: "On campus" },
  { id: "discord", label: "Discord" },
  { id: "teams", label: "Microsoft Teams" },
] as const satisfies Option[];

export const BARRIERS = [
  { id: "time", label: "The time doesn’t work for me" },
  { id: "unaware", label: "I didn’t know when or where" },
  { id: "level", label: "Not sure it’s for my level" },
  { id: "format", label: "The activities aren’t my thing" },
  { id: "busy", label: "Classes, work, or family" },
  { id: "none", label: "Nothing, I’ve been coming" },
] as const satisfies Option[];

export const CHANNELS = [
  { id: "email", label: "HawkMail" },
  { id: "instagram", label: "Instagram" },
  { id: "discord", label: "Discord" },
  { id: "teams", label: "Microsoft Teams" },
] as const satisfies Option[];

// The availability grid: Monday to Sunday, one-hour slots starting 9 a.m. to 8 p.m. A slot is day * 24 + hour.
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as const;
export const slotOf = (day: number, hour: number) => day * 24 + hour;
export const SLOTS: number[] = DAYS.flatMap((_, d) => HOURS.map((h) => slotOf(d, h)));

const hour12 = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? "a.m." : "p.m."}`;
export const hourLabel = (h: number) => (h === 12 ? "Noon" : hour12(h));
/** "Wednesday, 5–6 p.m." */
export const slotLabel = (slot: number) => {
  const d = Math.floor(slot / 24);
  const h = slot % 24;
  const from = hour12(h);
  const to = hour12(h + 1);
  return `${DAY_NAMES[d]}, ${from.split(" ")[1] === to.split(" ")[1] ? from.split(" ")[0] : from}–${to}`;
};

export const NOTE_MAX = 500;

export type Answers = {
  interests: string[];
  experience: string;
  languages: string[];
  frequency: string;
  locations: string[];
  free: number[];
  barriers: string[];
  channels: string[];
  note: string;
};

export const BLANK: Answers = {
  interests: [],
  experience: "",
  languages: [],
  frequency: "",
  locations: [],
  free: [],
  barriers: [],
  channels: [],
  note: "",
};

const ids = (options: readonly Option[]) => new Set<string>(options.map((o) => o.id));
const only = (picked: string[], options: readonly Option[]) => picked.every((p) => ids(options).has(p));

/** Why these answers can't be saved, or null when they can. The questions marked required on the form are required here. */
export function surveyProblem(a: Answers): string | null {
  if (!a.interests.length || !only(a.interests, INTERESTS)) return "Pick at least one thing you want from the club.";
  if (!ids(EXPERIENCE).has(a.experience)) return "Pick how much coding you’ve done.";
  if (!only(a.languages, LANGUAGES)) return "Unknown language.";
  if (!ids(FREQUENCY).has(a.frequency)) return "Pick how often you’d come.";
  if (!a.locations.length || !only(a.locations, LOCATIONS)) return "Pick at least one place you’d meet.";
  if (!a.free.every((s) => SLOTS.includes(s))) return "Unknown time slot.";
  if (!only(a.barriers, BARRIERS) || !only(a.channels, CHANNELS)) return "Unknown answer.";
  if (a.note.length > NOTE_MAX) return `Keep the last answer under ${NOTE_MAX} characters.`;
  return null;
}

/** Answers as stored: no repeats, in the form's order, and the note trimmed. */
export const cleanAnswers = (a: Answers): Answers => {
  const sorted = (picked: string[], options: readonly Option[]) => options.map((o) => o.id).filter((id) => picked.includes(id));
  return {
    interests: sorted(a.interests, INTERESTS),
    experience: a.experience,
    languages: sorted(a.languages, LANGUAGES),
    frequency: a.frequency,
    locations: sorted(a.locations, LOCATIONS),
    free: SLOTS.filter((s) => a.free.includes(s)),
    barriers: sorted(a.barriers, BARRIERS),
    channels: sorted(a.channels, CHANNELS),
    note: a.note
      .replace(/\r\n?/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  };
};

// ---- Results ----

export type SurveyResponse = Answers & { name: string; email: string; nights: number; updatedAt: number };

export const ATTENDED = [
  { id: "came", label: "Has come to a meeting" },
  { id: "never", label: "Hasn’t come yet" },
] as const satisfies Option[];

/** Each question officers can narrow the results by: what a response picked, out of which options. */
export const QUESTIONS = {
  interests: { options: INTERESTS, pick: (r: SurveyResponse) => r.interests },
  experience: { options: EXPERIENCE, pick: (r: SurveyResponse) => [r.experience] },
  languages: { options: LANGUAGES, pick: (r: SurveyResponse) => r.languages },
  frequency: { options: FREQUENCY, pick: (r: SurveyResponse) => [r.frequency] },
  locations: { options: LOCATIONS, pick: (r: SurveyResponse) => r.locations },
  barriers: { options: BARRIERS, pick: (r: SurveyResponse) => r.barriers },
  channels: { options: CHANNELS, pick: (r: SurveyResponse) => r.channels },
  attended: { options: ATTENDED, pick: (r: SurveyResponse) => [r.nights > 0 ? "came" : "never"] },
} satisfies Record<string, { options: readonly Option[]; pick: (r: SurveyResponse) => string[] }>;

export type Question = keyof typeof QUESTIONS;

/** What officers narrowed the results to: within a question any pick matches, across questions all must, and `free`
 *  keeps members free in every one of those slots. */
export type Filters = Record<Question, string[]> & { free: number[] };

export const NO_FILTERS: Filters = {
  interests: [],
  experience: [],
  languages: [],
  frequency: [],
  locations: [],
  barriers: [],
  channels: [],
  attended: [],
  free: [],
};

export const matches = (r: SurveyResponse, f: Filters) =>
  (Object.keys(QUESTIONS) as Question[]).every((q) => !f[q].length || f[q].some((id) => QUESTIONS[q].pick(r).includes(id))) &&
  f.free.every((s) => r.free.includes(s));

/** How many responses picked each option of a question, in the option list's order. */
export const tally = (rows: SurveyResponse[], q: Question) =>
  QUESTIONS[q].options.map((o: Option) => ({
    id: o.id,
    label: o.label,
    n: rows.filter((r) => QUESTIONS[q].pick(r).includes(o.id)).length,
  }));

/** How many responses are free in each slot. */
export function heat(rows: SurveyResponse[]) {
  const n = new Map<number, number>(SLOTS.map((s) => [s, 0]));
  for (const r of rows) for (const s of r.free) n.set(s, (n.get(s) ?? 0) + 1);
  return n;
}

/** The slots the most people are free in, busiest first (ties in week order), leaving out empty ones. */
export const bestSlots = (counts: Map<number, number>, top = 5) =>
  SLOTS.map((slot) => ({ slot, n: counts.get(slot) ?? 0 }))
    .filter((s) => s.n > 0)
    .sort((a, b) => b.n - a.n || a.slot - b.slot)
    .slice(0, top);

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
const labels = (picked: string[], options: readonly Option[]) =>
  picked.map((id) => options.find((o) => o.id === id)?.label ?? id).join("; ");

/** Every response as a spreadsheet, one row each. */
export const responsesCsv = (rows: SurveyResponse[]) =>
  [
    [
      "Name",
      "Email",
      "Meetings attended",
      "Wants",
      "Experience",
      "Languages",
      "How often",
      "Where",
      "Free",
      "Hard to come",
      "Reach by",
      "Note",
      "Updated",
    ],
    ...rows.map((r) => [
      r.name,
      r.email,
      r.nights,
      labels(r.interests, INTERESTS),
      labels([r.experience], EXPERIENCE),
      labels(r.languages, LANGUAGES),
      labels([r.frequency], FREQUENCY),
      labels(r.locations, LOCATIONS),
      r.free.map(slotLabel).join("; "),
      labels(r.barriers, BARRIERS),
      labels(r.channels, CHANNELS),
      r.note,
      new Date(r.updatedAt).toISOString().slice(0, 10),
    ]),
  ]
    .map((l) => l.map(csvCell).join(","))
    .join("\n");

/** Made-up responses for previewing the results page before real ones come in. The same every time. */
const NOTES = [
  "A Python workshop for people who have never coded would be great.",
  "",
  "Could we go to a hackathon together as a team?",
  "",
  "I work until 4 most days, so anything after 4:30 works.",
  "",
  "",
  "Resume reviews and help finding internships.",
];

export function exampleResponses(count = 24): SurveyResponse[] {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const some = <T extends Option>(options: readonly T[], weights: number[]) =>
    options.filter((_, i) => rand() < weights[i]).map((o) => o.id);
  const one = <T extends Option>(options: readonly T[], weights: number[]) => {
    let x = rand() * weights.reduce((a, b) => a + b, 0);
    return options.find((_, i) => (x -= weights[i]) < 0)?.id ?? options[0].id;
  };
  const first = ["Ava", "Noah", "Maya", "Ali", "Zoe", "Omar", "Lena", "Sam", "Nadia", "Eli", "Rosa", "Kai", "Hana", "Leo"];
  return Array.from({ length: count }, (_, i) => {
    // Afternoons and early evenings midweek, the way a commuter campus tends to look.
    const free = SLOTS.filter((s) => {
      const d = Math.floor(s / 24);
      const h = s % 24;
      const p = (d < 5 ? 0.1 : 0.05) + (h >= 15 && h <= 18 ? 0.35 : 0) + (d === 1 || d === 3 ? 0.15 : 0);
      return rand() < p;
    });
    return {
      name: `${first[i % first.length]} ${String.fromCharCode(65 + ((i * 7) % 26))}.`,
      email: `student${i + 1}@example.test`,
      nights: rand() < 0.3 ? Math.ceil(rand() * 3) : 0,
      interests: some(INTERESTS, [0.3, 0.6, 0.45, 0.35, 0.4, 0.3, 0.3, 0.4, 0.2, 0.2, 0.25, 0.3]),
      experience: one(EXPERIENCE, [3, 5, 4, 2]),
      languages: some(LANGUAGES, [0.6, 0.35, 0.3, 0.25, 0.15, 0.3, 0.15, 0.05]),
      frequency: one(FREQUENCY, [4, 5, 2, 1]),
      locations: some(LOCATIONS, [0.75, 0.5, 0.2]),
      free,
      barriers: some(BARRIERS, [0.45, 0.35, 0.2, 0.15, 0.4, 0.1]),
      channels: some(CHANNELS, [0.5, 0.55, 0.45, 0.15]),
      note: NOTES[i] ?? "",
      updatedAt: Date.UTC(2026, 9, 29) - i * 3_600_000,
    };
  }).map((r) => ({ ...r, interests: r.interests.length ? r.interests : ["ai"], locations: r.locations.length ? r.locations : ["campus"] }));
}
