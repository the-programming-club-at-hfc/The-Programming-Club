import { Menu } from "@base-ui/react/menu";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Slider } from "@base-ui/react/slider";
import { Switch } from "@base-ui/react/switch";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Tabs } from "@base-ui/react/tabs";
import { UserButton } from "@clerk/tanstack-react-start";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CardView, DECKS, fmtClock, fmtElapsed, useRemaining } from "#/components/game";
import { kickoffSlides } from "#/components/kickoff";
import type { GameId, Screen } from "#/components/game";
import {
  DrawHost,
  NextPanel,
  liveActionKey,
  useGuardedAction,
  useOkToLeave,
  useNewDrawing,
  useReadyRace,
  useStartRace,
} from "#/components/next";
import { ExportButton, OfficerGate, useAction, useJoinCode } from "#/components/officer";
import { useConfirm } from "#/components/feedback";
import { SearchPicker } from "#/components/search-picker";
import { GAME_TILE, Picto, Wrap, ordinal } from "#/components/ui";
import { WIKI_RACES, wikiUrl } from "#/lib/content";
import { deckFor, filtersFor, heldKey, nounFor } from "#/lib/flow";
import type { Filter } from "#/lib/flow";
import { DRAW_SECONDS, cardKey, drawKey, isAnswerGame, wikiSeconds } from "#/lib/grading";
import { PUZZLES, puzzleForLabel } from "#/lib/puzzles";
import { CATALOG, gamesIn, ideaTile, likelyWeek, useSchedule, usesTeamComputer } from "#/lib/schedule";
import type { LineupItem } from "#/lib/schedule";
import { CLUB, fmtDate, isCupWeek } from "#/lib/season";
import { teamWords } from "#/lib/words";

export const Route = createFileRoute("/hello-world/host")({
  head: () => ({ meta: [{ title: `Host · ${CLUB.season}` }, { name: "robots", content: "noindex" }] }),
  component: Host,
});

type Live = NonNullable<FunctionReturnType<typeof api.sessions.live>>;
type HostData = FunctionReturnType<typeof api.sessions.host>;
type Row = NonNullable<HostData["rows"]>[number];

