import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { FixRound } from "#/components/fix";
import { PuzzleRound } from "#/components/puzzle";
import { fmtClock, useRemaining } from "#/components/game";
import { Picto, Wrap } from "#/components/ui";
import { answersOpen, cardKey } from "#/lib/grading";
import { PUZZLES, puzzleSeed } from "#/lib/puzzles";
import { usePython } from "#/lib/python";
import type { Python } from "#/lib/python";
import { CLUB } from "#/lib/season";

// A team's lab computer for Fix it for real and puzzles. No sign-in: the computer enters the team key shown on the team's phones.
export const Route = createFileRoute("/hello-world/fix")({
  head: () => ({ meta: [{ title: `Team computer · ${CLUB.season}` }, { name: "robots", content: "noindex" }] }),
  component: FixPage,
});

type Live = NonNullable<FunctionReturnType<typeof api.sessions.live>>;
const storeKey = (sessionId: string) => `hwc.fixTeam.${sessionId}`;

function FixPage() {
  const live = useQuery(api.sessions.live);
  // Python starts loading as soon as the page opens, so it's ready when the round starts.
  const py = usePython();
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    setKey(live ? localStorage.getItem(storeKey(live._id)) : null);
  }, [live?._id]);
  const found = useQuery(api.teams.byKey, key ? { key } : "skip");

  if (live === undefined || (key && found === undefined)) return <Message title="loading…" />;
  if (live === null) return <Message title="no game right now">This page comes alive when an officer starts the night.</Message>;

  const pick = (k: string | null) => {
    if (k) localStorage.setItem(storeKey(live._id), k);
    else localStorage.removeItem(storeKey(live._id));
    setKey(k);
  };
  const team = found && live.teams.find((t) => t._id === found._id);
  if (!key || !team) return <TeamKeyForm live={live} wrong={!!key && found === null} onKey={pick} />;
  return <TeamComputer live={live} team={team} teamKey={key} py={py} onSwitch={() => pick(null)} />;
}

function Message({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Wrap className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <div className="tile tile-meadow mx-auto mb-10 size-32">
          <Picto id="fix" className="absolute inset-[14%]" />
        </div>
        <h1 className="text-[clamp(2.4rem,7vw,3.6rem)] lowercase">{title}</h1>
        {children && <p className="mx-auto mt-4 max-w-[44ch] text-lg text-dim">{children}</p>}
      </div>
    </Wrap>
  );
}

/** The team key is on every teammate's phone, so only the team itself can send answers from this computer. */
function TeamKeyForm({ live, wrong, onKey }: { live: Live; wrong: boolean; onKey: (key: string) => void }) {
  const [key, setKey] = useState("");
  return (
    <Wrap className="max-w-xl py-12">
      <p className="font-bold text-pine">Team computer</p>
      <h1 className="text-[clamp(2.4rem,7vw,3.6rem)] lowercase">which team is this?</h1>
      {live.teams.length === 0 ? (
        <p className="mt-4 text-lg text-dim">
          Teams aren’t made yet. Once they are, your team key shows up on your phones.<span className="blink"> _</span>
        </p>
      ) : (
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (key.length === 4) onKey(key);
          }}
        >
          <label className="block">
            <span className="text-lg text-dim">Type the team key from any teammate’s phone. This computer remembers it for tonight.</span>
            <input
              className="field narrow mt-4 text-center text-5xl font-extrabold tracking-[0.3em] uppercase"
              value={key}
              onChange={(e) =>
                setKey(
                  e.target.value
                    .replace(/[^a-z]/gi, "")
                    .toUpperCase()
                    .slice(0, 4),
                )
              }
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
              aria-label="Team key"
            />
          </label>
          {wrong && (
            <p role="alert" className="mt-3 font-semibold text-signal">
              That key isn’t a team tonight. Check a teammate’s phone and try again.
            </p>
          )}
          <button className="btn btn-primary mt-4 w-full text-lg" disabled={key.length !== 4}>
            Start
          </button>
        </form>
      )}
    </Wrap>
  );
}

