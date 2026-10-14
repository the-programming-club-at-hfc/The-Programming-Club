import { createFileRoute, redirect } from "@tanstack/react-router";

// Short link shown on the TV during a Wiki Race: programmingclub.dev/wiki
export const Route = createFileRoute("/wiki")({
  beforeLoad: () => {
    throw redirect({ to: "/hello-world/wiki" });
  },
});
