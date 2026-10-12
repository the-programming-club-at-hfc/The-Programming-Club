import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { NO_PICK, PhoneRound } from "#/components/answer";
import { FixRound } from "#/components/fix";
import type { PickArgs, TeamPick } from "#/components/answer";
import { CardView, DECKS, LevelChip, fmtClock } from "#/components/game";
import { OfficerGate } from "#/components/officer";
import { Wrap } from "#/components/ui";
import { BUGS, OUTPUTS } from "#/lib/content";
import { FIXES } from "#/lib/fixes";
import { FIRST_FIX_BONUS, FIX_POINTS, answersOpen, awardsFor, cardKey, cardSeconds, earlyMs, fixAwardsFor } from "#/lib/grading";
import type { AnswerGame } from "#/lib/grading";
import { usePython } from "#/lib/python";
import type { Python } from "#/lib/python";
import { CLUB } from "#/lib/season";
import { sfx, unlockAudio } from "#/lib/sound";

// Officers play every phone-answered card (and every Fix it for real card, with real Python) as a fake team, with the
// real components and scoring, and flag cards that are too easy, too hard, or broken. Nothing here writes to the database.
export const Route = createFileRoute("/hello-world/test")({
  head: () => ({ meta: [{ title: `Test the decks · ${CLUB.season}` }, { name: "robots", content: "noindex" }] }),
  component: TestPage,
});

type TestGame = AnswerGame | "fix";
const GAMES: TestGame[] = ["bug", "fix", "output", "lang"];
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
  game === "bug" ? BUGS[i].level : game === "fix" ? FIXES[i].level : game === "output" && OUTPUTS[i].tiebreak ? "hard" : null;
const levelOf = (game: TestGame, i: number) => {
  const l = levelName(game, i);
  return l && <LevelChip level={l} />;
};

function Tester() {
  const [game, setGame] = useState<TestGame>("bug");
  const [index, setIndex] = useState(0);
  const [tv, setTv] = useState(true);
  const [flags, saveFlags] = useFlags();
  const size = DECKS[game].size;
  const go = (d: number) => setIndex((index + d + size) % size);
  const flag = flags[cardKey(game, index)] as Flag | undefined;
  // Python loads the first time someone opens the Fix it for real deck, then stays ready.
  const [pyOn, setPyOn] = useState(false);
  useEffect(() => {
    if (game === "fix") setPyOn(true);
  }, [game]);
  const py = usePython(pyOn);

  return (
    <>
      <header className="flex flex-wrap items-end gap-4">
        <div>
          <p className="font-bold text-pine">Officers</p>
          <h1 className="text-[clamp(2.4rem,6vw,3.6rem)] lowercase">test the decks</h1>
          <p className="mt-2 max-w-[60ch] text-dim">
            Play every card the way a team does on a phone (or, for Fix it for real, on a team computer), then reveal to see what the real
            scoring gives. Flag cards that are too easy, too hard, or broken. Nothing here touches tonight’s game.
          </p>
        </div>
        <Link to="/hello-world/host" className="btn btn-sm ml-auto">
          Back to host
        </Link>
      </header>

      <div className="mt-6 flex flex-wrap gap-1 border-b-4 border-line pb-2">
        {GAMES.map((g) => (
          <button
            key={g}
            onClick={() => {
              setGame(g);
              setIndex(0);
            }}
            className={`px-3 py-1.5 font-bold ${game === g ? "bg-ink text-paper" : "text-dim hover:text-ink"}`}
          >
            {DECKS[g].name}
          </button>
        ))}
      </div>

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
          <input type="checkbox" className="size-4 accent-ink" checked={tv} onChange={(e) => setTv(e.target.checked)} />
          Show the TV view
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-start gap-6">
        {game === "fix" ? (
          <FixPlay key={cardKey(game, index)} index={index} tv={tv} py={py} />
        ) : (
          <Play key={cardKey(game, index)} game={game} index={index} tv={tv} />
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
          {timed && !revealed && (
            <p className={`narrow mb-3 text-center text-6xl leading-none font-extrabold ${remaining <= 10_000 ? "text-signal" : ""}`}>
              {remaining === 0 ? "time" : fmtClock(remaining)}
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
          <button className={`btn btn-sm ${double ? "btn-on" : ""}`} onClick={() => setDouble(!double)} aria-pressed={double}>
            Double points
          </button>
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
          <button className={`btn btn-sm ${hint ? "btn-on" : ""}`} onClick={() => setHint(!hint)} aria-pressed={hint} disabled={revealed}>
            Show hint
          </button>
          <button className="btn btn-sm" onClick={() => restart(true)}>
            Start {fmtClock(secs * 1000)} timer
          </button>
          <button className="btn btn-sm" onClick={() => restart(false)}>
            Reset, no timer
          </button>
          <button className={`btn btn-sm ${double ? "btn-on" : ""}`} onClick={() => setDouble(!double)} aria-pressed={double}>
            Double points
          </button>
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
  const key = cardKey(game, index);
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
        `${DECKS[g].name}, card ${i + 1}${g === "bug" || g === "fix" ? ` (${levelName(g, i)})` : ""}: ${f.flag}${f.note ? `. ${f.note}` : ""}`,
    )
    .join("\n");

  return (
    <section className="card mt-8 max-w-3xl p-5">
      <h2 className="text-2xl">Flag this card</h2>
      <div className="mt-3 flex flex-wrap gap-1">
        {FLAGS.map((f) => (
          <button
            key={f}
            className={`btn btn-sm capitalize ${cur?.flag === f ? "btn-neon" : ""}`}
            onClick={() => set(cur?.flag === f ? null : { flag: f, note: cur?.note ?? "" })}
            aria-pressed={cur?.flag === f}
          >
            {f}
          </button>
        ))}
        {cur && (
          <button className="btn btn-sm text-dim" onClick={() => set(null)}>
            Clear
          </button>
        )}
      </div>
      <input
        className="field mt-3"
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
          onClick={() =>
            void navigator.clipboard.writeText(text).then(
              () => setCopied(true),
              () => alert(text),
            )
          }
        >
          {copied ? "Copied" : "Copy flagged cards"}
        </button>
      </div>
      {list.length === 0 ? (
        <p className="mt-2 text-sm text-dim">Nothing flagged yet. Flags stay in this browser until you clear them.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {list.map(({ g, i, f }) => (
            <li key={`${g}:${i}`}>
              <button className="w-full py-1.5 text-left hover:text-pine" onClick={() => jump(g, i)}>
                <strong>
                  {DECKS[g].name}, card {i + 1}
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
