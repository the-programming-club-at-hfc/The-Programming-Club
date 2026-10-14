import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { SlideStage, kickoffSlides, useSlideKeys } from "#/components/kickoff";
import { CardView, DECKS, fmtClock, fmtElapsed, isSwapMoment, useChimes, useRemaining } from "#/components/game";
import { OfficerGate, run, useJoinCode } from "#/components/officer";
import { GAME_TILE, Picto, ordinal, weekTile } from "#/components/ui";
import { GAMES } from "#/lib/content";
import { cardKey, isAnswerGame, wikiKey } from "#/lib/grading";
import { nextMeeting, useJustEnded, useSchedule } from "#/lib/schedule";
import { CLUB, fmtDate } from "#/lib/season";
import { playMusic, setVolume, sfx, unlockAudio } from "#/lib/sound";
import { teamWords } from "#/lib/words";
import type { TeamWords } from "#/lib/words";

export const Route = createFileRoute("/hello-world/tv")({
  head: () => ({ meta: [{ title: `TV · ${CLUB.season}` }] }),
  component: Tv,
});

type Live = NonNullable<FunctionReturnType<typeof api.sessions.live>>;
type Board = NonNullable<FunctionReturnType<typeof api.answers.board>>;
type FixBoard = NonNullable<FunctionReturnType<typeof api.fixes.board>>;
type PuzzleBoard = NonNullable<FunctionReturnType<typeof api.puzzles.board>>;
type WikiBoard = NonNullable<FunctionReturnType<typeof api.wiki.board>>;

function useOrigin() {
  const [origin, setOrigin] = useState(`https://${CLUB.url}`);
  useEffect(() => {
    // In dev, swap localhost for the machine's network address so phones can scan the QR code.
    const { protocol, hostname, port } = window.location;
    const lan = import.meta.env.VITE_LAN_HOST as string | undefined;
    setOrigin(lan && ["localhost", "127.0.0.1"].includes(hostname) ? `${protocol}//${lan}:${port}` : window.location.origin);
  }, []);
  return origin;
}

function Tv() {
  return (
    <OfficerGate redirect="/hello-world/tv" purpose="put the game on the TV">
      <TvScreen />
    </OfficerGate>
  );
}

function TvScreen() {
  const live = useQuery(api.sessions.live);
  const code = useJoinCode();
  const [sound, setSound] = useState(false);
  return (
    <div
      className="theme-pine relative flex h-screen flex-col overflow-hidden"
      onClick={() => !sound && unlockAudio().then(() => setSound(true))}
    >
      {live && code ? <LiveTv live={live} code={code} sound={sound} /> : live === null ? <AfterNight /> : null}
      {!sound && (
        <button
          className="absolute top-4 right-4 z-10 rounded-[6px] bg-mist px-4 py-2 text-sm font-semibold text-dim"
          onClick={(e) => {
            e.stopPropagation();
            void unlockAudio().then(() => setSound(true));
          }}
        >
          Click to turn on sound
        </button>
      )}
    </div>
  );
}

/** The join code as white squares, sized by the parent's font size. */
function CodeSquares({ code, className = "" }: { code: string; className?: string }) {
  return (
    <span className={`flex gap-[0.08em] ${className}`} aria-label={`Code ${code.split("").join(" ")}`}>
      {code.split("").map((c, i) => (
        <span key={i} className="narrow grid h-[1.3em] w-[1.05em] place-items-center bg-white leading-none font-extrabold text-[#12332b]">
          {c}
        </span>
      ))}
    </span>
  );
}

/** After End night: the final standings for a while, then the attract screen. */
function AfterNight() {
  const last = useJustEnded();
  if (last === undefined) return null;
  return last ? (
    <div className="flex-1 overflow-hidden p-[3.5vw]">
      <Scoreboard teams={last.teams} solo={last.solo} final />
    </div>
  ) : (
    <Attract />
  );
}

