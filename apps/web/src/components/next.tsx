// The run-the-night control on /host: one big button that always says what it does next, walking through tonight's
// lineup. Everything it shows comes from the session (see src/lib/flow.ts), so a reload picks up where it left off.
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { DECKS, fmtClock, useRemaining } from "./game";
import type { Screen } from "./game";
import { drawOpen } from "./draw";
import { WORD_MAX } from "#/lib/draw";
import { useAction } from "./officer";
import { useConfirm, useNotify } from "./feedback";
import { SearchPicker } from "./search-picker";
import { BUGS, GAMES, RELAYS } from "#/lib/content";
import { FIXES } from "#/lib/fixes";
import {
  countOf,
  freshLeft,
  heldKey,
  heldLabel,
  nextCard,
  nextRace,
  nounFor,
  puzzleTitle,
  roundItems,
  roundNoun,
  roundOf,
  roundTitle,
  stepFor,
} from "#/lib/flow";
import type { Round } from "#/lib/flow";
import { DRAW_SECONDS, cardKey, cardSeconds, isAnswerGame, wikiSeconds } from "#/lib/grading";
import { PUZZLES } from "#/lib/puzzles";
import type { GameId } from "#/lib/grading";
import type { LineupItem } from "#/lib/schedule";
import { CLUB } from "#/lib/season";
import { teamWords } from "#/lib/words";
import type { Id } from "../../convex/_generated/dataModel";

type Live = NonNullable<FunctionReturnType<typeof api.sessions.live>>;
type Action = { label: string; go: (current: () => boolean) => Promise<unknown> | undefined; keys?: false };

/** One pending action per component. A dialog approval expires when its context changes or its owner unmounts. */
export function useGuardedAction(snapshot: string) {
  const run = useAction();
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  const isMounted = () => mounted.current;
  const context = useRef({ snapshot, version: 0 });
  if (context.current.snapshot !== snapshot) context.current = { snapshot, version: context.current.version + 1 };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      context.current.version++;
    };
  }, []);
  const act = async (go: (current: () => boolean) => Promise<unknown> | undefined) => {
    if (pending.current || !isMounted()) return;
    pending.current = true;
    setBusy(true);
    const version = context.current.version;
    let notified = false;
    const current = () => {
      if (!mounted.current) return false;
      if (context.current.version === version) return true;
      if (!notified) {
        notified = true;
        notify.info("Things changed while you were deciding. Check and try again.");
      }
      return false;
    };
    try {
      await run(Promise.resolve().then(() => (current() ? go(current) : undefined)));
    } finally {
      pending.current = false;
      if (isMounted()) setBusy(false);
    }
  };
  return { busy, act };
}

// Which focused things own which of the night's keys. Text entry owns every key. Space presses whatever focusable control
// has focus, so any of them owns it. Arrows move within tabs, radios, menus, sliders, and similar groups, and N types
// ahead in menus and lists, so those own them; a plain button or link owns neither, so after clicking +1 the arrow still
// advances the night. Anything marked data-own-keys owns them all.
const roles = (...names: string[]) => names.map((r) => `[role="${r}"]`);
const TEXT = [
  "input",
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  "[data-own-keys]",
  ...roles("textbox", "searchbox", "spinbutton", "combobox"),
];
const SPACE_OWNERS = [
  ...TEXT,
  "button",
  "a[href]",
  "summary",
  // A tab panel takes focus when its empty space is clicked, so it doesn't count.
  '[tabindex]:not([tabindex="-1"]):not([role="tabpanel"])',
  ...roles("button", "link", "checkbox", "radio", "switch", "slider", "tab", "option", "menuitem", "menuitemradio", "menuitemcheckbox"),
].join(", ");
const ARROW_OWNERS = [
  ...TEXT,
  ...roles(
    "tab",
    "radio",
    "slider",
    "option",
    "listbox",
    "menu",
    "menuitem",
    "menuitemradio",
    "menuitemcheckbox",
    "toolbar",
    "grid",
    "tree",
  ),
].join(", ");
const N_OWNERS = [...TEXT, ...roles("listbox", "option", "menu", "menuitem", "menuitemradio", "menuitemcheckbox", "tree", "grid")].join(
  ", ",
);
/** A dialog, confirmation, or popover is open: it has the keyboard, wherever focus is. Notifications (see feedback.tsx)
 *  also use dialog roles but never take the keyboard, so they don't count, and every match is checked so a notification
 *  can't hide a real dialog behind it. */
