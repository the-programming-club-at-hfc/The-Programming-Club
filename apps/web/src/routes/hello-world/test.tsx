import { Checkbox } from "@base-ui/react/checkbox";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ConvexError } from "convex/values";
import { useEffect, useMemo, useState } from "react";
import { NO_PICK, PhoneRound } from "#/components/answer";
import { useNotify } from "#/components/feedback";
import { FixRound } from "#/components/fix";
import { PuzzleRound } from "#/components/puzzle";
import type { PickArgs, TeamPick } from "#/components/answer";
import { CardView, DECKS, LevelChip, fmtClock } from "#/components/game";
import { OfficerGate } from "#/components/officer";
import { Wrap } from "#/components/ui";
import { WikiPair, WikiRound } from "#/components/wiki";
import { BUGS, OUTPUTS, WIKI_RACES } from "#/lib/content";
import { FIXES } from "#/lib/fixes";
import {
  FIRST_FIX_BONUS,
  FIRST_STAR_BONUS,
  FIX_POINTS,
  LOCKOUT_MS,
  PART1_POINTS,
  PART2_POINTS,
  answersOpen,
  awardsFor,
  cardSeconds,
  earlyMs,
  fixAwardsFor,
  puzzleAwardsFor,
  submitAnswer,
  wikiAwardsFor,
  wikiPlaces,
  wikiSeconds,
} from "#/lib/grading";
import type { AnswerGame, Stars } from "#/lib/grading";
import { PUZZLES } from "#/lib/puzzles";
import { usePython } from "#/lib/python";
import type { Python } from "#/lib/python";
import { CLUB } from "#/lib/season";
import { sfx, unlockAudio } from "#/lib/sound";

// Officers play every phone-answered card (and every Fix it for real card and puzzle, with real Python) as a fake team,
// with the real components and scoring, and flag cards that are too easy, too hard, or broken. Nothing here writes to
// the database.
export const Route = createFileRoute("/hello-world/test")({
  head: () => ({ meta: [{ title: `Test the decks · ${CLUB.season}` }, { name: "robots", content: "noindex" }] }),
  component: TestPage,
});

type TestGame = AnswerGame | "fix" | "puzzle" | "wiki";
const GAMES: TestGame[] = ["bug", "fix", "puzzle", "output", "lang", "wiki"];
const deckName = (g: TestGame) => (g === "wiki" ? "Wiki Race" : DECKS[g].name);
const keyOf = (g: TestGame, i: number) => `${g}:${i}`;
const FLAGS = ["too easy", "too hard", "broken"] as const;
type Flag = { flag: (typeof FLAGS)[number]; note: string };
const FLAGS_KEY = "hwc.flags";

function TestPage() {
  return (
    <Wrap className="py-8">
      <OfficerGate redirect="/hello-world/test" purpose="test the challenge decks">
        <Tester />
      </OfficerGate>
    </Wrap>
  );
}

function useFlags() {
  const [flags, setFlags] = useState<Record<string, Flag>>({});
  useEffect(() => {
    const saved = localStorage.getItem(FLAGS_KEY);
    if (saved) setFlags(JSON.parse(saved) as Record<string, Flag>);
  }, []);
  const save = (next: Record<string, Flag>) => {
    setFlags(next);
    localStorage.setItem(FLAGS_KEY, JSON.stringify(next));
  };
  return [flags, save] as const;
}

const levelName = (game: TestGame, i: number) =>
  game === "bug"
    ? BUGS[i].level
    : game === "fix"
      ? FIXES[i].level
      : game === "puzzle"
        ? PUZZLES[i].level
        : game === "output" && OUTPUTS[i].tiebreak
          ? "hard"
          : null;
const levelOf = (game: TestGame, i: number) => {
  const l = levelName(game, i);
  return l && <LevelChip level={l} />;
};

