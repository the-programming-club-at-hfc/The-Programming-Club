import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PageHead, Picto, Wrap, ordinal } from "#/components/ui";
import { CLUB } from "#/lib/season";

export const Route = createFileRoute("/hello-world/scores")({
  head: () => ({ meta: [{ title: `Scores · ${CLUB.season}` }] }),
  component: Scores,
});

const MEDAL = ["var(--color-gold)", "var(--color-silver)", "#d79a5b"];

function Scores() {
  const board = useQuery(api.stats.leaderboard);
  return (
    <>
      <PageHead title="scores">
        Season XP so far. Showing up every week is the fastest way up the board.
        <span className="mt-2 block">Each night: 3 XP for coming, +3/2/1 for your place, plus any bonus XP.</span>
      </PageHead>
      <Wrap>
        {board === undefined ? (
          <p className="text-dim">Loading scores…</p>
        ) : board.length === 0 ? (
          <div className="grid gap-[3px] md:grid-cols-[auto_1fr]">
            <div className="tile tile-sky size-40">
              <Picto id="people" className="absolute inset-[14%]" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-6 bg-mist p-8">
              <div>
                <p className="text-3xl font-extrabold tracking-[-0.03em]">The board is empty</p>
                <p className="mt-2 max-w-[44ch] text-dim">Names show up here after the first game night. Play once and you’re on it.</p>
              </div>
              <Link to="/hello-world/season" className="btn btn-primary">
                See when we play
              </Link>
            </div>
          </div>
        ) : (
          <table className="w-full max-w-4xl">
            <thead>
              <tr className="text-left text-sm text-dim">
                <th className="pb-3 font-normal">Rank</th>
                <th className="pb-3 font-normal">Name</th>
                <th className="pb-3 text-right font-normal">Weeks</th>
                <th className="pb-3 text-right font-normal">XP</th>
              </tr>
            </thead>
            <tbody>
              {board.map((p, i) => {
                const rank = 1 + board.filter((o) => o.xp > p.xp).length;
                return (
                  <tr key={p.name + i} className="border-t border-line">
                    <td className="w-24 py-3.5">
                      <span className="flex items-center gap-3">
                        <span className="size-5 rounded-full" style={{ background: MEDAL[rank - 1] ?? "transparent" }} aria-hidden />
                        <span className="narrow text-xl font-extrabold">{ordinal(rank)}</span>
                      </span>
                    </td>
                    <td className="py-3.5 text-lg font-bold">
                      {p.name}
                      {p.founder && <span className="chip ml-2 align-middle font-semibold">Founder</span>}
                      {p.rookie && <span className="chip ml-2 bg-meadow/25 align-middle font-semibold">Rookie</span>}
                    </td>
                    <td className="narrow py-3.5 text-right text-lg text-dim">{p.weeks}</td>
                    <td className="narrow py-3.5 text-right text-3xl font-extrabold">{p.xp}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Wrap>
    </>
  );
}
