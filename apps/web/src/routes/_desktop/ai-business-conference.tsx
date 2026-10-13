import { createFileRoute } from "@tanstack/react-router";
import { CLUB } from "#/lib/season";

// The desktop (routes/_desktop.tsx) opens the matching window; this route only sets the address and title.
export const Route = createFileRoute("/_desktop/ai-business-conference")({
  head: () => ({ meta: [{ title: `AI Business Conference · ${CLUB.name} at ${CLUB.school}` }] }),
  component: () => null,
});
