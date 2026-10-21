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
        <span className="mt-2 block">
          Each night: 3 XP for coming, +3/2/1 for your place, plus bonus XP like +2 for bringing a classmate. Tap a name to see where their
          XP came from.
        </span>
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
                <th className="pb-3 pl-6 text-right font-normal max-sm:hidden">Weeks</th>
                <th className="pb-3 pl-4 text-right font-normal">XP</th>
              </tr>
            </thead>
            <tbody>
              {board.map((p, i) => {
                // Ties share a place and the next score is still the next place (1st, 2nd, 2nd, 3rd), as in the rules.
                const rank = 1 + new Set(board.filter((o) => o.xp > p.xp).map((o) => o.xp)).size;
                return (
                  // Every cell is top-aligned on a 2.5rem first line, so the rank and numbers stay level with the name when the breakdown opens.
                  <tr key={p.name + i} className="border-t border-line align-top">
                    <td className="w-20 py-3.5 sm:w-24">
                      <span className="flex h-10 items-center gap-3">
                        <span
                          className="size-5 shrink-0 rounded-full"
                          style={{ background: MEDAL[rank - 1] ?? "transparent" }}
                          aria-hidden
                        />
                        <span className="narrow text-xl font-extrabold">{ordinal(rank)}</span>
                      </span>
                    </td>
                    <td className="py-3.5 text-lg font-bold">
                      {/* Where the XP came from, night by night. */}
                      <details className="group">
                        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 select-none [&::-webkit-details-marker]:hidden">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            {p.name}
                            {p.officer && <span className="chip font-semibold">Officer</span>}
                            {p.founder && <span className="chip font-semibold">Founder</span>}
                            {p.rookie && <span className="chip bg-meadow/25 font-semibold">Rookie</span>}
                          </span>
                          <span className="font-normal text-dim transition-transform group-open:rotate-90" aria-hidden>
                            ›
                          </span>
                        </summary>
                        <ul className="mt-2 border-l-2 border-line pl-3 text-sm font-normal">
                          {p.nights.map((n, j) => (
                            <li key={j} className="flex items-baseline justify-between gap-4 py-1">
                              <span>
                                <span className="font-semibold">Week {n.week}</span>
                                <span className="text-dim">
                                  {" · "}
                                  {n.show} coming
                                  {n.place > 0 && ` · +${n.place} place`}
                                  {n.bonuses.map((b) => ` · +${b.xp} ${b.why}`)}
                                </span>
                              </span>
                              <span className="narrow shrink-0 font-bold">{n.show + n.place + n.bonus} XP</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </td>
                    <td className="narrow py-3.5 pl-6 text-right text-lg leading-10 text-dim max-sm:hidden">{p.weeks}</td>
                    <td className="py-3.5 pl-4 text-right">
                      <span className="narrow block text-3xl leading-10 font-extrabold">{p.xp}</span>
                      {/* No room for a Weeks column on a phone, so the count sits under the XP. */}
                      <span className="block text-xs text-dim sm:hidden">
                        {p.weeks} {p.weeks === 1 ? "week" : "weeks"}
                      </span>
                    </td>
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
