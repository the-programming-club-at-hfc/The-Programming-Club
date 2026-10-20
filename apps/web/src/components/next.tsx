// The run-the-night control on /host: one big button that always says what it does next, walking through tonight's
// lineup. Everything it shows comes from the session (see src/lib/flow.ts), so a reload picks up where it left off.
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { DECKS, fmtClock, useRemaining } from "./game";
import type { Screen } from "./game";
import { drawOpen } from "./draw";
import { run } from "./officer";
import { BUGS, GAMES, RELAYS } from "#/lib/content";
import { FIXES } from "#/lib/fixes";
import { freshLeft, nextCard, nextRace, puzzleTitle, roundOf, roundTitle, stepFor } from "#/lib/flow";
import type { Round } from "#/lib/flow";
import { DRAW_SECONDS, cardKey, cardSeconds, isAnswerGame, wikiSeconds } from "#/lib/grading";
import { PUZZLES } from "#/lib/puzzles";
import type { GameId } from "#/lib/grading";
import type { LineupItem } from "#/lib/schedule";
import { CLUB } from "#/lib/season";
import { teamWords } from "#/lib/words";
import type { Id } from "../../convex/_generated/dataModel";

type Live = NonNullable<FunctionReturnType<typeof api.sessions.live>>;
type Action = { label: string; go: () => Promise<unknown> | undefined; keys?: false };

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

const level = (game: GameId, i: number) =>
  game === "bug" ? BUGS[i].level : game === "fix" ? FIXES[i].level : game === "relay" ? RELAYS[i].level : null;

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