function TeamComputer({
  live,
  team,
  teamKey,
  py,
  onSwitch,
}: {
  live: Live;
  team: Live["teams"][number];
  teamKey: string;
  py: Python;
  onSwitch: () => void;
}) {
  const remaining = useRemaining(live.timer);
  const s = live.screen;
  const game = s.mode === "card" && (s.game === "fix" || s.game === "puzzle") ? s.game : undefined;
  const index = game ? s.index : undefined;
  return (
    <Wrap className="py-8">
      <header className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <p className="text-dim">Team computer</p>
          <h1 className="text-3xl">{team.name}</h1>
        </div>
        <p className="narrow text-5xl leading-none font-extrabold">{team.score}</p>
        {index !== undefined && (live.timer.startedAt || remaining !== live.timer.durationMs) && (
          <p
            className={`narrow ml-auto text-6xl leading-none font-extrabold ${remaining <= 10_000 && live.timer.startedAt ? "text-signal" : ""}`}
          >
            {remaining === 0 && live.timer.startedAt ? "time" : fmtClock(remaining)}
          </p>
        )}
        <button className={`link text-dim ${index === undefined ? "ml-auto" : ""}`} onClick={onSwitch}>
          Not {team.name}? Switch team
        </button>
      </header>
      {index !== undefined && game === "puzzle" ? (
        <LivePuzzle
          key={cardKey("puzzle", index)}
          live={live}
          teamId={team._id}
          teamKey={teamKey}
          index={index}
          remaining={remaining}
          py={py}
        />
      ) : index !== undefined ? (
        <LiveFix key={cardKey("fix", index)} live={live} teamId={team._id} teamKey={teamKey} index={index} remaining={remaining} py={py} />
      ) : (
        <div className="card grid min-h-[50vh] place-items-center p-8 text-center">
          <div>
            <div className="tile tile-meadow mx-auto mb-8 size-28">
              <Picto id="fix" animate="loop" className="absolute inset-[14%]" />
            </div>
            <p className="text-3xl font-extrabold tracking-[-0.03em]">Hang tight.</p>
            <p className="mt-3 text-lg text-dim">When Fix it for real or a puzzle starts, it shows up here, with Python ready to run.</p>
            <p className="mt-6 text-sm text-dim">
              {py.status === "ready"
                ? "Python is ready."
                : py.status === "failed"
                  ? "Python didn’t load. Reload the page."
                  : "Getting Python ready…"}
            </p>
          </div>
        </div>
      )}
    </Wrap>
  );
}

function LiveFix({
  live,
  teamId,
  teamKey,
  index,
  remaining,
  py,
}: {
  live: Live;
  teamId: Id<"teams">;
  teamKey: string;
  index: number;
  remaining: number;
  py: Python;
}) {
  const board = useQuery(api.fixes.board);
  const report = useMutation(api.fixes.report);
  const key = cardKey("fix", index);
  const mine = board?.card === key ? (board.fixed.find((f) => f.teamId === teamId) ?? null) : null;
  const scored = live.scored.includes(key);
  return (
    <FixRound
      index={index}
      py={py}
      // Once scored, the result stays up even if an officer hides the answer again.
      revealed={!!live.screen.revealed || scored}
      hint={!!live.screen.hint}
      open={isOpen(live, key, remaining)}
      fixed={mine && { ms: mine.ms }}
      result={mine?.result ?? null}
      saveKey={`hwc.fixCode.${live._id}.${teamId}.${key}`}
      onFixed={(code) => report({ teamKey, card: key, code })}
    />
  );
}

/** Whether the card on the TV still takes answers, as the server will see it (minus its grace). */
const isOpen = (live: Live, key: string, remaining: number) =>
  answersOpen({
    revealed: !!live.screen.revealed,
    scored: live.scored.includes(key),
    endedAt: live.card?.key === key ? live.card.endedAt : undefined,
    own: live.timer.card === key,
    running: !!live.timer.startedAt,
    remaining,
    now: Date.now(),
    grace: 0,
  });

function LivePuzzle({
  live,
  teamId,
  teamKey,
  index,
  remaining,
  py,
}: {
  live: Live;
  teamId: Id<"teams">;
  teamKey: string;
  index: number;
  remaining: number;
  py: Python;
}) {
  const board = useQuery(api.puzzles.board);
  const submit = useMutation(api.puzzles.submit);
  const key = cardKey("puzzle", index);
  const mine = board?.card === key ? board.teams.find((t) => t.teamId === teamId) : undefined;
  // The same seed the server uses to check answers, so this is exactly the input it expects.
  const input = useMemo(() => PUZZLES[index].generate(puzzleSeed(live._id, teamId, index)), [live._id, teamId, index]);
  return (
    <PuzzleRound
      index={index}
      input={input}
      py={py}
      revealed={!!live.screen.revealed || live.scored.includes(key)}
      hint={!!live.screen.hint}
      open={isOpen(live, key, remaining)}
      stars={{ part1Ms: mine?.part1Ms ?? null, part2Ms: mine?.part2Ms ?? null }}
      lockedUntil={mine?.lockedUntil ?? null}
      result={mine?.result ?? null}
      saveKey={`hwc.puzzleCode.${live._id}.${teamId}.${key}`}
      onSubmit={(part, answer) => submit({ teamKey, card: key, part, answer })}
    />
  );
}
