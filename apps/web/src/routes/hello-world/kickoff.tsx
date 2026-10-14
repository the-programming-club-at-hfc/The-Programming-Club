import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { SlideStage, kickoffSlides, useSlideKeys } from "#/components/kickoff";
import { useSchedule } from "#/lib/schedule";
import { CLUB } from "#/lib/season";

// The deck on its own, for rehearsing. On the night, /host puts these slides on the TV.
export const Route = createFileRoute("/hello-world/kickoff")({
  validateSearch: (s: Record<string, unknown>): { s?: number } => (Number(s.s) > 1 ? { s: Math.floor(Number(s.s)) } : {}),
  head: () => ({ meta: [{ title: `Kickoff · ${CLUB.season}` }] }),
  component: Kickoff,
});

function Kickoff() {
  const { s: n = 1 } = Route.useSearch();
  const navigate = useNavigate({ from: "/hello-world/kickoff" });
  const deck = useRef<HTMLDivElement>(null);
  const all = kickoffSlides(useSchedule());
  const i = Math.min(n, all.length) - 1;
  const go = useCallback(
    (to: number) => void navigate({ search: { s: Math.min(Math.max(to, 0), all.length - 1) + 1 }, replace: true }),
    [navigate, all.length],
  );
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : deck.current?.requestFullscreen());
  useSlideKeys(i, all.length, go);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key.toLowerCase() === "f" && void fullscreen();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={deck} className="always-move theme-pine flex h-screen flex-col">
      <SlideStage slides={all} i={i} />
      <footer className="flex items-center gap-3 bg-mist px-5 py-2 text-sm font-semibold">
        <button className="btn btn-sm" onClick={() => go(i - 1)} aria-label="Previous slide">
          ‹
        </button>
        <span className="min-w-16 text-center" aria-live="polite">
          <span key={i} className="m-rise inline-block" style={{ "--base": "0ms" } as CSSProperties}>
            {i + 1}
          </span>{" "}
          / {all.length}
        </span>
        <button className="btn btn-sm" onClick={() => go(i + 1)} aria-label="Next slide">
          ›
        </button>
        <span className="h-1.5 flex-1 bg-line">
          <span className="deck-progress block h-full bg-sky" style={{ width: `${((i + 1) / all.length) * 100}%` }} />
        </span>
        <button className="btn btn-sm" onClick={() => void fullscreen()}>
          Full screen (F)
        </button>
      </footer>
    </div>
  );
}
