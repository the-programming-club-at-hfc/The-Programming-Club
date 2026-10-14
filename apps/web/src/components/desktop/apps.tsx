// The club desktop's apps: what each window shows. Content comes from lib/season.ts and the live schedule.
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Disclaimer } from "#/components/site";
import { GAME_TILE, Picto, weekTile } from "#/components/ui";
import { GAMES } from "#/lib/content";
import { nextMeeting, useSchedule } from "#/lib/schedule";
import { CLUB, OFFICERS, fmtDate, isHalloweenMonth } from "#/lib/season";
import { api } from "../../../convex/_generated/api";
import { Dashboard } from "./dashboard";

export type AppId = "about" | "meetings" | "world-cup" | "hackathon" | "conference" | "officers" | "join" | "site" | "dashboard";

export interface App {
  id: AppId;
  path: string;
  /** Window title, styled like a file name. */
  title: string;
  /** Desktop icon label. */
  label: string;
  /** Line glyph on a 24-unit grid, drawn in currentColor. */
  glyph: ReactNode;
  /** Default window placement (percent of the desktop) and width. */
  at: { left: number; top: number };
  width: string;
  Content: () => ReactNode;
  /** Only signed-in officers see its icon. */
  officer?: boolean;
}

export const mailto = `mailto:${CLUB.advisor.email}?subject=${encodeURIComponent("Programming Club")}`;

const G = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/* ---------- about: welcome.txt ---------- */