const Panel = ({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) => (
  // On a phone a pane is already the frame, so panels lose their card and their headings shrink.
  <section className={`card p-5 max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:p-0 max-lg:shadow-none ${className}`}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-2xl max-lg:text-lg">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

function Host() {
  return (
    <Wrap className="py-8 max-lg:pt-0">
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
  return <Running live={live} rows={data.rows} used={data.used} shown={data.session.shown ?? []} keys={data.keys} />;
}

function Running({
  live,
  rows,
  used,
  shown,
  keys,
}: {
  live: Live;
  rows: Row[];
  used: string[];
  shown: string[];
  keys: Record<string, string | null>;
}) {
  const week = useSchedule()[live.week - 1];
  const lineup = week.lineup;
  // The lineup round being played (from the session, so it survives a reload) opens its deck with its filter,
  // e.g. spooky cards for "Fix it for real, spooky".
  const playing = live.round !== null && live.round < lineup.length ? live.round : null;
  const label = playing === null ? null : lineup[playing].label;
  // Before the first round, the Games pane opens on tonight's first game.
  const [tab, setTab] = useState<Tab>(() => tabFor(label) ?? tabFor(lineup[0]?.label ?? null) ?? "bug");
  useEffect(() => {
    const t = tabFor(label);
    if (t) setTab(t);
  }, [label, playing]);
  const deck = useRef<HTMLDivElement>(null);
  const setRound = useMutation(api.sessions.setRound);
  const okToLeave = useOkToLeave(live);
  const { act } = useGuardedAction(JSON.stringify([liveActionKey(live), lineup]));
  // On a phone, one pane at a time, picked in the bar at the top; on a big screen, everything at once.
  const [pane, setPane] = useState<Pane>("run");
  return (
    <Tabs.Root value={pane} onValueChange={(v) => isPane(v) && setPane(v)}>
      <PhoneBar live={live} pane={pane} />
      <Header live={live} />
      <PanePanel value="run">
        <NextPanel live={live} lineup={lineup} used={used} shown={shown} className="mt-6" />
        <LineupPanel
          week={live.week}
          playing={playing}
          onPlay={(i, item) => {
            void act(async (current) => {
              if (!(await okToLeave()) || !current()) return;
              // A double-points lineup round turns double points on; any other round turns it off.
              await setRound({ round: i, double: item.double });
              const t = tabFor(item.label);
              if (!t) return;
              setTab(t);
              // The game's controls are in the Games pane on a phone, and further down the page on a big screen.
              setPane("games");
              // After the pane shows, so there's something to scroll to.
              setTimeout(() => deck.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
            });
          }}
          className="mt-6"
        />
      </PanePanel>
      {/* On a phone the two columns step aside (display: contents), so only the pane's own panels take up room. */}
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="space-y-6 max-lg:contents">
          <PanePanel value="tv" className="space-y-6">
            {(week.kind === "kickoff" || live.screen.mode === "slides") && <SlidesPanel live={live} />}
            <ScreenPanel live={live} />
            <TimerPanel live={live} />
          </PanePanel>
          <PanePanel value="scores">
            <TeamsPanel live={live} keys={lineup.some((g) => gamesIn(g.label).some(usesTeamComputer)) ? keys : {}} />
          </PanePanel>
        </div>
        <div className="space-y-6 max-lg:contents">
          <PanePanel ref={deck} value="games" className="scroll-mt-6 max-lg:scroll-mt-32">
            <DeckPanel
              live={live}
              tab={tab}
              setTab={setTab}
              used={used}
              filter={label && tabFor(label) === tab ? filterFor(label) : "all"}
              pick={label && tabFor(label) === tab && tab === "puzzle" ? puzzleForLabel(label) : undefined}
            />
          </PanePanel>
          <PanePanel value="players">
            <PlayersPanel live={live} rows={rows} sessionId={live._id} />
          </PanePanel>
        </div>
      </div>
    </Tabs.Root>
  );
}

type Pane = "run" | "scores" | "games" | "tv" | "players";
const PANES: [Pane, string][] = [
  ["run", "Run"],
  ["scores", "Scores"],
  ["games", "Games"],
  ["tv", "TV"],
  ["players", "Players"],
];
const isPane = (v: unknown): v is Pane => PANES.some(([p]) => p === v);

/** A pane's panels. Every pane stays mounted, so forms and live data carry over when the phone switches panes; a big
 *  screen shows them all, so a pane that isn't picked is only hidden on a phone (not hidden or inert everywhere, as
 *  a tab panel would be). */
const PanePanel = ({ className = "", ...props }: Omit<Tabs.Panel.Props, "className"> & { value: Pane; className?: string }) => (
  <Tabs.Panel keepMounted hidden={false} inert={false} className={`max-lg:data-hidden:hidden ${className}`} {...props} />
);

function useEndNight(live: Live) {
  const end = useMutation(api.sessions.end);
  const confirm = useConfirm();
  const { busy, act } = useGuardedAction(JSON.stringify([liveActionKey(live), live.teams]));
  return {
    busy,
    endNight: () =>
      act(async (current) => {
        if (
          !(await confirm({
            title: "End the night?",
            description: "Place XP goes out from the current standings.",
            confirmLabel: "End night",
            destructive: true,
          })) ||
          !current()
        )
          return;
        await end();
      }),
  };
}

/** On a phone, pinned to the top: the night, the join code, the clock (tap to start or pause), the rest under ⋯, and the
 *  panes. The big screen's header does all this with room to spare. */
function PhoneBar({ live, pane }: { live: Live; pane: Pane }) {
  const run = useAction();
  const { busy, endNight } = useEndNight(live);
  const timer = useMutation(api.sessions.timer);
  const remaining = useRemaining(live.timer);
  const code = useJoinCode();
  const plan = useSchedule();
  const running = !!live.timer.startedAt;
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const dialogHandoff = useRef(false);
  const links = [
    ["/hello-world/kickoff", "Kickoff slides"],
    ["/hello-world/schedule", "Plan the season"],
    ["/hello-world/kit", "Game plan"],
    ["/hello-world/test", "Test the decks"],
  ] as const;
  return (
    <div className="sticky top-0 z-40 -mx-5 border-b border-line bg-paper/95 px-5 pt-3 backdrop-blur-md lg:hidden">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-xs font-bold text-pine">
            Week {live.week}
            {live.practice ? " · practice" : ""}
          </p>
          <p className="truncate font-extrabold">{plan[live.week - 1]?.title}</p>
        </div>
        <p className="narrow text-2xl font-extrabold tracking-[0.15em]" title="Join code">
          {code}
        </p>
        <button
          className={`btn btn-sm narrow min-w-24 text-lg tabular-nums ${running && remaining <= 10_000 ? "text-signal" : ""}`}
          onClick={() => run(timer({ action: "toggle" }))}
          aria-label={running ? "Pause the timer" : "Start the timer"}
        >
          {running ? "❚❚" : "▶"} {running && remaining === 0 ? "TIME" : fmtClock(remaining)}
        </button>
        <div ref={menu} data-own-keys>
          <Menu.Root
            open={menuOpen}
            onOpenChange={(open) => {
              if (open) dialogHandoff.current = false;
              setMenuOpen(open);
            }}
            onOpenChangeComplete={(open) => {
              if (!open && dialogHandoff.current) {
                dialogHandoff.current = false;
                // Wait until the menu releases its focus trap, then give the dialog a durable return target.
                moreTrigger.current?.focus();
                void endNight();
              }
            }}
          >
            <Menu.Trigger ref={moreTrigger} className="btn btn-sm" aria-label="More">
              ⋯
            </Menu.Trigger>
            <Menu.Portal container={menu}>
              <Menu.Positioner sideOffset={8} align="end" positionMethod="fixed" className="z-50">
                <Menu.Popup
                  finalFocus={moreTrigger}
                  className="card grid max-h-[var(--available-height)] w-60 max-w-[var(--available-width)] gap-1 overflow-y-auto bg-paper p-2 text-ink shadow-lg"
                >
                  <Menu.LinkItem
                    href="/hello-world/tv"
                    target="_blank"
                    rel="noreferrer"
                    closeOnClick
                    className="btn btn-sm justify-start data-highlighted:bg-mist"
                  >
                    Open TV view
                  </Menu.LinkItem>
                  {links.map(([to, label]) => (
                    <Menu.LinkItem
                      key={to}
                      render={<Link to={to} />}
                      closeOnClick
                      className="btn btn-sm justify-start data-highlighted:bg-mist"
                    >
                      {label}
                    </Menu.LinkItem>
                  ))}
                  <Menu.Item
                    disabled={busy}
                    className="btn btn-sm btn-neon justify-start data-highlighted:outline-2"
                    onClick={() => {
                      dialogHandoff.current = true;
                      setMenuOpen(false);
                    }}
                  >
                    End night
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
        <UserButton />
      </div>
      <Tabs.List className="mt-1 grid grid-cols-5" aria-label="Host controls">
        {PANES.map(([p, label]) => (
          <Tabs.Tab
            key={p}
            value={p}
            className={`border-b-[3px] py-2.5 text-sm font-bold ${pane === p ? "border-ink text-ink" : "border-transparent text-dim"}`}
            onClick={() => {
              setMenuOpen(false);
              scrollTo({ top: 0 });
            }}
          >
            {label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </div>
  );
}

function Header({ live }: { live: Live }) {
  const { busy, endNight } = useEndNight(live);
  const plan = useSchedule();
  const code = useJoinCode();
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 max-lg:hidden">
      <div className="min-w-0">
        <p className="font-bold text-pine">
          Week {live.week}
          {isCupWeek(live.week) ? " · Cup night" : ""}
          {live.practice && <span className="chip ml-2 bg-sky text-[#12332b]">Practice: doesn’t count</span>}
        </p>
        <h1 className="text-3xl">{plan[live.week - 1]?.title}</h1>
      </div>
      <p className="narrow ml-auto font-extrabold text-4xl tracking-[0.2em] text-ink sm:ml-0 sm:text-5xl" title="Join code">
        {code}
      </p>
      {/* One row that scrolls sideways on phones, so the controls start right under the header. */}
      <nav className="-mx-1 flex w-full items-center gap-1 overflow-x-auto px-1 *:shrink-0 sm:ml-auto sm:w-auto sm:flex-wrap sm:overflow-visible">
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
        <Link to="/hello-world/test" className="btn btn-sm">
          Test the decks
        </Link>
        <button className="btn btn-sm btn-neon" disabled={busy} onClick={() => endNight()}>
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
  const { busy, act } = useGuardedAction(JSON.stringify(recent.map((s) => s._id)));
  const start = useMutation(api.sessions.start);
  const reopen = useMutation(api.sessions.reopen);
  const plan = useSchedule();
  const [week, setWeek] = useState(() => likelyWeek(plan));
  const [practice, setPractice] = useState(false);
  return (
    <div className="grid gap-6 max-lg:pt-6 lg:grid-cols-2">
      <Panel title="Start tonight" className="ring-2 ring-gold">
        <p className="text-dim">Starting opens joining and puts the QR code on the TV.</p>
        <SearchPicker
          className="mt-4"
          label="Week"
          value={String(week)}
          disabled={busy}
          options={plan.map((w) => ({ value: String(w.week), label: `Week ${w.week}: ${w.title}${w.cancelled ? " (cancelled)" : ""}` }))}
          onValueChange={(value) => {
            const next = plan.find((w) => String(w.week) === value);
            if (next) setWeek(next.week);
          }}
        />
        <label className="mt-4 flex items-start gap-2">
          <Switch.Root
            checked={practice}
            onCheckedChange={setPractice}
            disabled={busy}
            className="mt-1 inline-flex h-6 w-10 shrink-0 rounded-full bg-line p-1 data-checked:bg-ink"
          >
            <Switch.Thumb className="size-4 rounded-full bg-paper transition-transform data-checked:translate-x-4" />
          </Switch.Root>
          <span>
            <strong>Practice night</strong>
            <span className="block text-sm text-dim">
              A full rehearsal with the TV and phones. Nothing counts: no attendance, XP, stats, or cards used up.
            </span>
          </span>
        </label>
        <button className="btn btn-coin mt-4 text-lg" disabled={busy} onClick={() => act(() => start({ week, practice }))}>
          {practice ? `Start a practice of week ${week}` : `Start week ${week}`}
        </button>
        <p className="mt-4 text-sm text-dim">
          Then open{" "}
          <a href="/hello-world/tv" target="_blank" rel="noreferrer" className="underline">
            /hello-world/tv
          </a>{" "}
          on the room’s TV. To change a week’s games, use the{" "}
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
          <ul className="divide-y divide-line">
            {recent.map((s) => (
              <li key={s._id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-bold">Week {s.week}</span>
                <span className="text-dim">{fmtDate(new Date(s.startedAt))}</span>
                {s.practice && <span className="chip">Practice</span>}
                <span className="ml-auto" />
                {!s.practice && <ExportButton sessionId={s._id} />}
                <button className="btn btn-sm" disabled={busy} onClick={() => act(() => reopen({ sessionId: s._id }))}>
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

// The kickoff deck on the TV: always here on Week 1, and on any other night once the slides go up from "On the TV".
function SlidesPanel({ live }: { live: Live }) {
  const run = useAction();
  const setScreen = useMutation(api.sessions.setScreen);
  const count = kickoffSlides(useSchedule()).length;
  const on = live.screen.mode === "slides";
  // Where the deck was, so it picks up there after the TV shows something else.
  const last = useRef(0);
  if (on) last.current = live.screen.slide ?? 0;
  const i = last.current;
  // The rest of the screen stays, so the challenge on the go picks up again after the slides.
  const show = (to: number) => run(setScreen({ screen: { ...live.screen, mode: "slides", slide: Math.min(Math.max(to, 0), count - 1) } }));
  return (
    <Panel title="Kickoff slides">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" disabled={!on || i === 0} onClick={() => show(i - 1)}>
          ‹ Back
        </button>
        <button className={`btn btn-sm ${on ? "btn-on" : ""}`} onClick={() => show(i)}>
          {on ? `Slide ${i + 1} of ${count}` : i ? `Back to slide ${i + 1}` : "Put the slides on the TV"}
        </button>
        <button className="btn btn-sm" disabled={on && i === count - 1} onClick={() => show(on ? i + 1 : i)}>
          Next ›
        </button>
      </div>
      <p className="mt-3 text-sm text-dim">The arrow keys or a clicker on the TV computer move the slides too.</p>
    </Panel>
  );
}

function ScreenPanel({ live }: { live: Live }) {
  const run = useAction();
  const setScreen = useMutation(api.sessions.setScreen);
  const setSound = useMutation(api.sessions.setSound);
  const [message, setMessage] = useState("");
  const show = (screen: Screen) => run(setScreen({ screen }));
  const s = live.screen;
  // The game the screen holds, up now or under the scores, join screen, slides, or a message.
  const held = s.drawing !== undefined ? "draw" : s.wikiFrom ? "wiki" : s.game && s.index !== undefined ? "card" : null;
  // Named the way the Run the night panel names it.
  const thing = nounFor(held === "draw" ? "pictionary" : held === "wiki" ? "wiki" : s.game);
  const modes = [
    ["lobby", "Join screen"],
    ["scoreboard", "Scoreboard"],
    ["timer", "Big timer"],
  ] as const;
  return (
    <Panel title="On the TV" className="">
      <ToggleGroup<Screen["mode"]>
        data-own-keys
        value={[live.screen.mode]}
        onValueChange={(values) => {
          if (values.length === 0) return;
          const [mode] = values;
          if (mode === live.screen.mode) return;
          void show({ ...live.screen, mode, ...(mode === "slides" ? { slide: live.screen.slide ?? 0 } : {}) });
        }}
        aria-label="On the TV"
        className="flex flex-wrap gap-2"
      >
        {/* The game stays here while something else is up (the screens below keep it), one tap from coming back. */}
        {held && (
          <Toggle value={held} className={`btn btn-sm ${live.screen.mode === held ? "btn-on" : "btn-coin"}`}>
            {live.screen.mode === held ? `The ${thing}` : `Back to the ${thing}`}
          </Toggle>
        )}
        {modes.map(([mode, label]) => (
          <Toggle key={mode} value={mode} className={`btn btn-sm ${live.screen.mode === mode ? "btn-on" : ""}`}>
            {label}
          </Toggle>
        ))}
        <Toggle value="slides" className={`btn btn-sm ${live.screen.mode === "slides" ? "btn-on" : ""}`}>
          Kickoff slides
        </Toggle>
        {live.screen.mode === "message" && (
          <Toggle value="message" className="btn btn-sm btn-on">
            Message
          </Toggle>
        )}
      </ToggleGroup>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          // Over whatever is up, which comes back after: a card mid-play keeps its place and its clock parks.
          if (message.trim()) void show({ ...live.screen, mode: "message", message: message.trim() });
        }}
      >
        <input
          className="field min-w-0"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Big message, e.g. “5 minute break”"
          maxLength={80}
        />
        <button className="btn btn-sm">Show</button>
      </form>
      <div className="mt-3 flex items-center gap-3">
        <Switch.Root
          nativeButton
          render={<button type="button" />}
          checked={live.sound.music}
          className={`btn btn-sm ${live.sound.music ? "btn-on" : ""}`}
          onCheckedChange={(music) => {
            void run(setSound({ music }));
          }}
        >
          Music {live.sound.music ? "on" : "off"}
        </Switch.Root>
        <Slider.Root<number>
          min={0}
          max={1}
          step={0.1}
          value={live.sound.volume}
          onValueChange={(volume) => {
            void run(setSound({ volume }));
          }}
          className="flex min-w-24 flex-1 items-center gap-2 text-sm font-bold"
          data-own-keys
        >
          <Slider.Label>Volume</Slider.Label>
          <Slider.Control className="relative flex h-11 flex-1 touch-none items-center">
            <Slider.Track className="relative h-2 w-full rounded-full bg-line">
              <Slider.Indicator className="rounded-full bg-ink" />
              <Slider.Thumb className="size-5 rounded-full border-2 border-ink bg-paper outline-offset-4" />
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>
      </div>
    </Panel>
  );
}

function TimerPanel({ live }: { live: Live }) {
  const run = useAction();
  const timer = useMutation(api.sessions.timer);
  const remaining = useRemaining(live.timer);
  const running = !!live.timer.startedAt;
  return (
    <Panel title="Timer">
      <p className={`text-center narrow font-extrabold text-7xl tabular-nums ${running && remaining <= 10_000 ? "text-signal" : ""}`}>
        {running && remaining === 0 ? "TIME" : fmtClock(remaining)}
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
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
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {[30, 45, 60, 90, 120, 300, 720].map((s) => (
          <button
            key={s}
            className="btn btn-sm"
            onClick={() => run(timer({ action: "set", seconds: s, relay: live.teamSize > 1 && s === 720 }))}
          >
            {fmtClock(s * 1000)}
          </button>
        ))}
      </div>
      <Switch.Root
        nativeButton
        render={<button type="button" />}
        checked={live.timer.relay}
        className={`btn btn-sm mt-2 w-[calc(100%-8px)] ${live.timer.relay ? "btn-on" : ""}`}
        onCheckedChange={() => {
          void run(timer({ action: "relay" }));
        }}
      >
        {live.timer.relay ? "Relay chime every 2 min: on" : "Relay chime every 2 min: off"}
      </Switch.Root>
    </Panel>
  );
}

// How tonight is played. A night is all solo or all teams; solo is the default.
const MODES = [
  [1, "Solo"],
  [2, "Teams of 2"],
  [3, "Teams of 3"],
] as const;

function TeamsPanel({ live, keys }: { live: Live; keys: Record<string, string | null> }) {
  const run = useAction();
  const make = useMutation(api.teams.make);
  const add = useMutation(api.teams.add);
  const setDouble = useMutation(api.sessions.setDouble);
  const resetScores = useMutation(api.teams.resetScores);
  const setAuto = useMutation(api.teams.setAuto);
  const w = teamWords(live.teamSize === 1);
  const confirm = useConfirm();
  const { busy, act } = useGuardedAction(JSON.stringify([liveActionKey(live), live.teams]));
  // Picking a mode (even tonight's) remakes tonight's teams. Points carry over: each new team starts from its players' average.
  const setMode = (size: 1 | 2 | 3) =>
    act(async (current) => {
      if (
        live.teams.length &&
        !(await confirm({
          title: size === 1 ? "Put everyone on a team of their own?" : `Reshuffle everyone into teams of ${size}?`,
          description: size === 1 ? "Everyone keeps their own points." : "Each team starts from its players’ average points.",
          confirmLabel: size === 1 ? "Play solo" : "Remake teams",
        }))
      )
        return;
      if (current()) await make({ size });
    });

  return (
    <Panel title="Teams & scores">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          data-own-keys
          value={[String(live.teamSize)]}
          onValueChange={([value]) => {
            const mode = MODES.find(([size]) => String(size) === value);
            if (mode) void setMode(mode[0]);
          }}
          disabled={busy || live.unrevealed.length > 0}
          aria-label="How tonight is played"
          className="inline-flex flex-wrap rounded-[6px] bg-mist p-1"
        >
          {MODES.map(([size, label]) => (
            <Toggle
              key={size}
              value={String(size)}
              className="min-h-10 rounded-[4px] px-3 text-sm font-semibold text-ink data-pressed:bg-ink data-pressed:text-paper data-disabled:opacity-50"
            >
              {label}
            </Toggle>
          ))}
        </ToggleGroup>
        {live.teams.length > 0 && (
          <button
            className="btn btn-sm"
            disabled={busy || live.unrevealed.length > 0}
            onClick={() => setMode(live.teamSize === 1 ? 1 : live.teamSize === 2 ? 2 : 3)}
          >
            {live.teamSize === 1 ? "Remake solo teams" : "Reshuffle teams"}
          </button>
        )}
        <Switch.Root
          nativeButton
          render={<button type="button" />}
          checked={live.double}
          className={`btn btn-sm ${live.double ? "btn-on" : ""}`}
          onCheckedChange={(on) => {
            void run(setDouble({ on }));
          }}
        >
          Double points
        </Switch.Root>
        <Switch.Root
          nativeButton
          render={<button type="button" />}
          checked={live.autoTeams}
          className={`btn btn-sm ${live.autoTeams ? "btn-on" : ""}`}
          onCheckedChange={(on) => {
            void run(setAuto({ on }));
          }}
        >
          Auto teams
        </Switch.Root>
        {!w.solo && (
          <button className="btn btn-sm" onClick={() => run(add())}>
            Add team
          </button>
        )}
      </div>
      <p className="mt-2 text-sm text-dim">{live.autoTeams ? w.autoOn(live.teamSize) : w.autoOff}</p>
      {live.unrevealed.length > 0 && (
        <p className="mt-1 text-sm font-semibold">
          Finish the round first: reveal {live.unrevealed.map(cardName).join(", ")} (put it back on the TV if it’s gone), then you can
          switch modes.
        </p>
      )}
      {live.teams.length === 0 ? (
        <p className="mt-4 text-dim">{live.autoTeams ? w.emptyAuto : w.emptyManual}</p>
      ) : (
        <ol className="mt-3 divide-y divide-line">
          {live.teams.map((t) => (
            <TeamRow key={t._id} t={t} double={live.double} teamKey={keys[t._id]} keyTitle={w.keyTitle} />
          ))}
        </ol>
      )}
      {live.teams.length > 0 && (
        <button
          className="btn btn-sm mt-3 text-dim"
          disabled={busy}
          onClick={() =>
            act(async (current) => {
              if (
                !(await confirm({
                  title: "Reset scores to 0?",
                  description: `Set every ${w.team}’s score to 0.`,
                  confirmLabel: "Reset scores",
                  destructive: true,
                })) ||
                !current()
              )
                return;
              await resetScores();
            })
          }
        >
          Reset scores to 0
        </button>
      )}
    </Panel>
  );
}

/** A team: its name (tap to rename) and score, +1 +2 +3 at hand, and the rest under ⋯. One line on a big screen; on a
 *  phone, the buttons get their own row with room for thumbs. */
function TeamRow({
  t,
  double,
  teamKey,
  keyTitle,
}: {
  t: Live["teams"][number];
  double: boolean;
  teamKey?: string | null;
  keyTitle: string;
}) {
  const run = useAction();
  const score = useMutation(api.teams.score);
  const rename = useMutation(api.teams.rename);
  const remove = useMutation(api.teams.remove);
  const [more, setMore] = useState(false);
  const [edit, setEdit] = useState<{ kind: "points" | "name"; value: string } | null>(null);
  const confirm = useConfirm();
  const { busy, act } = useGuardedAction(JSON.stringify(t));
  const add = (n: number) => run(score({ teamId: t._id, delta: n }));
  const members = t.members.join(", ");
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{t.name}</p>
          {members !== t.name && <p className="truncate text-xs text-dim">{members || "empty"}</p>}
        </div>
        {teamKey && (
          <span className="chip text-sm" title={keyTitle}>
            {teamKey}
          </span>
        )}
        <span className="narrow w-12 text-right text-3xl font-extrabold text-ink tabular-nums">{t.score}</span>
        <div className="flex w-full gap-1.5 sm:w-auto">
          {[1, 2, 3].map((n) => (
            <button key={n} className="btn btn-sm min-h-11 flex-1 sm:flex-none" onClick={() => add(n)}>
              +{double ? n * 2 : n}
            </button>
          ))}
          <button
            className={`btn btn-sm min-h-11 flex-1 sm:flex-none ${more ? "btn-on" : ""}`}
            onClick={() => setMore(!more)}
            aria-expanded={more}
            aria-label={`More for ${t.name}`}
          >
            ⋯
          </button>
        </div>
      </div>
      {more && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button className="btn btn-sm" onClick={() => add(5)}>
            +{double ? 10 : 5}
          </button>
          <button className="btn btn-sm" onClick={() => add(-1)} aria-label="Minus one">
            −1
          </button>
          <button
            className="btn btn-sm"
            title="Any amount, e.g. −2 to undo a mistake"
            onClick={() => setEdit({ kind: "points", value: "" })}
          >
            Other amount…
          </button>
          <button className="btn btn-sm" onClick={() => setEdit({ kind: "name", value: t.name })}>
            Rename
          </button>
          <button
            className="btn btn-sm ml-auto text-dim"
            disabled={busy}
            onClick={() =>
              act(async (current) => {
                if (
                  !(await confirm({
                    title: `Remove ${t.name}?`,
                    description: "Its players go back to no team.",
                    confirmLabel: "Remove team",
                    destructive: true,
                  })) ||
                  !current()
                )
                  return;
                await remove({ teamId: t._id });
              })
            }
          >
            Remove
          </button>
        </div>
      )}
      {more && edit && (
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = edit.value.trim();
            const points = Number(value.replace("−", "-"));
            if (!value || (edit.kind === "points" && (!Number.isInteger(points) || points === 0))) return;
            void act(async () => {
              if (edit.kind === "name") await rename({ teamId: t._id, name: value });
              else await score({ teamId: t._id, delta: points });
              setEdit(null);
            });
          }}
        >
          <label className="min-w-0 flex-1 text-sm font-bold">
            {edit.kind === "name" ? "Team name" : `Points for ${t.name}, use a minus sign to take away`}
            <input
              className="field mt-1"
              autoFocus
              required
              disabled={busy}
              value={edit.value}
              inputMode={edit.kind === "points" ? "numeric" : "text"}
              onChange={(event) => setEdit({ ...edit, value: event.target.value })}
            />
          </label>
          <button className="btn btn-sm" disabled={busy}>
            Save
          </button>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setEdit(null)}>
            Cancel
          </button>
        </form>
      )}
    </li>
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
  playing?: number | null;
  onPlay?: (i: number, item: LineupItem) => void;
  className?: string;
}) {
  const run = useAction();
  const save = useMutation(api.schedule.save);
  const w = useSchedule()[week - 1];
  const lineup = w.lineup;
  // While a night runs, the editing buttons stay out of the way until Edit.
  const [editing, setEditing] = useState(!onPlay);
  const edit = editing || lineup.length === 0;
  const update = (next: LineupItem[]) =>
    run(
      save({
        week,
        title: w.title,
        pitch: w.pitch,
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
  const options = CATALOG.flatMap((group) => group.items.map((label) => ({ value: label, label, group: group.name })));
  for (const item of lineup) {
    if (!options.some((option) => option.value === item.label))
      options.push({ value: item.label, label: item.label, group: "Custom activities" });
  }

  return (
    <Panel
      title={onPlay ? "Tonight’s lineup" : `Week ${week} lineup`}
      action={
        onPlay &&
        lineup.length > 0 && (
          <Toggle className={`btn btn-sm ${editing ? "btn-on" : ""}`} pressed={editing} onPressedChange={setEditing}>
            {editing ? "Done" : "Edit"}
          </Toggle>
        )
      }
      className={className}
    >
      {lineup.length === 0 ? (
        <p className="text-dim">No games planned. Add one below.</p>
      ) : (
        <ol className="space-y-[3px]">
          {lineup.map((g, i) => {
            const id = gamesIn(g.label)[0];
            const gt = id ? GAME_TILE[id] : null;
            const on = playing === i;
            return (
              <li
                key={`${i}-${g.label}`}
                className={`flex items-center gap-2 p-2 ${edit ? "flex-wrap" : ""} ${on ? "bg-sun/30" : "bg-mist"}`}
              >
                <span className="narrow w-6 text-center text-lg font-extrabold">{i + 1}</span>
                <span className={`tile ${gt?.tile ?? ideaTile(g.label) ?? "bg-line"} size-8 shrink-0`}>
                  {gt && <Picto id={gt.picto} className="absolute inset-[10%]" />}
                </span>
                <span className={`flex-1 font-bold ${edit ? "min-w-32" : "min-w-0"}`}>
                  {g.label}
                  {g.double && <span className="chip ml-2">Double points</span>}
                </span>
                {onPlay && (
                  <button className={`btn btn-sm ${on ? "btn-on" : "btn-coin"}`} onClick={() => onPlay(i, g)}>
                    {on ? "Playing" : "Play"}
                  </button>
                )}
                {edit && (
                  <>
                    <SearchPicker
                      className="w-full sm:w-48"
                      value={null}
                      onValueChange={(label) => {
                        if (label) void setLine(i, { label });
                      }}
                      label={`Swap game ${i + 1}`}
                      placeholder="Swap…"
                      options={options}
                    />
                    <Toggle
                      pressed={g.double}
                      className={`btn btn-sm ${g.double ? "btn-on" : ""}`}
                      onPressedChange={(double) => {
                        void setLine(i, { double });
                      }}
                      title="Double points"
                    >
                      Double
                    </Toggle>
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
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {edit && (
        <SearchPicker
          className="mt-3"
          value={null}
          onValueChange={(label) => {
            if (label) void update([...lineup, { label, double: false }]);
          }}
          label="Add a game"
          placeholder="+ Add a game…"
          options={options}
        />
      )}
    </Panel>
  );
}

/** "output:2" as "Output? #3", a race key as "Wiki Race: From → To", and "draw:4" as "Drawing 4", for officers. */
const cardName = (key: string) => {
  const [game, rest] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
  return game === "wiki"
    ? `Wiki Race: ${rest.replace(">", " → ")}`
    : game === "draw"
      ? `Drawing ${rest}`
      : `${TABS.find(([id]) => id === game)?.[1] ?? game} #${Number(rest) + 1}`;
};

type Tab = GameId | "wiki" | "pictionary";
const TABS: [Tab, string][] = [
  ["bug", "Bug Hunt"],
  ["fix", "Fix it for real"],
  ["output", "Output?"],
  ["relay", "Code Relay"],
  ["puzzle", "Puzzles"],
  ["wiki", "Wiki Race"],
  ["pictionary", "Pictionary"],
  ["lang", "Guess the Language"],
];
const isTab = (v: unknown): v is Tab => TABS.some(([t]) => t === v);
const filterFor = (label: string): Filter => filtersFor(label)[0] ?? "all";
/** The Games tab for a lineup entry, if it has one. */
const tabFor = (label: string | null) => {
  const id = label && gamesIn(label)[0];
  return TABS.find(([t]) => t === id)?.[0];
};

function DeckPanel({
  live,
  tab,
  setTab,
  used,
  filter,
  pick,
}: {
  live: Live;
  tab: Tab;
  setTab: (t: Tab) => void;
  used: string[];
  filter: Filter;
  /** A puzzle to start on, from the lineup round being played. */
  pick?: number;
}) {
  return (
    <Panel title="Games" className="">
      <Tabs.Root value={tab} onValueChange={(v) => isTab(v) && setTab(v)}>
        <Tabs.List
          className="-mx-4 flex gap-1 overflow-x-auto border-b-4 border-line px-4 pb-2 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
          aria-label="Games"
        >
          {TABS.map(([id, label]) => (
            <Tabs.Tab
              key={id}
              value={id}
              className={`shrink-0 px-3 py-2 font-bold whitespace-nowrap ${tab === id ? "bg-ink text-paper" : "text-dim hover:text-ink"}`}
            >
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {/* Only the picked game's tool is mounted, so a card tool starts fresh each time its tab opens. */}
        {TABS.map(([id]) => (
          <Tabs.Panel key={id} value={id} className="mt-4">
            {id === "wiki" ? (
              <WikiTool live={live} used={used} />
            ) : id === "pictionary" ? (
              <PictionaryTool live={live} />
            ) : (
              <CardTool key={`${filter}:${pick}`} game={id} live={live} used={used} initial={filter} pick={pick} />
            )}
          </Tabs.Panel>
        ))}
      </Tabs.Root>
    </Panel>
  );
}

function CardTool({ game, live, used, initial, pick }: { game: GameId; live: Live; used: string[]; initial: Filter; pick?: number }) {
  const run = useAction();
  const setScreen = useMutation(api.sessions.setScreen);
  const timer = useMutation(api.sessions.timer);
  const s = live.screen;
  const tvIndex = s.mode === "card" && s.game === game ? s.index : undefined;
  const isUsed = (i: number) => used.includes(`${game}:${i}`);
  const firstFresh = (list: number[]) =>
    Math.max(
      0,
      list.findIndex((i) => !isUsed(i)),
    );
  const filters: Filter[] =
    game === "bug" || game === "fix" ? ["all", "easy", "medium", "hard", "spooky"] : game === "relay" ? ["all", "easy", "medium"] : [];
  const [filter, setFilter] = useState<Filter>(() =>
    filters.includes(initial) && (tvIndex === undefined || deckFor(game, initial).includes(tvIndex)) ? initial : "all",
  );
  // Start on the lineup round's puzzle, or the card the TV is showing, or else the first card not shown on any night yet.
  const [pos, setPos] = useState(() =>
    pick !== undefined ? pick : tvIndex !== undefined ? deckFor(game, filter).indexOf(tvIndex) : firstFresh(deckFor(game, filter)),
  );

  const indexes = useMemo(() => deckFor(game, filter), [game, filter]);
  const index = indexes[Math.min(pos, indexes.length - 1)] ?? 0;

  // Follow the TV when another officer changes the card, dropping a filter that hides it. A lineup round's puzzle
  // stays put at first, even while the last puzzle is still on the TV.
  const keepPick = useRef(pick !== undefined);
  useEffect(() => {
    if (keepPick.current) {
      keepPick.current = false;
      return;
    }
    if (tvIndex === undefined) return;
    const i = deckFor(game, filter).indexOf(tvIndex);
    if (i === -1) setFilter("all");
    setPos(i === -1 ? tvIndex : i);
  }, [tvIndex]);
  const onTv = tvIndex === index;

  // Prev and Next only move this preview; the TV changes with Show on TV. Next skips cards already shown this season.
  const step = (from: number, d: number) => {
    const n = indexes.length;
    if (d > 0)
      for (let k = 1; k < n; k++) {
        if (!isUsed(indexes[(from + k) % n])) return (from + k) % n;
      }
    return (from + d + n) % n;
  };
  const go = (d: number) => setPos(step(Math.min(pos, indexes.length - 1), d));
  const secs = DECKS[game].seconds(index);
  const start = () =>
    timer({
      action: "set",
      seconds: secs,
      relay: live.teamSize > 1 && (game === "relay" || (game === "puzzle" && !!PUZZLES[index].relay)),
      autostart: true,
    });
  // The card held under the scores or join screen comes back as it was, its parked clock and all. Any other card goes
  // up with its own clock running, so the clock always belongs to the card on the TV and 0:00 closes its answers. A card
  // that already has answers or a score tonight comes back with the clock it left with (that's the server's job): a fresh
  // one would reopen it and hand every lock the early bonus. Start is there to give it one on purpose.
  const okToLeave = useOkToLeave(live);
  const { busy, act } = useGuardedAction(JSON.stringify([liveActionKey(live), game, index]));
  const showOnTv = async (current: () => boolean) => {
    const key = cardKey(game, index);
    if (heldKey(s) === key) return setScreen({ screen: { ...s, mode: "card" } });
    if (!(await okToLeave()) || !current()) return;
    const scored = live.scored.includes(key);
    await setScreen({ screen: { mode: "card", game, index, revealed: scored } });
    if (!scored && !live.unrevealed.includes(key)) await start();
  };

  return (
    <div>
      {filters.length > 0 && (
        <RadioGroup<Filter>
          value={filter}
          data-own-keys
          aria-label="Filter cards"
          className="mb-3 flex flex-wrap gap-1.5"
          onValueChange={(f) => {
            setFilter(f);
            setPos(firstFresh(deckFor(game, f)));
          }}
        >
          {filters.map((f) => (
            <Radio.Root
              key={f}
              value={f}
              nativeButton
              render={<button type="button" />}
              className="chip capitalize data-checked:bg-ink data-checked:text-paper"
            >
              {f}
            </Radio.Root>
          ))}
        </RadioGroup>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" onClick={() => go(-1)}>
          ‹ Prev
        </button>
        <span className="mx-2 font-bold text-dim">
          {Math.min(pos, indexes.length - 1) + 1} / {indexes.length}
          {!onTv && isUsed(index) && <span className="chip ml-2">shown before</span>}
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
          <button className="btn btn-sm btn-neon" disabled={busy} onClick={() => act(showOnTv)}>
            Show on TV
          </button>
        )}
        {/* A restart for this card's clock. Previewing another card, its clock would time the one on the TV. */}
        {(onTv || !heldKey(s)) && (
          <button className="btn btn-sm" onClick={() => run(start())}>
            Start {fmtClock(secs * 1000)}
          </button>
        )}
      </div>
      <p className="mt-3 text-sm text-dim">
        {onTv
          ? s.revealed
            ? "On the TV with the answer."
            : "On the TV. The answer below is only on your screen."
          : "Preview. The answer is only on your screen."}
      </p>
      {onTv && isAnswerGame(game) && <AnswerStatus live={live} />}
      {onTv && game === "fix" && <FixStatus live={live} />}
      {onTv && game === "puzzle" && <PuzzleStatus live={live} index={index} />}
      <div className="mt-2 border-4 border-line bg-mist p-4">
        <CardView game={game} index={index} answer />
      </div>
    </div>
  );
}

const mark = (ok?: boolean) => (ok ? "✓" : "✗");

/** Phone answers for the card on the TV: who has picked or locked, then what each team got. */
function AnswerStatus({ live }: { live: Live }) {
  const data = useQuery(api.answers.host);
  if (!data) return null;
  const w = teamWords(live.teamSize === 1);
  const locked = data.teams.filter((t) => t.pick?.locked).length;
  // For Output?'s sudden-death tiebreaker: the first team to lock in the right answer.
  const firstRight = data.scored
    ? data.teams.filter((t) => t.result?.correct && t.lockMs !== null).sort((a, b) => a.lockMs! - b.lockMs!)[0]?._id
    : undefined;
  return (
    <div className="mt-3 border-4 border-line p-3">
      <p className="font-bold">{data.scored ? "Scored from phones" : `Phone answers: ${locked} of ${data.teams.length} locked in`}</p>
      {data.teams.length === 0 ? (
        <p className="text-sm text-dim">{w.noTeams}</p>
      ) : (
        <ul className="mt-1 divide-y divide-line">
          {data.teams.map((t) => {
            const p = t.pick;
            const status = p?.locked
              ? "Locked"
              : p?.lineLocked
                ? "Line locked"
                : p && (p.line !== undefined || p.choice !== undefined)
                  ? "Picked"
                  : "No answer";
            const r = t.result;
            return (
              <li key={t._id} className="flex flex-wrap items-center gap-2 py-1.5">
                <span className="font-bold">{t.name}</span>
                <span className={`chip ${status === "Locked" ? "bg-pine text-white" : status === "No answer" ? "" : "bg-sun/40"}`}>
                  {status}
                </span>
                {t.lockMs !== null && <span className="text-xs text-dim">at {(Math.max(0, t.lockMs) / 1000).toFixed(1)}s</span>}
                {firstRight === t._id && <span className="chip bg-gold text-[#12332b]">First right</span>}
                {data.scored && (
                  <>
                    <span className="min-w-0 truncate font-code text-sm text-dim">
                      {p?.line !== undefined && `line ${p.line} ${mark(r?.line)} · `}
                      {p?.choice !== undefined
                        ? `${p.choice.replace(/\n/g, " / ")} ${mark(p.line !== undefined ? r?.fix : r?.correct)}`
                        : p
                          ? ""
                          : "—"}
                    </span>
                    <span className="narrow ml-auto text-xl font-extrabold">+{r?.points ?? 0}</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-xs text-dim">
        {data.scored
          ? "Points went on the board when you revealed. Use the score buttons to fix anything."
          : `Revealing adds the points automatically, once. If phones or Wi-Fi fail, ${w.teams} use whiteboards and you score with the buttons.`}
      </p>
    </div>
  );
}

/** Fix it for real on the TV: each team's status and the code that passed, the hint button, then the points. */
function FixStatus({ live }: { live: Live }) {
  const run = useAction();
  const data = useQuery(api.fixes.host);
  const setScreen = useMutation(api.sessions.setScreen);
  if (!data) return null;
  const s = live.screen;
  const fixedCount = data.teams.filter((t) => t.fixed).length;
  const w = teamWords(live.teamSize === 1);
  return (
    <div className="mt-3 border-4 border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold">
          {data.scored ? "Scored" : `Fixed: ${fixedCount} of ${data.teams.length} ${w.teams}`} · laptops on the join page, lab computers at
          /hello-world/fix
        </p>
        {!s.revealed && !data.scored && (
          <Toggle
            pressed={!!s.hint}
            className={`btn btn-sm ml-auto ${s.hint ? "btn-on" : ""}`}
            onPressedChange={(hint) => {
              void run(setScreen({ screen: { ...s, hint } }));
            }}
          >
            {s.hint ? "Hide hint" : "Show hint"}
          </Toggle>
        )}
      </div>
      {data.teams.length === 0 ? (
        <p className="text-sm text-dim">{w.noTeams}</p>
      ) : (
        <ul className="mt-1 divide-y divide-line">
          {data.teams.map((t) => (
            <li key={t._id} className="py-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{t.name}</span>
                <span className={`chip ${t.fixed ? "bg-pine text-white" : ""}`}>
                  {t.fixed ? `Fixed${t.ms === null ? "" : ` at ${fmtElapsed(t.ms)}`}` : "Not fixed yet"}
                </span>
                {t.first && <span className="chip bg-gold text-[#12332b]">First</span>}
                {data.scored && <span className="narrow ml-auto text-xl font-extrabold">+{t.result?.points ?? 0}</span>}
              </div>
              {t.code !== null && (
                <details className="mt-1 text-sm">
                  <summary className="cursor-pointer text-dim">Their code</summary>
                  <pre className="code mt-1 text-sm">{t.code}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-dim">
        {data.scored
          ? "Points went on the board when you revealed. Use the score buttons to fix anything."
          : `Laptops (and lab computers) mark a ${w.team} fixed when every test passes. Revealing adds +3 per fix and +2 more for the first, doubled on double points.`}
      </p>
    </div>
  );
}

/** A puzzle on the TV: each team's stars and lockouts, the hint button (lit up at half time), then the points. */
function PuzzleStatus({ live, index }: { live: Live; index: number }) {
  const run = useAction();
  const board = useQuery(api.puzzles.board);
  const extra = useQuery(api.puzzles.host);
  const [showKey, setShowKey] = useState(false);
  const answers = useQuery(api.puzzles.answers, showKey ? {} : "skip");
  const setScreen = useMutation(api.sessions.setScreen);
  const remaining = useRemaining(live.timer);
  const [now, setNow] = useState(() => Date.now());
  const locked = board?.teams.some((t) => t.lockedUntil !== null && t.lockedUntil > now);
  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [locked]);
  const key = `puzzle:${index}`;
  if (board?.card !== key) return null;
  const s = live.screen;
  const w = teamWords(live.teamSize === 1);
  const halfway = live.timer.card === key && remaining <= live.timer.durationMs / 2;
  const count = (part: "part1Ms" | "part2Ms") => board.teams.filter((t) => t[part] !== null).length;
  const star = (ms: number | null, first: boolean) => (
    <span className={`chip ${ms === null ? "" : "bg-gold text-[#12332b]"}`}>
      {ms === null ? "☆" : `★ ${fmtElapsed(ms)}${first ? " · first" : ""}`}
    </span>
  );
  return (
    <div className="mt-3 border-4 border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold">
          {board.scored ? "Scored" : `Part 1: ${count("part1Ms")} of ${board.teams.length} · Part 2: ${count("part2Ms")}`} · join pages, or
          lab computers at /hello-world/fix
        </p>
        {!s.revealed && !board.scored && (
          <Toggle
            pressed={!!s.hint}
            className={`btn btn-sm ml-auto ${s.hint ? "btn-on" : halfway ? "btn-coin" : ""}`}
            onPressedChange={(hint) => {
              void run(setScreen({ screen: { ...s, hint } }));
            }}
          >
            {s.hint ? "Hide hint" : halfway ? "Halfway: show hint" : "Show hint"}
          </Toggle>
        )}
      </div>
      {board.teams.length === 0 ? (
        <p className="text-sm text-dim">{w.noTeams}</p>
      ) : (
        <ul className="mt-1 divide-y divide-line">
          {board.teams.map((t) => {
            const x = extra?.wrong.find((r) => r.teamId === t.teamId);
            const wait = t.lockedUntil === null ? 0 : Math.ceil((t.lockedUntil - now) / 1000);
            const a = answers?.teams.find((k) => k.teamId === t.teamId);
            return (
              <li key={t.teamId} className="py-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{t.name}</span>
                  {star(t.part1Ms, t.first1)}
                  {star(t.part2Ms, t.first2)}
                  {wait > 0 && <span className="chip bg-signal text-white">locked {wait}s</span>}
                  {board.scored && <span className="narrow ml-auto text-xl font-extrabold">+{t.result?.points ?? 0}</span>}
                </div>
                {!!x?.wrong && (
                  <p className="text-xs text-dim">
                    {x.wrong} wrong · last: <span className="font-code">{x.lastWrong}</span>
                  </p>
                )}
                {a && (
                  <p className="text-xs text-dim">
                    Answers: <span className="font-code break-all">{a.part1}</span> · <span className="font-code break-all">{a.part2}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="flex-1 text-xs text-dim">
          {board.scored
            ? "Points went on the board when you revealed. Use the score buttons to fix anything."
            : `Each ${w.team} gets a different input. A wrong answer locks the ${w.team} out for 30 seconds. Revealing adds +3 per part 1 star, +5 per part 2 star, and +2 more for the first ${w.team} to each star, doubled on double points. Ending the night scores a puzzle you never revealed.`}
        </p>
        <Toggle className="btn btn-sm text-dim" onPressedChange={setShowKey} pressed={showKey}>
          {showKey ? "Hide answers" : `Show each ${w.team}’s answers`}
        </Toggle>
      </div>
    </div>
  );
}

/** Wiki Race on the TV: the finish order from phones with a ✓/✗ for the referee, then the points. */
function WikiStatus({ live }: { live: Live }) {
  const run = useAction();
  const data = useQuery(api.wiki.board);
  const check = useMutation(api.wiki.check);
  if (!data) return null;
  const done = new Set(data.finished.map((f) => f.teamId));
  const racing = live.teams.filter((t) => !done.has(t._id));
  const points = new Map(data.results?.map((r) => [r.teamId, r.result?.points ?? 0]));
  const w = teamWords(live.teamSize === 1);
  return (
    <div className="mt-3 border-4 border-line p-3">
      <p className="font-bold">
        {data.scored ? "Scored" : `Finished: ${data.finished.filter((f) => f.ok !== false).length} of ${data.teams} ${w.teams}`}
        {data.clicks && " · Fewest Clicks"}
      </p>
      {data.teams === 0 ? (
        <p className="text-sm text-dim">{w.noTeams}</p>
      ) : (
        <ul className="mt-1 divide-y divide-line">
          {data.finished.map((f) => (
            <li key={f.teamId} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className="narrow w-9 text-xl font-extrabold">{f.place !== null ? ordinal(f.place) : "–"}</span>
              <span className={`font-bold ${f.ok === false ? "text-dim line-through" : ""}`}>{f.name}</span>
              {f.clicks !== null && <span className="chip bg-sun/40">{f.clicks} clicks</span>}
              <span className="text-xs text-dim">
                {f.ms !== null && `at ${fmtElapsed(f.ms)}`}
                {f.by && ` · ${f.by}`}
              </span>
              <span className="ml-auto" />
              {data.scored ? (
                <span className="narrow text-xl font-extrabold">+{points.get(f.teamId) ?? 0}</span>
              ) : (
                <ToggleGroup<"correct" | "incorrect">
                  data-own-keys
                  aria-label={`Verify ${f.name}’s finish`}
                  className="flex gap-2"
                  value={f.ok === true ? ["correct"] : f.ok === false ? ["incorrect"] : []}
                  onValueChange={(value) => {
                    void run(
                      check({
                        teamId: f.teamId,
                        card: data.card,
                        ok: value.length === 0 ? null : value[0] === "correct",
                      }),
                    );
                  }}
                >
                  <Toggle value="correct" className={`btn btn-sm ${f.ok === true ? "btn-on" : ""}`} aria-label={`${f.name} made it`}>
                    ✓
                  </Toggle>
                  <Toggle
                    value="incorrect"
                    className={`btn btn-sm ${f.ok === false ? "btn-neon" : ""}`}
                    aria-label={`${f.name} isn’t there yet`}
                  >
                    ✗
                  </Toggle>
                </ToggleGroup>
              )}
            </li>
          ))}
          {racing.map((t) => (
            <li key={t._id} className="flex flex-wrap items-center gap-2 py-1.5 text-dim">
              <span className="narrow w-9 text-xl font-extrabold">–</span>
              <span className="font-bold">{t.name}</span>
              <span className="chip">{data.scored ? "Didn’t finish" : "Racing"}</span>
              {data.scored && <span className="narrow ml-auto text-xl font-extrabold text-ink">+{points.get(t._id) ?? 0}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-dim">
        {data.scored
          ? "Points went on the board when the race ended. Use the score buttons to fix anything."
          : `Glance at each ${w.team}’s screen: ✓ it counts, ✗ not there yet (the ${w.team} can tap again). Unchecked finishes count. Ending the race scores it once: 5, 4, 3 by place, 2 for any other finish, 1 for playing, doubled on double points.`}
      </p>
    </div>
  );
}

function WikiTool({ live, used }: { live: Live; used: string[] }) {
  const run = useAction();
  const setScreen = useMutation(api.sessions.setScreen);
  const timer = useMutation(api.sessions.timer);
  const readyRace = useReadyRace();
  const startRace = useStartRace();
  const s = live.screen;
  const okToLeave = useOkToLeave(live);
  const [cs, setCs] = useState(false);
  const [clicks, setClicks] = useState(!!s.wikiClicks);
  const [race, setRace] = useState<{ from: string; to: string } | null>(
    s.mode === "wiki" && s.wikiFrom && s.wikiTo ? { from: s.wikiFrom, to: s.wikiTo } : null,
  );
  const { busy, act } = useGuardedAction(JSON.stringify([liveActionKey(live), race, clicks]));
  // Follow the TV when the Next button or another officer puts up a race.
  useEffect(() => {
    if (s.mode === "wiki" && s.wikiFrom && s.wikiTo) {
      setRace({ from: s.wikiFrom, to: s.wikiTo });
      setClicks(!!s.wikiClicks);
    }
  }, [s.mode, s.wikiFrom, s.wikiTo, s.wikiClicks]);
  const onTv = !!race && s.mode === "wiki" && s.wikiFrom === race.from && s.wikiTo === race.to;
  const raced = (r: { from: string; to: string }) => used.includes(`wiki:${r.from}>${r.to}`);
  const draw = () => {
    const pool = WIKI_RACES.filter((r) => !cs || r.cs);
    // Prefer races nobody has run yet this season, and never the one already drawn.
    const fresh = pool.filter((r) => !raced(r) && r.from !== race?.from);
    const from = fresh.length ? fresh : pool;
    setRace(from[Math.floor(Math.random() * from.length)]);
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-sm btn-coin" onClick={draw}>
          Draw a race
        </button>
        <Switch.Root
          nativeButton
          render={<button type="button" />}
          checked={cs}
          onCheckedChange={setCs}
          className={`chip ml-2 ${cs ? "bg-ink text-paper" : ""}`}
        >
          Computer science targets only
        </Switch.Root>
        <Switch.Root
          nativeButton
          render={<button type="button" />}
          checked={clicks}
          className={`chip ml-2 ${clicks ? "bg-ink text-paper" : ""} data-disabled:opacity-50`}
          onCheckedChange={setClicks}
          // A race keeps its style once it's up, so finishes all count the same way.
          disabled={onTv}
        >
          Fewest Clicks
        </Switch.Root>
        <SearchPicker
          className="mt-2 w-full"
          value={null}
          label="Pick a race"
          placeholder="Or pick a race…"
          options={WIKI_RACES.map((r, i) => ({ value: String(i), label: `${r.from} → ${r.to}${raced(r) ? " (raced before)" : ""}` }))}
          onValueChange={(value) => {
            const selected = WIKI_RACES.find((_, i) => String(i) === value);
            if (selected) setRace(selected);
          }}
        />
      </div>
      {race && (
        <>
          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-4 border-line bg-mist p-4 text-center">
            <a href={wikiUrl(race.from)} target="_blank" rel="noreferrer" className="font-bold text-2xl hover:underline">
              {race.from}
            </a>
            <span className="text-dim">→</span>
            <a href={wikiUrl(race.to)} target="_blank" rel="noreferrer" className="font-bold text-2xl text-ink hover:underline">
              {race.to}
            </a>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {onTv && s.wikiReady ? (
              <button className="btn btn-sm btn-coin" onClick={() => run(startRace(s))}>
                Start the race: {fmtClock(wikiSeconds(clicks) * 1000)}
              </button>
            ) : onTv ? (
              <button
                className={`btn btn-sm ${s.revealed ? "" : "btn-coin"}`}
                disabled={!!s.revealed}
                onClick={() => run(setScreen({ screen: { ...s, revealed: true } }))}
              >
                {s.revealed ? "Race over" : "End race and score"}
              </button>
            ) : (
              <button
                className="btn btn-sm btn-neon"
                // The get-ready screen first, so every team is on /wiki before the race shows.
                disabled={busy}
                onClick={() =>
                  act(async (current) => {
                    if (!(await okToLeave()) || !current()) return;
                    await readyRace({ ...race, clicks });
                  })
                }
              >
                Show on TV
              </button>
            )}
            <button className="btn btn-sm" onClick={() => setRace({ from: race.to, to: race.from })}>
              Reverse
            </button>
            {/* While any race waits on its get-ready screen, only Start the race starts the clock. */}
            {!(s.mode === "wiki" && s.wikiReady) && (
              <button
                className="btn btn-sm"
                onClick={() => run(timer({ action: "set", seconds: wikiSeconds(clicks), relay: false, autostart: true }))}
              >
                Start {fmtClock(wikiSeconds(clicks) * 1000)}
              </button>
            )}
          </div>
          {onTv && s.wikiReady && (
            <p className="mt-3 text-sm text-dim">
              On the TV: open {CLUB.url}/wiki. Start shows the race and sends every {teamWords(live.teamSize === 1).computer} to the start
              article at once.
            </p>
          )}
          {onTv && !s.wikiReady && <WikiStatus live={live} />}
        </>
      )}
    </div>
  );
}

/** Tech Pictionary outside the big button: a new drawing (the next drawer in turn), the reveal, and the drawing's controls. */
function PictionaryTool({ live }: { live: Live }) {
  const confirm = useConfirm();
  const okToLeave = useOkToLeave(live);
  const { busy, act } = useGuardedAction(liveActionKey(live));
  const newDrawing = useNewDrawing();
  const setScreen = useMutation(api.sessions.setScreen);
  const timer = useMutation(api.sessions.timer);
  const remaining = useRemaining(live.timer);
  const s = live.screen;
  // Like the big button: the reveal stops a running clock so the buzzer doesn't go off over the word.
  // The drawing comes back on the TV for its reveal, even after the scoreboard or join screen went up meanwhile.
  const reveal = async () => {
    await setScreen({ screen: { ...s, mode: "draw", revealed: true } });
    if (live.timer.startedAt && remaining > 0) await timer({ action: "pause" });
  };
  // A drawing up and still open: not revealed, and not scored by the TV moving on.
  const up = s.drawing !== undefined && !s.revealed && !live.scored.includes(drawKey(s.drawing));
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          className="btn btn-sm btn-neon"
          disabled={busy}
          onClick={() =>
            act(async (current) => {
              if (
                up &&
                !(await confirm({
                  title: "Replace the current drawing?",
                  description: "A drawing is still up. Score it as it stands and start a new one?",
                  confirmLabel: "Score and replace drawing",
                }))
              )
                return;
              if (!current() || !(await okToLeave()) || !current()) return;
              await newDrawing();
            })
          }
        >
          New drawing, {fmtClock(DRAW_SECONDS * 1000)}
        </button>
        {up && (
          <button className="btn btn-sm btn-coin" disabled={busy} onClick={() => act(reveal)}>
            Reveal the word and score
          </button>
        )}
      </div>
      <DrawHost live={live} />
      <p className="mt-3 text-sm text-dim">
        The drawer draws on their phone or the officer tablet, everyone else guesses on theirs, and revealing scores it once.
      </p>
    </div>
  );
}

// The bonus XP in the rules. Picking one fills in the reason, which can still be edited (say, to add who they brought).
const BONUS_PRESETS = [
  { why: "Brought a classmate", xp: 2 },
  { why: "Costume", xp: 3 },
];

/** A player's bonus XP tonight, each with what it was for, and a form to add one: pick a reason or type your own. */
function Bonuses({ row }: { row: Row }) {
  const run = useAction();
  const add = useMutation(api.teams.addBonus);
  const remove = useMutation(api.teams.removeBonus);
  const [form, setForm] = useState<{ why: string; xp: number } | null>(null);
  const presets = row.broughtBy ? [{ why: `Brought by ${row.broughtBy}`, xp: 2 }, ...BONUS_PRESETS] : BONUS_PRESETS;

  return (
    <div className="flex basis-full flex-wrap items-center gap-1.5 text-sm">
      {row.bonuses.map((b, i) => (
        <span key={i} className="chip gap-1.5">
          +{b.xp} {b.why}
          <button
            className="text-dim"
            onClick={() => run(remove({ attendanceId: row._id, index: i }))}
            aria-label={`Remove +${b.xp} ${b.why}`}
          >
            ×
          </button>
        </span>
      ))}
      {form ? (
        <form
          className="flex flex-wrap items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void run(add({ attendanceId: row._id, ...form }).then(() => setForm(null)));
          }}
        >
          <SearchPicker
            className="w-full sm:w-64"
            value={null}
            label={`Bonus reason for ${row.name}`}
            placeholder="Pick a reason…"
            options={presets.map((preset, i) => ({ value: String(i), label: `${preset.why} (+${preset.xp})` }))}
            onValueChange={(value) => {
              const preset = presets.find((_, i) => String(i) === value);
              if (preset) setForm(preset);
            }}
          />
          <input
            className="field w-52 py-1 text-sm"
            placeholder="or type what it’s for"
            value={form.why}
            onChange={(e) => setForm({ ...form, why: e.target.value })}
            maxLength={60}
            required
            aria-label="What the bonus is for"
          />
          <input
            className="field w-16 py-1 text-sm"
            type="number"
            min={1}
            max={10}
            value={form.xp || ""}
            onChange={(e) => setForm({ ...form, xp: Number(e.target.value) })}
            required
            aria-label="Bonus XP"
          />
          <button className="btn btn-sm btn-primary">Add</button>
          <button type="button" className="text-dim underline" onClick={() => setForm(null)}>
            Cancel
          </button>
        </form>
      ) : (
        <button className="btn btn-sm" onClick={() => setForm({ why: "", xp: 2 })}>
          + Bonus XP
        </button>
      )}
    </div>
  );
}

function PlayersPanel({ live, rows, sessionId }: { live: Live; rows: Row[]; sessionId: Id<"sessions"> }) {
  const run = useAction();
  const move = useMutation(api.teams.move);
  const addPlayer = useMutation(api.teams.addPlayer);
  const removePlayer = useMutation(api.teams.removePlayer);
  const [form, setForm] = useState({ name: "", email: "" });
  const confirm = useConfirm();
  const { busy, act } = useGuardedAction(JSON.stringify([sessionId, rows.map((r) => [r._id, r.name, r.teamId])]));

  return (
    <Panel title={`Players (${rows.length})`}>
      {!live.practice && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ExportButton sessionId={sessionId} />
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-dim">Nobody yet. Put the join screen on the TV.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r._id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="min-w-40 flex-1">
                <p className="font-bold">
                  {r.name}
                  {r.firstTime && <span className="chip ml-2 text-pine">New</span>}
                  {r.officer && <span className="chip ml-2">{r.teamId ? "Officer, playing" : "Officer"}</span>}
                </p>
                <p className="text-xs text-dim">
                  {r.email}
                  {r.broughtBy ? ` · brought by ${r.broughtBy}` : ""}
                </p>
              </div>
              <SearchPicker
                className="w-full sm:w-48"
                value={r.teamId ?? ""}
                label={`Team for ${r.name}`}
                disabled={busy}
                options={[{ value: "", label: "No team" }, ...live.teams.map((t) => ({ value: t._id, label: t.name }))]}
                onValueChange={(value) => {
                  if (value === "") void run(move({ attendanceId: r._id, teamId: null }));
                  else {
                    const team = live.teams.find((t) => t._id === value);
                    if (team) void run(move({ attendanceId: r._id, teamId: team._id }));
                  }
                }}
              />
              <button
                className="text-sm text-dim underline"
                disabled={busy}
                onClick={() =>
                  act(async (current) => {
                    if (
                      !(await confirm({
                        title: `Remove ${r.name} from tonight?`,
                        description: "They will be removed from tonight’s attendance and team.",
                        confirmLabel: "Remove player",
                        destructive: true,
                      })) ||
                      !current()
                    )
                      return;
                    await removePlayer({ attendanceId: r._id });
                  })
                }
              >
                Remove
              </button>
              <Bonuses row={r} />
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