const OVERLAY = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';
const overlayOpen = () =>
  [...document.querySelectorAll(OVERLAY)].some((el) => !el.closest('[data-feedback="notifications"]') && el.getClientRects().length > 0);

/** Changes that invalidate an approval to replace or finish the current game. */
export const liveActionKey = (live: Live) =>
  JSON.stringify([live._id, live.round, live.screen, live.unrevealed, live.scored, live.teamSize, live.double, live.timer]);

/** The Pictionary word, shown to officers only while they press and hold. It never goes on the TV. */
export function WordPeek({ word }: { word: string }) {
  const [peek, setPeek] = useState(false);
  return (
    <button
      data-own-keys
      className="mt-4 grid min-h-40 w-full place-items-center border-4 border-dashed border-gold text-center select-none"
      onPointerDown={() => setPeek(true)}
      onPointerUp={() => setPeek(false)}
      onPointerLeave={() => setPeek(false)}
      onPointerCancel={() => setPeek(false)}
      onBlur={() => setPeek(false)}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && setPeek(true)}
      onKeyUp={() => setPeek(false)}
    >
      {peek ? (
        <span className="font-bold text-5xl text-ink">{word}</span>
      ) : (
        <span className="text-dim">Press and hold to see the word</span>
      )}
    </button>
  );
}

/** A Bug Hunt, Fix it for real, or Code Relay card's difficulty. */
export const cardLevel = (game: GameId, i: number) =>
  game === "bug" ? BUGS[i].level : game === "fix" ? FIXES[i].level : game === "relay" ? RELAYS[i].level : null;

/**
 * Before something new goes up over the TV's card (or race) while it has answers in and hasn't been revealed: ask, since
 * those answers only count once it's back and revealed. A drawing scores itself when something else goes up.
 */
export function useOkToLeave(live: Live) {
  const confirm = useConfirm();
  return async () => {
    const s = live.screen;
    const key = heldKey(s);
    if (!key || s.drawing !== undefined || !live.unrevealed.includes(key)) return true;
    const what = s.wikiFrom
      ? `this race (${s.wikiFrom} → ${s.wikiTo})`
      : s.game && s.index !== undefined
        ? `this ${nounFor(s.game)} (${DECKS[s.game].name} #${s.index + 1})`
        : "it";
    return confirm({
      title: `Skip ${what} without scoring it?`,
      description: `${
        s.game === "puzzle"
          ? "Its stars score when you bring it back and reveal it, or when the night ends."
          : "Answers on it won’t count unless you bring it back and reveal it."
      }`,
      confirmLabel: "Skip without scoring",
      destructive: true,
    });
  };
}

/** Put a Wiki Race's get-ready screen on the TV, with its clock set but stopped so no old countdown or chime runs on. */
export function useReadyRace() {
  const setScreen = useMutation(api.sessions.setScreen);
  const timer = useMutation(api.sessions.timer);
  return async (race: { from: string; to: string; clicks: boolean }) => {
    await setScreen({
      screen: { mode: "wiki", wikiFrom: race.from, wikiTo: race.to, wikiClicks: race.clicks || undefined, wikiReady: true },
    });
    await timer({ action: "set", seconds: wikiSeconds(race.clicks), relay: false });
  };
}

/** Start a Wiki Race from its get-ready screen: the race goes up and its clock starts, for every team at once. */
export function useStartRace() {
  const setScreen = useMutation(api.sessions.setScreen);
  const timer = useMutation(api.sessions.timer);
  // The get-ready screen back on the TV if the scoreboard or join screen went up meanwhile, so the clock times the
  // race; then the clock, so finish times always count from it; then the race goes up and team computers jump to it.
  return async (s: Screen) => {
    if (s.mode !== "wiki") await setScreen({ screen: { ...s, mode: "wiki" } });
    await timer({ action: "set", seconds: wikiSeconds(!!s.wikiClicks), relay: false, autostart: true });
    await setScreen({ screen: { ...s, mode: "wiki", wikiReady: undefined } });
  };
}

