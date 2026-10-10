import { UserButton } from "@clerk/tanstack-react-start";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CardView, DECKS, fmtClock, useRemaining } from "#/components/game";
import type { GameId, Screen } from "#/components/game";
import { ExportButton, OfficerGate } from "#/components/officer";
import { GAME_TILE, Picto, Wrap } from "#/components/ui";
import { BUGS, PICTIONARY, RELAYS, WIKI_RACES } from "#/lib/content";
import { CATALOG, gamesIn, ideaTile, likelyWeek, useSchedule } from "#/lib/schedule";
import type { LineupItem } from "#/lib/schedule";
import { CLUB, fmtDate, isCupWeek } from "#/lib/season";

export const Route = createFileRoute("/hello-world/host")({
  head: () => ({ meta: [{ title: `Host · ${CLUB.season}` }, { name: "robots", content: "noindex" }] }),
  component: Host,
});

type Live = NonNullable<FunctionReturnType<typeof api.sessions.live>>;
type HostData = FunctionReturnType<typeof api.sessions.host>;
type Row = NonNullable<HostData["rows"]>[number];

async function run(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    alert(e instanceof ConvexError ? String(e.data) : "That didn’t work. Check your connection and try again.");
  }
}

const Panel = ({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) => (
  <section className={`card p-5 ${className}`}>
    <h2 className="mb-3 text-2xl">{title}</h2>
    {children}
  </section>
);

function Host() {
  return (
    <Wrap className="py-8">
      <OfficerGate redirect="/hello-world/host" purpose="run tonight’s game">
        <Console />
      </OfficerGate>
    </Wrap>
  );
}

function Console() {
  const data = useQuery(api.sessions.host);
  const live = useQuery(api.sessions.live);
  if (!data || live === undefined) return <p className="font-bold text-dim">Loading…</p>;
  if (!data.session || !live) return <StartPanel recent={data.recent} />;
  return <Running live={live} rows={data.rows} />;
}

function Running({ live, rows }: { live: Live; rows: Row[] }) {
  const [tab, setTab] = useState<Tab>("bug");
  const [playing, setPlaying] = useState<string | null>(null);
  return (
    <>
      <Header live={live} />
      <LineupPanel
        week={live.week}
        playing={playing}
        onPlay={(label) => {
          setPlaying(label);
          const id = gamesIn(label)[0];
          if (TABS.some(([t]) => t === id)) setTab(id as Tab);
        }}
        className="mt-6"
      />
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[1fr_1.25fr]">
        <div className="space-y-6">
          <ScreenPanel live={live} />
          <TimerPanel live={live} />
          <TeamsPanel live={live} />
        </div>
        <div className="space-y-6">
          <DeckPanel live={live} tab={tab} setTab={setTab} />
          <PlayersPanel live={live} rows={rows} sessionId={live._id} />
        </div>
      </div>
    </>
  );
}

function Header({ live }: { live: Live }) {
  const end = useMutation(api.sessions.end);
  const plan = useSchedule();
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div>
        <p className="font-bold text-pine">
          Week {live.week}
          {isCupWeek(live.week) ? " · Cup night" : ""}
        </p>
        <h1 className="text-3xl">{plan[live.week - 1]?.title}</h1>
      </div>
      <p className="narrow font-extrabold text-5xl tracking-[0.2em] text-ink" title="Join code">
        {live.code}
      </p>
      <nav className="ml-auto flex flex-wrap items-center gap-1">
        <a href="/hello-world/tv" target="_blank" rel="noreferrer" className="btn btn-sm">
          Open TV view
        </a>
        <Link to="/hello-world/kickoff" className="btn btn-sm">
          Kickoff slides
        </Link>
        <Link to="/hello-world/schedule" className="btn btn-sm">
          Plan the season
        </Link>
        <Link to="/hello-world/kit" className="btn btn-sm">
          Game plan
        </Link>
        <button
          className="btn btn-sm btn-neon"
          onClick={() => confirm("End the night? Place XP goes out from the current standings.") && run(end())}
        >
          End night
        </button>
        <span className="ml-2">
          <UserButton />
        </span>
      </nav>
    </header>
  );
}

