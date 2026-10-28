import { Collapsible } from "@base-ui/react/collapsible";
import { Dialog } from "@base-ui/react/dialog";
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
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CardView, DECKS, fmtClock, fmtElapsed, useRemaining } from "#/components/game";
import { kickoffSlides } from "#/components/kickoff";
import type { GameId, Screen } from "#/components/game";
import { HostTimer } from "#/components/host-timer";
import {
  DrawHost,
  NextPanel,
  liveActionKey,
  useGuardedAction,
  useOkToLeave,
  useNewDrawing,
  useReadyRace,
  cardLevel,
  useReveal,
  useStartRace,
} from "#/components/next";
import { ExportButton, OfficerGate, useAction, useJoinCode } from "#/components/officer";
import { useConfirm } from "#/components/feedback";
import { SearchPicker } from "#/components/search-picker";
import { GAME_TILE, Picto, Wrap, ordinal } from "#/components/ui";
import { GAMES, WIKI_RACES, wikiUrl } from "#/lib/content";
import { deckFor, filtersFor, heldKey, nextCard, nounFor, puzzleTitle, revealable, roundOf, roundTitle } from "#/lib/flow";
import type { Filter, Round } from "#/lib/flow";
import { DRAW_SECONDS, cardKey, drawKey, isAnswerGame, wikiSeconds } from "#/lib/grading";
import { PUZZLES, puzzleForLabel } from "#/lib/puzzles";
import { CATALOG, gamesIn, ideaFor, ideaTile, likelyWeek, useSchedule, usesTeamComputer } from "#/lib/schedule";
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

