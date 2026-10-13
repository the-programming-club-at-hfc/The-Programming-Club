import { createFileRoute, redirect } from "@tanstack/react-router";

// Short link shown on the TV: programmingclub.dev/join
export const Route = createFileRoute("/join")({
  validateSearch: (s: Record<string, unknown>): { code?: string } => (typeof s.code === "string" ? { code: s.code } : {}),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/hello-world/join", search });
  },
});
