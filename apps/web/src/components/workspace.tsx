// The full Fix it for real and puzzle workspaces, wired to Convex. A lab computer at /hello-world/fix sends as its team
// key; a player's join page on a laptop (or a phone that opened it) sends as its join token.
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useMemo, useSyncExternalStore } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { answersOpen, cardKey } from "#/lib/grading";
import { PUZZLES, puzzleSeed } from "#/lib/puzzles";
import type { Python } from "#/lib/python";
import { FixRound } from "./fix";
import { PuzzleRound } from "./puzzle";

export type Live = NonNullable<FunctionReturnType<typeof api.sessions.live>>;

/** Who's sending: a lab computer by the team key, or a join page by its token. */
export type Sender = { teamKey: string } | { token: string };

interface LiveProps {
  live: Live;
  teamId: Id<"teams">;
  by: Sender;
  index: number;
  remaining: number;
  py: Python;
}

/** Laptop-sized: room for the editor next to the card, and a mouse or trackpad. */
const LAPTOP = "(min-width: 1024px) and (pointer: fine)";

export const useLaptop = () =>
  useSyncExternalStore(
    (on) => {
      const m = matchMedia(LAPTOP);
      m.addEventListener("change", on);
      return () => m.removeEventListener("change", on);
    },
    () => matchMedia(LAPTOP).matches,
    () => false,
  );

/** Whether the card on the TV still takes answers, as the server will see it (minus its grace). */
export const isOpen = (live: Live, key: string, remaining: number) =>
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

export function LiveFix({ live, teamId, by, index, remaining, py }: LiveProps) {
  const board = useQuery(api.fixes.board);
  const report = useMutation(api.fixes.report);
  const reportByToken = useMutation(api.fixes.reportByToken);
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
      onFixed={(code) => ("token" in by ? reportByToken({ ...by, card: key, code }) : report({ ...by, card: key, code }))}
    />
  );
}

export function LivePuzzle({ live, teamId, by, index, remaining, py }: LiveProps) {
  const board = useQuery(api.puzzles.board);
  const submit = useMutation(api.puzzles.submit);
  const submitByToken = useMutation(api.puzzles.submitByToken);
  const key = cardKey("puzzle", index);
  const mine = board?.card === key ? board.teams.find((t) => t.teamId === teamId) : undefined;
  const input = usePuzzleInput(live, teamId, index);
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
      onSubmit={(part, answer) =>
        "token" in by ? submitByToken({ ...by, card: key, part, answer }) : submit({ ...by, card: key, part, answer })
      }
      solo={live.teamSize === 1}
    />
  );
}

/** The team's own puzzle input, from the same seed the server uses to check answers, so it's exactly the input it expects. */
export const usePuzzleInput = (live: Live, teamId: Id<"teams">, index: number) =>
  useMemo(() => PUZZLES[index].generate(puzzleSeed(live._id, teamId, index)), [live._id, teamId, index]);