/** A titled group of controls inside a pane, which is already the frame. */
const Panel = ({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) => (
  <section className={className}>
    <h2 className="mb-2 text-lg">{title}</h2>
    {children}
  </section>
);

const STRIP = ["tile-sky", "tile-meadow", "tile-sun", "tile-silver", "tile-pine", "tile-gold"];
const Brand = () => (
  <Link to="/hello-world" className="flex shrink-0 items-center" aria-label="hello, world cup home">
    <span className="grid grid-cols-3 gap-[2px]" aria-hidden>
      {STRIP.map((t) => (
        <span key={t} className={`tile ${t} size-2.5`} />
      ))}
    </span>
  </Link>
);

// The host page has its own bar instead of the site's header and footer (see route.tsx), so the console gets the
// whole screen. The sign-in prompts and the start screen are plain pages under a small bar.
function Host() {
  return (
    <div className="[&>:not([data-host-shell])]:mx-4 [&>:not([data-host-shell])]:my-16">
      <OfficerGate redirect="/hello-world/host" purpose="run tonight’s game">
        <Console />
      </OfficerGate>
    </div>
  );
}

function Console() {
  const data = useQuery(api.sessions.host);
  const live = useQuery(api.sessions.live);
  if (!data || live === undefined) return <p className="font-bold text-dim">Loading…</p>;
  if (!data.session || !live)
    return (
      <div data-host-shell>
        <header className="border-b border-line">
          <div className="mx-auto flex h-14 w-[min(1240px,100%-2.5rem)] items-center gap-3">
            <Brand />
            <p className="font-extrabold">Host tonight’s game</p>
            <span className="ml-auto">
              <UserButton />
            </span>
          </div>
        </header>
        <Wrap className="py-8">
          <StartPanel recent={data.recent} />
        </Wrap>
      </div>
    );
  return <Running live={live} rows={data.rows} used={data.used} shown={data.session.shown ?? []} keys={data.keys} />;
}

/** On a phone, one pane at a time; on a big screen, Play (the command row, rounds, and stage) is always there and the
 *  rail beside it shows Scores, Players, or the TV. */
type Pane = "play" | "scores" | "players" | "tv";
type Side = Exclude<Pane, "play">;
const isPane = (v: unknown): v is Pane => v === "play" || v === "scores" || v === "players" || v === "tv";

/** Whether the screen is big enough for the side-by-side console (Tailwind's lg), kept current as the window resizes. */
const WIDE = "(min-width: 64rem)";
function useWide() {
  return useSyncExternalStore(
    (change) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", change);
      return () => query.removeEventListener("change", change);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
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
  // The lineup round being played comes from the session, so it survives a reload.
  const playing = live.round !== null && live.round < lineup.length ? live.round : null;
  const round = playing === null ? null : roundOf(lineup[playing], playing);
  const roundTab = round ? (tabFor(round.label) ?? null) : null;
  // A game picked by hand lasts until the round changes; then the stage follows the round again.
  const [pick, setPick] = useState<{ round: number | null; tab: Tab } | null>(null);
  const tool = pick && pick.round === playing ? pick.tab : roundTab;
  // Two selections: the phone's pane, and the rail's on a big screen, where Play is always showing and never a tab. The
  // tabs follow whichever one this screen size uses, so a selected tab is always one you can see.
  const isWide = useWide();
  const [pane, setPane] = useState<Pane>("play");
  const [side, setSide] = useState<Side>("scores");
  const choose = (p: Pane) => {
    setPane(p);
    if (p !== "play") setSide(p);
  };
  const [teamsOpen, setTeamsOpen] = useState(live.teams.length === 0);
  const [editing, setEditing] = useState(false);
  const setRound = useMutation(api.sessions.setRound);
  const confirm = useConfirm();
  const okToLeave = useOkToLeave(live);
  const { act } = useGuardedAction(JSON.stringify([liveActionKey(live), lineup]));

  // Any round but the current one, by hand: the same skip warning as the big button, and the same title on the TV.
  const jump = (i: number, item: LineupItem) => {
    setPick(null);
    setPane("play");
    if (i === playing) return;
    const r = roundOf(item, i);
    void act(async (current) => {
      if (
        !(await confirm({
          title: `Jump to round ${i + 1}?`,
          description: `${item.label}${item.double ? " (double points)" : ""}. The TV shows the round’s title. Scores stay as they are.`,
          confirmLabel: "Jump to round",
        })) ||
        !current() ||
        !(await okToLeave()) ||
        !current()
      )
        return;
      await setRound({ round: i, double: r.double, title: roundTitle(r) });
    });
  };
  const openTeams = () => {
    setTeamsOpen(true);
    choose("scores");
  };
  // What the clock is timing, named the way the TV-now line names it.
  const timing = live.timer.card ? cardName(live.timer.card) : undefined;
  // Each pane's visibility comes from CSS at each size, so nothing flashes or unmounts while the size changes.
  const railClass = (p: Side) =>
    `card min-h-0 p-4 lg:col-start-2 lg:row-start-4 lg:rounded-t-none desk:overflow-y-auto ${pane === p ? "" : "max-lg:hidden"} ${side === p ? "" : "lg:hidden"}`;

  return (
    <Tabs.Root value={isWide ? side : pane} onValueChange={(v) => isPane(v) && choose(v)} data-host-shell>
      <HostBar live={live} />
      <div className="mx-auto grid w-full max-w-[100rem] grid-cols-[minmax(0,1fr)] gap-3 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)] lg:grid-rows-[auto_auto_auto_1fr] lg:px-5 desk:h-[calc(100dvh-4rem-1px)] desk:grid-rows-[auto_auto_auto_minmax(0,1fr)]">
        <RoundStrip
          lineup={lineup}
          playing={playing}
          tool={tool}
          roundTab={roundTab}
          onJump={jump}
          onEdit={() => setEditing(true)}
          onPick={(tab) => {
            setPick(tab === null ? null : { round: playing, tab });
            setPane("play");
          }}
          className={`lg:col-span-2 lg:row-start-2 ${pane === "play" ? "" : "max-lg:hidden"}`}
        />
        {/* On a phone, the next action, the clock, and the panes stay pinned at the top, in one row on a phone on its
            side; on a big screen the command row runs across the top and the panes head the rail. The command row is
            two lines: the big button beside the timer's controls, at one height, then a line of notes under each. */}
        <div className="grid gap-2 bg-paper max-lg:sticky max-lg:top-0 max-lg:z-30 max-lg:order-first max-lg:-mx-3 max-lg:border-b max-lg:border-line max-lg:px-3 max-lg:pt-2 short:grid-cols-[minmax(0,1fr)_auto] short:items-center lg:contents">
          {/* Side by side once there's room for both in rem, which follows the text size (a breakpoint wouldn't). */}
          <div className="@container lg:col-span-2 lg:row-start-1">
            <div className="grid gap-x-3 gap-y-1.5 @min-[68rem]:grid-cols-[minmax(0,1fr)_auto] @min-[68rem]:grid-rows-[auto_auto]">
              <NextPanel
                live={live}
                lineup={lineup}
                used={used}
                shown={shown}
                className="@min-[68rem]:row-span-2 @min-[68rem]:grid-rows-subgrid"
              />
              <HostTimer live={live} cardLabel={timing} className="max-lg:hidden @min-[68rem]:row-span-2 @min-[68rem]:grid-rows-subgrid" />
            </div>
          </div>
          <HostTimer live={live} variant="bar" cardLabel={timing} className="lg:hidden" />
          <Tabs.List
            aria-label="Host panes"
            className="grid grid-cols-4 short:col-span-2 lg:col-start-2 lg:rounded-t-[10px] lg:shadow-[inset_0_0_0_1.5px_var(--color-line)] lg:row-start-3 lg:flex lg:gap-1 lg:rounded-b-none lg:px-3 lg:pt-1"
          >
            {(
              [
                ["play", "Play"],
                ["scores", "Scores"],
                ["players", `Players (${rows.length})`],
                ["tv", "TV"],
              ] as const
            )
              .filter(([p]) => !(isWide && p === "play"))
              .map(([p, label]) => (
                <Tabs.Tab
                  key={p}
                  value={p}
                  className={`border-b-[3px] py-2.5 text-sm font-bold lg:px-2 lg:text-base ${p === "play" ? "lg:hidden" : ""} ${
                    side === p ? "lg:border-ink lg:text-ink" : "lg:border-transparent lg:text-dim"
                  } ${pane === p ? "max-lg:border-ink max-lg:text-ink" : "max-lg:border-transparent max-lg:text-dim"}`}
                  onClick={() => {
                    if (!isWide) scrollTo({ top: 0 });
                  }}
                >
                  {p === "tv" ? (
                    <>
                      TV<span className="max-lg:hidden"> &amp; sound</span>
                    </>
                  ) : (
                    label
                  )}
                </Tabs.Tab>
              ))}
          </Tabs.List>
        </div>
        {/* A big screen has no Play tab, since the stage is always there: it's a plain region then, the same element. */}
        <PanePanel
          value="play"
          role={isWide ? "region" : undefined}
          aria-label={isWide ? "Current activity" : undefined}
          className={`lg:col-start-1 lg:row-span-2 lg:row-start-3 ${pane === "play" ? "" : "max-lg:hidden"}`}
        >
          <Stage
            live={live}
            rows={rows}
            used={used}
            shown={shown}
            round={round}
            tool={tool}
            roundTab={roundTab}
            onBack={() => setPick(null)}
            onPick={(tab) => setPick(tab === roundTab ? null : { round: playing, tab })}
            onTeams={openTeams}
            onPlayers={() => choose("players")}
            onTv={() => choose("tv")}
          />
        </PanePanel>
        <PanePanel value="scores" className={railClass("scores")}>
          <ScoresPane
            live={live}
            keys={lineup.some((g) => gamesIn(g.label).some(usesTeamComputer)) ? keys : {}}
            open={teamsOpen}
            setOpen={setTeamsOpen}
          />
        </PanePanel>
        <PanePanel value="players" className={railClass("players")}>
          <PlayersPanel live={live} rows={rows} sessionId={live._id} />
        </PanePanel>
        <PanePanel value="tv" className={railClass("tv")}>
          <div className="space-y-6">
            {(week.kind === "kickoff" || live.screen.mode === "slides") && <SlidesPanel live={live} />}
            <ScreenPanel live={live} />
          </div>
        </PanePanel>
      </div>
      <LineupDialog week={live.week} open={editing} setOpen={setEditing} />
    </Tabs.Root>
  );
}

/** A pane. Every pane stays mounted, so forms, open confirmations, and live data carry over between panes, and the
 *  page decides which ones show at each size (a big screen shows Play beside one rail pane). */
const PanePanel = ({ className = "", ...props }: Omit<Tabs.Panel.Props, "className"> & { value: Pane; className?: string }) => (
  <Tabs.Panel keepMounted hidden={false} inert={false} className={`min-w-0 ${className}`} {...props} />
);

/** What the TV shows right now, in words, with the game waiting under it when something else is up. */
function tvNow(live: Live) {
  const s = live.screen;
  const key = heldKey(s);
  const held = key ? cardName(key) : null;
  switch (s.mode) {
    case "card":
      return `${held ?? "A card"}, ${s.revealed ? "answer shown" : "answer hidden"}${s.hint ? ", hint up" : ""}`;
    case "wiki":
      return `${held ?? "Wiki Race"}${s.wikiReady ? ": get ready" : s.revealed ? ": over" : ": racing"}`;
    case "draw":
      return `${held ?? "A drawing"}${s.revealed ? ", word shown" : ""}`;
    default: {
      const what =
        s.mode === "lobby"
          ? "Join screen"
          : s.mode === "scoreboard"
            ? "Scoreboard"
            : s.mode === "timer"
              ? "Big timer"
              : s.mode === "slides"
                ? `Kickoff slide ${(s.slide ?? 0) + 1}`
                : `Message: “${s.message ?? ""}”`;
      return held ? `${what} (${held} waits under it)` : what;
    }
  }
}

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

/** The night, the join code, what the TV shows, and the Night menu: links to the other officer pages and End night. */
function HostBar({ live }: { live: Live }) {
  const plan = useSchedule();
  const code = useJoinCode();
  const tv = tvNow(live);
  return (
    // Above a phone's sticky command bar (z-30), so the Night menu opens over it.
    <header className="relative z-40 border-b border-line bg-paper/95 backdrop-blur-md lg:sticky lg:top-0">
      <div className="mx-auto flex h-14 max-w-[100rem] items-center gap-3 px-3 lg:h-16 lg:gap-4 lg:px-5">
        <span className="max-sm:hidden">
          <Brand />
        </span>
        <div className="min-w-0 flex-1 leading-tight lg:flex-initial">
          <p className="truncate text-xs font-bold text-pine">
            Week {live.week}
            {isCupWeek(live.week) ? " · Cup night" : ""}
            {live.practice && (
              <span className="chip ml-2 bg-sky text-[#12332b]">
                Practice<span className="max-lg:hidden">: doesn’t count</span>
              </span>
            )}
          </p>
          <h1 className="truncate text-lg lg:text-xl">{plan[live.week - 1]?.title}</h1>
        </div>
        <p className="narrow text-2xl font-extrabold tracking-[0.15em] lg:ml-auto lg:text-4xl" title="Join code">
          <span className="sr-only">Join code </span>
          {code}
        </p>
        <p
          className="flex min-w-0 items-center gap-2 rounded-[6px] bg-mist px-3 py-1.5 text-sm font-semibold max-lg:hidden"
          title="What the TV shows"
        >
          <span className="size-2 shrink-0 rounded-full bg-pine" aria-hidden />
          <span className="max-w-[24rem] truncate">TV: {tv}</span>
        </p>
        <a href="/hello-world/tv" target="_blank" rel="noreferrer" className="btn btn-sm max-lg:hidden">
          Open TV view ↗
        </a>
        <NightMenu live={live} />
        <UserButton />
      </div>
      <p className="truncate border-t border-line px-3 py-1 text-xs font-semibold text-dim lg:hidden">TV: {tv}</p>
    </header>
  );
}

const PAGES = [
  ["/hello-world/kickoff", "Kickoff slides page"],
  ["/hello-world/schedule", "Plan the season"],
  ["/hello-world/kit", "Game plan"],
  ["/hello-world/test", "Test the decks"],
] as const;

function NightMenu({ live }: { live: Live }) {
  const { busy, endNight } = useEndNight(live);
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialogHandoff = useRef(false);
  return (
    <div ref={menu} data-own-keys>
      <Menu.Root
        open={open}
        onOpenChange={(next) => {
          if (next) dialogHandoff.current = false;
          setOpen(next);
        }}
        onOpenChangeComplete={(next) => {
          if (!next && dialogHandoff.current) {
            dialogHandoff.current = false;
            // Wait until the menu releases its focus trap, then give the dialog a durable return target.
            trigger.current?.focus();
            void endNight();
          }
        }}
      >
        <Menu.Trigger ref={trigger} className="btn btn-sm">
          Night <span aria-hidden>▾</span>
        </Menu.Trigger>
        <Menu.Portal container={menu}>
          <Menu.Positioner sideOffset={8} align="end" positionMethod="fixed" className="z-50">
            <Menu.Popup
              finalFocus={trigger}
              className="card grid max-h-[var(--available-height)] w-60 max-w-[var(--available-width)] gap-1 overflow-y-auto bg-paper p-2 text-ink shadow-lg"
            >
              <Menu.LinkItem
                href="/hello-world/tv"
                target="_blank"
                rel="noreferrer"
                closeOnClick
                className="btn btn-sm justify-start data-highlighted:bg-mist lg:hidden"
              >
                Open TV view ↗
              </Menu.LinkItem>
              {PAGES.map(([to, label]) => (
                <Menu.LinkItem
                  key={to}
                  render={<Link to={to} />}
                  closeOnClick
                  className="btn btn-sm justify-start data-highlighted:bg-mist"
                >
                  {label}
                </Menu.LinkItem>
              ))}
              <Menu.Separator className="my-1 border-t border-line" />
              <Menu.Item
                disabled={busy}
                className="btn btn-sm btn-neon justify-start data-highlighted:outline-2"
                onClick={() => {
                  dialogHandoff.current = true;
                  setOpen(false);
                }}
              >
                End night…
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}

/** Tonight's rounds at a glance: played, playing, to come. Picking one jumps there by hand; the lineup edits in a dialog;
 *  any game's tools can come up by hand. */
function RoundStrip({
  lineup,
  playing,
  tool,
  roundTab,
  onJump,
  onEdit,
  onPick,
  className = "",
}: {
  lineup: LineupItem[];
  playing: number | null;
  tool: Tab | null;
  roundTab: Tab | null;
  onJump: (i: number, item: LineupItem) => void;
  onEdit: () => void;
  onPick: (tab: Tab | null) => void;
  className?: string;
}) {
  const menu = useRef<HTMLDivElement>(null);
  return (
    <nav aria-label="Tonight’s rounds" className={`flex flex-wrap items-center gap-2 ${className}`}>
      {lineup.length === 0 ? (
        <p className="flex-1 text-sm text-dim">No rounds planned tonight.</p>
      ) : (
        <ol className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 max-lg:basis-full">
          {lineup.map((g, i) => {
            const id = gamesIn(g.label)[0];
            const gt = id ? GAME_TILE[id] : null;
            const state = playing === null ? (i === 0 ? "next" : "later") : i < playing ? "done" : i === playing ? "now" : "later";
            return (
              <li key={`${i}-${g.label}`} className="shrink-0">
                <button
                  className={`relative flex min-h-10 items-center gap-2 rounded-[6px] py-1 pr-3 pl-2 text-sm font-semibold whitespace-nowrap ${
                    state === "now"
                      ? "bg-sun/30 shadow-[inset_0_0_0_2px_var(--color-sun)]"
                      : state === "done"
                        ? "text-dim shadow-[inset_0_0_0_1px_var(--color-line)]"
                        : "bg-mist hover:bg-line"
                  }`}
                  aria-current={state === "now" ? "step" : undefined}
                  onClick={() => onJump(i, g)}
                >
                  <span className="narrow w-4 text-center font-extrabold">{i + 1}</span>
                  <span className={`tile ${gt?.tile ?? ideaTile(g.label) ?? "bg-line"} size-5 shrink-0`}>
                    {gt && <Picto id={gt.picto} className="absolute inset-[10%]" />}
                  </span>
                  {g.label}
                  {g.double && <span className="chip">×2</span>}
                  <span className="sr-only">
                    {state === "now" ? ", playing now" : state === "done" ? ", played" : state === "next" ? ", first up" : ""}
                  </span>
                  {state === "done" && <span aria-hidden>✓</span>}
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <button className="btn btn-sm" onClick={onEdit}>
        Edit lineup
      </button>
      <div ref={menu} data-own-keys>
        <Menu.Root>
          <Menu.Trigger className={`btn btn-sm ${tool !== roundTab ? "btn-on" : ""}`}>
            Pick a game by hand <span aria-hidden>▾</span>
          </Menu.Trigger>
          <Menu.Portal container={menu}>
            <Menu.Positioner sideOffset={6} align="end" positionMethod="fixed" className="z-50">
              <Menu.Popup className="card grid max-h-[var(--available-height)] w-64 max-w-[var(--available-width)] gap-0.5 overflow-y-auto bg-paper p-2 text-ink shadow-lg">
                <Menu.RadioGroup value={tool === roundTab ? "round" : (tool ?? "round")} onValueChange={(v) => onPick(isTab(v) ? v : null)}>
                  <Menu.RadioItem
                    value="round"
                    closeOnClick
                    className="btn btn-sm justify-start data-checked:bg-pine data-checked:text-white data-highlighted:outline-2"
                  >
                    {playing === null ? "Back to getting ready" : "Back to this round’s game"}
                  </Menu.RadioItem>
                  <Menu.Separator className="my-1 border-t border-line" />
                  {TABS.filter(([t]) => t !== roundTab).map(([t, label]) => (
                    <Menu.RadioItem
                      key={t}
                      value={t}
                      closeOnClick
                      className="btn btn-sm justify-start data-checked:bg-pine data-checked:text-white data-highlighted:outline-2"
                    >
                      {label}
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioGroup>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
    </nav>
  );
}

function LineupDialog({ week, open, setOpen }: { week: number; open: boolean; setOpen: (open: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[90] bg-black/50" />
        <Dialog.Popup className="card fixed top-[4dvh] left-1/2 z-[91] max-h-[92dvh] w-[min(44rem,calc(100%-1.5rem))] -translate-x-1/2 overflow-y-auto bg-paper p-5 text-ink shadow-lg">
          <div className="flex items-center gap-3">
            <Dialog.Title className="text-2xl">Tonight’s lineup</Dialog.Title>
            <Dialog.Close className="btn btn-sm ml-auto">Done</Dialog.Close>
          </div>
          <Dialog.Description className="mt-1 mb-4 text-sm text-dim">
            Changes save to the season plan right away. Use the round buttons to jump to a round.
          </Dialog.Description>
          <LineupPanel week={week} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The game in play: getting ready before round 1, the round's tools, or an activity run by hand. */
function Stage({
  live,
  rows,
  used,
  shown,
  round,
  tool,
  roundTab,
  onBack,
  onPick,
  onTeams,
  onPlayers,
  onTv,
}: {
  live: Live;
  rows: Row[];
  used: string[];
  shown: string[];
  round: Round | null;
  tool: Tab | null;
  roundTab: Tab | null;
  onBack: () => void;
  onPick: (tab: Tab) => void;
  onTeams: () => void;
  onPlayers: () => void;
  onTv: () => void;
}) {
  const manual = tool !== null && tool !== roundTab;
  const label = round?.label ?? null;
  // The game the TV holds, up now or waiting under the scores, when it isn't the one on the stage.
  const s = live.screen;
  const tvTab: Tab | null = s.drawing !== undefined ? "pictionary" : s.wikiFrom ? "wiki" : (s.game ?? null);
  const tvKey = heldKey(s);
  // Something still in play on the TV (not revealed or scored) that the stage isn't showing.
  const elsewhere = tvTab && tvTab !== tool && tvKey && !s.revealed && !live.scored.includes(tvKey) ? tvTab : null;
  const name = tool ? TABS.find(([t]) => t === tool)?.[1] : null;
  const heading = manual ? name : round ? `Round ${round.index + 1}: ${round.label}` : tool ? name : "Getting ready";
  const head = manual || !tool || !!elsewhere;
  const id = useId();
  const filter = label && !manual ? filterFor(label) : "all";
  const pick = label && !manual && tool === "puzzle" ? puzzleForLabel(label) : undefined;
  // A CVE round's preview starts on the card its big button puts up next.
  const next = round && !manual && round.filters.includes("cve") ? (nextCard(round, used, shown) ?? undefined) : undefined;
  // Getting ready is a short summary, so its card ends where it does; a game's tools fill the space they're given.
  const setup = !tool && !round;
  return (
    <section aria-labelledby={`${id}-stage`} className={`card flex min-h-0 flex-col ${setup ? "" : "h-full"}`}>
      {/* The round already shows in the rounds strip and under the big button, so a header only appears when the stage
          isn't simply the round's own game. */}
      <div className={head ? "flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2" : "contents"}>
        <h2 id={`${id}-stage`} className={head ? "min-w-0 text-lg" : "sr-only"}>
          {heading}
        </h2>
        {manual && (
          <>
            <span className="chip">Picked by hand</span>
            <button className="btn btn-sm ml-auto" onClick={onBack}>
              {round ? `Back to round ${round.index + 1}` : "Back to getting ready"}
            </button>
          </>
        )}
        {elsewhere && (
          <button className="btn btn-sm ml-auto" onClick={() => onPick(elsewhere)}>
            The TV has {TABS.find(([t]) => t === elsewhere)?.[1]} going: show its controls
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 p-4 desk:overflow-y-auto">
        {tool === "wiki" ? (
          <WikiTool live={live} used={used} round={round} />
        ) : tool === "pictionary" ? (
          <PictionaryTool live={live} round={round} />
        ) : tool ? (
          <CardTool
            key={`${tool}:${filter}:${pick}:${next}`}
            game={tool}
            live={live}
            used={used}
            initial={filter}
            pick={pick}
            next={next}
            round={round}
          />
        ) : round ? (
          <ActivityStage live={live} round={round} />
        ) : (
          <SetupSteps live={live} rows={rows} onTeams={onTeams} onPlayers={onPlayers} onTv={onTv} />
        )}
      </div>
    </section>
  );
}

/** Before round 1: what's ready and what isn't, each with the way to it. The controls themselves live in one place,
 *  and the lineup is the rounds strip above, so this is the TV, who's playing, and how, in a few short lines. */
function SetupSteps({
  live,
  rows,
  onTeams,
  onPlayers,
  onTv,
}: {
  live: Live;
  rows: Row[];
  onTeams: () => void;
  onPlayers: () => void;
  onTv: () => void;
}) {
  const code = useJoinCode();
  const w = teamWords(live.teamSize === 1);
  const spooky = useSchedule()[live.week - 1].theme === "spooky";
  const lobby = live.screen.mode === "lobby";
  const teams = live.teams.length > 0;
  const mode = MODES.find(([size]) => size === live.teamSize)?.[1] ?? "Teams";
  const steps: { ok: boolean; title: string; detail: React.ReactNode; go?: [string, () => void] }[] = [
    {
      ok: lobby,
      title: lobby ? "Join screen on the TV" : `The TV shows: ${tvNow(live)}`,
      detail: (
        <>
          {/* The spooky night is played on computers: its TV shows no QR. */}
          {spooky ? "Computers" : "Phones"}: {CLUB.url}/<wbr />
          join, code {code ?? "…"}
        </>
      ),
      go: lobby ? undefined : ["TV controls", onTv],
    },
    {
      ok: teams || live.autoTeams,
      title: teams
        ? `${mode}: ${live.teams.length} ${live.teams.length === 1 ? w.team : w.teams}`
        : live.autoTeams
          ? `${mode}, with Auto teams`
          : "How is tonight played?",
      detail: live.autoTeams ? w.autoOn(live.teamSize) : teams ? w.autoOff : w.nobodyPlaying.split(". ")[0] + ".",
      go: ["Team settings", onTeams],
    },
    {
      ok: rows.length > 0,
      title: `${rows.length} ${rows.length === 1 ? "player" : "players"} joined`,
      detail: "Someone without a phone? Add them by hand.",
      go: ["Players", onPlayers],
    },
  ];
  // Side by side once there's room for three (in rem, so larger text gets rows), else a row each with its button last.
  return (
    <div className="@container">
      <ol className="grid gap-2 @min-[40rem]:grid-cols-3">
        {steps.map((s) => (
          <li
            key={s.title}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[8px] bg-mist p-3 @min-[40rem]:flex @min-[40rem]:flex-col @min-[40rem]:items-start"
          >
            <div className="flex min-w-0 flex-1 items-start gap-2.5 [overflow-wrap:anywhere]">
              <span
                className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-sm font-extrabold ${s.ok ? "bg-pine text-white" : "bg-paper shadow-[inset_0_0_0_2px_var(--color-signal)]"}`}
              >
                <span aria-hidden>{s.ok ? "✓" : ""}</span>
                <span className="sr-only">{s.ok ? "Done: " : "To do: "}</span>
              </span>
              <div className="min-w-0">
                <p className="leading-snug font-bold">{s.title}</p>
                <p className="text-sm text-dim">{s.detail}</p>
              </div>
            </div>
            {s.go && (
              <button className="btn btn-sm shrink-0" onClick={s.go[1]}>
                {s.go[0]}
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A round without its own tools (an idea from the library, a custom activity): how it goes and how it's scored. */
function ActivityStage({ live, round }: { live: Live; round: Round }) {
  const game = GAMES.find((g) => g.id === (round.game ?? gamesIn(round.label)[0]));
  const idea = ideaFor(round.label);
  const w = teamWords(live.teamSize === 1);
  return (
    <div className="max-w-[60ch] space-y-3">
      <p>{idea?.how ?? game?.gist ?? "An activity you run in the room."}</p>
      {(idea || game) && (
        <p className="text-sm text-dim">
          {[idea?.time ?? game?.time, idea?.need ?? game?.need].filter(Boolean).join(" · ")}
          {idea?.link && (
            <>
              {" · "}
              <a href={idea.link} target="_blank" rel="noreferrer" className="link">
                Where to play ↗
              </a>
            </>
          )}
        </p>
      )}
      <p className="rounded-[6px] bg-mist p-3 text-sm">
        <strong>Score it by hand</strong> with each {w.team}’s + buttons under Scores{game ? `: ${game.scoring}` : "."} Time it with the
        clock; Big timer puts it on the TV.
      </p>
    </div>
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
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Panel title="Start tonight" className="card p-5 ring-2 ring-gold">
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
      <Panel title={`Week ${week} lineup`} className="card p-5">
        <LineupPanel week={week} />
      </Panel>
      <Panel title="Past nights" className="card p-5">
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

// How tonight is played. A night is all solo or all teams; solo is the default.
const MODES = [
  [1, "Solo"],
  [2, "Teams of 2"],
  [3, "Teams of 3"],
] as const;

/** The standings with +1 +2 +3 at hand, under a one-line summary of how tonight is played and its settings. */
function ScoresPane({
  live,
  keys,
  open,
  setOpen,
}: {
  live: Live;
  keys: Record<string, string | null>;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const w = teamWords(live.teamSize === 1);
  const mode = MODES.find(([s]) => s === live.teamSize)?.[1] ?? "Teams";
  return (
    <section aria-label="Scores">
      <Collapsible.Root open={open} onOpenChange={setOpen}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-sm font-semibold">
            {mode}
            {live.autoTeams ? " · Auto teams on" : ""}
            {live.double ? " · Double points on" : ""}
          </p>
          <Collapsible.Trigger className={`btn btn-sm ${open ? "btn-on" : ""}`}>
            Team settings <span aria-hidden>{open ? "▴" : "▾"}</span>
          </Collapsible.Trigger>
        </div>
        {/* Mounted while closed, so a confirmation it opened still finishes. */}
        <Collapsible.Panel keepMounted className="mt-3 rounded-[8px] bg-mist p-3 data-closed:hidden">
          <TeamSettings live={live} />
        </Collapsible.Panel>
      </Collapsible.Root>
      {live.teams.length === 0 ? (
        <p className="mt-4 text-dim">{live.autoTeams ? w.emptyAuto : w.emptyManual}</p>
      ) : (
        <ol className="mt-2 divide-y divide-line">
          {live.teams.map((t) => (
            <TeamRow key={t._id} t={t} double={live.double} teamKey={keys[t._id]} keyTitle={w.keyTitle} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** How tonight is played (remaking teams), Auto teams, Double points, Add team, and resetting every score. */
function TeamSettings({ live }: { live: Live }) {
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
    <div>
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
          className="inline-flex flex-wrap rounded-[6px] bg-paper p-1"
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
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
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
    </div>
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

/** A week's games in order, to edit. Edits save to the season plan right away, so swapping a game mid-night also
 *  updates the season page. */
function LineupPanel({ week }: { week: number }) {
  const run = useAction();
  const save = useMutation(api.schedule.save);
  const w = useSchedule()[week - 1];
  const lineup = w.lineup;
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
    <div>
      {lineup.length === 0 ? (
        <p className="text-dim">No games planned. Add one below.</p>
      ) : (
        <ol className="space-y-[3px]">
          {lineup.map((g, i) => {
            const id = gamesIn(g.label)[0];
            const gt = id ? GAME_TILE[id] : null;
            return (
              <li key={`${i}-${g.label}`} className="flex flex-wrap items-center gap-2 bg-mist p-2">
                <span className="narrow w-6 text-center text-lg font-extrabold">{i + 1}</span>
                <span className={`tile ${gt?.tile ?? ideaTile(g.label) ?? "bg-line"} size-8 shrink-0`}>
                  {gt && <Picto id={gt.picto} className="absolute inset-[10%]" />}
                </span>
                <span className="min-w-32 flex-1 font-bold">
                  {g.label}
                  {g.double && <span className="chip ml-2">Double points</span>}
                </span>
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
              </li>
            );
          })}
        </ol>
      )}
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
    </div>
  );
}

/** "output:2" as "Output? #3", a race key as "Wiki Race: From → To", and "draw:4" as "Drawing 4", for officers. */
const cardName = (key: string) => {
  const [game, rest] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
  return game === "wiki"
    ? `Wiki Race: ${rest.replace(">", " → ")}`
    : game === "draw"
      ? `Drawing ${rest}`
      : game === "puzzle"
        ? `Puzzle: ${puzzleTitle(Number(rest))}`
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
// A CVE round opens on the real bugs, which its big button draws from.
const filterFor = (label: string): Filter => {
  const f = filtersFor(label);
  return f.includes("cve") ? "cve" : (f[0] ?? "all");
};
/** The Games tab for a lineup entry, if it has one. */
const tabFor = (label: string | null) => {
  const id = label && gamesIn(label)[0];
  return TABS.find(([t]) => t === id)?.[0];
};

function CardTool({
  game,
  live,
  used,
  initial,
  pick,
  next,
  round,
}: {
  game: GameId;
  live: Live;
  used: string[];
  initial: Filter;
  pick?: number;
  /** The card the round's big button puts up next, to start on instead of the first fresh one. */
  next?: number;
  /** The round being played, whose big button reveals its own cards. */
  round: Round | null;
}) {
  const run = useAction();
  const reveal = useReveal(live);
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
    game === "bug"
      ? ["all", "easy", "medium", "hard", "spooky", "cve"]
      : game === "fix"
        ? ["all", "easy", "medium", "hard", "spooky"]
        : game === "relay"
          ? ["all", "easy", "medium"]
          : [];
  // The round's filter, unless it hides the card to start on (the TV's, or the next one once the CVEs run out).
  const [filter, setFilter] = useState<Filter>(() => {
    const start = tvIndex ?? next;
    return filters.includes(initial) && (start === undefined || deckFor(game, initial).includes(start)) ? initial : "all";
  });
  // Start on the lineup round's puzzle, or the card the TV is showing, or the round's next card, or else the first card
  // not shown on any night yet.
  const [pos, setPos] = useState(() =>
    pick !== undefined
      ? pick
      : tvIndex !== undefined
        ? deckFor(game, filter).indexOf(tvIndex)
        : next !== undefined
          ? deckFor(game, filter).indexOf(next)
          : firstFresh(deckFor(game, filter)),
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
  // one would reopen it and hand every lock the early bonus. Restart is there to give it one on purpose.
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

  const key = cardKey(game, index);
  // Its clock waits (parked) while the scores, join screen, or a message are up over it.
  const held = !onTv && heldKey(s) === key;
  const noun = nounFor(game);
  // The round's big button reveals the round's own cards, so the reveal here is only for a card picked by hand.
  const byButton =
    !!round && revealable(round) && (round.kind === "deck" ? round.game === game : round.kind === "puzzle" && round.puzzle === index);
  const level = cardLevel(game, index);
  // Browsing away from the card on the TV: name the one the big button acts on, with a way back to it.
  const upKey = heldKey(s) && !s.revealed && !onTv ? heldKey(s) : null;
  const status =
    onTv && isAnswerGame(game) ? (
      <AnswerStatus live={live} />
    ) : onTv && game === "fix" ? (
      <FixStatus live={live} />
    ) : onTv && game === "puzzle" ? (
      <PuzzleStatus live={live} index={index} />
    ) : null;

  return (
    <div className="@container">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StageTag state={onTv ? "live" : held ? "held" : "preview"} />
        <p className="min-w-0 font-bold">
          {cardName(key)}
          <span className="font-semibold text-dim">
            {level ? ` · ${level}` : ""} · {fmtClock(secs * 1000)}
          </span>
          {!onTv && !held && isUsed(index) && <span className="chip ml-2">shown before</span>}
        </p>
        <span className="inline-flex items-center gap-1" role="group" aria-label="Browse the deck">
          <button className="btn btn-sm" onClick={() => go(-1)} aria-label="Previous card">
            ‹ Prev
          </button>
          <span className="narrow min-w-14 text-center font-bold text-dim">
            {Math.min(pos, indexes.length - 1) + 1} / {indexes.length}
          </span>
          <button className="btn btn-sm" onClick={() => go(1)} aria-label="Next card">
            Next ›
          </button>
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          {onTv ? (
            s.revealed ? (
              // Scoring happens once, so hiding and showing the answer again never scores twice.
              <button className="btn btn-sm" onClick={() => run(setScreen({ screen: { ...s, revealed: false } }))}>
                Hide answer on TV
              </button>
            ) : (
              !byButton && (
                <button className="btn btn-sm" disabled={busy} onClick={() => act(() => reveal("card"))}>
                  Reveal answer on TV
                </button>
              )
            )
          ) : (
            <button className="btn btn-sm" disabled={busy} onClick={() => act(showOnTv)}>
              {held ? "Put it back on the TV" : heldKey(s) ? "Show this one on TV instead" : "Show on TV"}
            </button>
          )}
          {/* A fresh clock for the card on the TV (and a fresh early-bonus window if nobody has answered yet). */}
          {onTv && !s.revealed && (
            <button className="btn btn-sm" disabled={busy} onClick={() => run(start())}>
              Restart the {noun}’s clock: {fmtClock(secs * 1000)}
            </button>
          )}
        </span>
      </div>
      {filters.length > 0 && (
        <RadioGroup<Filter>
          value={filter}
          data-own-keys
          aria-label="Filter cards"
          className="mt-2 flex flex-wrap gap-1.5"
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
              {f === "cve" ? "CVE" : f}
            </Radio.Root>
          ))}
        </RadioGroup>
      )}
      {upKey && (
        <p className="mt-2 flex flex-wrap items-center gap-2 rounded-[6px] bg-sun/20 px-3 py-1.5 text-sm">
          <span>
            On the TV: <strong>{cardName(upKey)}</strong>. The big button acts on that one.
          </span>
          {tvIndex !== undefined && (
            <button className="btn btn-sm" onClick={() => setPos(Math.max(0, indexes.indexOf(tvIndex)))}>
              Back to it
            </button>
          )}
        </p>
      )}
      {/* The card and, beside it when there's room, what the phones and team computers are doing. */}
      <div className={`mt-3 grid items-start gap-3 ${status ? "@2xl:grid-cols-[minmax(0,1fr)_minmax(15rem,20rem)]" : ""}`}>
        <div
          className={`min-w-0 rounded-[8px] p-4 ${onTv ? "bg-mist shadow-[inset_0_0_0_3px_var(--color-pine)]" : "border-2 border-dashed border-line"}`}
        >
          <p className="mb-2 text-xs font-extrabold tracking-wide text-dim uppercase">
            {onTv
              ? s.revealed
                ? "Answer is on the TV"
                : `Answer only on your screen${byButton ? " · the big button reveals it" : ""}`
              : held
                ? "Off the TV for now · its clock waits until it’s back"
                : "Preview · only you see this, answer too"}
          </p>
          <CardView game={game} index={index} answer />
        </div>
        {status && <div className="min-w-0 @2xl:sticky @2xl:top-0 [&>div]:mt-0">{status}</div>}
      </div>
    </div>
  );
}

/** Whether the stage shows what's on the TV, what's waiting under it, or a private preview. */
const StageTag = ({ state }: { state: "live" | "held" | "preview" }) => (
  <span
    className={`shrink-0 rounded-[4px] px-2 py-0.5 text-xs font-extrabold tracking-wide uppercase ${
      state === "live"
        ? "bg-pine text-white"
        : state === "held"
          ? "bg-sun/40 text-ink"
          : "text-dim shadow-[inset_0_0_0_1.5px_var(--color-dim)]"
    }`}
  >
    {state === "live" ? "Live on TV" : state === "held" ? "Off the TV for now" : "Preview, not on TV"}
  </span>
);

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
                {/* Bug Hunt: the team gave up its early bonus for the beetle's hint. */}
                {p?.hint && <span className="chip bg-sun/40">Asked the beetle</span>}
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

function WikiTool({ live, used, round }: { live: Live; used: string[]; round: Round | null }) {
  const run = useAction();
  const reveal = useReveal(live);
  // In a Wiki Race round the big button starts and ends its races; these are for a race picked by hand.
  const byButton = round?.kind === "wiki";
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
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StageTag state={onTv ? "live" : s.wikiFrom === race.from && s.wikiTo === race.to ? "held" : "preview"} />
            {s.revealed && onTv && <span className="text-sm font-bold text-dim">Race over</span>}
          </div>
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-4 border-line bg-mist p-4 text-center">
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
              !byButton && (
                <button className="btn btn-sm" disabled={busy} onClick={() => act(() => startRace(s))}>
                  Start the race: {fmtClock(wikiSeconds(clicks) * 1000)}
                </button>
              )
            ) : onTv ? (
              !s.revealed &&
              !byButton && (
                <button className="btn btn-sm" disabled={busy} onClick={() => act(() => reveal("wiki"))}>
                  End race and score
                </button>
              )
            ) : (
              <button
                className="btn btn-sm"
                // The get-ready screen first, so every team is on /wiki before the race shows.
                disabled={busy}
                onClick={() =>
                  act(async (current) => {
                    if (!(await okToLeave()) || !current()) return;
                    await readyRace({ ...race, clicks });
                  })
                }
              >
                {s.wikiFrom ? "Show this race on TV instead" : "Show on TV"}
              </button>
            )}
            {!onTv && (
              <button className="btn btn-sm" onClick={() => setRace({ from: race.to, to: race.from })}>
                Reverse
              </button>
            )}
            {/* A fresh clock for this race only, once it's running: get ready's Start starts it the first time. */}
            {onTv && !s.wikiReady && !s.revealed && (
              <button
                className="btn btn-sm"
                disabled={busy}
                onClick={() => run(timer({ action: "set", seconds: wikiSeconds(clicks), relay: false, autostart: true }))}
              >
                Restart the race clock: {fmtClock(wikiSeconds(clicks) * 1000)}
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
function PictionaryTool({ live, round }: { live: Live; round: Round | null }) {
  const confirm = useConfirm();
  const okToLeave = useOkToLeave(live);
  const { busy, act } = useGuardedAction(liveActionKey(live));
  const newDrawing = useNewDrawing();
  const reveal = useReveal(live);
  const s = live.screen;
  // In a Pictionary round the big button starts and reveals drawings; these are for a drawing outside one.
  const byButton = round?.kind === "pictionary";
  // A drawing up and still open: not revealed, and not scored by the TV moving on.
  const up = s.drawing !== undefined && !s.revealed && !live.scored.includes(drawKey(s.drawing));
  return (
    <div>
      {byButton ? (
        <p className="text-sm text-dim">The big button starts each drawing and reveals the word.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-sm"
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
            // The drawing comes back on the TV for its reveal, even after the scoreboard or join screen went up.
            <button className="btn btn-sm" disabled={busy} onClick={() => act(() => reveal("draw"))}>
              Reveal the word and score
            </button>
          )}
        </div>
      )}
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
      <form
        className="mb-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(addPlayer(form).then(() => setForm({ name: "", email: "" })));
        }}
      >
        <input
          className="field"
          placeholder="Name (no phone? add them)"
          aria-label="Player name"
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
      {rows.length === 0 ? (
        <p className="text-dim">Nobody yet. They show up here as they join from the TV’s code.</p>
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
    </Panel>
  );
}
