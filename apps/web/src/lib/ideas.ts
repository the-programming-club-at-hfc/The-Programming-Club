// New members' ideas for the club: asked once on their phone after their first join (convex/ideas.ts).
import { fmtDate } from "./season";

export const IDEA_MAX = 500;

/** An idea as stored: trimmed, with Windows line breaks and runs of blank lines squeezed. Empty means nothing to send. */
export const cleanIdea = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Every idea as plain text for a planning doc: one per paragraph, with who and when. */
export const ideasText = (ideas: { name: string; createdAt: number; text: string }[]) =>
  ideas.map((i) => `${i.name}, ${fmtDate(new Date(i.createdAt), { month: "short", day: "numeric" })}: ${i.text}`).join("\n\n");