function Tester() {
  const [game, setGame] = useState<TestGame>("bug");
  const [index, setIndex] = useState(0);
  const [tv, setTv] = useState(true);
  const [flags, saveFlags] = useFlags();
  const size = game === "wiki" ? WIKI_RACES.length : DECKS[game].size;
  const go = (d: number) => setIndex((index + d + size) % size);
  const flag = flags[keyOf(game, index)] as Flag | undefined;
  // Python loads the first time someone opens the Fix it for real deck, then stays ready.
  const [pyOn, setPyOn] = useState(false);
  useEffect(() => {
    if (game === "fix" || game === "puzzle") setPyOn(true);
  }, [game]);
  const py = usePython(pyOn);

  return (
    <>
      <header className="flex flex-wrap items-end gap-4">
        <div>
          <p className="font-bold text-pine">Officers</p>
          <h1 className="text-[clamp(2.4rem,6vw,3.6rem)] lowercase">test the decks</h1>
          <p className="mt-2 max-w-[60ch] text-dim">
            Play every card the way a team does on a phone (or, for Fix it for real and puzzles, on a team computer), then reveal to see
            what the real scoring gives. Flag cards that are too easy, too hard, or broken. Nothing here touches tonight’s game.
          </p>
        </div>
        <Link to="/hello-world/host" className="btn btn-sm ml-auto">
          Back to host
        </Link>
      </header>

      <RadioGroup<TestGame>
        name="deck"
        required
        aria-label="Challenge deck"
        value={game}
        onValueChange={(next) => {
          setGame(next);
          setIndex(0);
        }}
        className="mt-6 flex flex-wrap gap-1 border-b-4 border-line pb-2"
      >
        {GAMES.map((g) => (
          <Radio.Root
            key={g}
            value={g}
            render={<button type="button" />}
            nativeButton
            className={`px-3 py-1.5 font-bold ${game === g ? "bg-ink text-paper" : "text-dim hover:text-ink"}`}
          >
            {deckName(g)}
          </Radio.Root>
        ))}
      </RadioGroup>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" onClick={() => go(-1)}>
          ‹ Prev
        </button>
        <span className="font-bold">
          Card {index + 1} of {size}
          {levelOf(game, index)}
          {flag && <span className="chip ml-2 bg-signal text-white">{flag.flag}</span>}
        </span>
        <button className="btn btn-sm" onClick={() => go(1)}>
          Next ›
        </button>
        <label className="ml-auto flex items-center gap-2 text-sm font-bold">
          <Checkbox.Root
            name="tv-view"
            className="flex size-4 shrink-0 items-center justify-center rounded-[3px] border border-ink data-checked:bg-ink data-checked:text-paper"
            checked={tv}
            onCheckedChange={setTv}
          >
            <Checkbox.Indicator>✓</Checkbox.Indicator>
          </Checkbox.Root>
          Show the TV view
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-start gap-6">
        {game === "fix" ? (
          <FixPlay key={keyOf(game, index)} index={index} tv={tv} py={py} />
        ) : game === "puzzle" ? (
          <PuzzlePlay key={keyOf(game, index)} index={index} tv={tv} py={py} />
        ) : game === "wiki" ? (
          <WikiPlay key={keyOf(game, index)} index={index} tv={tv} />
        ) : (
          <Play key={keyOf(game, index)} game={game} index={index} tv={tv} />
        )}
      </div>

      <FlagPanel
        game={game}
        index={index}
        flags={flags}
        save={saveFlags}
        jump={(g, i) => {
          setGame(g);
          setIndex(i);
        }}
      />
    </>
  );
}

/** Made-up rivals around the pretend team, so the standings after the reveal look like a real night's. */
const standings = (points: number) =>
  [
    { _id: "a", name: "Null Pointers", score: 9 },
    { _id: "b", name: "Off by One", score: 6 },
    { _id: "c", name: "Tab Hoarders", score: 4 },
    { _id: "d", name: "Semicolons", score: 2 },
    { _id: "you", name: "Your team", score: points },
  ].sort((x, y) => y.score - x.score);