function StartPanel({ recent }: { recent: HostData["recent"] }) {
  const start = useMutation(api.sessions.start);
  const reopen = useMutation(api.sessions.reopen);
  const plan = useSchedule();
  const [week, setWeek] = useState(() => likelyWeek(plan));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Start tonight" className="ring-2 ring-gold">
        <p className="text-dim">Starting opens joining and puts the QR code on the TV.</p>
        <label className="mt-4 block font-bold">
          Week
          <select className="field mt-1" value={week} onChange={(e) => setWeek(Number(e.target.value))}>
            {plan.map((w) => (
              <option key={w.week} value={w.week}>
                Week {w.week}: {w.title}
                {w.cancelled ? " (cancelled)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-coin mt-4 text-lg" onClick={() => run(start({ week }))}>
          Start week {week}
        </button>
        <p className="mt-4 text-sm text-dim">
          Then open{" "}
          <a href="/hello-world/tv" target="_blank" rel="noreferrer" className="underline">
            /hello-world/tv
          </a>{" "}
          on the gaming-room TV. To change a week’s games, use the{" "}
          <Link to="/hello-world/schedule" className="underline">
            season planner
          </Link>
          .
        </p>
      </Panel>
      <LineupPanel week={week} />
      <Panel title="Past nights">
        {recent.length === 0 ? (
          <p className="text-dim">Nothing yet. Attendance exports show up here after each night.</p>
        ) : (
          <ul className="divide-y-2 divide-grid/60">
            {recent.map((s) => (
              <li key={s._id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-bold">Week {s.week}</span>
                <span className="text-dim">{fmtDate(new Date(s.startedAt))}</span>
                <span className="ml-auto" />
                <ExportButton sessionId={s._id} />
                <button className="btn btn-sm" onClick={() => run(reopen({ sessionId: s._id }))}>
                  Reopen
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function ScreenPanel({ live }: { live: Live }) {
  const setScreen = useMutation(api.sessions.setScreen);
  const [message, setMessage] = useState("");
  const show = (screen: Screen) => run(setScreen({ screen }));
  const modes = [
    ["lobby", "Join screen"],
    ["scoreboard", "Scoreboard"],
    ["timer", "Big timer"],
  ] as const;
  return (
    <Panel title="On the TV" className="">
      <div className="flex flex-wrap">
        {modes.map(([mode, label]) => (
          <button
            key={mode}
            className={`btn btn-sm ${live.screen.mode === mode ? "btn-on" : ""}`}
            onClick={() => show({ ...live.screen, mode })}
          >
            {label}
          </button>
        ))}
        {(live.screen.mode === "card" || live.screen.mode === "wiki" || live.screen.mode === "message") && (
          <span className="btn btn-sm btn-on pointer-events-none">
            {live.screen.mode === "card" ? "Challenge card" : live.screen.mode === "wiki" ? "Wiki Race" : "Message"}
          </span>
        )}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (message.trim()) void show({ mode: "message", message: message.trim() });
        }}
      >
        <input
          className="field"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Big message, e.g. “5 minute break”"
          maxLength={80}
        />
        <button className="btn btn-sm">Show</button>
      </form>
    </Panel>
  );
}

function TimerPanel({ live }: { live: Live }) {
  const timer = useMutation(api.sessions.timer);
  const remaining = useRemaining(live.timer);
  const running = !!live.timer.startedAt;
  return (
    <Panel title="Timer">
      <p className={`text-center narrow font-extrabold text-7xl tabular-nums ${running && remaining <= 10_000 ? "text-signal" : ""}`}>
        {running && remaining === 0 ? "TIME" : fmtClock(remaining)}
      </p>
      <div className="mt-3 flex flex-wrap justify-center">
        <button className="btn btn-coin" onClick={() => run(timer({ action: "toggle" }))}>
          {running ? "Pause" : "Start"}
        </button>
        <button className="btn" onClick={() => run(timer({ action: "reset" }))}>
          Reset
        </button>
        <button className="btn" onClick={() => run(timer({ action: "add" }))}>
          +30s
        </button>
      </div>
      <div className="mt-2 flex flex-wrap justify-center">
        {[30, 60, 90, 120, 300, 720].map((s) => (
          <button key={s} className="btn btn-sm" onClick={() => run(timer({ action: "set", seconds: s }))}>
            {fmtClock(s * 1000)}
          </button>
        ))}
      </div>
      <button
        className={`btn btn-sm mt-2 w-[calc(100%-8px)] ${live.timer.relay ? "btn-on" : ""}`}
        onClick={() => run(timer({ action: "relay" }))}
      >
        {live.timer.relay ? "Relay chime every 2 min: on" : "Relay chime every 2 min: off"}
      </button>
    </Panel>
  );
}

function TeamsPanel({ live }: { live: Live }) {
  const make = useMutation(api.teams.make);
  const add = useMutation(api.teams.add);
  const score = useMutation(api.teams.score);
  const rename = useMutation(api.teams.rename);
  const remove = useMutation(api.teams.remove);
  const setDouble = useMutation(api.sessions.setDouble);
  const resetScores = useMutation(api.teams.resetScores);
  const shuffleTeams = (size: 2 | 3) =>
    (!live.teams.length || confirm("Reshuffle everyone into new teams? Tonight’s team scores reset.")) && run(make({ size }));

  return (
    <Panel title="Teams & scores">
      <div className="flex flex-wrap">
        <button className="btn btn-sm btn-coin" onClick={() => shuffleTeams(3)}>
          Make teams of 3
        </button>
        <button className="btn btn-sm" onClick={() => shuffleTeams(2)}>
          Teams of 2
        </button>
        <button className="btn btn-sm" onClick={() => run(add())}>
          Add team
        </button>
        <button className={`btn btn-sm ${live.double ? "btn-on" : ""}`} onClick={() => run(setDouble({ on: !live.double }))}>
          {live.double ? "Final round ×2: on" : "Final round ×2"}
        </button>
      </div>
      {live.teams.length === 0 ? (
        <p className="mt-4 text-dim">No teams yet. Once people have joined, make teams and they’ll see theirs on their phones.</p>
      ) : (
        <ol className="mt-3 divide-y-2 divide-grid/60">
          {live.teams.map((t) => (
            <li key={t._id} className="py-3">
              <div className="flex items-baseline gap-3">
                <button
                  className="text-left font-bold text-xl font-bold hover:text-pine"
                  title="Rename"
                  onClick={() => {
                    const name = prompt("Team name", t.name);
                    if (name) void run(rename({ teamId: t._id, name }));
                  }}
                >
                  {t.name}
                </button>
                <span className="text-sm text-dim">{t.members.join(", ") || "empty"}</span>
                <span className="ml-auto narrow font-extrabold text-3xl text-ink tabular-nums">{t.score}</span>
              </div>
              <div className="mt-1 flex flex-wrap">
                {[1, 2, 3, 5].map((n) => (
                  <button key={n} className="btn btn-sm" onClick={() => run(score({ teamId: t._id, delta: n }))}>
                    +{live.double ? n * 2 : n}
                  </button>
                ))}
                <button className="btn btn-sm" onClick={() => run(score({ teamId: t._id, delta: -1 }))} aria-label="Minus one">
                  −1
                </button>
                <button
                  className="btn btn-sm ml-auto text-dim"
                  onClick={() => confirm(`Remove ${t.name}? Its players go back to no team.`) && run(remove({ teamId: t._id }))}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {live.teams.length > 0 && (
        <button className="btn btn-sm mt-3 text-dim" onClick={() => confirm("Set every team’s score to 0?") && run(resetScores())}>
          Reset scores to 0
        </button>
      )}
    </Panel>
  );
}

/**
 * A week's games in order. Edits save to the season plan right away, so swapping a game mid-night
 * also updates the season page. While a night runs, picking a game opens its deck below.
 */
function LineupPanel({
  week,
  playing,
  onPlay,
  className = "",
}: {
  week: number;
  playing?: string | null;
  onPlay?: (label: string) => void;
  className?: string;
}) {
  const save = useMutation(api.schedule.save);
  const w = useSchedule()[week - 1];
  const lineup = w.lineup;
  const update = (next: LineupItem[]) =>
    run(
      save({
        week,
        title: w.title,
        pitch: w.pitch,
        lesson: w.lesson,
        bonus: w.bonus,
        startsAt: w.start.getTime(),
        cancelled: w.cancelled,
        lineup: next,
      }),
    );
  const setLine = (i: number, patch: Partial<LineupItem>) => update(lineup.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const move = (i: number, by: number) => {
    const l = [...lineup];
    [l[i], l[i + by]] = [l[i + by], l[i]];
    void update(l);
  };
  const options = (
    <>
      {CATALOG.map((grp) => (
        <optgroup key={grp.name} label={grp.name}>
          {grp.items.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );

  return (
    <Panel title={onPlay ? "Tonight’s lineup" : `Week ${week} lineup`} className={className}>
      {lineup.length === 0 ? (
        <p className="text-dim">No games planned. Add one below.</p>
      ) : (
        <ol className="space-y-[3px]">
          {lineup.map((g, i) => {
            const id = gamesIn(g.label)[0];
            const gt = id ? GAME_TILE[id] : null;
            const on = playing === g.label;
            return (
              <li key={`${i}-${g.label}`} className={`flex flex-wrap items-center gap-2 p-2 ${on ? "bg-sun/30" : "bg-mist"}`}>
                <span className="narrow w-6 text-center text-lg font-extrabold">{i + 1}</span>
                <span className={`tile ${gt?.tile ?? ideaTile(g.label) ?? "bg-line"} size-8 shrink-0`}>
                  {gt && <Picto id={gt.picto} className="absolute inset-[10%]" />}
                </span>
                <span className="min-w-32 flex-1 font-bold">
                  {g.label}
                  {g.double && <span className="chip ml-2">×2</span>}
                </span>
                {onPlay && (
                  <button className={`btn btn-sm ${on ? "btn-on" : "btn-coin"}`} onClick={() => onPlay(g.label)}>
                    {on ? "Playing" : "Play"}
                  </button>
                )}
                <select
                  className="field w-28 py-1 text-sm"
                  value=""
                  onChange={(e) => e.target.value && setLine(i, { label: e.target.value })}
                  aria-label={`Swap game ${i + 1}`}
                >
                  <option value="">Swap…</option>
                  {options}
                </select>
                <button
                  className={`btn btn-sm ${g.double ? "btn-on" : ""}`}
                  onClick={() => setLine(i, { double: !g.double })}
                  aria-pressed={g.double}
                  title="Double points"
                >
                  ×2
                </button>
                <button className="btn btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  ↑
                </button>
                <button className="btn btn-sm" onClick={() => move(i, 1)} disabled={i === lineup.length - 1} aria-label="Move down">
                  ↓
                </button>
                <button
                  className="btn btn-sm text-dim"
                  onClick={() => update(lineup.filter((_, j) => j !== i))}
                  aria-label={`Remove ${g.label}`}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <select
        className="field mt-3 text-sm"
        value=""
        onChange={(e) => e.target.value && update([...lineup, { label: e.target.value, double: false }])}
        aria-label="Add a game"
      >
        <option value="">+ Add a game…</option>
        {options}
      </select>
    </Panel>
  );
}

type Tab = GameId | "wiki" | "pictionary";
const TABS: [Tab, string][] = [
  ["bug", "Bug Hunt"],
  ["output", "Output?"],
  ["relay", "Code Relay"],
  ["wiki", "Wiki Race"],
  ["pictionary", "Pictionary"],
  ["lang", "Guess the Language"],
];
type Filter = "all" | "easy" | "medium" | "hard" | "spooky";

function DeckPanel({ live, tab, setTab }: { live: Live; tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <Panel title="Games" className="">
      <div className="flex flex-wrap gap-1 border-b-4 border-line pb-2">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 font-bold ${tab === id ? "bg-ink text-paper" : "text-dim hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === "wiki" ? (
          <WikiTool live={live} />
        ) : tab === "pictionary" ? (
          <PictionaryTool />
        ) : (
          <CardTool key={tab} game={tab} live={live} />
        )}
      </div>
    </Panel>
  );
}

function CardTool({ game, live }: { game: GameId; live: Live }) {
  const setScreen = useMutation(api.sessions.setScreen);
  const timer = useMutation(api.sessions.timer);
  const [filter, setFilter] = useState<Filter>("all");
  const [pos, setPos] = useState(0);

  const indexes = useMemo(() => {
    const all = Array.from({ length: DECKS[game].size }, (_, i) => i);
    if (filter === "all") return all;
    if (game === "bug") return all.filter((i) => (filter === "spooky" ? BUGS[i].spooky : BUGS[i].level === filter));
    if (game === "relay") return all.filter((i) => RELAYS[i].level === filter);
    return all;
  }, [game, filter]);
  const index = indexes[Math.min(pos, indexes.length - 1)] ?? 0;
  const s = live.screen;
  const onTv = s.mode === "card" && s.game === game && s.index === index;

  const go = (d: number) => {
    const next = (pos + d + indexes.length) % indexes.length;
    setPos(next);
    if (s.mode === "card" && s.game === game)
      void run(setScreen({ screen: { mode: "card", game, index: indexes[next], revealed: false } }));
  };
  const filters: Filter[] =
    game === "bug" ? ["all", "easy", "medium", "hard", "spooky"] : game === "relay" ? ["all", "easy", "medium"] : [];
  const secs = DECKS[game].seconds(index);

  return (
    <div>
      {filters.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f}
              className={`chip capitalize ${filter === f ? "bg-ink text-paper" : ""}`}
              onClick={() => {
                setFilter(f);
                setPos(0);
              }}
            >
              {f}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center">
        <button className="btn btn-sm" onClick={() => go(-1)}>
          ‹ Prev
        </button>
        <span className="mx-2 font-bold text-dim">
          {Math.min(pos, indexes.length - 1) + 1} / {indexes.length}
        </span>
        <button className="btn btn-sm" onClick={() => go(1)}>
          Next ›
        </button>
        <span className="ml-auto" />
        {onTv ? (
          <button
            className={`btn btn-sm ${s.revealed ? "" : "btn-coin"}`}
            onClick={() => run(setScreen({ screen: { ...s, revealed: !s.revealed } }))}
          >
            {s.revealed ? "Hide answer on TV" : "Reveal answer on TV"}
          </button>
        ) : (
          <button
            className="btn btn-sm btn-neon"
            onClick={() => run(setScreen({ screen: { mode: "card", game, index, revealed: false } }))}
          >
            Show on TV
          </button>
        )}
        <button
          className="btn btn-sm"
          onClick={() => run(timer({ action: "set", seconds: secs, relay: game === "relay", autostart: true }))}
        >
          Start {fmtClock(secs * 1000)}
        </button>
      </div>
      <p className="mt-3 text-sm text-dim">
        {onTv
          ? s.revealed
            ? "On the TV with the answer."
            : "On the TV. The answer below is only on your screen."
          : "Preview. The answer is only on your screen."}
      </p>
      <div className="mt-2 border-4 border-line bg-mist p-4">
        <CardView game={game} index={index} answer />
      </div>
    </div>
  );
}

function WikiTool({ live }: { live: Live }) {
  const setScreen = useMutation(api.sessions.setScreen);
  const timer = useMutation(api.sessions.timer);
  const [cs, setCs] = useState(false);
  const [race, setRace] = useState<{ from: string; to: string } | null>(
    live.screen.mode === "wiki" && live.screen.wikiFrom && live.screen.wikiTo
      ? { from: live.screen.wikiFrom, to: live.screen.wikiTo }
      : null,
  );
  const draw = () => {
    const pool = WIKI_RACES.filter((r) => !cs || r.cs);
    setRace(pool[Math.floor(Math.random() * pool.length)]);
  };
  const url = (t: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, "_"))}`;
  return (
    <div>
      <div className="flex flex-wrap items-center">
        <button className="btn btn-sm btn-coin" onClick={draw}>
          Draw a race
        </button>
        <button className={`chip ml-2 ${cs ? "bg-ink text-paper" : ""}`} onClick={() => setCs(!cs)}>
          Computer science targets only
        </button>
      </div>
      {race && (
        <>
          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-4 border-line bg-mist p-4 text-center">
            <a href={url(race.from)} target="_blank" rel="noreferrer" className="font-bold text-2xl hover:underline">
              {race.from}
            </a>
            <span className="text-dim">→</span>
            <a href={url(race.to)} target="_blank" rel="noreferrer" className="font-bold text-2xl text-ink hover:underline">
              {race.to}
            </a>
          </div>
          <div className="mt-3 flex flex-wrap">
            <button
              className="btn btn-sm btn-neon"
              onClick={() => run(setScreen({ screen: { mode: "wiki", wikiFrom: race.from, wikiTo: race.to } }))}
            >
              Show on TV
            </button>
            <button className="btn btn-sm" onClick={() => setRace({ from: race.to, to: race.from })}>
              Reverse
            </button>
            <button className="btn btn-sm" onClick={() => run(timer({ action: "set", seconds: 300, relay: false, autostart: true }))}>
              Start 5:00
            </button>
            <button className="btn btn-sm" onClick={() => run(timer({ action: "set", seconds: 360, relay: false, autostart: true }))}>
              Fewest Clicks 6:00
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function PictionaryTool() {
  const timer = useMutation(api.sessions.timer);
  const [word, setWord] = useState<string | null>(null);
  const [peek, setPeek] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap">
        <button className="btn btn-sm btn-coin" onClick={() => setWord(PICTIONARY[Math.floor(Math.random() * PICTIONARY.length)])}>
          Next word
        </button>
        <button className="btn btn-sm" onClick={() => run(timer({ action: "set", seconds: 60, relay: false, autostart: true }))}>
          Start 1:00
        </button>
      </div>
      {word && (
        <button
          className="mt-4 grid min-h-40 w-full place-items-center border-4 border-dashed border-gold text-center select-none"
          onPointerDown={() => setPeek(true)}
          onPointerUp={() => setPeek(false)}
          onPointerLeave={() => setPeek(false)}
          onKeyDown={(e) => (e.key === " " || e.key === "Enter") && setPeek(true)}
          onKeyUp={() => setPeek(false)}
        >
          {peek ? (
            <span className="font-bold text-5xl text-ink">{word}</span>
          ) : (
            <span className="text-dim">Drawer only: press and hold</span>
          )}
        </button>
      )}
      <p className="mt-3 text-sm text-dim">The word stays on this device. Hand your phone to the drawer; it never goes on the TV.</p>
    </div>
  );
}

function PlayersPanel({ live, rows, sessionId }: { live: Live; rows: Row[]; sessionId: Id<"sessions"> }) {
  const move = useMutation(api.teams.move);
  const bonus = useMutation(api.teams.bonus);
  const addPlayer = useMutation(api.teams.addPlayer);
  const removePlayer = useMutation(api.teams.removePlayer);
  const [form, setForm] = useState({ name: "", email: "" });
  const cup = isCupWeek(live.week);

  return (
    <Panel title={`Players (${rows.length})`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ExportButton sessionId={sessionId} />
        {cup && <span className="text-sm text-dim">Power-up cards: weeks attended before this Cup, max 3. First-timers get 1.</span>}
      </div>
      {rows.length === 0 ? (
        <p className="text-dim">Nobody yet. Put the join screen on the TV.</p>
      ) : (
        <ul className="divide-y-2 divide-grid/60">
          {rows.map((r) => (
            <li key={r._id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="min-w-40 flex-1">
                <p className="font-bold">
                  {r.name}
                  {r.firstTime && <span className="chip ml-2 text-pine">New</span>}
                  {r.powerups !== null && (
                    <span className="chip ml-2 text-ink">
                      {r.powerups} power-up{r.powerups > 1 ? "s" : ""}
                    </span>
                  )}
                </p>
                <p className="text-xs text-dim">
                  {r.email}
                  {r.broughtBy ? ` · brought by ${r.broughtBy}` : ""}
                </p>
              </div>
              <select
                className="field w-auto py-1 text-sm"
                value={r.teamId ?? ""}
                onChange={(e) => run(move({ attendanceId: r._id, teamId: (e.target.value || null) as Id<"teams"> | null }))}
                aria-label={`Team for ${r.name}`}
              >
                <option value="">No team</option>
                {live.teams.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <span className="flex items-center">
                <button className="btn btn-sm" onClick={() => run(bonus({ attendanceId: r._id, delta: -1 }))} aria-label="Less bonus XP">
                  −
                </button>
                <span className="w-16 text-center text-sm" title="Bonus XP (friend, costume)">
                  +{r.bonusXp} XP
                </span>
                <button className="btn btn-sm" onClick={() => run(bonus({ attendanceId: r._id, delta: 1 }))} aria-label="More bonus XP">
                  +
                </button>
              </span>
              <button
                className="text-sm text-dim underline"
                onClick={() => confirm(`Remove ${r.name} from tonight?`) && run(removePlayer({ attendanceId: r._id }))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          void run(addPlayer(form).then(() => setForm({ name: "", email: "" })));
        }}
      >
        <input
          className="field"
          placeholder="Name (no phone? add them here)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          className="field"
          type="email"
          placeholder="HawkMail"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <button className="btn btn-sm">Add player</button>
      </form>
    </Panel>
  );
}