function About() {
  return (
    <div className="space-y-5">
      <pre className="code text-[0.95rem]">
        <span className="font-bold">if</span> (curious) {"{"}
        {"\n"}
        {"  "}
        <span className="font-bold text-[#ffb547]">build</span>();{"\n"}
        {"  "}
        <span className="font-bold text-[#9fd3ff]">debug</span>();{"\n"}
        {"  "}
        <span className="font-bold text-[#ff8fa3]">belong</span>();{"\n"}
        {"}"}
      </pre>
      <p className="text-lg leading-relaxed">
        We’re {CLUB.name} at {CLUB.school}. All skill levels welcome. We build projects, play team coding games, and help each other learn,
        in whatever language you’re studying.
      </p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 text-[0.95rem]">
        {[
          ["Who can join", CLUB.eligibility],
          ["Experience", "None needed"],
          ["Cost", "Free. No dues."],
          ["When", `${CLUB.day}, ${CLUB.time}`],
          ["Where", CLUB.room],
          ["Languages", "Any"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-dim">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ---------- meetings: the live season calendar ---------- */

function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function countdown(start: number, now: number) {
  const mins = Math.max(0, Math.floor((start - now) / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `in ${d} day${d > 1 ? "s" : ""}, ${h} hr`;
  if (h > 0) return `in ${h} hr ${m} min`;
  return `in ${m} min`;
}

function Meetings() {
  const plan = useSchedule();
  const now = useNow();
  const next = now === null ? null : nextMeeting(plan, now);
  const costume = plan.find((w) => w.bonus && /costume/i.test(w.bonus) && !w.cancelled);
  return (
    <div>
      {next && now !== null && (
        <div className="mb-5 flex items-center gap-4 rounded-[8px] bg-mist p-4">
          <span className={`tile ${weekTile(plan[next.i]).tile} size-14 shrink-0 rounded-[6px]`}>
            <Picto id={weekTile(plan[next.i]).picto} className="absolute inset-[12%]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm text-dim">
              {next.live ? "Happening now" : `Next meeting, ${countdown(plan[next.i].start.getTime(), now)}`}
            </p>
            <p className="text-lg leading-tight font-extrabold">{plan[next.i].title}</p>
            <p className="text-sm">
              {fmtDate(plan[next.i].start, { weekday: "long", month: "long", day: "numeric" })}, {CLUB.time}, {CLUB.room}
            </p>
          </div>
        </div>
      )}
      {isHalloweenMonth() && costume && (
        <p className="mb-4 text-sm font-semibold text-[#c2410c]">Come to {costume.title} in costume for +3 XP.</p>
      )}
      <ol className="divide-y divide-line">
        {plan.map((w, i) => {
          const past = next ? i < next.i : now !== null;
          return (
            <li key={w.week} className={`flex items-center gap-3 py-2 ${past || w.cancelled ? "opacity-45" : ""}`}>
              <span className="narrow w-14 shrink-0 text-sm font-bold text-dim">
                {fmtDate(w.start, { month: "short", day: "numeric" })}
              </span>
              <span className={`min-w-0 flex-1 truncate font-semibold ${w.cancelled ? "line-through" : ""}`}>{w.title}</span>
              {w.kind === "cup" && <span className="chip bg-gold">Cup night</span>}
              {next?.i === i && <span className="chip bg-[#0b4fa3] text-white">Next</span>}
            </li>
          );
        })}
      </ol>
      <Link to="/hello-world/season" className="link mt-4 inline-block text-sm">
        See every week’s games
      </Link>
    </div>
  );
}

/* ---------- world-cup: this season's event ---------- */

function WorldCup() {
  return (
    <div>
      <div className="grid grid-cols-3 gap-[3px] overflow-hidden rounded-[6px]">
        {GAMES.map((g) => (
          <span key={g.id} className={`tile ${GAME_TILE[g.id].tile} block aspect-square`}>
            <Picto id={GAME_TILE[g.id].picto} animate="loop" className="absolute inset-[14%]" />
          </span>
        ))}
      </div>
      <h3 className="mt-5 text-2xl lowercase">hello, world cup</h3>
      <p className="mt-2 leading-relaxed">
        Season 0 is a coding game league: eight Wednesdays of Wikipedia races, bug hunts, and code relays. No experience needed, and you can
        start any week.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link to="/hello-world" className="btn btn-primary btn-sm">
          Open Hello, World Cup
        </Link>
        <Link to="/hello-world/rules" className="btn btn-sm">
          See the six games
        </Link>
      </div>
    </div>
  );
}

/* ---------- officers: contacts ---------- */

function Officers() {
  const officers = OFFICERS.filter((o) => o.name && o.role !== "Faculty advisor");
  return (
    <div>
      <ul className="divide-y divide-line">
        {officers.map((o) => (
          <li key={o.name} className="flex items-center gap-3 py-2.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-mist text-sm font-extrabold">
              {o.name
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span>
              <span className="block leading-tight font-bold">{o.name}</span>
              <span className="text-sm text-dim">{o.role}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-[8px] bg-mist p-4">
        <p className="text-sm text-dim">Faculty advisor</p>
        <p className="font-extrabold">{CLUB.advisor.name}</p>
        <p className="text-sm">
          <a href={mailto} className="link">
            {CLUB.advisor.email}
          </a>
          <span className="text-dim">, office {CLUB.advisor.office}</span>
        </p>
        <a href={mailto} className="btn btn-primary btn-sm mt-3">
          Email the advisor
        </a>
      </div>
    </div>
  );
}

/* ---------- join: a setup wizard ---------- */

const STEPS = [
  { title: "Come to a meeting", body: `${CLUB.day}, ${CLUB.time}, in ${CLUB.room}. Any week is a good week to start.` },
  { title: "Join the game", body: "Scan the code on the TV and sign in with your name and HawkMail. You’re in the game in a minute." },
  {
    title: "Tell us what you want to do",
    body: `Email ${CLUB.advisor.name} your interests to get on the member list, or fill out a Club Interest form with the Office of Student Activities in M-105.`,
  },
];

function Join() {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  return (
    <div className="flex min-h-64 flex-col">
      <p className="text-sm text-dim">
        Step {step + 1} of {STEPS.length}. {CLUB.eligibility}. No application, no fee.
      </p>
      <div className="mt-3 flex gap-1" aria-hidden>
        {STEPS.map((_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-[#0b4fa3]" : "bg-line"}`} />
        ))}
      </div>
      <h3 className="mt-5 text-2xl">{s.title}</h3>
      <p className="mt-2 leading-relaxed">{s.body}</p>
      <div className="mt-auto flex justify-between gap-2 border-t border-line pt-4">
        <button className="btn btn-sm" onClick={() => setStep(step - 1)} disabled={step === 0}>
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button className="btn btn-primary btn-sm" onClick={() => setStep(step + 1)}>
            Next
          </button>
        ) : (
          <a href={mailto} className="btn btn-primary btn-sm">
            Email the advisor
          </a>
        )}
      </div>
    </div>
  );
}

/* ---------- site: about this site (required disclaimer) ---------- */

function Site() {
  return (
    <div className="space-y-4">
      <Disclaimer className="text-[0.95rem] leading-relaxed" />
      <p className="text-sm text-dim">
        Questions about student clubs? Office of Student Activities, M-105,{" "}
        <a href="mailto:studentactivities@hfcc.edu" className="link">
          studentactivities@hfcc.edu
        </a>
        .
      </p>
      <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <Link to="/privacy" className="link">
          Privacy policy
        </Link>
        <Link to="/terms" className="link">
          Terms of use
        </Link>
        <Link to="/hello-world/host" className="link">
          Officer sign-in
        </Link>
      </p>
    </div>
  );
}

/* ---------- registry ---------- */

/* ---------- hackathon: Hack The Nest ---------- */

const HACK = { id: "hack-the-nest-2026", url: "https://hackthenest.tech/" };

function Hackathon() {
  return (
    <div className="space-y-5">
      <div className="rounded-[10px] bg-[#0a2147] p-5 text-white">
        <p className="text-sm font-semibold text-[#9fd3ff]">Sat–Sun, Nov 14–15, 2026 · 24 hours</p>
        <p className="mt-1 text-2xl leading-tight font-extrabold tracking-[-0.02em]">Hack The Nest</p>
        <p className="mt-1 text-white/75">Eastern Michigan University, Ypsilanti</p>
        <a
          href={HACK.url}
          target="_blank"
          rel="noreferrer"
          className="press mt-4 inline-flex h-9 items-center rounded-full bg-white px-4 text-sm font-semibold text-[#0a2147] hover:bg-[#e8f1ff]"
        >
          Visit hackthenest.tech ↗
        </a>
      </div>
      <p className="text-lg leading-relaxed">
        A free, in-person, 24-hour hackathon run by Google Developer Group on Campus at EMU. Build anything with a team of up to four, or
        come solo and get matched with a team at the start. Any major, any experience level.
      </p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 text-[0.95rem]">
        {[
          ["Cost", "Free, with meals and swag"],
          ["Teams", "Up to 4, solo welcome"],
          ["Who", "College and high school students"],
          ["Prizes", "Four tracks, announced soon"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-dim">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <Interest event={HACK.id} />
      <p className="text-sm text-dim">Hosted by GDG on Campus at EMU, not by our club. Register and find the schedule on their site.</p>
    </div>
  );
}

/* ---------- conference: Michigan AI Business Conference ---------- */

const CONF = {
  id: "ai-business-conference-2026",
  url: "https://abgumich.org/conference",
  flyer: "/events/ai-business-conference-2026.pdf",
};

function Conference() {
  return (
    <div className="space-y-5">
      <div className="rounded-[10px] bg-[#0b2a55] p-5 text-white">
        <p className="text-sm font-semibold text-[#f5c400]">Fri, Oct 23, 2026 · 10:30 a.m.–5 p.m.</p>
        <p className="mt-1 text-2xl leading-tight font-extrabold tracking-[-0.02em]">AI Business Conference</p>
        <p className="mt-1 text-white/75">Ross School of Business, University of Michigan, Ann Arbor</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={CONF.url}
            target="_blank"
            rel="noreferrer"
            className="press inline-flex h-9 items-center rounded-full bg-[#f5c400] px-4 text-sm font-semibold text-[#0b2a55] hover:bg-[#ffd633]"
          >
            Get a ticket ↗
          </a>
          <a
            href={CONF.flyer}
            target="_blank"
            rel="noreferrer"
            className="press inline-flex h-9 items-center rounded-full bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/20"
          >
            View the flyer (PDF)
          </a>
        </div>
      </div>
      <p className="text-lg leading-relaxed">
        A full day on how AI is changing finance and venture capital: keynotes, expert panels, coffee chats, and networking with industry
        leaders. Speakers come from Microsoft, J.P. Morgan, Bank of America, BTIG, and more.
      </p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 text-[0.95rem]">
        {[
          ["Cost", "$17 general admission"],
          ["Tickets", "On sale until Thu, Oct 22, 8 a.m. ET"],
          ["Tracks", "Finance & quant, venture capital"],
          ["Included", "Lunch, workshops, closing reception"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-dim">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <Interest event={CONF.id} />
      <p className="text-sm text-dim">
        Hosted by the University of Michigan’s AI Business Group (ABG), not by our club. Times are from their flyer; check their site for
        the full agenda, since it may start earlier.
      </p>
    </div>
  );
}

/** One anonymous heart per browser, so officers can see how many members want to go. */
function Interest({ event }: { event: string }) {
  const [voter, setVoter] = useState<string | null>(null);
  useEffect(() => {
    let id = localStorage.getItem("pc.voter");
    if (!id) localStorage.setItem("pc.voter", (id = crypto.randomUUID()));
    setVoter(id);
  }, []);
  const data = useQuery(api.interest.get, voter ? { event, voter } : "skip");
  const toggle = useMutation(api.interest.toggle).withOptimisticUpdate((store, args) => {
    const cur = store.getQuery(api.interest.get, args);
    if (cur) store.setQuery(api.interest.get, args, { count: cur.count + (cur.mine ? -1 : 1), mine: !cur.mine });
  });
  const mine = !!data?.mine;
  const count = data?.count ?? 0;
  return (
    <div className="flex items-center gap-3 rounded-[10px] bg-mist p-3 pr-4">
      <button
        onClick={() => voter && void toggle({ event, voter })}
        disabled={!data}
        aria-pressed={mine}
        className={`press flex h-10 items-center gap-2 rounded-full px-4 font-semibold transition-colors ${mine ? "bg-[#e5484d] text-white" : "bg-white text-ink shadow-[0_0_0_1px_var(--color-line)] hover:shadow-[0_0_0_1px_#e5484d]"}`}
      >
        <svg key={String(mine)} viewBox="0 0 24 24" className={`size-5 ${mine ? "heart-pop" : ""}`} aria-hidden>
          <path
            d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"
            fill={mine ? "currentColor" : "none"}
            stroke={mine ? "none" : "#e5484d"}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
        {mine ? "You’re interested" : "I’m interested"}
      </button>
      <p className="text-sm text-dim" aria-live="polite">
        {data ? (count === 1 ? "1 member interested" : `${count} members interested`) : "\u00a0"}
      </p>
    </div>
  );
}

export const APPS: App[] = [
  {
    id: "about",
    path: "/about",
    title: "welcome.txt",
    label: "Welcome",
    glyph: (
      <svg viewBox="0 0 24 24" {...G}>
        <path d="M6 3h8l4 4v14H6Z" />
        <path d="M14 3v4h4M9 12h6M9 16h4" />
      </svg>
    ),
    at: { left: 12, top: 8 },
    width: "30rem",
    Content: About,
  },
  {
    id: "meetings",
    path: "/meetings",
    title: "Meetings",
    label: "Meetings",
    glyph: (
      <svg viewBox="0 0 24 24" {...G}>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M4 10h16M9 3v4M15 3v4" />
      </svg>
    ),
    at: { left: 50, top: 14 },
    width: "26rem",
    Content: Meetings,
  },
  {
    id: "world-cup",
    path: "/world-cup",
    title: "Hello, World Cup",
    label: "Hello, World Cup",
    glyph: (
      <svg viewBox="0 0 24 24" {...G}>
        <path d="M6.5 4.5h11l2.5 14h-16Z" />
        <path d="M7.5 18.5l-1 1.5h11l-1-1.5M15 8.5v3.5H10M11.5 10.5L10 12l1.5 1.5" />
      </svg>
    ),
    at: { left: 30, top: 18 },
    width: "24rem",
    Content: WorldCup,
  },
  {
    id: "hackathon",
    path: "/hack-the-nest",
    title: "Hack The Nest",
    label: "Hack The Nest",
    glyph: (
      <svg viewBox="0 0 24 24" {...G}>
        <rect x="4" y="5" width="16" height="11" rx="1.5" />
        <path d="M2.5 19.5h19M12.8 7.8l-2.3 3.4h3l-2.3 3.4" />
      </svg>
    ),
    at: { left: 34, top: 10 },
    width: "27rem",
    Content: Hackathon,
  },
  {
    id: "conference",
    path: "/ai-business-conference",
    title: "AI Business Conference",
    label: "AI Business Conference",
    glyph: (
      <svg viewBox="0 0 24 24" {...G}>
        <rect x="3.5" y="4" width="17" height="10" rx="1.5" />
        <path d="M12 14v3M8 21l4-4 4 4M7.5 11l3-3 2 2 3.5-3.5" />
      </svg>
    ),
    at: { left: 44, top: 12 },
    width: "27rem",
    Content: Conference,
  },
  {
    id: "officers",
    path: "/officers",
    title: "Officers",
    label: "Officers",
    glyph: (
      <svg viewBox="0 0 24 24" {...G}>
        <circle cx="9" cy="9" r="3" />
        <circle cx="17" cy="10" r="2.5" />
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 15.2c2.8-.6 6 1.2 6 4.8" />
      </svg>
    ),
    at: { left: 40, top: 22 },
    width: "24rem",
    Content: Officers,
  },
  {
    id: "join",
    path: "/how-to-join",
    title: "How to join",
    label: "How to join",
    glyph: (
      <svg viewBox="0 0 24 24" {...G}>
        <circle cx="10" cy="8" r="3.5" />
        <path d="M3 20c0-3.9 3.1-7 7-7 1.6 0 3 .5 4.2 1.4M18 14v6M15 17h6" />
      </svg>
    ),
    at: { left: 22, top: 26 },
    width: "26rem",
    Content: Join,
  },
  {
    id: "site",
    path: "/site",
    title: "About this site",
    label: "About this site",
    glyph: (
      <svg viewBox="0 0 24 24" {...G}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7.5v.5" />
      </svg>
    ),
    at: { left: 58, top: 30 },
    width: "26rem",
    Content: Site,
  },
  {
    id: "dashboard",
    path: "/dashboard",
    title: "Officer dashboard",
    label: "Dashboard",
    glyph: (
      <svg viewBox="0 0 24 24" {...G}>
        <rect x="3.5" y="4" width="7" height="9" rx="1.5" />
        <rect x="13.5" y="4" width="7" height="5" rx="1.5" />
        <rect x="13.5" y="12" width="7" height="8" rx="1.5" />
        <rect x="3.5" y="16" width="7" height="4" rx="1.5" />
      </svg>
    ),
    at: { left: 26, top: 6 },
    width: "36rem",
    Content: Dashboard,
    officer: true,
  },
];

export const appFor = (path: string) => APPS.find((a) => a.path === path) ?? null;