/** A new Tech Pictionary drawing: the server picks the next drawer and a secret word, then it goes up with its clock. */
export function useNewDrawing() {
  const start = useMutation(api.drawings.start);
  const setScreen = useMutation(api.sessions.setScreen);
  const timer = useMutation(api.sessions.timer);
  return async () => {
    const drawing = await start();
    await setScreen({ screen: { mode: "draw", drawing, revealed: false } });
    await timer({ action: "set", seconds: DRAW_SECONDS, relay: false, autostart: true });
  };
}

/**
 * Reveal the TV's card, race, or drawing, bringing it back on the TV first if something else went up over it. A clock
 * still running stops so the buzzer doesn't go off over the answer; one that ran out stays at "time". The server scores a
 * reveal once, so revealing again after hiding the answer never scores twice.
 */
export function useReveal(live: Live) {
  const setScreen = useMutation(api.sessions.setScreen);
  const timer = useMutation(api.sessions.timer);
  // Time left as of the press, read then rather than ticking here, so the callers don't redraw every 200 ms.
  return async (mode: "card" | "wiki" | "draw") => {
    const t = live.timer;
    const running = t.startedAt !== undefined && t.remainingMs - (Date.now() - t.startedAt) > 0;
    await setScreen({ screen: { ...live.screen, mode, revealed: true } });
    if (running) await timer({ action: "pause" });
  };
}

/** The drawing for officers: who's drawing, the word (press and hold), skip it or hand it to someone else, and who has drawn. */
export function DrawHost({ live }: { live: Live }) {
  const run = useAction();
  const data = useQuery(api.drawings.host);
  const skip = useMutation(api.drawings.skip);
  const setScreen = useMutation(api.sessions.setScreen);
  const switchDrawer = useMutation(api.drawings.switchDrawer);
  const timer = useMutation(api.sessions.timer);
  const ownWord = useMutation(api.drawings.ownWord);
  const remaining = useRemaining(live.timer);
  const [own, setOwn] = useState("");
  const [saving, setSaving] = useState(false);
  if (!data) return null;
  const d = data.current;
  // Changing the word or drawer waits for the drawing to be back on the TV, where phones and the tablet can draw it.
  const onTv = live.screen.mode === "draw";
  const useOwn = async (drawingId: Id<"drawings">, word: string) => {
    setSaving(true);
    try {
      await ownWord({ drawingId, word });
      // Keep anything typed while it saved.
      setOwn((cur) => (cur === word ? "" : cur));
      await fresh();
    } finally {
      setSaving(false);
    }
  };
  const fresh = () => timer({ action: "set", seconds: DRAW_SECONDS, relay: false, autostart: true });
  // Someone new gets a new word and a fresh clock.
  const handTo = (id: Id<"attendance">) => d && run(switchDrawer({ drawingId: d._id, attendanceId: id }).then(fresh));
  return (
    <div className="mt-4 border-4 border-line p-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <p className="font-bold">
          {d ? `Drawing ${d.n}: ${d.drawerName} ${d.over ? "drew it" : "is drawing"}` : `Next to draw: ${data.next?.name ?? "nobody yet"}`}
        </p>
        <p className="ml-auto text-sm text-dim">
          Drawn tonight: {data.drawn} of {data.players.length}
        </p>
      </div>
      {d && !d.over && (
        <>
          {/* The scoreboard or join screen went up mid-drawing: phones and the tablet stop drawing until it's back. */}
          {live.screen.mode !== "draw" && (
            <button className="btn btn-coin mt-3 w-full" onClick={() => run(setScreen({ screen: { ...live.screen, mode: "draw" } }))}>
              Put the drawing back on the TV
            </button>
          )}
          <WordPeek word={d.word} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              className="btn btn-sm"
              disabled={!onTv || !drawOpen(live, d.key, remaining) || d.got > 0}
              onClick={() => run(skip({ drawingId: d._id }))}
            >
              Skip this word
            </button>
            <SearchPicker
              className="w-auto text-sm"
              value={null}
              disabled={!onTv || d.got > 0}
              onValueChange={(value) => {
                const player = data.players.find((p) => p._id === value && p._id !== d.drawer);
                if (player) void handTo(player._id);
              }}
              label="Switch drawer"
              placeholder="Switch drawer…"
              options={data.players.filter((p) => p._id !== d.drawer).map((p) => ({ value: p._id, label: p.name }))}
            />
          </div>
          {/* A word of the officer's own, e.g. tonight's topic: the drawer gets it on a clean canvas with a fresh clock. */}
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (own.trim() && !saving) void run(useOwn(d._id, own));
            }}
          >
            {/* Dotted out like a password, since guessers walk past; press and hold the word above to check it. */}
            <input
              className="field min-w-0 py-1 text-base [-webkit-text-security:disc]"
              value={own}
              onChange={(e) => setOwn(e.target.value)}
              placeholder="Or give them your own word"
              aria-label="Your own word"
              maxLength={WORD_MAX}
              autoComplete="off"
              spellCheck={false}
              disabled={!onTv || d.got > 0}
            />
            <button className="btn btn-sm shrink-0" disabled={!onTv || d.got > 0 || !own.trim() || saving}>
              Use it
            </button>
          </form>
          {d.got > 0 && <p className="mt-1 text-sm text-dim">Someone has it, so the word and the drawer stay.</p>}
        </>
      )}
      <p className="mt-2 text-xs text-dim">
        The drawer gets the word on their phone. The officer tablet draws on the same picture: {CLUB.url}/hello-world/draw
      </p>
    </div>
  );
}

