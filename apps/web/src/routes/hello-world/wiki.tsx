import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";
import { Picto, Wrap } from "#/components/ui";
import { wikiUrl } from "#/lib/content";
import { CLUB } from "#/lib/season";

// A team computer opens this and lands on tonight's start article. Between races it waits for the next one.
export const Route = createFileRoute("/hello-world/wiki")({
  head: () => ({ meta: [{ title: `Wiki Race · ${CLUB.season}` }] }),
  component: Wiki,
});

function Wiki() {
  const live = useQuery(api.sessions.live);
  const s = live?.screen;
  const from = s?.mode === "wiki" && !s.revealed && !s.wikiReady ? s.wikiFrom : undefined;
  const ready = s?.mode === "wiki" && !!s.wikiReady;
  // replace, not assign, so the race's back button doesn't land here and bounce forward again.
  useEffect(() => {
    if (from) window.location.replace(wikiUrl(from));
  }, [from]);

  return (
    <Wrap className="max-w-xl py-16">
      <div className="tile tile-sky size-24">
        <Picto id="wiki" className="absolute inset-[14%]" />
      </div>
      <h1 className="mt-6 text-[clamp(2.4rem,6vw,4rem)] lowercase">wiki race</h1>
      {from ? (
        <p className="mt-4 text-lg">
          Opening{" "}
          <a href={wikiUrl(from)} className="link">
            {from}
          </a>
          …
        </p>
      ) : (
        <p className="mt-4 text-lg text-dim">
          {live === undefined
            ? "Checking for a race…"
            : ready
              ? "You’re ready. Keep this page open: it jumps to the start article the moment the race starts."
              : "Keep this page open. It jumps to the start article as soon as the next race is on the TV."}
        </p>
      )}
    </Wrap>
  );
}
