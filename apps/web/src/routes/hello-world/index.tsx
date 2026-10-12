import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AgendaList, GAME_TILE, HourDial, Picto, Wrap, weekTile } from "#/components/ui";
import { GAMES, MATCH_AGENDA } from "#/lib/content";
import { nextMeeting, useSchedule } from "#/lib/schedule";
import { CLUB, fmtDate } from "#/lib/season";

export const Route = createFileRoute("/hello-world/")({ component: Home });

function countdown(start: number, now: number) {
  const mins = Math.max(0, Math.floor((start - now) / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `in ${d} day${d > 1 ? "s" : ""}, ${h} hr`;
  if (h > 0) return `in ${h} hr ${m} min`;
  return `in ${m} min`;
}

function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const short = (d: Date) => fmtDate(d, { month: "short", day: "numeric" }).toLowerCase();

function Home() {
  const now = useNow();
  const plan = useSchedule();
  const next = now === null ? null : nextMeeting(plan, now);
  return (
    <>
      <Wrap className="grid gap-x-12 gap-y-10 pt-12 pb-16 lg:grid-cols-[1.15fr_1fr] lg:pt-16">
        <div className="flex flex-col">
          <p className="text-lg font-medium text-dim">
            {CLUB.name} at {CLUB.school}
          </p>
          {/* Sized to its column (container units) so "world cup" never wraps; the leading leaves room for the comma. */}
          <h1 className="@container mt-5">
            <span className="block text-[clamp(3rem,17.5cqi,9rem)] leading-[0.9] tracking-[-0.055em] whitespace-nowrap">
              hello,
              <br />
              world cup
            </span>
          </h1>
          <p className="mt-9 max-w-[42ch] text-[1.3rem] leading-relaxed">
            Eight Wednesdays of team games for programmers of every level. No experience, no homework, any language.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/hello-world/join" className="btn btn-primary text-lg">
              Join tonight’s game
            </Link>
            <Link to="/hello-world/rules" className="btn text-lg">
              See the six games
            </Link>
          </div>
        </div>

        {/* The pictogram wall: one tile per game, then the trophy, the season, and the way in. */}
        <ul className="grid grid-cols-3 gap-[3px] self-center">
          {GAMES.map((g, i) => {
            const t = GAME_TILE[g.id];
            return (
              <li key={g.id} className="tile-in" style={{ animationDelay: `${i * 70}ms` }}>
                <Link to="/hello-world/rules" hash={g.id} className={`tile ${t.tile} group block aspect-square`}>
                  <Picto
                    animate="loop"
                    id={t.picto}
                    className="absolute inset-x-[16%] top-[8%] bottom-[22%] m-auto transition-transform duration-200 group-hover:-translate-y-1"
                  />
                  <span className="absolute bottom-2.5 left-3 text-sm font-bold lowercase max-sm:hidden">{g.name}</span>
                </Link>
              </li>
            );
          })}
          <li className="tile-in" style={{ animationDelay: "420ms" }}>
            <Link to="/hello-world/cup" className="tile tile-gold group block aspect-square">
              <Picto
                animate="loop"
                id="keycap"
                className="absolute inset-x-[16%] top-[8%] bottom-[22%] m-auto transition-transform duration-200 group-hover:-translate-y-1"
              />
              <span className="absolute bottom-2.5 left-3 text-sm font-bold max-sm:hidden">cup nights</span>
            </Link>
          </li>
          <li className="tile-in" style={{ animationDelay: "490ms" }}>
            <Link to="/hello-world/season" className="tile tile-silver flex aspect-square flex-col justify-between p-3">
              <span className="narrow text-[clamp(1.6rem,2.6vw,2.4rem)] leading-[0.95] font-extrabold">
                {short(plan[0].start)}
                <br />
                to {short(plan[plan.length - 1].start)}
              </span>
              <span className="text-sm leading-tight font-bold whitespace-nowrap">
                {CLUB.day.toLowerCase()}
                <br />
                {CLUB.time}
              </span>
            </Link>
          </li>
          <li className="tile-in" style={{ animationDelay: "560ms" }}>
            <Link to="/hello-world/join" className="tile tile-pine group block aspect-square">
              <Picto
                animate="loop"
                id="people"
                className="absolute inset-x-[16%] top-[8%] bottom-[22%] m-auto transition-transform duration-200 group-hover:-translate-y-1"
              />
              <span className="absolute bottom-2.5 left-3 text-sm font-bold max-sm:hidden">join a team</span>
            </Link>
          </li>
        </ul>
      </Wrap>

      {next ? (
        <section className="theme-pine">
          <Wrap className="grid items-center gap-8 py-10 md:grid-cols-[auto_1fr_auto]">
            <div className={`tile ${weekTile(plan[next.i]).tile} size-28 rounded-[4px]`}>
              <Picto id={weekTile(plan[next.i]).picto} className="absolute inset-[14%]" />
            </div>
            <div>
              <p className="text-dim">
                {next.live ? "Happening now" : "Next up"}, week {next.i + 1} of 8
              </p>
              <p className="mt-1 text-[clamp(2rem,4vw,3.2rem)] leading-none font-extrabold tracking-[-0.03em] lowercase">
                {plan[next.i].title}
              </p>
              <p className="mt-3 max-w-[56ch] text-dim">{plan[next.i].pitch}</p>
            </div>
            <div className="md:text-right">
              <p className="narrow text-[clamp(3rem,6vw,5rem)] leading-none font-extrabold">{short(plan[next.i].start)}</p>
              <p className="mt-1 font-semibold">
                {CLUB.time}, {next.live ? "right now" : countdown(plan[next.i].start.getTime(), now!)}
              </p>
            </div>
          </Wrap>
        </section>
      ) : (
        now !== null && (
          <section className="theme-pine">
            <Wrap className="py-10 text-2xl font-bold">Season 0 is over. See you in Season 1.</Wrap>
          </section>
        )
      )}

      <Wrap className="mt-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 className="text-[clamp(2.4rem,5vw,4rem)] lowercase">eight wednesdays</h2>
          <Link to="/hello-world/season" className="link">
            Full schedule
          </Link>
        </div>
        <ol className="mt-10 grid grid-cols-4 gap-x-[3px] gap-y-8 lg:grid-cols-8">
          {plan.map((w, i) => {
            const t = weekTile(w);
            const past = next ? i < next.i : now !== null;
            return (
              <li key={w.week} className={past || w.cancelled ? "opacity-40" : ""}>
                <Link to="/hello-world/season" hash={`week-${i + 1}`} className="group block">
                  <span
                    className={`tile ${t.tile} block aspect-square ${next?.i === i ? "outline-[3px] outline-offset-[3px] outline-ink" : ""}`}
                  >
                    <Picto id={t.picto} className="absolute inset-[16%]" />
                    <span className="narrow absolute top-2 left-2.5 text-lg font-extrabold">{i + 1}</span>
                  </span>
                  <span className="narrow mt-3 block text-sm font-bold text-dim">{short(w.start)}</span>
                  <span className={`mt-0.5 block leading-tight font-bold group-hover:underline ${w.cancelled ? "line-through" : ""}`}>
                    {w.title}
                  </span>
                  {w.cancelled && <span className="text-sm text-dim">No meeting</span>}
                </Link>
              </li>
            );
          })}
        </ol>
      </Wrap>

      <Wrap className="mt-28 grid items-center gap-x-20 gap-y-10 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <HourDial rows={MATCH_AGENDA} className="mx-auto w-full max-w-[26rem]" />
        <div>
          <h2 className="text-[clamp(2.4rem,5vw,4rem)] lowercase">one hour, every week</h2>
          <p className="mt-4 max-w-[48ch] text-lg text-dim">
            Every match night follows the same clock. The last round counts double, so a team in last place can still win.
          </p>
          <div className="mt-8">
            <AgendaList rows={MATCH_AGENDA} compact />
          </div>
        </div>
      </Wrap>

      <Wrap className="mt-28">
        <dl className="grid gap-x-12 gap-y-12 md:grid-cols-3">
          {[
            ["no homework", "Everything happens in the room, in one hour."],
            ["join any week", "Scan the code on the TV and you’re on a team. Late arrivals land on the smallest team."],
            [
              "any level",
              "Code Relay takes any language you’re learning in class. On-screen puzzles are short Python, and we explain every one.",
            ],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[clamp(1.8rem,3vw,2.4rem)] leading-none font-extrabold tracking-[-0.03em]">{k}</dt>
              <dd className="mt-3 max-w-[34ch] text-dim">{v}</dd>
            </div>
          ))}
        </dl>
      </Wrap>
    </>
  );
}
