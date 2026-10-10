import { createFileRoute } from "@tanstack/react-router";

// The desktop (routes/_desktop.tsx) opens the matching window; this route only sets the address.
export const Route = createFileRoute("/_desktop/")({
  component: () => null,
});