/** The drawing for officers: who's drawing, the word (press and hold), skip it or hand it to someone else, and who has drawn. */
export function DrawHost({ live }: { live: Live }) {
  const data = useQuery(api.drawings.host);
  const skip = useMutation(api.drawings.skip);
  const switchDrawer = useMutation(api.drawings.switchDrawer);
  const timer = useMutation(api.sessions.timer);
  const remaining = useRemaining(live.timer);
  if (!data) return null;
  const d = data.current;
  // Someone new gets a new word and a fresh clock.
  const handTo = (id: Id<"attendance">) =>
    d &&
    run(
      switchDrawer({ drawingId: d._id, attendanceId: id }).then(() =>
        timer({ action: "set", seconds: DRAW_SECONDS, relay: false, autostart: true }),
      ),
    );
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
          <WordPeek word={d.word} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              className="btn btn-sm"
              disabled={!drawOpen(live, d.key, remaining) || d.got > 0}
              onClick={() => run(skip({ drawingId: d._id }))}
            >
              Skip this word
            </button>
            <select
              className="field w-auto py-1 text-sm"
              value=""
              disabled={d.got > 0}
              onChange={(e) => e.target.value && handTo(e.target.value as Id<"attendance">)}
              aria-label="Switch drawer"
            >
              <option value="">Switch drawer…</option>
              {data.players
                .filter((p) => p._id !== d.drawer)
                .map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
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
  const remaining = useRemaining(live.timer);
  const [busy, setBusy] = useState(false);

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

  const step = stepFor({ round: r, screen: s, teams, hintReady });
  const card = r ? nextCard(r, used, shown) : null;
  const race = r?.kind === "wiki" ? nextRace(r, used, shown) : null;

  // Highlight the reveal (or scores) once time is up or every team is in.
  const waiting = step === "reveal" || step === "scores";
  const answers = useQuery(api.answers.board, waiting && s.mode === "card" && isAnswerGame(s.game) ? {} : "skip");
  const fixes = useQuery(api.fixes.board, waiting && s.mode === "card" && s.game === "fix" ? {} : "skip");
  const wiki = useQuery(api.wiki.board, waiting && s.mode === "wiki" ? {} : "skip");
  const drawing = useQuery(api.drawings.board, waiting && s.mode === "draw" ? {} : "skip");
  // Who draws next, for the button.
  const draws = useQuery(api.drawings.host, r?.kind === "pictionary" && step === "show" ? {} : "skip");
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
  const startRound = async (x: Round) => {
    await setRound({ round: x.index, double: x.double, title: roundTitle(x) });
  };
  const show = async () => {
    if (r?.kind === "deck" && r.game) {
      if (card === null) return alert("This deck is out of cards for tonight. Pick one by hand under Games.");
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
    ? { label: `Next round: ${after.label}`, go: () => startRound(after) }
    : {
        label: "End night",
        keys: false,
        go: () => (confirm("End the night? Place XP goes out from the current standings.") ? end() : undefined),
      };

  const thing =
    r?.kind === "wiki"
      ? "race"
      : r?.kind === "puzzle"
        ? "puzzle"
        : r?.kind === "pictionary"
          ? "drawing"
          : r?.game === "relay"
            ? "problem"
            : "card";
  const reveal: Action = {
    label:
      r?.kind === "wiki"
        ? "End race and score"
        : r?.kind === "puzzle"
          ? "Reveal and score"
          : r?.kind === "pictionary"
            ? "Reveal the word and score"
            : "Reveal answer",
    go: async () => {
      await setScreen({ screen: { ...s, mode: r?.kind === "wiki" ? "wiki" : r?.kind === "pictionary" ? "draw" : "card", revealed: true } });
      await pause();
    },
  };
  let primary: Action | null = null;
  let alt: Action | null = null;
  if (!r) {
    if (rounds.length) primary = { label: `Start round 1: ${rounds[0].label}`, go: () => startRound(rounds[0]) };
  } else if (step === "show") {
    const label =
      r.kind === "wiki" && race
        ? `Get ready: ${w.computers} to /wiki`
        : r.kind === "puzzle" && r.puzzle !== undefined
          ? `Show the puzzle: ${puzzleTitle(r.puzzle)}`
          : r.kind === "pictionary"
            ? `New drawing: ${draws?.next?.name ?? "next in turn"}`
            : `Show ${s.mode === "message" ? "the first" : "next"} ${thing}`;
    primary = { label, go: show };
  } else if (step === "go") {
    primary = {
      label: `Start the race: ${fmtClock(wikiSeconds(!!s.wikiClicks) * 1000)}`,
      go: () => startRace(s),
    };
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
    primary = { label: `Another ${thing}`, go: show };
    alt = onward;
  } else primary = onward;

  const act = async (a: Action) => {
    setBusy(true);
    try {
      await run(Promise.resolve(a.go()));
    } finally {
      setBusy(false);
    }
  };

  // Space or → for the big button, N for the next round. Typing in a field, or a control with its own keys, is left alone.
  const keys = useRef({ primary, alt, busy, act });
  keys.current = { primary, alt, busy, act };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, select, [contenteditable], [data-own-keys]"))
        return;
      const k = keys.current;
      const a = e.key === " " || e.key === "ArrowRight" ? k.primary : e.key === "n" || e.key === "N" ? k.alt : null;
      if (!a || a.keys === false) return;
      e.preventDefault();
      // A focused button would also click on Space in some browsers, so let go of it.
      if (t instanceof HTMLButtonElement) t.blur();
      if (!k.busy) void k.act(a);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const manual =
    r &&
    (step === "scores" || step === "choose" || step === "next") &&
    !(r.kind === "wiki" || r.kind === "puzzle" || r.kind === "pictionary" || (r.kind === "deck" && r.game !== "relay"));
  const rules = r && GAMES.find((g) => g.id === (r.game ?? r.kind));
  return (
    <section className={`card p-5 ring-2 ring-gold max-lg:p-4 ${className}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-2xl max-lg:text-lg">Run the night</h2>
        <p className="text-dim">
          {r ? (
            <>
              Round {r.index + 1} of {rounds.length}: <strong className="text-ink">{r.label}</strong>
            </>
          ) : (
            "Not started yet"
          )}
          {live.double && <span className="chip ml-2">Double points</span>}
        </p>
      </div>
      {!primary ? (
        <p className="mt-3 text-dim">No games in tonight’s lineup yet. Add some below.</p>
      ) : (
        <div className={`mt-4 grid gap-2 ${alt ? "sm:grid-cols-[1.4fr_1fr]" : ""}`}>
          <button
            className={`btn btn-coin min-h-20 w-full text-2xl ${ready ? "ring-4 ring-sun ring-offset-2" : ""}`}
            disabled={busy}
            onClick={() => act(primary)}
          >
            {primary.label}
          </button>
          {alt && (
            <button className="btn min-h-20 w-full text-xl" disabled={busy} onClick={() => act(alt)}>
              {alt.label}
            </button>
          )}
        </div>
      )}
      {ready && (
        <p className="mt-2 font-bold text-pine">
          {allIn ? (drawing ? "Everyone guessing got it." : `Every ${w.team} ${allStars ? "has both stars" : "is in"}.`) : "Time’s up."}
        </p>
      )}
      {teams === 0 && (step === "start" || step === "show") && <p className="mt-2 font-semibold text-signal">{w.nobodyPlaying}</p>}
      {r?.kind === "pictionary" && <DrawHost live={live} />}
      {manual && (
        <p className="mt-3 text-sm">
          <strong>Score this one by hand</strong> with the score buttons{rules ? `: ${rules.scoring}` : "."}
        </p>
      )}
      <div className="mt-3 space-y-0.5 text-sm text-dim">
        {r?.kind === "deck" && r.game && (step === "show" || step === "choose") && (
          <p>
            Next card:{" "}
            {card === null
              ? "none left tonight"
              : `${DECKS[r.game].name} #${card + 1}${level(r.game, card) ? `, ${level(r.game, card)}` : ""}, ${fmtClock(cardSeconds(r.game, card) * 1000)}`}
            {" · "}
            {freshLeft(r, used, shown)} fresh left
          </p>
        )}
        {r?.kind === "puzzle" && r.puzzle !== undefined && step === "show" && (
          <p>
            Next puzzle: {puzzleTitle(r.puzzle)}, {fmtClock(cardSeconds("puzzle", r.puzzle) * 1000)}
            {!w.solo && PUZZLES[r.puzzle].relay ? " with relay chimes every 2 minutes" : ""}
            {" · "}
            {w.computers} at /hello-world/fix
          </p>
        )}
        {step === "hint" && <p>Half the time is gone, so the hint is unlocked.</p>}
        {step === "go" && (
          <p>
            On the TV: open {CLUB.url}/wiki. Start shows {s.wikiFrom} → {s.wikiTo} and sends every {w.computer} there at once.
          </p>
        )}
        {race && (step === "show" || step === "choose") && (
          <p>
            Next race: {race.from} → {race.to}, {race.clicks ? "Fewest Clicks, " : ""}
            {fmtClock(wikiSeconds(race.clicks) * 1000)}
          </p>
        )}
        <p>
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
          <p className="text-xs max-lg:hidden">
            Keys: Space or → for “{primary.label}”{alt && alt.keys !== false ? `, N for “${alt.label}”` : ""}.
          </p>
        )}
      </div>
    </section>
  );
}
