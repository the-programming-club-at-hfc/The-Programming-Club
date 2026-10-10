import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { CardView, DECKS, fmtClock, isSwapMoment, unlockAudio, useChimes, useRemaining } from "#/components/game";
import { GAME_TILE, Picto, ordinal, weekTile } from "#/components/ui";
import { GAMES } from "#/lib/content";
import { nextMeeting, useSchedule } from "#/lib/schedule";
import { CLUB, fmtDate } from "#/lib/season";

export const Route = createFileRoute("/hello-world/tv")({
  head: () => ({ meta: [{ title: `TV · ${CLUB.season}` }] }),
  component: Tv,
});

type Live = NonNullable<FunctionReturnType<typeof api.sessions.live>>;

function useOrigin() {
  const [origin, setOrigin] = useState(`https://${CLUB.url}`);
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}

function Tv() {
  const live = useQuery(api.sessions.live);
  const [sound, setSound] = useState(false);
  return (
    <div
      className="theme-pine relative flex h-screen flex-col overflow-hidden"
      onClick={() => !sound && unlockAudio().then(() => setSound(true))}
    >
      {live ? <LiveTv live={live} /> : live === null ? <Attract /> : null}
      {!sound && (
        <button
          className="absolute top-4 right-4 z-10 rounded-[6px] bg-mist px-4 py-2 text-sm font-semibold text-dim"
          onClick={(e) => {
            e.stopPropagation();
            void unlockAudio().then(() => setSound(true));
          }}
        >
          Click to turn on timer sounds
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

function LiveTv({ live }: { live: Live }) {
  const remaining = useRemaining(live.timer);
  useChimes(live.timer, remaining);
  const origin = useOrigin();
  const joinUrl = `${origin}/hello-world/join?code=${live.code}`;
  const s = live.screen;
  const running = !!live.timer.startedAt;
  const plan = useSchedule();
  const wk = plan[live.week - 1];
  const wt = weekTile(wk);
  const deckTile = s.game ? GAME_TILE[s.game] : null;

  return (
    <>
      <div className="flex-1 overflow-hidden p-[3.5vw]">
        {s.mode === "lobby" && <Lobby live={live} joinUrl={joinUrl} />}
        {s.mode === "scoreboard" && <Scoreboard live={live} />}
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
            </p>
            <CardView game={s.game} index={s.index} answer={!!s.revealed} size="xl" />
          </div>
        )}
        {s.mode === "wiki" && s.wikiFrom && s.wikiTo && (
          <div className="flex h-full flex-col justify-center gap-[3vw]">
            <div className="grid grid-cols-2 gap-[0.3vw]">
              <div className="bg-mist p-[3vw]">
                <p className="text-[1.6vw] text-dim">Start here</p>
                <p className="mt-[0.8vw] text-[5vw] leading-[0.95] font-extrabold tracking-[-0.03em]">{s.wikiFrom}</p>
              </div>
              <div className="tile tile-sky p-[3vw]">
                <p className="text-[1.6vw]">Get to</p>
                <p className="mt-[0.8vw] text-[5vw] leading-[0.95] font-extrabold tracking-[-0.03em]">{s.wikiTo}</p>
              </div>
            </div>
            <p className="text-[1.5vw] text-dim">
              Links inside the article only. No search bar. Back button and Ctrl+F are fine. Shout “Wiki!” when you land.
            </p>
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
        <span className="ml-auto text-dim">
          Join at <strong className="text-ink">{origin.replace(/^https?:\/\//, "")}/hello-world/join</strong>
        </span>
        <CodeSquares code={live.code} className="text-[2vw]" />
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

function Lobby({ live, joinUrl }: { live: Live; joinUrl: string }) {
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
        <CodeSquares code={live.code} className="mt-[1vw] text-[6vw]" />
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

function Scoreboard({ live }: { live: Live }) {
  const top = Math.max(1, ...live.teams.map((t) => t.score));
  return (
    <div className="mx-auto flex h-full max-w-[86vw] flex-col">
      <h2 className="text-[4vw] leading-none tracking-[-0.04em]">tonight’s standings</h2>
      {live.teams.length === 0 ? (
        <p className="mt-[6vw] text-[2.2vw] text-dim">Teams show up here once officers make them.</p>
      ) : (
        <ol className="mt-[3vw] flex flex-col gap-[1.4vw]">
          {live.teams.map((t) => {
            const rank = 1 + live.teams.filter((o) => o.score > t.score).length;
            return (
              <li key={t._id} className="grid grid-cols-[3vw_6vw_1fr_10vw] items-center gap-[1.5vw]">
                <span className="size-[2.6vw] rounded-full" style={{ background: MEDAL[rank - 1] ?? "transparent" }} aria-hidden />
                <span className="narrow text-[3.2vw] leading-none font-extrabold">{ordinal(rank)}</span>
                <div className="min-w-0">
                  <p className="truncate text-[2.5vw] leading-tight font-extrabold">
                    {t.name} <span className="text-[1.3vw] font-normal text-dim">{t.members.join(", ")}</span>
                  </p>
                  <div className="mt-[0.6vw] h-[0.9vw] bg-mist">
                    <div className="h-full bg-sky" style={{ width: `${Math.max(2, (t.score / top) * 100)}%` }} />
                  </div>
                </div>
                <span className="narrow text-right text-[5vw] leading-none font-extrabold">{t.score}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
