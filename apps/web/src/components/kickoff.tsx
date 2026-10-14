import { useQuery } from "convex/react";
import { QRCodeSVG } from "qrcode.react";
import { Fragment, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { Code, Picto, weekTile } from "#/components/ui";
import { FEEDBACK } from "#/lib/content";
import type { WeekPlan } from "#/lib/schedule";
import { useJoinCode } from "#/components/officer";
import { CLUB, OFFICERS, fmtDate } from "#/lib/season";
import { XpTable } from "#/routes/hello-world/rules";

// The QR always opens the join page; once an officer starts the night, it carries the join code too.
function JoinBox() {
  const live = useQuery(api.sessions.live);
  const code = useJoinCode();
  const [origin, setOrigin] = useState(`https://${CLUB.url}`);
  useEffect(() => setOrigin(window.location.origin), []);
  const open = live && code;
  return (
    <div className="flex items-center gap-6">
      <div className="shrink-0 bg-white p-3">
        <QRCodeSVG value={`${origin}/join${open ? `?code=${code}` : ""}`} size={180} marginSize={0} />
      </div>
      <div>
        <p className="opacity-70">Scan, or go to</p>
        <p className="text-2xl font-extrabold">{CLUB.url}/join</p>
        {open ? (
          <>
            <p className="mt-2 opacity-70">and enter code</p>
            <p className="narrow text-8xl leading-none font-extrabold tracking-[0.12em]">{code}</p>
            <p className="opacity-70">{live.roster.length} joined</p>
          </>
        ) : (
          <p className="mt-2 max-w-[30ch] text-sm opacity-70">
            Officers: start Week 1 in /host and sign in here, and the join code appears.
          </p>
        )}
      </div>
    </div>
  );
}

// Tonight's teams, live: they fill in as people join (or when an officer makes teams in /host).
function Teams() {
  const live = useQuery(api.sessions.live);
  if (!live) return null;
  if (!live.teams.length)
    return (
      <p className="m-rise mt-10 text-xl text-dim" style={at(4)}>
        {live.autoTeams ? "Join on your phone and you’ll land on a team." : `${live.roster.length} here. Officers: make teams in /host.`}
      </p>
    );
  return (
    <ul className="mx-auto mt-10 grid max-w-[1400px] grid-cols-2 gap-[3px] text-left lg:grid-cols-4">
      {live.teams.map((t, k) => (
        <li key={t._id} className={`tile m-pop ${TEAM_TILES[k % TEAM_TILES.length]} p-6`} style={at(4 + Math.min(k, 7))}>
          <p className="text-[clamp(1.5rem,2.2vw,2.4rem)] leading-tight font-extrabold tracking-[-0.02em]">{t.name}</p>
          <ul className="mt-2 text-[clamp(1.2rem,1.6vw,1.8rem)] leading-snug font-semibold">
            {t.members.length ? t.members.map((m) => <li key={m}>{m}</li>) : <li>Nobody yet</li>}
          </ul>
        </li>
      ))}
    </ul>
  );
}
const TEAM_TILES = ["tile-sky", "tile-meadow", "tile-sun", "tile-silver"];

const at = (i: number) => ({ "--i": i }) as CSSProperties;

function Words({ text, i = 0 }: { text: string; i?: number }) {
  let n = i;
  return text.split("\n").map((line, row) => (
    <Fragment key={row}>
      {row > 0 && <br />}
      {line.split(" ").map((word, col, cols) => (
        <Fragment key={col}>
          <span className="m-line">
            <span style={at(n++)}>{word}</span>
          </span>
          {col < cols.length - 1 && " "}
        </Fragment>
      ))}
    </Fragment>
  ));
}

const H = ({ children }: { children: ReactNode }) => (
  <h2 className="mb-[0.7em] text-[clamp(2.6rem,4.6vw,5rem)] leading-[0.9] tracking-[-0.045em] lowercase">
    {typeof children === "string" ? <Words text={children} /> : children}
  </h2>
);
const Big = ({ children }: { children: ReactNode }) => (
  <ul className="prose-list space-y-4 text-[clamp(1.3rem,1.9vw,2rem)] leading-snug">{children}</ul>
);

// The Wiki Race rules in content.ts are written to read on a phone; these are the short version for the TV.
const RACE_STEPS = [
  "On your team’s computer, open programmingclub.dev/wiki. It jumps to the start article.",
  "On “Go,” click only links inside the article. No search bar, no typing URLs.",
  "The back button and Ctrl+F are fine.",
  "Land on the target? Tap “We made it!” on a phone and raise a hand.",
];
const RACE_POINTS = [
  ["5", "1st place", "tile-gold"],
  ["4", "2nd place", "tile-silver"],
  ["3", "3rd place", "tile-sun"],
  ["2", "Finished in time", "tile-sky"],
  ["1", "Played", "tile-meadow"],
];

/** The kickoff deck, shown on its own page (/hello-world/kickoff) or on the TV during Week 1. */
export function kickoffSlides(plan: WeekPlan[]): ReactNode[] {
  const officers = OFFICERS.filter((o) => o.name);
  const s: ReactNode[] = [
    <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <p className="m-rise text-xl text-dim" style={at(0)}>
          {CLUB.name} at {CLUB.school}
        </p>
        <h1 className="mt-3 text-[clamp(3.5rem,8vw,8rem)] leading-[0.9] tracking-[-0.045em] lowercase">
          <Words text={"Hello,\nWorld Cup"} i={1} />
          <span className="m-rise inline-block" style={at(4)}>
            <span className="blink">_</span>
          </span>
        </h1>
        <p className="m-rise mt-8 text-3xl font-bold" style={at(5)}>
          {CLUB.tag}
        </p>
      </div>
      <div className="space-y-8">
        <div className="m-wipe rounded-[6px] bg-mist p-8" style={at(3)}>
          <h3 className="text-2xl">Warm-up: what does this print?</h3>
          <div className="m-rise" style={at(5)}>
            <Code code={'print("go" + "!" * 3)'} numbered={false} className="mt-3 text-3xl" />
          </div>
        </div>
        <div className="m-rise" style={at(7)}>
          <JoinBox />
        </div>
      </div>
    </div>,
    <div className="text-center">
      <h2 className="text-[clamp(3rem,6.5vw,7rem)] leading-[0.9] tracking-[-0.045em] lowercase">
        <Words text="Welcome to the very first meeting." />
      </h2>
      <p className="m-rise mx-auto mt-10 max-w-[34ch] text-[clamp(1.5rem,2.4vw,2.6rem)]" style={at(6)}>
        Everyone here tonight is a Founding Member of {CLUB.name}.
      </p>
      <p className="chip m-pop mt-10 px-5 py-2 text-xl" style={at(8)}>
        Warm-up answer: <code className="font-bold">go!!!</code>. Multiplying a string repeats it.
      </p>
    </div>,
    <div>
      <H>Meet the officers</H>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {officers.map((o, k) => (
          <li key={o.name} className="m-rise border-t-[3px] border-ink pt-4" style={at(3 + k)}>
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
          <li className="m-rise" style={at(3)}>
            A friendly place to learn and practice programming together.
          </li>
          <li className="m-rise" style={at(4)}>
            Workshops, group projects, talks, and other things that build real skills.
          </li>
          <li className="m-rise" style={at(5)}>
            A place to show what you’re working on and meet people who like this stuff.
          </li>
        </Big>
      </div>
      <dl className="space-y-6 self-center">
        {[
          ["Who can join", "Any HFC student"],
          ["Experience", "Any major, any level"],
          ["Fees", "None, all free!"],
        ].map(([k, v], n) => (
          <div key={k} className="m-rise border-l-[6px] border-sky pl-6" style={at(6 + n)}>
            <dt className="text-xl text-dim">{k}</dt>
            <dd className="text-5xl font-extrabold tracking-[-0.03em]">{v}</dd>
          </div>
        ))}
      </dl>
    </div>,
  ];
  s.push(
    <div className="text-center">
      <h2 className="text-[clamp(3rem,6.5vw,7rem)] leading-[0.9] tracking-[-0.045em] lowercase">
        <Words text="Why “Season 0”?" />
      </h2>
      <p className="m-rise mt-10 text-[clamp(1.6rem,2.6vw,2.8rem)]" style={at(4)}>
        Because programmers start counting at zero.
      </p>
      <p className="m-rise mx-auto mt-6 max-w-[48ch] text-[clamp(1.2rem,1.7vw,1.8rem)] text-balance text-dim" style={at(6)}>
        We’re starting mid-semester, so the rest of it is for getting the club up and running. Tell us the projects, events, and trips you
        want, and we’ll do our best to plan them into Season 1.
      </p>
    </div>,
    <div>
      <H>The next eight Wednesdays</H>
      <ol className="grid grid-cols-4 gap-x-[3px] gap-y-6 lg:grid-cols-8">
        {plan.map((w, i) => {
          const t = weekTile(w);
          return (
            <li key={w.week}>
              <span className={`tile ${t.tile} m-pop block aspect-square`} style={at(1 + i)}>
                <Picto id={t.picto} className="absolute inset-[15%]" />
                <span className="narrow absolute top-2 left-3 text-3xl font-extrabold">{i + 1}</span>
              </span>
              <span className="narrow m-rise mt-3 block text-xl font-bold text-dim" style={at(2 + i)}>
                {fmtDate(w.start, { month: "short", day: "numeric" }).toLowerCase()}
              </span>
              <span className="m-rise block text-[clamp(1rem,1.4vw,1.5rem)] leading-tight font-bold" style={at(2 + i)}>
                {w.title}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="m-rise mt-10 text-lg text-dim" style={at(12)}>
        Lineup subject to change.
      </p>
    </div>,
    <div>
      <H>How you score</H>
      <div className="m-drop max-w-4xl text-2xl" style={at(3)}>
        <XpTable />
      </div>
      <p className="m-rise mt-8 text-[clamp(1.4rem,2.2vw,2.4rem)]" style={at(7)}>
        Showing up is worth as much as winning. Every week is a fresh chance.
      </p>
    </div>,
    <div className="grid items-center gap-12 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <H>The Golden Keycap</H>
        <dl className="space-y-6">
          {plan
            .filter((w) => w.kind === "cup")
            .map((w, n) => (
              <div key={w.week} className="m-rise border-l-[6px] border-gold pl-6" style={at(3 + n)}>
                <dt className="text-xl text-dim">
                  Week {w.week} · {fmtDate(w.start, { month: "long", day: "numeric" })}
                </dt>
                <dd className="text-5xl font-extrabold tracking-[-0.03em]">{w.title}</dd>
              </div>
            ))}
        </dl>
        <p className="m-rise mt-8 text-[clamp(1.4rem,2.2vw,2.4rem)]" style={at(6)}>
          Everyone starts at zero, so anyone can win. The winners sign the trophy.
        </p>
        <p className="m-rise mt-3 text-[clamp(1.2rem,1.7vw,1.8rem)] text-dim" style={at(7)}>
          The take-home prize isn’t decided yet.
        </p>
      </div>
      <div className="m-pop" style={at(5)}>
        <div className="tile tile-gold m-float m-shine mx-auto aspect-square w-[min(100%,24rem)]">
          <Picto id="keycap" className="absolute inset-[16%]" label="The Golden Keycap" animate="loop" />
        </div>
      </div>
    </div>,
    <div className="grid gap-12 lg:grid-cols-2">
      <div>
        <H>Your turn: what should this club be?</H>
        <ol className="steps space-y-3 text-[clamp(1.2rem,1.7vw,1.8rem)]">
          {FEEDBACK.map((q, k) => (
            <li key={q} className="m-rise" style={at(3 + k)}>
              {q}
            </li>
          ))}
        </ol>
      </div>
      <div className="m-pop tile tile-sky self-center p-10" style={at(5)}>
        <p className="text-[clamp(1.6rem,2.6vw,2.8rem)] leading-tight font-extrabold tracking-[-0.02em] text-balance">
          Not joined yet? Join now and add your ideas.
        </p>
        <div className="mt-8">
          <JoinBox />
        </div>
        <p className="mt-8 text-[clamp(1.1rem,1.5vw,1.6rem)]">
          Every answer goes straight to the officers. Think of something later? Tell any of us.
        </p>
      </div>
    </div>,
    <div className="grid items-center gap-12 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <H>First match: Wiki Race</H>
        <ol className="steps space-y-4 text-[clamp(1.3rem,2vw,2.1rem)] leading-snug">
          {RACE_STEPS.map((x, k) => (
            <li key={x} className="m-rise" style={at(3 + k)}>
              {x}
            </li>
          ))}
        </ol>
      </div>
      <div>
        <p className="m-rise mb-4 text-xl text-dim" style={at(4)}>
          Points per race
        </p>
        <ul className="space-y-3">
          {RACE_POINTS.map(([pts, what, tile], k) => (
            <li key={what} className="m-rise flex items-center gap-5" style={at(5 + k)}>
              <span className={`tile ${tile} narrow grid size-16 shrink-0 place-items-center text-4xl font-extrabold`}>{pts}</span>
              <span className="text-[clamp(1.2rem,1.8vw,1.9rem)] font-bold">{what}</span>
            </li>
          ))}
        </ul>
        <p className="m-rise mt-8 text-xl text-dim" style={at(10)}>
          Teams of 2–3, one computer per team.
        </p>
      </div>
    </div>,
    <div className="text-center">
      <h2
        className="m-slam text-[clamp(3rem,6vw,6.5rem)] leading-[0.9] tracking-[-0.045em] lowercase"
        style={{ "--base": "200ms" } as CSSProperties}
      >
        Find your team.
      </h2>
      <p className="m-rise mt-6 text-[clamp(1.4rem,2.2vw,2.4rem)]" style={at(3)}>
        Sit together, then open {CLUB.url}/wiki on one computer per team.
      </p>
      <Teams />
    </div>,
  );
  return s;
}

/** One slide at a time, with the wipe that covers each change. */
export function SlideStage({ slides, i }: { slides: ReactNode[]; i: number }) {
  const prev = useRef(i);
  const dir = useRef<"fwd" | "back">("fwd");
  if (prev.current !== i) {
    dir.current = i >= prev.current ? "fwd" : "back";
    prev.current = i;
  }
  return (
    <div className="relative flex min-h-0 flex-1">
      <div className="flex flex-1 overflow-auto">
        <div key={i} className="m-auto w-[min(1500px,100%-5rem)] py-10">
          {slides[i]}
        </div>
      </div>
      <div key={`w${i}`} className="deck-wipe" data-dir={dir.current} aria-hidden>
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

/** Arrow keys, Page Up/Down (clickers), space, Home, and End move through the deck. */
export function useSlideKeys(i: number, count: number, go: (to: number) => void) {
  useEffect(() => {
    const to = (n: number) => go(Math.min(Math.max(n, 0), count - 1));
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (["ArrowRight", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        to(i + 1);
      }
      if (["ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        to(i - 1);
      }
      if (e.key === "Home") to(0);
      if (e.key === "End") to(count - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, count, go]);
}
