import { createFileRoute } from "@tanstack/react-router";
import { SurveyResults } from "#/components/survey-results";
import { CLUB } from "#/lib/season";

export const Route = createFileRoute("/survey/results")({
  head: () => ({ meta: [{ title: `Survey results · ${CLUB.name}` }, { name: "robots", content: "noindex" }] }),
  component: SurveyResults,
});
