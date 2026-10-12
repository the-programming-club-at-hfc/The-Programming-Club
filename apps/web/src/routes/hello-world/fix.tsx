import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { FixRound } from "#/components/fix";
import { fmtClock, useRemaining } from "#/components/game";
import { Picto, Wrap } from "#/components/ui";
import { answersOpen, cardKey } from "#/lib/grading";
import { usePython } from "#/lib/python";
import type { Python } from "#/lib/python";
import { CLUB } from "#/lib/season";

// A team's lab computer for Fix it for real. No sign-in: the computer picks its team from tonight's list.
export const Route = createFileRoute("/hello-world/fix")({
  head: () => ({ meta: [{ title: `Team computer · ${CLUB.season}` }, { name: "robots", content: "noindex" }] }),
  component: FixPage,
});

type Live = NonNullable<FunctionReturnType<typeof api.sessions.live>>;
const teamKey = (sessionId: string) => `hwc.fixTeam.${sessionId}`;

function FixPage() {
  const live = useQuery(api.sessions.live);
  // Python starts loading as soon as the page opens, so it's ready when the round starts.
  const py = usePython();
  const [teamId, setTeamId] = useState<string | null>(null);
  useEffect(() => {
    setTeamId(live ? localStorage.getItem(teamKey(live._id)) : null);
  }, [live?._id]);

  if (live === undefined) return <Message title="loading…" />;
  if (live === null) return <Message title="no game right now">This page comes alive when an officer starts the night.</Message>;

  const pick = (id: string | null) => {
    if (id) localStorage.setItem(teamKey(live._id), id);
    else localStorage.removeItem(teamKey(live._id));
    setTeamId(id);
  };
  const team = live.teams.find((t) => t._id === teamId);
  if (!team) return <TeamPicker live={live} onPick={pick} />;
  return <TeamComputer live={live} team={team} py={py} onSwitch={() => pick(null)} />;
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

function TeamPicker({ live, onPick }: { live: Live; onPick: (id: string) => void }) {
  return (
    <Wrap className="py-12">
      <p className="font-bold text-pine">Team computer</p>
      <h1 className="text-[clamp(2.4rem,7vw,3.6rem)] lowercase">which team is this?</h1>
      {live.teams.length === 0 ? (
        <p className="mt-4 text-lg text-dim">
          Teams aren’t made yet. They’ll show up here on their own.<span className="blink"> _</span>
        </p>
      ) : (
        <>
          <p className="mt-4 text-lg text-dim">Tap your team. This computer remembers it for tonight.</p>
          <ul className="mt-8 grid gap-[3px] sm:grid-cols-2 lg:grid-cols-3">
            {live.teams.map((t) => (
              <li key={t._id}>
                <button className="tile tile-meadow block min-h-32 w-full p-6 text-left" onClick={() => onPick(t._id)}>
                  <span className="block text-3xl font-extrabold tracking-[-0.03em]">{t.name}</span>
                  <span className="mt-2 block">{t.members.join(", ") || "No players yet"}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Wrap>
  );
}

function TeamComputer({ live, team, py, onSwitch }: { live: Live; team: Live["teams"][number]; py: Python; onSwitch: () => void }) {
  const remaining = useRemaining(live.timer);
  const s = live.screen;
  const index = s.mode === "card" && s.game === "fix" ? s.index : undefined;
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
      {index !== undefined ? (
        <LiveFix key={cardKey("fix", index)} live={live} teamId={team._id} index={index} remaining={remaining} py={py} />
      ) : (
        <div className="card grid min-h-[50vh] place-items-center p-8 text-center">
          <div>
            <div className="tile tile-meadow mx-auto mb-8 size-28">
              <Picto id="fix" animate="loop" className="absolute inset-[14%]" />
            </div>
            <p className="text-3xl font-extrabold tracking-[-0.03em]">Hang tight.</p>
            <p className="mt-3 text-lg text-dim">
              When Fix it for real starts, a buggy program shows up here. Fix it, run it, and check it.
            </p>
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
  index,
  remaining,
  py,
}: {
  live: Live;
  teamId: Id<"teams">;
  index: number;
  remaining: number;
  py: Python;
}) {
  const board = useQuery(api.fixes.board);
  const report = useMutation(api.fixes.report);
  const key = cardKey("fix", index);
  const mine = board?.card === key ? (board.fixed.find((f) => f.teamId === teamId) ?? null) : null;
  const scored = live.scored.includes(key);
  const open = answersOpen({
    revealed: !!live.screen.revealed,
    scored,
    endedAt: live.card?.key === key ? live.card.endedAt : undefined,
    own: live.timer.card === key,
    running: !!live.timer.startedAt,
    remaining,
    now: Date.now(),
    grace: 0,
  });
  return (
    <FixRound
      index={index}
      py={py}
      // Once scored, the result stays up even if an officer hides the answer again.
      revealed={!!live.screen.revealed || scored}
      hint={!!live.screen.hint}
      open={open}
      fixed={mine && { ms: mine.ms }}
      result={mine?.result ?? null}
      saveKey={`hwc.fixCode.${live._id}.${key}`}
      onFixed={(code) => report({ teamId, card: key, code })}
    />
  );
}