function Attract() {
  const plan = useSchedule();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  const next = now === null ? null : nextMeeting(plan, now);
  return (
    <div className="grid flex-1 grid-cols-[1fr_1.1fr] items-center gap-[5vw] px-[6vw]">
      <ul className="grid grid-cols-3 gap-[0.3vw]">
        {GAMES.map((g, i) => (
          <li key={g.id} className={`tile tile-in ${GAME_TILE[g.id].tile} aspect-square`} style={{ animationDelay: `${i * 90}ms` }}>
            <Picto animate="loop" id={GAME_TILE[g.id].picto} className="absolute inset-[13%]" />
          </li>
        ))}
      </ul>
      <div>
        <h1 className="text-[7.4vw] leading-[0.9] tracking-[-0.055em] whitespace-nowrap">
          hello,
          <br />
          world cup
        </h1>
        {next && (
          <p className="mt-[3vw] text-[1.9vw]">
            Next up: <strong>{plan[next.i].title}</strong>,{" "}
            {fmtDate(plan[next.i].start, { weekday: "long", month: "long", day: "numeric" })}
          </p>
        )}
        <p className="mt-[0.8vw] text-[1.5vw] text-dim">Grab a seat. The game starts soon.</p>
      </div>
    </div>
  );
}

function LiveTv({ live, code, sound }: { live: Live; code: string; sound: boolean }) {
  const remaining = useRemaining(live.timer);
  useChimes(live.timer, remaining);
  useTvSound(live, remaining, sound);
  const origin = useOrigin();
  const joinUrl = `${origin}/join?code=${code}`;
  const s = live.screen;
  const running = !!live.timer.startedAt;
  const plan = useSchedule();
  const wk = plan[live.week - 1];
  const wt = weekTile(wk);
  const w = teamWords(live.teamSize === 1);
  const deckTile = s.game ? GAME_TILE[s.game] : null;
  const answerable = s.mode === "card" && isAnswerGame(s.game) && s.index !== undefined;
  const boardData = useQuery(api.answers.board, answerable ? {} : "skip");
  const board = answerable && s.game && s.index !== undefined && boardData?.card === cardKey(s.game, s.index) ? boardData : null;
  const isFix = s.mode === "card" && s.game === "fix" && s.index !== undefined;
  const fixData = useQuery(api.fixes.board, isFix ? {} : "skip");
  const fixBoard = isFix && s.index !== undefined && fixData?.card === cardKey("fix", s.index) ? fixData : null;
  const isPuzzle = s.mode === "card" && s.game === "puzzle" && s.index !== undefined;
  const puzzleData = useQuery(api.puzzles.board, isPuzzle ? {} : "skip");
  const puzzleBoard = isPuzzle && s.index !== undefined && puzzleData?.card === cardKey("puzzle", s.index) ? puzzleData : null;
  const stars = puzzleBoard?.teams.reduce((n, t) => n + Number(t.part1Ms !== null) + Number(t.part2Ms !== null), 0) ?? null;
  const isWiki = s.mode === "wiki" && !!s.wikiFrom && !!s.wikiTo;
  const wikiData = useQuery(api.wiki.board, isWiki ? {} : "skip");
  const wikiBoard = isWiki && wikiData?.card === wikiKey(s.wikiFrom!, s.wikiTo!) ? wikiData : null;
  useCountSound(
    board ? board.card : fixBoard ? fixBoard.card : puzzleBoard ? puzzleBoard.card : wikiBoard?.card,
    board
      ? board.locked
      : fixBoard
        ? fixBoard.fixed.length
        : puzzleBoard
          ? stars
          : wikiBoard
            ? wikiBoard.finished.filter((f) => f.ok !== false).length
            : null,
  );
  // A card already scored tonight shows as played (answer and results), like it does on phones.
  const done = !!s.revealed || !!board?.results || !!fixBoard?.scored || !!puzzleBoard?.scored;

  return (
    <>
      <div className={s.mode === "slides" ? "flex min-h-0 flex-1" : "flex-1 overflow-hidden p-[3.5vw]"}>
        {s.mode === "slides" && <Slides screen={s} />}
        {s.mode === "lobby" && <Lobby live={live} code={code} joinUrl={joinUrl} />}
        {s.mode === "scoreboard" && <Scoreboard teams={live.teams} solo={live.teamSize === 1} />}
        {s.mode === "timer" && (
          <div className="grid h-full place-items-center">
            <BigTimer remaining={remaining} running={running} swap={isSwapMoment(live.timer, remaining)} size="text-[34vw]" />
          </div>
        )}
        {s.mode === "card" && s.game && s.index !== undefined && (
          <div className="mx-auto flex h-full max-w-[90vw] flex-col justify-center">
            <p className="mb-[1.2vw] flex items-center gap-[1vw] text-[1.8vw] font-bold">
              {deckTile && (
                <span className={`tile ${deckTile.tile} size-[3.6vw]`}>
                  <Picto id={deckTile.picto} className="absolute inset-[10%]" />
                </span>
              )}
              {DECKS[s.game].name}
              {board && board.locked !== null && !s.revealed && board.teams > 0 && (
                <span className="ml-auto">
                  <span className="narrow text-[2.6vw] font-extrabold">{board.locked}</span> of {board.teams} {w.teams} locked in
                </span>
              )}
              {fixBoard && !done && fixBoard.teams > 0 && (
                <span className="ml-auto">
                  <span className="narrow text-[2.6vw] font-extrabold">{fixBoard.fixed.length}</span> of {fixBoard.teams} {w.teams} fixed it
                </span>
              )}
              {puzzleBoard && !done && stars !== null && stars > 0 && (
                <span className="ml-auto">
                  <span className="narrow text-[2.6vw] font-extrabold text-gold">{stars}</span> star{stars === 1 ? "" : "s"} so far
                </span>
              )}
            </p>
            <div className={board?.results || fixBoard || puzzleBoard ? "grid grid-cols-[minmax(0,1fr)_26vw] items-start gap-[3vw]" : ""}>
              <CardView game={s.game} index={s.index} answer={done} hint={!!s.hint} size="xl" solo={w.solo} />
              {board?.results && <Results results={board.results} bug={s.game === "bug"} />}
              {fixBoard && <FixList board={fixBoard} done={done} w={w} />}
              {puzzleBoard && <StarBoard board={puzzleBoard} done={done} w={w} />}
            </div>
          </div>
        )}
        {s.mode === "wiki" && s.wikiReady && (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="text-[2vw] font-bold text-dim">Wiki Race{s.wikiClicks ? ": Fewest Clicks" : ""} · get ready</p>
              <p className="mt-[1.5vw] text-[2.4vw]">{w.openOn}</p>
              <p className="mt-[0.5vw] text-[6vw] leading-[1] font-extrabold tracking-[-0.03em]">{CLUB.url}/wiki</p>
              <p className="mt-[2vw] text-[1.8vw] text-dim">The start and target go up when the race starts, for {w.everyone} at once.</p>
            </div>
          </div>
        )}
        {s.mode === "wiki" && !s.wikiReady && s.wikiFrom && s.wikiTo && (
          <div className={`grid h-full items-center gap-[3vw] ${wikiBoard && wikiBoard.teams > 0 ? "grid-cols-[minmax(0,1fr)_26vw]" : ""}`}>
            <div className="flex flex-col gap-[3vw]">
              <div className={`grid gap-[0.3vw] ${wikiBoard && wikiBoard.teams > 0 ? "" : "grid-cols-2"}`}>
                <div className="bg-mist p-[3vw]">
                  <p className="text-[1.6vw] text-dim">Start here</p>
                  <p className="mt-[0.8vw] text-[5vw] leading-[0.95] font-extrabold tracking-[-0.03em]">{s.wikiFrom}</p>
                  <p className="mt-[1.2vw] text-[1.6vw] font-bold">
                    {w.Computers}: {CLUB.url}/wiki
                  </p>
                </div>
                <div className="tile tile-sky p-[3vw]">
                  <p className="text-[1.6vw]">Get to</p>
                  <p className="mt-[0.8vw] text-[5vw] leading-[0.95] font-extrabold tracking-[-0.03em]">{s.wikiTo}</p>
                </div>
              </div>
              <p className="text-[1.5vw] text-dim">
                {s.wikiClicks ? "Fewest clicks wins. Count every link you click. " : ""}
                Links inside the article only. No search bar. Back button and Ctrl+F are fine. Tap “{w.madeIt}” on a phone when you land.
              </p>
            </div>
            {wikiBoard && wikiBoard.teams > 0 && <RaceList board={wikiBoard} done={done || wikiBoard.scored} w={w} />}
          </div>
        )}
        {s.mode === "message" && (
          <div className="grid h-full place-items-center text-center">
            <p className="max-w-[18ch] text-[5.5vw] leading-[1] font-extrabold tracking-[-0.03em] text-balance">{s.message}</p>
          </div>
        )}
      </div>

      {/* Ticker: late arrivals can always join. */}
      <footer className="flex items-center gap-[1.6vw] bg-mist pr-[2.5vw] text-[1.4vw]">
        <span className={`tile ${wt.tile} size-[5vw] shrink-0`}>
          <Picto id={wt.picto} className="absolute inset-[12%]" />
        </span>
        <span className="font-bold">
          Week {live.week}: {wk.title}
        </span>
        {live.double && <span className="bg-sun px-[0.8vw] py-[0.2vw] font-bold text-[#12332b]">Last round counts double</span>}
        {live.practice && <span className="bg-sky px-[0.8vw] py-[0.2vw] font-bold text-[#12332b]">Practice night</span>}
        <span className="ml-auto text-dim">
          Join at <strong className="text-ink">{origin.replace(/^https?:\/\//, "")}/join</strong>
        </span>
        <CodeSquares code={code} className="text-[2vw]" />
        {s.mode !== "timer" && (running || remaining !== live.timer.durationMs) && (
          <span
            className={`narrow min-w-[4ch] text-right text-[2.8vw] leading-none font-extrabold ${remaining <= 10_000 && running ? "text-signal" : ""}`}
          >
            {remaining === 0 && running ? "time" : fmtClock(remaining)}
          </span>
        )}
      </footer>
      {s.mode !== "timer" && isSwapMoment(live.timer, remaining) && (
        <div className="absolute inset-x-0 top-[38%] bg-signal py-[2vw] text-center text-[6vw] leading-none font-extrabold tracking-[-0.03em] text-white">
          swap drivers
        </div>
      )}
    </>
  );
}

// Kickoff slides: /host moves them, and so do the arrow keys or a clicker on the TV computer.
function Slides({ screen }: { screen: Live["screen"] }) {
  const all = kickoffSlides(useSchedule());
  const setScreen = useMutation(api.sessions.setScreen);
  const go = useCallback((to: number) => void run(setScreen({ screen: { ...screen, slide: to } })), [setScreen, screen]);
  const i = Math.min(screen.slide ?? 0, all.length - 1);
  useSlideKeys(i, all.length, go);
  return <SlideStage slides={all} i={i} />;
}

/** A pop each time another team locks in (or fixes it, in Fix it for real, or earns a puzzle star). */
function useCountSound(card: string | undefined, n: number | null) {
  const prev = useRef<{ card: string; n: number | null } | null>(null);
  useEffect(() => {
    if (!card) return;
    const p = prev.current;
    prev.current = { card, n };
    if (p?.card === card && n !== null && n > (p.n ?? 0)) sfx.join(n);
  }, [card, n]);
}

/** Fix it for real: the teams that fixed it, in order, with their times. Points join them once it's scored. No code. */
function FixList({ board, done, w }: { board: FixBoard; done: boolean; w: TeamWords }) {
  return (
    <div>
      {!done && <p className="text-[2.2vw] leading-tight font-extrabold tracking-[-0.03em]">Fix it on your {w.computer}</p>}
      {board.fixed.length === 0 ? (
        <p className="mt-[1vw] text-[1.6vw] text-dim">{done ? "Nobody fixed it this time." : "No fixes yet."}</p>
      ) : (
        <ol className="mt-[1vw] flex flex-col gap-[0.5vw]">
          {board.fixed.map((f, i) => (
            <li key={f.teamId} className="grid grid-cols-[2.6vw_minmax(0,1fr)_auto] items-center gap-[1vw] bg-mist px-[1.2vw] py-[0.8vw]">
              <span className="narrow text-[2.4vw] leading-none font-extrabold text-meadow">{i + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-[1.8vw] leading-tight font-extrabold">{f.name}</span>
                <span className="block text-[1.2vw] text-dim">
                  {f.ms === null ? "fixed" : `fixed at ${fmtElapsed(f.ms)}`}
                  {f.result?.first ? " · first" : ""}
                </span>
              </span>
              <span className="narrow text-[2.6vw] leading-none font-extrabold">{f.result ? `+${f.result.points}` : "✓"}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Puzzles: every team's stars, most first, with times on the puzzle's clock. Points join them once it's scored. Never answers. */
function StarBoard({ board, done, w }: { board: PuzzleBoard; done: boolean; w: TeamWords }) {
  const star = (ms: number | null, first: boolean) => (
    <span className={`block text-[1.2vw] ${ms === null ? "text-dim" : ""}`}>
      <span className={ms === null ? "" : "text-gold"}>{ms === null ? "☆" : "★"}</span>
      {ms === null ? " not yet" : ` ${fmtElapsed(ms)}${first ? " · first" : ""}`}
    </span>
  );
  return (
    <div>
      {!done && <p className="text-[2.2vw] leading-tight font-extrabold tracking-[-0.03em]">Answer on your {w.computer}</p>}
      {board.teams.length === 0 ? (
        <p className="mt-[1vw] text-[1.6vw] text-dim">{w.noTeams}</p>
      ) : (
        <ol className="mt-[1vw] flex flex-col gap-[0.5vw]">
          {board.teams.map((t) => (
            <li key={t.teamId} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-[1vw] bg-mist px-[1.2vw] py-[0.7vw]">
              <span className="min-w-0 truncate text-[1.8vw] leading-tight font-extrabold">{t.name}</span>
              <span>
                {star(t.part1Ms, t.first1)}
                {star(t.part2Ms, t.first2)}
              </span>
              {done && <span className="narrow text-[2.6vw] leading-none font-extrabold">+{t.result?.points ?? 0}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Wiki Race: the finish order with places and times (or click counts), then every team's points once it's scored. */
function RaceList({ board, done, w }: { board: WikiBoard; done: boolean; w: TeamWords }) {
  const rows = board.results
    ? board.results.map((r) => ({
        key: r.teamId,
        name: r.name,
        place: r.result?.place ?? null,
        note: null,
        end: `+${r.result?.points ?? 0}`,
      }))
    : board.finished
        .filter((f) => f.ok !== false)
        .map((f) => ({
          key: f.teamId,
          name: f.name,
          place: f.place,
          note: [f.clicks !== null && `${f.clicks} click${f.clicks === 1 ? "" : "s"}`, f.ms !== null && `at ${fmtElapsed(f.ms)}`]
            .filter(Boolean)
            .join(" · "),
          end: f.ok ? "✓" : "",
        }));
  return (
    <div>
      {!done && (
        <p className="text-[2.2vw] leading-tight font-extrabold tracking-[-0.03em]">
          {board.clicks ? "Fewest clicks so far" : "Finish order"}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="mt-[1vw] text-[1.6vw] text-dim">Nobody yet. Tap “{w.madeIt}” on a phone when you land.</p>
      ) : (
        <ol className="mt-[1vw] flex flex-col gap-[0.5vw]">
          {rows.map((r) => (
            <li key={r.key} className="grid grid-cols-[3.4vw_minmax(0,1fr)_auto] items-center gap-[1vw] bg-mist px-[1.2vw] py-[0.8vw]">
              <span className={`narrow text-[2.2vw] leading-none font-extrabold ${r.place !== null ? "text-meadow" : "text-dim"}`}>
                {r.place !== null ? ordinal(r.place) : "–"}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[1.8vw] leading-tight font-extrabold">{r.name}</span>
                {(r.note || (board.results && r.place === null)) && (
                  <span className="block text-[1.2vw] text-dim">{r.note || "for playing"}</span>
                )}
              </span>
              <span className="narrow text-[2.6vw] leading-none font-extrabold">{r.end}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Who got what on the revealed card. Picks stay hidden until now. */
function Results({ results, bug }: { results: NonNullable<Board["results"]>; bug: boolean }) {
  return (
    <ol className="flex flex-col gap-[0.5vw]">
      {results.map(({ _id, name, result: r }) => (
        <li key={_id} className="grid grid-cols-[2.6vw_minmax(0,1fr)_auto] items-center gap-[1vw] bg-mist px-[1.2vw] py-[0.8vw]">
          <span className={`text-[2.4vw] leading-none font-extrabold ${r?.correct ? "text-meadow" : r?.points ? "text-sun" : "text-dim"}`}>
            {r?.correct || r?.points ? "✓" : "✗"}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[1.8vw] leading-tight font-extrabold">{name}</span>
            {(bug || !r) && (
              <span className="block text-[1.2vw] text-dim">
                {!r ? "no answer" : `line ${r.line ? "✓" : "✗"} · fix ${r.fix ? "✓" : "✗"}${r.early ? " · early" : ""}`}
              </span>
            )}
          </span>
          <span className="narrow text-[2.6vw] leading-none font-extrabold">+{r?.points ?? 0}</span>
        </li>
      ))}
    </ol>
  );
}

/** Game-show sounds and music, driven by what changes on the TV. `on` is false until someone clicks to allow sound. */
function useTvSound(live: Live, remaining: number, on: boolean) {
  const prev = useRef(live);
  useEffect(() => {
    const p = prev.current;
    prev.current = live;
    if (p === live) return;
    const s = live.screen;
    const ps = p.screen;

    if (live.roster.length > p.roster.length) sfx.join(live.roster.length);

    const moved = live.roster.filter((r, i) => p.roster[i] && r.teamId !== p.roster[i].teamId).length;
    if (moved >= 3) sfx.shuffle();

    if (
      s.mode !== ps.mode ||
      s.game !== ps.game ||
      s.index !== ps.index ||
      s.wikiFrom !== ps.wikiFrom ||
      s.wikiReady !== ps.wikiReady ||
      s.message !== ps.message
    ) {
      if (s.mode === "scoreboard") sfx.scoreboard();
      else if (s.mode === "card" || s.mode === "wiki" || s.mode === "message") sfx.card();
    } else if (s.revealed && !ps.revealed) sfx.reveal();

    const before = new Map(p.teams.map((t) => [t._id, t.score]));
    const deltas = live.teams.map((t) => t.score - (before.get(t._id) ?? t.score));
    if (deltas.some((d) => d > 0)) sfx.point();
    else if (deltas.some((d) => d < 0) && live.teams.some((t) => t.score !== 0)) sfx.minus();

    if (live.timer.startedAt && live.timer.startedAt !== p.timer.startedAt && live.timer.remainingMs > 0) sfx.go();
  }, [live]);

  // Countdown ticks for the last ten seconds.
  const running = !!live.timer.startedAt;
  const secs = Math.ceil(remaining / 1000);
  useEffect(() => {
    if (running && secs > 0 && secs <= 10) sfx.tick(secs <= 3);
  }, [running, secs]);

  // Lobby music while people join, thinking music while the clock runs.
  const music = !live.sound.music ? null : live.screen.mode === "lobby" ? "lobby" : running && remaining > 0 ? "think" : null;
  useEffect(() => playMusic(on ? music : null), [on, music]);
  useEffect(() => () => playMusic(null), []);
  useEffect(() => setVolume(live.sound.volume), [live.sound.volume]);
}

function BigTimer({ remaining, running, swap, size }: { remaining: number; running: boolean; swap: boolean; size: string }) {
  const done = running && remaining === 0;
  return (
    <div className="text-center">
      <p
        className={`narrow leading-[0.85] font-extrabold ${size} ${done ? "text-gold" : remaining <= 10_000 && running ? "text-signal" : ""}`}
      >
        {done ? "time" : fmtClock(remaining)}
      </p>
      {swap && <p className="mt-[2vw] bg-signal px-[3vw] py-[1vw] text-[5vw] font-extrabold text-white">swap drivers</p>}
    </div>
  );
}

function Lobby({ live, code, joinUrl }: { live: Live; code: string; joinUrl: string }) {
  return (
    <div className="grid h-full grid-cols-[auto_1fr] gap-[4vw]">
      <div className="flex flex-col justify-center">
        <p className="text-[4vw] leading-[0.9] font-extrabold tracking-[-0.04em]">join the game</p>
        <div className="mt-[2vw] flex items-end gap-[2vw]">
          <div className="bg-white p-[0.8vw]">
            <QRCodeSVG value={joinUrl} size={512} className="h-[26vh] w-[26vh]" marginSize={0} />
          </div>
        </div>
        <p className="mt-[1.4vw] text-[1.4vw] text-dim">
          Scan, or go to <strong className="text-ink">{joinUrl.replace(/^https?:\/\//, "").split("?")[0]}</strong> and enter
        </p>
        <CodeSquares code={code} className="mt-[1vw] text-[6vw]" />
      </div>
      <div className="flex min-h-0 flex-col">
        <p className="text-[2.2vw] font-bold">
          <span className="narrow text-[3.2vw] font-extrabold">{live.roster.length}</span> player{live.roster.length === 1 ? "" : "s"} here
        </p>
        <ul className="mt-[1.5vw] flex flex-wrap content-start gap-[0.6vw] overflow-hidden">
          {live.roster.map((p, i) => (
            <li key={p.name + i} className="flex items-center gap-[0.6vw] bg-mist px-[1.2vw] py-[0.7vw] text-[1.7vw] font-bold">
              {p.firstTime && <span className="size-[0.8vw] rounded-full bg-sky" aria-hidden />}
              {p.name}
            </li>
          ))}
        </ul>
        {live.roster.some((p) => p.firstTime) && (
          <p className="mt-auto flex items-center gap-[0.6vw] text-[1.3vw] text-dim">
            <span className="size-[0.8vw] rounded-full bg-sky" aria-hidden /> First meeting. Say hi.
          </p>
        )}
      </div>
    </div>
  );
}

const MEDAL = ["var(--color-gold)", "var(--color-silver)", "#d79a5b"];

type Standing = { _id: string; name: string; score: number; members: string[]; xp?: number };

/** Standings in points. Once the night is over (`final`), with the place XP each team's players earned. */
function Scoreboard({ teams, solo, final = false }: { teams: Standing[]; solo: boolean; final?: boolean }) {
  const top = Math.max(1, ...teams.map((t) => t.score));
  const first = teams.filter((t) => t.score > 0 && t.score === teams[0].score);
  const xp = teams.some((t) => t.xp !== undefined);
  return (
    <div className="mx-auto flex h-full max-w-[86vw] flex-col">
      <h2 className="text-[4vw] leading-none tracking-[-0.04em]">{final ? "final standings" : "tonight’s standings"}</h2>
      {final && first.length > 0 && (
        <p className="mt-[1.2vw] text-[2.4vw] font-bold">
          {first.map((t) => t.name).join(" and ")} {first.length === 1 ? "wins" : "tie for 1st"}
          {xp && (
            <span className="text-meadow">
              {" "}
              · +{first[0].xp} XP{solo ? "" : " each"}
            </span>
          )}
        </p>
      )}
      {teams.length === 0 ? (
        <p className="mt-[6vw] text-[2.2vw] text-dim">{teamWords(solo).scoreboardEmpty}</p>
      ) : (
        <ol className="mt-[3vw] flex flex-col gap-[1.4vw]">
          {teams.map((t) => {
            const rank = 1 + teams.filter((o) => o.score > t.score).length;
            return (
              <li key={t._id} className="grid grid-cols-[3vw_6vw_1fr_10vw] items-center gap-[1.5vw]">
                <span className="size-[2.6vw] rounded-full" style={{ background: MEDAL[rank - 1] ?? "transparent" }} aria-hidden />
                <span className="narrow text-[3.2vw] leading-none font-extrabold">{ordinal(rank)}</span>
                <div className="min-w-0">
                  <p className="truncate text-[2.5vw] leading-tight font-extrabold">
                    {t.name}{" "}
                    {t.members.join(", ") !== t.name && <span className="text-[1.3vw] font-normal text-dim">{t.members.join(", ")}</span>}
                  </p>
                  <div className="mt-[0.6vw] h-[0.9vw] bg-mist">
                    <div className="h-full bg-sky" style={{ width: `${Math.max(2, (t.score / top) * 100)}%` }} />
                  </div>
                </div>
                <span className="text-right">
                  <span className="narrow block text-[5vw] leading-none font-extrabold">{t.score}</span>
                  {t.xp !== undefined && <span className="block text-[1.5vw] font-bold text-meadow">+{t.xp} XP</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {/* Points are tonight's game; XP is the season board. */}
      <p className="mt-auto pt-[2vw] text-[1.5vw] text-dim">
        {!final
          ? "Points are for tonight. When the night ends, 1st, 2nd, and 3rd place earn +3, +2, and +1 XP each."
          : xp
            ? `Points were for tonight. Season XP is 3 for coming, +3/2/1 for your place: ${CLUB.url}/hello-world/scores`
            : "Practice night: nothing tonight counts toward XP."}
      </p>
    </div>
  );
}
