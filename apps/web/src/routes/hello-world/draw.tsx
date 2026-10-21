import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Sketch, drawOpen } from "#/components/draw";
import { fmtClock, useRemaining } from "#/components/game";
import { OfficerGate, run } from "#/components/officer";
import { Picto } from "#/components/ui";
import { CLUB } from "#/lib/season";

// The officer tablet for Tech Pictionary: a shared drawing pad for anyone who'd rather not draw on their phone. It draws
// on the same picture as the drawer's phone. Sized for a landscape tablet with a pen.
export const Route = createFileRoute("/hello-world/draw")({
  head: () => ({ meta: [{ title: `Drawing pad · ${CLUB.season}` }, { name: "robots", content: "noindex" }] }),
  component: DrawPad,
});

function DrawPad() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden overscroll-none">
      <OfficerGate redirect="/hello-world/draw" purpose="use the drawing pad">
        <Pad />
      </OfficerGate>
    </div>
  );
}

/** Keeps the tablet's screen on while the pad is open, since it sits idle between drawings. Needs https, so it's quiet
 *  elsewhere; the screen timeout in the tablet's settings is the backup (see the officer prep list). */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const ask = () => {
      if (document.visibilityState === "visible" && "wakeLock" in navigator)
        navigator.wakeLock.request("screen").then(
          (l) => (lock = l),
          () => undefined,
        );
    };
    ask();
    document.addEventListener("visibilitychange", ask);
    return () => {
      document.removeEventListener("visibilitychange", ask);
      void lock?.release();
    };
  }, []);
}

/** Full screen hides the browser's address bar and tabs (and Android's bars), so the pad gets the whole tablet. Browsers
 *  only allow it from a tap, and a swipe from the edge leaves it, so the button stays until it's on. */
function FullScreen({ className = "" }: { className?: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const check = () => setOn(!!document.fullscreenElement || !document.fullscreenEnabled);
    check();
    document.addEventListener("fullscreenchange", check);
    return () => document.removeEventListener("fullscreenchange", check);
  }, []);
  if (on) return null;
  return (
    <button className={`btn btn-sm ${className}`} onClick={() => void document.documentElement.requestFullscreen().catch(() => undefined)}>
      Full screen
    </button>
  );
}

function Pad() {
  useWakeLock();
  const live = useQuery(api.sessions.live);
  const data = useQuery(api.drawings.host);
  const skip = useMutation(api.drawings.skip);
  const remaining = useRemaining(live?.timer);
  // The word stays hidden until tapped, for each word, since guessers walk past the tablet.
  const [shown, setShown] = useState<string | null>(null);
  const s = live?.screen;
  const cur = data?.current;
  const d = s?.mode === "draw" && cur?.n === s.drawing ? cur : null;
  // The scores or a message are up mid-drawing: it's coming back, not over.
  const paused = !!cur && !cur.over && s?.mode !== "draw" && s?.drawing === cur.n;
  if (!live || !d)
    return (
      <div className="grid flex-1 place-items-center text-center">
        <div>
          <div className="tile tile-pine mx-auto mb-8 size-28">
            <Picto id="pictionary" className="absolute inset-[14%]" />
          </div>
          <h1 className="text-[clamp(2.4rem,6vw,3.6rem)] lowercase">
            {paused ? "drawing paused" : "waiting for the next drawing"}
            <span className="blink"> _</span>
          </h1>
          <FullScreen className="mt-8" />
        </div>
      </div>
    );
  // No grace here: the clock on this screen stops at 0:00, and so does the pen.
  const open = !d.over && drawOpen(live, d.key, remaining);
  const show = shown === d.word;
  return (
    <>
      <header className="flex items-center gap-4 border-b border-line px-4 py-2">
        <p className="min-w-0 truncate text-2xl font-extrabold">
          {d.drawerName} {d.over ? "drew" : "is drawing"}
        </p>
        <button
          className={`btn min-w-48 text-xl ${show || d.over ? "btn-on" : ""}`}
          onClick={() => setShown(show ? null : d.word)}
          aria-pressed={show}
        >
          {show || d.over ? d.word : "Tap to show the word"}
        </button>
        {open && d.got === 0 && (
          <button className="btn btn-sm" onClick={() => run(skip({ drawingId: d._id }).then(() => setShown(null)))}>
            Skip word
          </button>
        )}
        <FullScreen />
        <p className={`narrow ml-auto text-5xl font-extrabold ${open && remaining <= 10_000 ? "text-signal" : ""}`}>
          {open ? fmtClock(remaining) : "pens down"}
        </p>
      </header>
      <Sketch
        key={`${d._id}:${d.rev}`}
        drawingId={d._id}
        rev={d.rev}
        edit={open}
        className="flex min-h-0 flex-1 gap-3 bg-mist p-3"
        canvasClass="h-full min-w-0 flex-1"
        // Two columns, so every tool fits under a tablet browser's tab and bookmark bars; Undo and Clear span both.
        toolsClass="grid w-24 shrink-0 grid-cols-2 content-start justify-items-center gap-2 [&>button:nth-last-of-type(-n+2)]:col-span-2 [&>button:nth-last-of-type(-n+2)]:w-full [&>p]:col-span-2"
      />
    </>
  );
}