/** One card played by a pretend team, scored by the same function Convex uses. */
function Play({ game, index, tv }: { game: AnswerGame; index: number; tv: boolean }) {
  const secs = cardSeconds(game, index);
  const [start, setStart] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [timed, setTimed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [double, setDouble] = useState(false);
  const [pick, setPick] = useState<TeamPick>(NO_PICK);
  const [times, setTimes] = useState<{ lineLockedAt?: number; lockedAt?: number }>({});

  useEffect(() => {
    if (!timed || revealed) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [timed, revealed]);

  const remaining = timed ? Math.max(0, start + secs * 1000 - now) : secs * 1000;
  const open = answersOpen({ revealed, scored: false, endedAt: undefined, own: timed, running: timed, remaining, now, grace: 0 });

  const restart = (withTimer: boolean) => {
    const t = Date.now();
    setStart(t);
    setNow(t);
    setTimed(withTimer);
    setRevealed(false);
    setPick(NO_PICK);
    setTimes({});
  };
  const onPick = (p: PickArgs) =>
    setPick((c) => ("line" in p ? { ...c, line: p.line, lineBy: "You" } : { ...c, choice: p.choice, choiceBy: "You" }));
  const onLock = (step: "line" | "answer") => {
    const t = Date.now();
    if (step === "line") {
      setPick((c) => ({ ...c, lineLocked: true, lineLockedBy: "You" }));
      setTimes((x) => ({ ...x, lineLockedAt: t }));
    } else {
      setPick((c) => ({ ...c, locked: true, lockedBy: "You" }));
      setTimes((x) => ({ ...x, lockedAt: t }));
    }
  };

  const answered = pick.line !== undefined || pick.choice !== undefined;
  const award = awardsFor({
    game,
    index,
    start,
    double,
    scored: [],
    answers: [{ id: 0, pick: { line: pick.line, choice: pick.choice, ...times } }],
  })?.awards[0];
  const result = revealed && answered && award ? { ...award.grade, points: award.points } : null;
  const early = earlyMs(game, index);

  return (
    <>
      <div className="w-[390px] max-w-full shrink-0">
        <div className="rounded-[28px] border-8 border-ink bg-paper p-3">
          {timed && !revealed && remaining > 0 && (
            <p className={`narrow mb-3 text-center text-6xl leading-none font-extrabold ${remaining <= 10_000 ? "text-signal" : ""}`}>
              {fmtClock(remaining)}
            </p>
          )}
          <PhoneRound
            game={game}
            index={index}
            revealed={revealed}
            open={open}
            pick={pick}
            result={result}
            onPick={onPick}
            onLock={onLock}
            teams={standings(result?.points ?? 0)}
            teamId="you"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-1">
          {revealed ? (
            <button className="btn btn-sm btn-coin" onClick={() => restart(timed)}>
              Play again
            </button>
          ) : (
            <button
              className="btn btn-sm btn-coin"
              onClick={() => {
                setRevealed(true);
                void unlockAudio().then(() => sfx.reveal());
              }}
            >
              Reveal
            </button>
          )}
          <button className="btn btn-sm" onClick={() => restart(true)}>
            Start {fmtClock(secs * 1000)} timer
          </button>
          <button className="btn btn-sm" onClick={() => restart(false)}>
            Reset, no timer
          </button>
          <Toggle className={`btn btn-sm ${double ? "btn-on" : ""}`} onPressedChange={setDouble} pressed={double}>
            Double points
          </Toggle>
        </div>
        <p className="mt-3 text-sm text-dim">
          {early
            ? `Early bonus: lock in within ${early / 1000} seconds${game === "bug" ? " (both steps, right line)" : " with the right answer"}.`
            : "No early bonus in this game."}
          {times.lockedAt !== undefined && ` You locked in at ${((times.lockedAt - start) / 1000).toFixed(1)}s.`}
          {revealed && ` Real scoring: +${result?.points ?? 0}.`}
        </p>
      </div>
      {tv && (
        <div className="theme-pine min-w-0 flex-1 basis-[28rem] rounded-[10px] p-6">
          <p className="mb-3 text-sm font-bold text-dim">TV · {DECKS[game].name}</p>
          <CardView game={game} index={index} answer={revealed} />
        </div>
      )}
    </>
  );
}

/** One Fix it for real card on a pretend team computer, with real Python and the same scoring Convex uses. */
function FixPlay({ index, tv, py }: { index: number; tv: boolean; py: Python }) {
  const secs = cardSeconds("fix", index);
  const [start, setStart] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [timed, setTimed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(false);
  const [double, setDouble] = useState(false);
  const [fixedAt, setFixedAt] = useState<number | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!timed || revealed) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [timed, revealed]);

  const remaining = timed ? Math.max(0, start + secs * 1000 - now) : secs * 1000;
  const open = answersOpen({ revealed, scored: false, endedAt: undefined, own: timed, running: timed, remaining, now, grace: 0 });
  const award = fixAwardsFor({ index, double, scored: [], fixes: fixedAt === null ? [] : [{ id: 0, at: fixedAt }] })?.awards[0];
  const result = revealed && award ? { points: award.points, first: award.first } : null;

  const restart = (withTimer: boolean) => {
    const t = Date.now();
    setStart(t);
    setNow(t);
    setTimed(withTimer);
    setRevealed(false);
    setHint(false);
    setFixedAt(null);
    setRound((r) => r + 1);
  };

  return (
    <>
      <div className="w-full">
        {timed && !revealed && (
          <p className={`narrow mb-3 text-6xl leading-none font-extrabold ${remaining <= 10_000 ? "text-signal" : ""}`}>
            {remaining === 0 ? "time" : fmtClock(remaining)}
          </p>
        )}
        <FixRound
          key={round}
          index={index}
          py={py}
          revealed={revealed}
          hint={hint}
          open={open}
          fixed={fixedAt === null ? null : { ms: fixedAt - start }}
          result={result}
          onFixed={async () => setFixedAt((f) => f ?? Date.now())}
        />
        <div className="mt-4 flex flex-wrap gap-1">
          {revealed ? (
            <button className="btn btn-sm btn-coin" onClick={() => restart(timed)}>
              Play again
            </button>
          ) : (
            <button
              className="btn btn-sm btn-coin"
              onClick={() => {
                setRevealed(true);
                void unlockAudio().then(() => sfx.reveal());
              }}
            >
              Reveal
            </button>
          )}
          <Toggle className={`btn btn-sm ${hint ? "btn-on" : ""}`} onPressedChange={setHint} pressed={hint} disabled={revealed}>
            Show hint
          </Toggle>
          <button className="btn btn-sm" onClick={() => restart(true)}>
            Start {fmtClock(secs * 1000)} timer
          </button>
          <button className="btn btn-sm" onClick={() => restart(false)}>
            Reset, no timer
          </button>
          <Toggle className={`btn btn-sm ${double ? "btn-on" : ""}`} onPressedChange={setDouble} pressed={double}>
            Double points
          </Toggle>
        </div>
        <p className="mt-3 text-sm text-dim">
          +{FIX_POINTS} for a fix in time, +{FIRST_FIX_BONUS} more for the first team. You’re the only team here, so a fix is first.
          {fixedAt !== null && ` You fixed it at ${((fixedAt - start) / 1000).toFixed(1)}s.`}
          {revealed && ` Real scoring: +${result?.points ?? 0}.`}
        </p>
      </div>
      {tv && (
        <div className="theme-pine min-w-0 flex-1 basis-[28rem] rounded-[10px] p-6">
          <p className="mb-3 text-sm font-bold text-dim">TV · {DECKS.fix.name}</p>
          <CardView game="fix" index={index} answer={revealed} hint={hint} />
        </div>
      )}
    </>
  );
}

const randomSeed = () => Math.floor(Math.random() * 1_000_000);

/**
 * One puzzle on a pretend team computer: an input from any seed, the reference answers, real Python, the same answer
 * checking and 30-second lockout as the server, and the same scoring.
 */
function PuzzlePlay({ index, tv, py }: { index: number; tv: boolean; py: Python }) {
  const p = PUZZLES[index];
  const secs = cardSeconds("puzzle", index);
  const [seed, setSeed] = useState(randomSeed);
  const [start, setStart] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [timed, setTimed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(false);
  const [double, setDouble] = useState(false);
  const [stars, setStars] = useState<Stars>({ wrong: 0 });
  const [round, setRound] = useState(0);
  const input = useMemo(() => p.generate(seed), [p, seed]);
  const answers = useMemo(() => p.solve(input), [p, input]);

  useEffect(() => {
    if (!timed || revealed) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [timed, revealed]);

  const remaining = timed ? Math.max(0, start + secs * 1000 - now) : secs * 1000;
  const open = answersOpen({ revealed, scored: false, endedAt: undefined, own: timed, running: timed, remaining, now, grace: 0 });
  const award = puzzleAwardsFor({ index, double, scored: [], teams: stars.part1At === undefined ? [] : [{ id: 0, ...stars }] })?.awards[0];
  const result = revealed && award ? { points: award.points, first1: award.first1, first2: award.first2 } : null;
  const ms = (at: number | undefined) => (at === undefined ? null : at - start);

  const restart = (withTimer: boolean, nextSeed = seed) => {
    const t = Date.now();
    setSeed(nextSeed);
    setStart(t);
    setNow(t);
    setTimed(withTimer);
    setRevealed(false);
    setHint(false);
    setStars({ wrong: 0 });
    setRound((r) => r + 1);
  };
  const onSubmit = async (part: 1 | 2, answer: string) => {
    if (!open) throw new ConvexError("Time’s up. Answers are closed for this puzzle.");
    const r = submitAnswer(stars, part, answer, () => answers[`part${part}`], Date.now());
    if (r.kind === "early") throw new ConvexError("Solve part 1 first.");
    if (r.kind === "locked") throw new ConvexError(`Wait ${Math.ceil(r.waitMs / 1000)}s, then try again.`);
    if (r.kind === "done") return { right: true, waitMs: 0 };
    setStars(r.stars);
    return { right: r.kind === "right", waitMs: r.kind === "wrong" ? LOCKOUT_MS : 0 };
  };

  return (
    <>
      <div className="w-full">
        <div className="card mb-4 flex flex-wrap items-center gap-2 p-4">
          <label className="flex items-center gap-2 font-bold">
            Seed
            <input
              className="field w-32 py-1"
              inputMode="numeric"
              value={seed}
              onChange={(e) => restart(timed, Number(e.target.value.replace(/\D/g, "").slice(0, 9)))}
            />
          </label>
          <button className="btn btn-sm" onClick={() => restart(timed, randomSeed())}>
            New input
          </button>
          <p className="ml-auto text-sm">
            <span className="text-dim">Reference answers (officers only):</span> part 1{" "}
            <strong className="font-code break-all">{answers.part1}</strong> · part 2{" "}
            <strong className="font-code break-all">{answers.part2}</strong>
          </p>
        </div>
        {timed && !revealed && (
          <p className={`narrow mb-3 text-6xl leading-none font-extrabold ${remaining <= 10_000 ? "text-signal" : ""}`}>
            {remaining === 0 ? "time" : fmtClock(remaining)}
          </p>
        )}
        <PuzzleRound
          key={round}
          index={index}
          input={input}
          py={py}
          revealed={revealed}
          hint={hint}
          open={open}
          stars={{ part1Ms: ms(stars.part1At), part2Ms: ms(stars.part2At) }}
          lockedUntil={stars.lockedUntil ?? null}
          result={result}
          // Code stays through a new seed, so a solution can be tried on another input.
          saveKey={`hwc.testPuzzleCode.${index}`}
          onSubmit={onSubmit}
        />
        <div className="mt-4 flex flex-wrap gap-1">
          {revealed ? (
            <button className="btn btn-sm btn-coin" onClick={() => restart(timed)}>
              Play again
            </button>
          ) : (
            <button
              className="btn btn-sm btn-coin"
              onClick={() => {
                setRevealed(true);
                void unlockAudio().then(() => sfx.reveal());
              }}
            >
              Reveal
            </button>
          )}
          <Toggle className={`btn btn-sm ${hint ? "btn-on" : ""}`} onPressedChange={setHint} pressed={hint} disabled={revealed}>
            Show hint
          </Toggle>
          <button className="btn btn-sm" onClick={() => restart(true)}>
            Start {fmtClock(secs * 1000)} timer{p.relay ? " (relay)" : ""}
          </button>
          <button className="btn btn-sm" onClick={() => restart(false)}>
            Reset, no timer
          </button>
          <Toggle className={`btn btn-sm ${double ? "btn-on" : ""}`} onPressedChange={setDouble} pressed={double}>
            Double points
          </Toggle>
        </div>
        <p className="mt-3 text-sm text-dim">
          +{PART1_POINTS} for part 1, +{PART2_POINTS} for part 2, and +{FIRST_STAR_BONUS} more for the first team to each star. You’re the
          only team here, so every star is first. A wrong answer locks you out for {LOCKOUT_MS / 1000} seconds.
          {stars.wrong > 0 && ` Wrong answers so far: ${stars.wrong}.`}
          {revealed && ` Real scoring: +${result?.points ?? 0}.`}
        </p>
      </div>
      {tv && (
        <div className="theme-pine min-w-0 flex-1 basis-[28rem] rounded-[10px] p-6">
          <p className="mb-3 text-sm font-bold text-dim">TV · {DECKS.puzzle.name}</p>
          <CardView game="puzzle" index={index} answer={revealed} hint={hint} />
        </div>
      )}
    </>
  );
}

/** One Wiki Race on a pretend team's phone, with pretend rivals ahead of it and the same scoring Convex uses. */
function WikiPlay({ index, tv }: { index: number; tv: boolean }) {
  const race = WIKI_RACES[index];
  const [clicks, setClicks] = useState(false);
  const secs = wikiSeconds(clicks);
  const [start, setStart] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [timed, setTimed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [double, setDouble] = useState(false);
  const [ahead, setAhead] = useState(0);
  const [finish, setFinish] = useState<{ at: number; clicks?: number; ok: boolean | null } | null>(null);

  useEffect(() => {
    if (!timed || revealed) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [timed, revealed]);

  const remaining = timed ? Math.max(0, start + secs * 1000 - now) : secs * 1000;
  const open = answersOpen({ revealed, scored: false, endedAt: undefined, own: timed, running: timed, remaining, now, grace: 0 });
  // Rivals that finished before you (Fewest Clicks: with fewer clicks), plus one team that doesn't finish.
  const rivals = Array.from({ length: ahead }, (_, i) => ({ team: `r${i}`, at: start + i, clicks: 0 }));
  const mine = finish && finish.ok !== false ? [{ team: "you", at: finish.at, clicks: finish.clicks }] : [];
  const finishes = [...rivals, ...mine];
  const award = wikiAwardsFor({
    key: "wiki:test",
    clicks,
    double,
    scored: [],
    teams: ["you", "slow", ...rivals.map((r) => r.team)],
    finishes,
  })?.awards[0];
  const place = mine.length ? wikiPlaces(finishes, clicks)[finishes.length - 1] : null;

  const restart = (withTimer: boolean, withClicks = clicks) => {
    const t = Date.now();
    setStart(t);
    setNow(t);
    setTimed(withTimer);
    setRevealed(false);
    setFinish(null);
    setClicks(withClicks);
  };

  return (
    <>
      <div className="w-[390px] max-w-full shrink-0">
        <div className="rounded-[28px] border-8 border-ink bg-paper p-3">
          {timed && !revealed && remaining > 0 && (
            <p className={`narrow mb-3 text-center text-6xl leading-none font-extrabold ${remaining <= 10_000 ? "text-signal" : ""}`}>
              {fmtClock(remaining)}
            </p>
          )}
          <WikiRound
            key={String(clicks)}
            from={race.from}
            to={race.to}
            clicks={clicks}
            open={open}
            revealed={revealed}
            finish={finish && { ms: finish.at - start, clicks: finish.clicks ?? null, ok: finish.ok, by: "You", place }}
            result={revealed && award ? { points: award.points, place: award.place ?? undefined } : null}
            onFinish={(n) => setFinish({ at: Date.now(), clicks: n, ok: null })}
            onUndo={() => setFinish(null)}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-1">
          {revealed ? (
            <button className="btn btn-sm btn-coin" onClick={() => restart(timed)}>
              Play again
            </button>
          ) : (
            <button
              className="btn btn-sm btn-coin"
              onClick={() => {
                setRevealed(true);
                void unlockAudio().then(() => sfx.reveal());
              }}
            >
              End race
            </button>
          )}
          <button className="btn btn-sm" onClick={() => restart(true)}>
            Start {fmtClock(secs * 1000)} timer
          </button>
          <button className="btn btn-sm" onClick={() => restart(false)}>
            Reset, no timer
          </button>
          <Toggle
            className={`btn btn-sm ${clicks ? "btn-on" : ""}`}
            onPressedChange={(pressed) => restart(timed, pressed)}
            pressed={clicks}
          >
            Fewest Clicks
          </Toggle>
          <Toggle className={`btn btn-sm ${double ? "btn-on" : ""}`} onPressedChange={setDouble} pressed={double}>
            Double points
          </Toggle>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1 text-sm">
          <span className="font-bold">Referee:</span>
          <ToggleGroup<"accepted" | "rejected">
            aria-label="Referee decision"
            value={finish?.ok === true ? ["accepted"] : finish?.ok === false ? ["rejected"] : []}
            disabled={!finish || revealed}
            onValueChange={(values) => finish && setFinish({ ...finish, ok: values.length ? values[0] === "accepted" : null })}
            className="flex gap-1"
          >
            <Toggle value="accepted" aria-label="Accept finish" className={`btn btn-sm ${finish?.ok === true ? "btn-on" : ""}`}>
              ✓
            </Toggle>
            <Toggle value="rejected" aria-label="Reject finish" className={`btn btn-sm ${finish?.ok === false ? "btn-neon" : ""}`}>
              ✗
            </Toggle>
          </ToggleGroup>
          <span className="ml-2 font-bold" id="teams-ahead-label">
            Teams ahead of you:
          </span>
          <RadioGroup<number>
            name="teams-ahead"
            required
            aria-labelledby="teams-ahead-label"
            value={ahead}
            onValueChange={setAhead}
            className="flex gap-1"
          >
            {[0, 1, 2, 3, 4].map((n) => (
              <Radio.Root
                key={n}
                value={n}
                render={<button type="button" />}
                nativeButton
                className={`chip ${ahead === n ? "bg-ink text-paper" : ""}`}
              >
                {n}
              </Radio.Root>
            ))}
          </RadioGroup>
        </div>
        <p className="mt-3 text-sm text-dim">
          Scored with you, the teams ahead of you, and one team that doesn’t finish.
          {finish && ` You finished at ${((finish.at - start) / 1000).toFixed(1)}s.`}
          {revealed && ` Real scoring: +${award?.points ?? 0}.`}
        </p>
      </div>
      {tv && (
        <div className="theme-pine min-w-0 flex-1 basis-[28rem] rounded-[10px] p-6">
          <p className="mb-3 text-sm font-bold text-dim">TV · Wiki Race</p>
          <WikiPair from={race.from} to={race.to} />
        </div>
      )}
    </>
  );
}

function FlagPanel({
  game,
  index,
  flags,
  save,
  jump,
}: {
  game: TestGame;
  index: number;
  flags: Record<string, Flag>;
  save: (f: Record<string, Flag>) => void;
  jump: (g: TestGame, i: number) => void;
}) {
  const notify = useNotify();
  const [copyFallback, setCopyFallback] = useState("");
  const key = keyOf(game, index);
  const cur = flags[key] as Flag | undefined;
  const [copied, setCopied] = useState(false);
  const set = (f: Flag | null) => {
    const next = { ...flags };
    if (f) next[key] = f;
    else delete next[key];
    save(next);
  };
  const list = GAMES.flatMap((g) =>
    Object.entries(flags)
      .filter(([k]) => k.startsWith(`${g}:`))
      .map(([k, f]) => ({ g, i: Number(k.split(":")[1]), f }))
      .sort((a, b) => a.i - b.i),
  );
  const text = list
    .map(
      ({ g, i, f }) =>
        `${deckName(g)}, card ${i + 1}${g === "bug" || g === "fix" || g === "puzzle" ? ` (${levelName(g, i)})` : ""}: ${f.flag}${f.note ? `. ${f.note}` : ""}`,
    )
    .join("\n");

  return (
    <section className="card mt-8 max-w-3xl p-5">
      <h2 className="text-2xl">Flag this card</h2>
      <ToggleGroup<Flag["flag"]>
        aria-label="Card flag"
        value={cur ? [cur.flag] : []}
        onValueChange={(values) => set(values[0] ? { flag: values[0], note: cur?.note ?? "" } : null)}
        className="mt-3 flex flex-wrap gap-1"
      >
        {FLAGS.map((f) => (
          <Toggle key={f} value={f} className={`btn btn-sm capitalize ${cur?.flag === f ? "btn-neon" : ""}`}>
            {f}
          </Toggle>
        ))}
      </ToggleGroup>
      {cur && (
        <button className="btn btn-sm mt-1 text-dim" onClick={() => set(null)}>
          Clear
        </button>
      )}
      <input
        className="field mt-3"
        aria-label="Flag note"
        placeholder={cur ? "Short note, e.g. “two choices are both right”" : "Pick a flag first, then add a note"}
        value={cur?.note ?? ""}
        onChange={(e) => cur && set({ ...cur, note: e.target.value })}
        disabled={!cur}
        maxLength={200}
      />

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <h3 className="text-lg font-extrabold">Flagged cards ({list.length})</h3>
        <button
          className="btn btn-sm btn-coin ml-auto"
          disabled={!list.length}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setCopyFallback("");
            } catch {
              setCopyFallback(text);
              notify.error("Couldn’t copy. Select and copy the flagged cards from the text box below.");
            }
          }}
        >
          {copied ? "Copied" : "Copy flagged cards"}
        </button>
      </div>
      {copyFallback && (
        <label className="mt-3 block text-sm font-bold">
          Copy flagged cards manually
          <textarea
            className="field mt-1 min-h-32 font-normal"
            readOnly
            value={copyFallback}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      {list.length === 0 ? (
        <p className="mt-2 text-sm text-dim">Nothing flagged yet. Flags stay in this browser until you clear them.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {list.map(({ g, i, f }) => (
            <li key={`${g}:${i}`}>
              <button className="w-full py-1.5 text-left hover:text-pine" onClick={() => jump(g, i)}>
                <strong>
                  {deckName(g)}, card {i + 1}
                </strong>
                : {f.flag}
                {f.note && <span className="text-dim"> · {f.note}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