export function NextPanel({
  live,
  lineup,
  used,
  shown,
  className = "",
}: {
  live: Live;
  lineup: LineupItem[];
  /** Cards used on earlier real nights, and cards up tonight. */
  used: string[];
  shown: string[];
  className?: string;
}) {
  const setRound = useMutation(api.sessions.setRound);
  const setScreen = useMutation(api.sessions.setScreen);
  const timer = useMutation(api.sessions.timer);
  const end = useMutation(api.sessions.end);
  const readyRace = useReadyRace();
  const startRace = useStartRace();
  const newDrawing = useNewDrawing();
  const revealNow = useReveal(live);
  const remaining = useRemaining(live.timer);
  const confirm = useConfirm();
  const notify = useNotify();
  const okToLeave = useOkToLeave(live);
  const { busy, act: guardedAct } = useGuardedAction(JSON.stringify([liveActionKey(live), lineup, live.teams]));

  const rounds = lineup.map(roundOf);
  const at = live.round === null || !rounds.length ? null : Math.min(live.round, rounds.length - 1);
  const r = at === null ? null : rounds[at];
  const following = at === null ? 1 : at + 1;
  const after = following < rounds.length ? rounds[following] : null;
  const s = live.screen;
  const teams = live.teams.length;
  const w = teamWords(live.teamSize === 1);
  const timeUp = remaining === 0;

  // This round's puzzle, while it's up and unrevealed: done once every team has both stars, and its hint unlocks at half time.
  const puzzle = r?.kind === "puzzle" ? r.puzzle : undefined;
  const puzzleUp = puzzle !== undefined && s.game === "puzzle" && s.index === puzzle && !s.revealed;
  const stars = useQuery(api.puzzles.board, puzzleUp ? {} : "skip");
  const allStars =
    puzzleUp &&
    teams > 0 &&
    stars?.card === cardKey("puzzle", puzzle) &&
    stars.teams.length > 0 &&
    stars.teams.every((t) => t.part2Ms !== null);
  const halfway = puzzleUp && live.timer.card === cardKey("puzzle", puzzle) && remaining <= live.timer.durationMs / 2;
  const hintReady = halfway && !timeUp && !allStars;

  // This round's cards (races, drawings) so far, toward its set number: "Snippet 3 of 5".
  const played = r ? roundItems(r, live.thisRound).length : 0;
  const upNext = r ? countOf(r, played + 1) : null;
  const held = heldLabel(r, live.thisRound, s);
  const step = stepFor({ round: r, screen: s, teams, hintReady, played });
  const card = r ? nextCard(r, used, shown) : null;
  const race = r?.kind === "wiki" ? nextRace(r, used, shown) : null;

  // Highlight the reveal (or scores) once time is up or every team is in.
  const waiting = step === "reveal" || step === "scores";
  const answers = useQuery(api.answers.board, waiting && s.mode === "card" && isAnswerGame(s.game) ? {} : "skip");
  const fixes = useQuery(api.fixes.board, waiting && s.mode === "card" && s.game === "fix" ? {} : "skip");
  const wiki = useQuery(api.wiki.board, waiting && s.mode === "wiki" ? {} : "skip");
  const drawing = useQuery(api.drawings.board, waiting && s.mode === "draw" ? {} : "skip");
  // Who draws next, for the button.
  const between = step === "show" || step === "choose" || step === "done";
  const draws = useQuery(api.drawings.host, r?.kind === "pictionary" && between ? {} : "skip");
  const allIn =
    allStars ||
    (teams > 0 &&
      (answers
        ? answers.locked === teams
        : fixes
          ? fixes.fixed.length === teams
          : wiki
            ? wiki.finished.filter((f) => f.ok !== false).length === teams
            : drawing
              ? drawing.guessing > 0 && drawing.got.length === drawing.guessing
              : false));
  const ready = waiting && (allIn || timeUp);

  // A clock that ran out stays at "time"; one still running stops so the buzzer doesn't go off over the answer.
  const pause = () => (live.timer.startedAt && remaining > 0 ? timer({ action: "pause" }) : undefined);
  const startRound = async (x: Round, current: () => boolean) => {
    if (!(await okToLeave()) || !current()) return;
    await setRound({ round: x.index, double: x.double, title: roundTitle(x) });
  };
  const show = async (current: () => boolean) => {
    if (!(await okToLeave()) || !current()) return;
    if (r?.kind === "deck" && r.game) {
      if (card === null) return notify.info(`This deck is out of ${thing}s for tonight. Pick one by hand under Games.`);
      await setScreen({ screen: { mode: "card", game: r.game, index: card, revealed: false } });
      await timer({ action: "set", seconds: cardSeconds(r.game, card), relay: live.teamSize > 1 && r.game === "relay", autostart: true });
    } else if (r?.kind === "puzzle" && r.puzzle !== undefined) {
      await setScreen({ screen: { mode: "card", game: "puzzle", index: r.puzzle, revealed: false } });
      await timer({
        action: "set",
        seconds: cardSeconds("puzzle", r.puzzle),
        relay: live.teamSize > 1 && !!PUZZLES[r.puzzle].relay,
        autostart: true,
      });
    } else if (race) {
      // The get-ready screen: Start (the "go" step) shows the race and starts the clock.
      await readyRace(race);
    } else if (r?.kind === "pictionary") {
      await newDrawing();
    }
  };
  const onward: Action = after
    ? { label: `Next round: ${after.label}`, go: (current) => startRound(after, current) }
    : {
        label: "End night",
        keys: false,
        go: async (current) => {
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
        },
      };

  const thing = r ? roundNoun(r) : "snippet";
  const drawer = draws?.next?.name ?? "next in turn";
  const of = upNext ? ` (${upNext})` : "";
  // The TV screen this round's cards (or races, or drawings) play on.
  const home = r?.kind === "wiki" ? "wiki" : r?.kind === "pictionary" ? "draw" : "card";
  const reveal: Action = {
    label:
      r?.kind === "wiki"
        ? "End race and score"
        : r?.kind === "puzzle"
          ? "Reveal and score"
          : r?.kind === "pictionary"
            ? "Reveal the word and score"
            : "Reveal answer",
    go: () => revealNow(home),
  };
  let primary: Action | null = null;
  let alt: Action | null = null;
  if (!r) {
    if (rounds.length) primary = { label: `Start round 1: ${rounds[0].label}`, go: (current) => startRound(rounds[0], current) };
  } else if (step === "show") {
    const label =
      r.kind === "wiki" && race
        ? `Get ready${upNext ? ` for race ${upNext}` : ""}: ${w.computers} to /wiki`
        : r.kind === "puzzle" && r.puzzle !== undefined
          ? `Show the puzzle: ${puzzleTitle(r.puzzle)}`
          : r.kind === "pictionary"
            ? `New drawing: ${drawer}${of}`
            : `Show ${upNext ? `${thing} ${upNext}` : `next ${thing}`}`;
    primary = { label, go: show };
  } else if (step === "go") {
    primary = {
      label: `Start the race: ${fmtClock(wikiSeconds(!!s.wikiClicks) * 1000)}`,
      go: () => startRace(s),
    };
  } else if ((step === "reveal" || step === "hint") && s.mode !== home) {
    // The scores, join screen, or a message went up mid-play: its clock parked, and it comes back to finish.
    primary = { label: `Put the ${thing} back on the TV`, go: () => setScreen({ screen: { ...s, mode: home } }) };
    alt = { ...reveal, keys: false };
  } else if (step === "hint") {
    // The same hint the Puzzles deck puts up: on the TV, phones, and team computers.
    primary = { label: "Show hint", go: () => setScreen({ screen: { ...s, mode: "card", hint: true } }) };
    // Revealing early is a click, never a stray N.
    alt = { ...reveal, keys: false };
  } else if (step === "reveal") {
    primary = reveal;
  } else if (step === "scores") {
    primary = {
      label: "Show scores",
      go: async () => {
        await setScreen({ screen: { ...s, mode: "scoreboard" } });
        await pause();
      },
    };
  } else if (step === "choose") {
    primary = { label: r.kind === "pictionary" ? `Another drawing: ${drawer}${of}` : `Next ${thing}${of}`, go: show };
    alt = onward;
  } else if (step === "done") {
    // The round has played its set number: on to the next one, with one more a click away (never a stray N).
    primary = onward;
    alt = { label: r.kind === "pictionary" ? `One more drawing: ${drawer}` : `One more ${thing}`, go: show, keys: false };
  } else primary = onward;

  const act = (a: Action) => guardedAct(a.go);

  // Space or → for the big button, N for the second one, unless what has focus owns that key (see SPACE_OWNERS) or a
  // dialog is open. A focused button gets its own Space press, the big button included, exactly once; nothing is blurred.
  // Keys another handler already took are left alone, and so is this panel while it's hidden.
  const keys = useRef({ primary, alt, busy, act });
  keys.current = { primary, alt, busy, act };
  const panel = useRef<HTMLElement>(null);
  const panelId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey || !panel.current?.offsetParent) return;
      const space = e.key === " ";
      const arrow = e.key === "ArrowRight";
      const n = e.key === "n" || e.key === "N";
      if (!(space || arrow || n) || overlayOpen()) return;
      if (t?.closest(space ? SPACE_OWNERS : arrow ? ARROW_OWNERS : N_OWNERS)) return;
      const k = keys.current;
      const a = n ? k.alt : k.primary;
      if (!a || a.keys === false) return;
      e.preventDefault();
      if (!k.busy) void k.act(a);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const manual =
    r &&
    (step === "scores" || step === "choose" || step === "done" || step === "next") &&
    !(r.kind === "wiki" || r.kind === "puzzle" || r.kind === "pictionary" || (r.kind === "deck" && r.game !== "relay"));
  const rules = r && GAMES.find((g) => g.id === (r.game ?? r.kind));
  // The details under the button, one short line each: where the night is, what's up, what's next.
  const nextCardLine =
    r?.kind === "deck" && r.game && between
      ? `Next ${thing}: ${
          card === null
            ? "none left tonight"
            : `${DECKS[r.game].name} #${card + 1}${cardLevel(r.game, card) ? `, ${cardLevel(r.game, card)}` : ""}, ${fmtClock(cardSeconds(r.game, card) * 1000)}`
        } · ${freshLeft(r, used, shown)} fresh left`
      : r?.kind === "puzzle" && r.puzzle !== undefined && step === "show"
        ? `Next puzzle: ${puzzleTitle(r.puzzle)}, ${fmtClock(cardSeconds("puzzle", r.puzzle) * 1000)}${
            !w.solo && PUZZLES[r.puzzle].relay ? " with relay chimes every 2 minutes" : ""
          } · ${w.computers} at /hello-world/fix`
        : race && between
          ? `Next race: ${race.from} → ${race.to}, ${race.clicks ? "Fewest Clicks, " : ""}${fmtClock(wikiSeconds(race.clicks) * 1000)}`
          : null;
  return (
    <section ref={panel} aria-labelledby={`${panelId}-title`} className={`min-w-0 ${className}`}>
      <h2 id={`${panelId}-title`} className="sr-only">
        Run the night
      </h2>
      {!primary ? (
        <p className="card p-4 text-dim">No games in tonight’s lineup yet. Add some with Edit lineup.</p>
      ) : (
        <div className={`grid gap-2 ${alt ? "grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]" : ""}`}>
          <button
            className={`btn btn-coin min-h-14 w-full aria-disabled:cursor-wait aria-disabled:opacity-60 text-lg leading-tight whitespace-normal short:min-h-11 short:py-2 short:text-base lg:min-h-16 lg:text-2xl ${ready ? "ring-4 ring-sun ring-offset-2" : ""}`}
            // Not disabled while it works: a disabled button drops focus, and the next key would land nowhere. The
            // guard ignores presses until the last one finishes.
            aria-disabled={busy || undefined}
            onClick={() => act(primary)}
          >
            {primary.label}
          </button>
          {alt && (
            <button
              className="btn min-h-14 w-full text-sm aria-disabled:cursor-wait aria-disabled:opacity-60 leading-tight whitespace-normal short:min-h-11 short:py-2 lg:min-h-16 lg:text-base"
              aria-disabled={busy || undefined}
              onClick={() => act(alt)}
            >
              {alt.label}
            </button>
          )}
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-dim">
        {ready && (
          <p className="font-bold text-pine">
            {allIn ? (drawing ? "Everyone guessing got it." : `Every ${w.team} ${allStars ? "has both stars" : "is in"}.`) : "Time’s up."}
          </p>
        )}
        {teams === 0 && (step === "start" || step === "show") && (
          <p className="font-semibold text-signal">
            {w.solo ? "Nobody’s playing yet." : "No teams yet."}{" "}
            {live.autoTeams
              ? "Players go on as they join from the TV’s code."
              : "Pick how tonight is played under Team settings (or turn on Auto teams) so phones can play."}
          </p>
        )}
        <p className="short:hidden">
          {r ? (
            <>
              Round {r.index + 1} of {rounds.length}
              {held ? `, ${held.toLowerCase()}` : ""}
            </>
          ) : (
            "Not started yet"
          )}
          {live.double && <span className="chip ml-2">Double points</span>}
        </p>
        {step === "hint" && <p>Half the time is gone, so the hint is unlocked.</p>}
        {step === "go" && (
          <p>
            On the TV: open {CLUB.url}/wiki. Start shows {s.wikiFrom} → {s.wikiTo} and sends every {w.computer} there at once.
          </p>
        )}
        {nextCardLine && <p className="max-lg:hidden">{nextCardLine}</p>}
        <p className="max-lg:hidden">
          {after ? (
            <>
              Up next: round {after.index + 1}, {after.label}
              {after.double && " (double points)"}
            </>
          ) : (
            "This is the last round."
          )}
        </p>
        {primary && primary.keys !== false && (
          <p className="max-lg:hidden">
            Keys: Space or → for “{primary.label}”{alt && alt.keys !== false ? `, N for “${alt.label}”` : ""}
          </p>
        )}
      </div>
      {manual && (
        <p className="mt-1.5 text-sm">
          <strong>Score this one by hand</strong> with the score buttons{rules ? `: ${rules.scoring}` : "."}
        </p>
      )}
    </section>
  );
}
