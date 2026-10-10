import { Link, createFileRoute } from "@tanstack/react-router";
import { AgendaList, GAME_TILE, HourDial, PageHead, Picto, Wrap, weekTile } from "#/components/ui";
import { GAMES, MATCH_AGENDA } from "#/lib/content";
import { gamesIn, ideaFor, useSchedule } from "#/lib/schedule";
import type { WeekPlan } from "#/lib/schedule";
import { CLUB, fmtDate } from "#/lib/season";

export const Route = createFileRoute("/hello-world/season")({
  head: () => ({ meta: [{ title: `Season · ${CLUB.season}` }] }),
  component: Season,
});

const short = (d: Date) => fmtDate(d, { month: "short", day: "numeric" }).toLowerCase();

/** For a week, which games it plays and whether each is the double-points final round. */
function plays(w: WeekPlan) {
  const out = new Map<string, boolean>();
  if (w.cancelled) return out;
  for (const g of w.lineup) for (const id of gamesIn(g.label)) out.set(id, out.get(id) || g.double);
  return out;
}

function Season() {
  const plan = useSchedule();
  return (
    <>
      <PageHead title="the season">
        Eight Wednesdays, {CLUB.time}, in {CLUB.room}. Each match night plays one main game. Weeks 4 and 6 are Cup nights, where everyone
        starts at zero.
      </PageHead>

      {/* The competition schedule: weeks down, games across. */}
      <Wrap>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-[3px]">
            <thead>
              <tr>
                <th className="w-[38%]" />
                {GAMES.map((g) => (
                  <th key={g.id} className="pb-2 align-bottom">
                    <Link
                      to="/hello-world/rules"
                      hash={g.id}
                      className={`tile ${GAME_TILE[g.id].tile} mx-auto block size-14 rounded-[3px]`}
                      title={g.name}
                    >
                      <Picto id={GAME_TILE[g.id].picto} className="absolute inset-[12%]" />
                    </Link>
                    <span className="mt-2 block text-xs leading-tight font-bold lowercase">{g.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plan.map((w, i) => {
                const p = plays(w);
                return (
                  <tr key={w.week} className={`group ${w.cancelled ? "opacity-45" : ""}`}>
                    <th scope="row" className="rounded-l-[3px] bg-mist py-3 pr-3 pl-4 text-left font-normal">
                      <a href={`#week-${i + 1}`} className="flex items-baseline gap-4">
                        <span className="narrow w-6 text-xl font-extrabold">{i + 1}</span>
                        <span className="narrow w-14 text-sm font-bold text-dim">{short(w.start)}</span>
                        <span className={`font-bold group-hover:underline ${w.cancelled ? "line-through" : ""}`}>{w.title}</span>
                        {w.cancelled && <span className="chip ml-auto">No meeting</span>}
                        {w.kind === "cup" && <span className="chip ml-auto bg-gold">Cup</span>}
                      </a>
                    </th>
                    {GAMES.map((g) => (
                      <td key={g.id} className={`h-12 text-center ${p.has(g.id) ? GAME_TILE[g.id].tile : "bg-mist/50"}`}>
                        {p.has(g.id) && (
                          <span className={`narrow text-sm font-extrabold ${GAME_TILE[g.id].tile === "tile-pine" ? "text-white" : ""}`}>
                            {p.get(g.id) ? "×2" : "●"}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-dim">● played that night. ×2 is the final round, worth double points.</p>
      </Wrap>

      <Wrap className="mt-24">
        {plan.map((w, i) => {
          const t = weekTile(w);
          return (
            <article
              key={w.week}
              id={`week-${i + 1}`}
              className="grid scroll-mt-24 gap-x-12 gap-y-6 border-t border-line py-12 md:grid-cols-[9rem_1fr_1fr]"
            >
              <div className={`tile ${t.tile} size-28 rounded-[4px] md:size-36`}>
                <Picto id={t.picto} className="absolute inset-[14%]" />
                <span className="narrow absolute top-2 left-2.5 text-xl font-extrabold">{i + 1}</span>
              </div>
              <div>
                <p className="narrow font-bold text-dim">
                  {fmtDate(w.start, { weekday: "long", month: "long", day: "numeric" }).toLowerCase()}
                  {w.cancelled && ", no meeting this week"}
                </p>
                <h2 className="mt-2 text-[clamp(2rem,3.6vw,3rem)] lowercase">{w.title}</h2>
                <p className="mt-4 max-w-[46ch] text-lg leading-relaxed">{w.pitch}</p>
                {w.kind === "cup" && (
                  <Link to="/hello-world/cup" className="link mt-4 inline-block">
                    Cup night agenda
                  </Link>
                )}
              </div>
              <div className="space-y-5 md:pt-8">
                <div>
                  <h3 className="text-sm tracking-normal text-dim">What we’ll play</h3>
                  <ol className="steps mt-2">
                    {w.games.map((g) => {
                      const idea = ideaFor(g.replace(/^Final round ×2: /, ""));
                      return (
                        <li key={g}>
                          {g}
                          {idea && <span className="block text-sm text-dim">{idea.how}</span>}
                        </li>
                      );
                    })}
                  </ol>
                </div>
                {w.lesson && (
                  <div>
                    <h3 className="text-sm tracking-normal text-dim">Mini-lesson</h3>
                    <p className="mt-1">{w.lesson}</p>
                  </div>
                )}
                {w.bonus && (
                  <div>
                    <h3 className="text-sm tracking-normal text-dim">Bonus</h3>
                    <p className="mt-1">{w.bonus}</p>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </Wrap>

      <Wrap className="mt-10 grid items-center gap-x-20 gap-y-10 rounded-[6px] bg-mist p-8 md:p-14 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <HourDial rows={MATCH_AGENDA} className="mx-auto w-full max-w-[22rem]" />
        <div>
          <h2 className="text-[clamp(2rem,3.6vw,3rem)] lowercase">how a match night runs</h2>
          <p className="mt-3 text-dim">Weeks 2, 3, 5, 6, and 7 follow this clock. Only the game changes.</p>
          <div className="mt-6">
            <AgendaList rows={MATCH_AGENDA} />
          </div>
        </div>
      </Wrap>
    </>
  );
}
