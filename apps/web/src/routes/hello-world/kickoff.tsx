import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import { AgendaList, Code, Picto, weekTile } from "#/components/ui";
import { FEEDBACK, GAMES, MATCH_AGENDA, REMIX_MENU, WALL_CATEGORIES } from "#/lib/content";
import { useSchedule } from "#/lib/schedule";
import type { WeekPlan } from "#/lib/schedule";
import { CLUB, OFFICERS, fmtDate } from "#/lib/season";
import { XpTable } from "./rules";

export const Route = createFileRoute("/hello-world/kickoff")({
  validateSearch: (s: Record<string, unknown>): { s?: number } => (Number(s.s) > 1 ? { s: Math.floor(Number(s.s)) } : {}),
  head: () => ({ meta: [{ title: `Kickoff · ${CLUB.season}` }] }),
  component: Kickoff,
});

function JoinBox() {
  const live = useQuery(api.sessions.live);
  const [origin, setOrigin] = useState(`https://${CLUB.url}`);
  useEffect(() => setOrigin(window.location.origin), []);
  if (!live) return <p className="text-dim">Officers: start Week 1 in /host and the join code appears here.</p>;
  return (
    <div className="flex items-center gap-6">
      <div className="bg-white p-3">
        <QRCodeSVG value={`${origin}/hello-world/join?code=${live.code}`} size={180} marginSize={0} />
      </div>
      <div>
        <p className="text-dim">Scan to join, or enter code</p>
        <p className="narrow text-8xl leading-none font-extrabold tracking-[0.12em]">{live.code}</p>
        <p className="text-dim">{live.roster.length} joined</p>
      </div>
    </div>
  );
}

const H = ({ children }: { children: ReactNode }) => (
  <h2 className="mb-[0.7em] text-[clamp(2.6rem,4.6vw,5rem)] leading-[0.9] tracking-[-0.045em] lowercase">{children}</h2>
);
const Big = ({ children }: { children: ReactNode }) => (
  <ul className="prose-list space-y-4 text-[clamp(1.3rem,1.9vw,2rem)] leading-snug">{children}</ul>
);

