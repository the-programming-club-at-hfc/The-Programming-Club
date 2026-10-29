import { createFileRoute } from "@tanstack/react-router";
import { Survey } from "#/components/survey";
import { CLUB } from "#/lib/season";

// The member survey, the link in the "help us plan" email. Results are at /survey/results, for officers.
export const Route = createFileRoute("/survey/")({
  head: () => ({
    meta: [
      { title: `Help us plan the club · ${CLUB.name}` },
      { name: "description", content: `Three minutes: tell ${CLUB.name} what you want and when you can come.` },
    ],
  }),
  component: Survey,
});