function slides(plan: WeekPlan[]): ReactNode[] {
  const wiki = GAMES.find((g) => g.id === "wiki")!;
  const officers = OFFICERS.filter((o) => o.name);
  const s: ReactNode[] = [
    <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <p className="text-xl text-dim">
          {CLUB.name} at {CLUB.school}
        </p>
        <h1 className="mt-3 text-[clamp(3.5rem,8vw,8rem)] leading-[0.9] tracking-[-0.045em] lowercase">
          Hello,
          <br />
          World Cup
        </h1>
        <p className="mt-8 text-3xl font-bold">{CLUB.tag}</p>
      </div>
      <div className="space-y-8">
        <div className="rounded-[6px] bg-mist p-8">
          <h3 className="text-2xl">Warm-up: what does this print?</h3>
          <Code code={'print("go" + "!" * 3)'} numbered={false} className="mt-3 text-3xl" />
        </div>
        <JoinBox />
      </div>
    </div>,
    <div className="text-center">
      <h2 className="text-[clamp(3rem,6.5vw,7rem)] leading-[0.9] tracking-[-0.045em] lowercase">Welcome to the very first meeting.</h2>
      <p className="mx-auto mt-10 max-w-[34ch] text-[clamp(1.5rem,2.4vw,2.6rem)]">
        Everyone here tonight is a Founding Member of {CLUB.name}.
      </p>
      <p className="chip mt-10 px-5 py-2 text-xl">
        Warm-up answer: <code className="font-bold">go!!!</code>. Multiplying a string repeats it.
      </p>
    </div>,
    <div>
      <H>Meet the officers</H>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {officers.map((o) => (
          <li key={o.name} className="border-t-[3px] border-ink pt-4">
            <p className="text-dim">{o.role}</p>
            <p className="mt-1 text-3xl leading-tight font-extrabold tracking-[-0.02em]">{o.name}</p>
            {o.fact && <p className="mt-3">{o.fact}</p>}
          </li>
        ))}
      </ul>
    </div>,
    <div className="grid gap-12 lg:grid-cols-2">
      <div>
        <H>What this club is</H>
        <Big>
          <li>A friendly place to learn and practice programming together, whatever your level.</li>
          <li>Workshops, group projects, talks, and other things that build real skills.</li>
          <li>A place to show what you’re working on and meet people who like this stuff.</li>
        </Big>
      </div>
      <dl className="space-y-6 self-center">
        {[
          ["Who can join", "All currently enrolled HFC students"],
          ["Experience needed", "None"],
          ["Dues", "$0, always"],
        ].map(([k, v]) => (
          <div key={k} className="border-l-[6px] border-sky pl-6">
            <dt className="text-xl text-dim">{k}</dt>
            <dd className="text-5xl font-extrabold tracking-[-0.03em]">{v}</dd>
          </div>
        ))}
      </dl>
    </div>,
  ];
  s.push(
    <div className="text-center">
      <h2 className="text-[clamp(3rem,6.5vw,7rem)] leading-[0.9] tracking-[-0.045em] lowercase">Why “Season 0”?</h2>
      <p className="mt-10 text-[clamp(1.6rem,2.6vw,2.8rem)]">Because programmers start counting at zero.</p>
      <p className="mx-auto mt-6 max-w-[48ch] text-[clamp(1.2rem,1.7vw,1.8rem)] text-dim">
        This semester is our pilot: eight weeks of team games to get to know each other. Next semester is Season 1, with bigger events
        planned around what you tell us tonight.
      </p>
    </div>,
    <div>
      <H>The next eight Wednesdays</H>
      <ol className="grid grid-cols-4 gap-x-[3px] gap-y-6 lg:grid-cols-8">
        {plan.map((w, i) => {
          const t = weekTile(w);
          return (
            <li key={w.week}>
              <span className={`tile ${t.tile} block aspect-square`}>
                <Picto id={t.picto} className="absolute inset-[15%]" />
                <span className="narrow absolute top-2 left-3 text-3xl font-extrabold">{i + 1}</span>
              </span>
              <span className="narrow mt-3 block text-xl font-bold text-dim">
                {fmtDate(w.start, { month: "short", day: "numeric" }).toLowerCase()}
              </span>
              <span className="block text-[clamp(1rem,1.4vw,1.5rem)] leading-tight font-bold">{w.title}</span>
            </li>
          );
        })}
      </ol>
    </div>,
    <div className="grid gap-12 lg:grid-cols-2">
      <div>
        <H>How a night works</H>
        <div className="text-2xl">
          <AgendaList rows={MATCH_AGENDA.slice(0, 6)} compact />
        </div>
      </div>
      <ul className="space-y-6 self-center text-[clamp(1.3rem,1.8vw,1.9rem)]">
        <li className="border-l-[6px] border-meadow pl-6">
          <strong>No homework.</strong> Everything happens in the room.
        </li>
        <li className="border-l-[6px] border-meadow pl-6">
          <strong>Join any week.</strong> Scan the QR code and you’re on a team.
        </li>
        <li className="border-l-[6px] border-meadow pl-6">
          <strong>Any language for Code Relay.</strong> On-screen puzzles are short Python, and we explain every one.
        </li>
      </ul>
    </div>,
    <div>
      <H>How you score</H>
      <div className="max-w-4xl text-2xl">
        <XpTable />
      </div>
      <p className="mt-8 text-[clamp(1.4rem,2.2vw,2.4rem)]">Showing up is worth as much as winning. Every week is a fresh chance.</p>
    </div>,
    <div className="grid items-center gap-12 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <H>Cup nights and the Golden Keycap</H>
        <Big>
          <li>Week 4 is the Midseason Cup. Week 6 is the Final.</li>
          <li>Everyone starts at zero, so a first-timer can win.</li>
          <li>Every week you attend earns you a power-up card.</li>
          <li>The last round is All-In: wager any or all of your points.</li>
          <li>The winners sign the Golden Keycap.</li>
        </Big>
      </div>
      <div className="tile tile-gold mx-auto aspect-square w-[min(100%,24rem)]">
        <Picto id="keycap" className="absolute inset-[16%]" label="The Golden Keycap" />
      </div>
    </div>,
    <div className="grid gap-12 lg:grid-cols-2">
      <div>
        <H>Your turn: what should this club be?</H>
        <ol className="steps space-y-3 text-[clamp(1.2rem,1.7vw,1.8rem)]">
          {FEEDBACK.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ol>
      </div>
      <div className="self-center text-center">
        {CLUB.links.feedbackForm && (
          <div className="mb-8">
            <div className="inline-block bg-white p-3">
              <QRCodeSVG value={CLUB.links.feedbackForm} size={220} marginSize={0} />
            </div>
            <p className="mt-2 text-xl">Scan to answer on your phone</p>
          </div>
        )}
        <p className="text-xl text-dim">Or grab sticky notes and post ideas under:</p>
        <ul className="mt-4 grid grid-cols-2 gap-4">
          {WALL_CATEGORIES.map((c, i) => (
            <li key={c} className={`tile ${["tile-sky", "tile-meadow", "tile-sun", "tile-silver"][i % 4]} py-8 text-3xl font-extrabold`}>
              {c}
            </li>
          ))}
        </ul>
      </div>
    </div>,
    <div>
      <H>Pick the games for Boss Battle</H>
      <p className="text-[clamp(1.2rem,1.8vw,1.9rem)] text-dim">
        Put a dot next to the two you want on {fmtDate(plan[6].start, { month: "long", day: "numeric" })}.
      </p>
      <ul className="mt-8 grid gap-x-12 sm:grid-cols-2">
        {REMIX_MENU.map((g) => (
          <li key={g} className="border-b-2 border-dashed border-line py-5 font-bold text-[clamp(1.6rem,2.6vw,2.8rem)]">
            {g}
          </li>
        ))}
      </ul>
    </div>,
    <div className="grid gap-12 lg:grid-cols-2">
      <div>
        <H>First match: Wiki Race</H>
        <ol className="steps space-y-3 text-[clamp(1.2rem,1.8vw,1.9rem)]">
          {wiki.steps.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
      </div>
      <div className="self-center">
        <h3 className="text-3xl">Scoring</h3>
        <p className="mt-3 text-2xl">{wiki.scoring}</p>
        <p className="mt-6 text-xl text-dim">Teams of 2–3, one computer per team.</p>
      </div>
    </div>,
    <div className="text-center">
      <h2 className="text-[clamp(3rem,7vw,7.5rem)] leading-[0.9] tracking-[-0.045em] lowercase">Squad up.</h2>
      <p className="mt-10 text-[clamp(1.5rem,2.4vw,2.6rem)]">Teams of 2–3. Open wikipedia.org on your team’s computer.</p>
      <a href="/hello-world/tv" className="btn btn-primary mt-12 text-3xl">
        Switch the TV to the game
      </a>
    </div>,
    <div className="text-center">
      <h2 className="text-[clamp(3rem,6.5vw,7rem)] leading-[0.9] tracking-[-0.045em] lowercase">See you next Wednesday.</h2>
      <p className="mt-10 text-[clamp(1.5rem,2.4vw,2.6rem)]">
        {plan[1].title}: {fmtDate(plan[1].start, { weekday: "long", month: "long", day: "numeric" })}, {CLUB.time}, {CLUB.room}.
      </p>
      <p className="mt-6 text-[clamp(1.2rem,1.8vw,1.9rem)] text-dim">Bring an HFC classmate who’s never been: you both get +2 XP.</p>
      {CLUB.links.teams && (
        <div className="mt-10">
          <div className="inline-block bg-white p-3">
            <QRCodeSVG value={CLUB.links.teams} size={200} marginSize={0} />
          </div>
          <p className="mt-2 text-xl">Join our Teams group</p>
        </div>
      )}
    </div>,
  );
  return s;
}

function Kickoff() {
  const { s: n = 1 } = Route.useSearch();
  const navigate = useNavigate({ from: "/hello-world/kickoff" });
  const deck = useRef<HTMLDivElement>(null);
  const plan = useSchedule();
  const all = slides(plan);
  const i = Math.min(n, all.length) - 1;
  const go = useCallback(
    (to: number) => void navigate({ search: { s: Math.min(Math.max(to, 0), all.length - 1) + 1 }, replace: true }),
    [navigate, all.length],
  );
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : deck.current?.requestFullscreen());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        go(i + 1);
      }
      if (["ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        go(i - 1);
      }
      if (e.key === "Home") go(0);
      if (e.key === "End") go(all.length - 1);
      if (e.key.toLowerCase() === "f") void fullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, i, all.length]);

  return (
    <div ref={deck} className="theme-pine flex h-screen flex-col">
      <div className="flex min-h-0 flex-1 overflow-auto">
        <div className="m-auto w-[min(1500px,100%-5rem)] py-10">{all[i]}</div>
      </div>
      <footer className="flex items-center gap-3 bg-mist px-5 py-2 text-sm font-semibold">
        <button className="btn btn-sm" onClick={() => go(i - 1)} aria-label="Previous slide">
          ‹
        </button>
        <span className="min-w-16 text-center" aria-live="polite">
          {i + 1} / {all.length}
        </span>
        <button className="btn btn-sm" onClick={() => go(i + 1)} aria-label="Next slide">
          ›
        </button>
        <span className="h-1.5 flex-1 bg-line">
          <span className="block h-full bg-sky" style={{ width: `${((i + 1) / all.length) * 100}%` }} />
        </span>
        <button className="btn btn-sm" onClick={() => void fullscreen()}>
          Full screen (F)
        </button>
      </footer>
    </div>
  );
}
