import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { NO_PICK, PhoneRound } from "#/components/answer";
import { CardView, fmtClock, fmtElapsed, useRemaining } from "#/components/game";
import { Picto, Wrap, ordinal, weekTile } from "#/components/ui";
import { answersOpen, cardKey, isAnswerGame } from "#/lib/grading";
import type { AnswerGame } from "#/lib/grading";
import { IDEA_MAX } from "#/lib/ideas";
import { useSchedule } from "#/lib/schedule";
import { CLUB } from "#/lib/season";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/hello-world/join")({
  validateSearch: (s: Record<string, unknown>): { code?: string } => (typeof s.code === "string" ? { code: s.code } : {}),
  head: () => ({ meta: [{ title: `Join · ${CLUB.season}` }] }),
  component: Join,
});

const tokenKey = (sessionId: string) => `hwc.token.${sessionId}`;
type Profile = { name: string; email: string };

function Join() {
  const { code: codeFromQr } = Route.useSearch();
  const live = useQuery(api.sessions.live);
  const [token, setToken] = useState<string | null>(null);
  const me = useQuery(api.players.me, token ? { token } : "skip");

  useEffect(() => {
    setToken(live ? localStorage.getItem(tokenKey(live._id)) : null);
  }, [live?._id]);

  useEffect(() => {
    // An officer removed this player, or the token is stale.
    if (token && me === null && live) {
      localStorage.removeItem(tokenKey(live._id));
      setToken(null);
    }
  }, [token, me, live]);

  if (live === undefined)
    return (
      <Center>
        <p className="text-dim">Loading…</p>
      </Center>
    );
  if (live === null)
    return (
      <Center>
        <div className="tile tile-silver mx-auto mb-10 size-32">
          <Picto id="people" className="absolute inset-[14%]" />
        </div>
        <h1 className="text-[clamp(2.4rem,7vw,3.6rem)] lowercase">no game right now</h1>
        <p className="mx-auto mt-4 max-w-[40ch] text-lg text-dim">
          Joining opens when an officer starts the night: {CLUB.day}, {CLUB.time}, in {CLUB.room}.
        </p>
        <Link to="/hello-world/season" className="btn mt-8">
          See this week’s game
        </Link>
      </Center>
    );

  if (token && me) {
    return (
      <MyGame
        token={token}
        me={me}
        live={live}
        onSwitch={() => {
          localStorage.removeItem(tokenKey(live._id));
          setToken(null);
        }}
      />
    );
  }
  return <JoinForm initialCode={codeFromQr ?? ""} sessionId={live._id} week={live.week} onJoined={setToken} />;
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <Wrap className="grid min-h-[60vh] place-items-center text-center">
      <div>{children}</div>
    </Wrap>
  );
}

function JoinForm({
  initialCode,
  sessionId,
  week,
  onJoined,
}: {
  initialCode: string;
  sessionId: string;
  week: number;
  onJoined: (t: string) => void;
}) {
  const join = useMutation(api.players.join);
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [profile, setProfile] = useState<Profile>({ name: "", email: "" });
  const [broughtBy, setBroughtBy] = useState("");
  const [idea, setIdea] = useState("");
  // Only a phone that has never joined gets the idea box ("Switch player" keeps the saved profile).
  const [firstPhone, setFirstPhone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("hwc.profile");
    if (saved) setProfile(JSON.parse(saved) as Profile);
    setFirstPhone(!saved && !Object.keys(localStorage).some((k) => k.startsWith("hwc.token.")));
  }, []);

  async function submit(e: { preventDefault: () => void }) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const token = await join({ code, ...profile, broughtBy: broughtBy || undefined, idea: (firstPhone && idea) || undefined });
      localStorage.setItem("hwc.profile", JSON.stringify(profile));
      localStorage.setItem(tokenKey(sessionId), token);
      onJoined(token);
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : "Couldn’t join. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const wk = useSchedule()[week - 1];
  const t = weekTile(wk);
  const letters = code.padEnd(4, " ").slice(0, 4).split("");
  return (
    <Wrap className="max-w-xl py-10">
      <form onSubmit={submit} className="space-y-7">
        <div className="flex items-center gap-5">
          <div className={`tile ${t.tile} size-20 shrink-0 rounded-[3px]`}>
            <Picto id={t.picto} className="absolute inset-[14%]" />
          </div>
          <p className="leading-tight">
            <span className="text-dim">Week {week}</span>
            <br />
            <span className="text-lg font-bold">{wk.title}</span>
          </p>
        </div>
        <div>
          <p className="font-bold text-pine">Welcome to {CLUB.name}!</p>
          <h1 className="mt-1 text-[clamp(2.6rem,9vw,3.8rem)] leading-[0.9] lowercase">join the game</h1>
          <p className="mt-4 text-lg text-dim">No account or password. Type the code on the TV and your name, and you’re in.</p>
        </div>

        <label className="block">
          <span className="font-bold">Code on the TV</span>
          <span className="relative mt-2 grid grid-cols-4 gap-[3px]">
            {letters.map((c, i) => (
              <span
                key={i}
                aria-hidden
                className={`narrow grid h-20 place-items-center text-5xl font-extrabold ${c.trim() ? "bg-ink text-paper" : "bg-mist"} ${focused && i === Math.min(code.length, 3) ? "outline-[3px] -outline-offset-[3px] outline-sun" : ""}`}
              >
                {c}
              </span>
            ))}
            <input
              className="absolute inset-0 h-full w-full cursor-text uppercase opacity-0"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^a-z]/gi, "").toUpperCase())}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              maxLength={4}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              aria-label="Code on the TV"
            />
          </span>
        </label>

        <label className="block">
          <span className="font-bold">Your name</span>
          <input
            className="field mt-2"
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            autoComplete="name"
            required
            maxLength={40}
          />
        </label>
        <label className="block">
          <span className="font-bold">HawkMail</span> <span className="text-dim">Keeps your XP together week to week.</span>
          <input
            className="field mt-2"
            type="email"
            value={profile.email}
            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
            autoComplete="email"
            required
            placeholder="jsmith@hawkmail.hfcc.edu"
          />
        </label>
        <label className="block">
          <span className="font-bold">Who brought you?</span> <span className="text-dim">Optional. Officers give you both +2 XP.</span>
          <input className="field mt-2" value={broughtBy} onChange={(e) => setBroughtBy(e.target.value)} maxLength={40} />
        </label>
        {firstPhone && (
          <label className="block">
            <span className="font-bold">Anything you’d like the club to do?</span> <span className="text-dim">Optional.</span>
            <textarea
              className="field mt-2 block"
              rows={2}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              maxLength={IDEA_MAX}
              placeholder="Events, projects, games, workshops…"
            />
            {idea.length > IDEA_MAX - 100 && (
              <span className="mt-1 block text-right text-sm text-dim">
                {idea.length}/{IDEA_MAX}
              </span>
            )}
          </label>
        )}
        {error && (
          <p role="alert" className="rounded-[6px] bg-signal/10 px-4 py-3 font-semibold text-signal">
            {error}
          </p>
        )}
        <button className="btn btn-primary w-full text-lg" disabled={busy}>
          {busy ? "Joining…" : "Join the game"}
        </button>
      </form>
    </Wrap>
  );
}

type Live = NonNullable<FunctionReturnType<typeof api.sessions.live>>;
type Me = NonNullable<FunctionReturnType<typeof api.players.me>>;

function MyGame({ token, me, live, onSwitch }: { token: string; me: Me; live: Live; onSwitch: () => void }) {
  const remaining = useRemaining(live.timer);
  const s = live.screen;
  const wk = useSchedule()[live.week - 1];
  const t = weekTile(wk);
  const hot = remaining <= 10_000 && !!live.timer.startedAt;
  return (
    <Wrap className="max-w-2xl py-10">
      <p className="text-dim">
        Week {live.week}: {wk.title}
      </p>
      <h1 className="mt-1 text-[clamp(2.4rem,8vw,3.4rem)] lowercase">{me.name}</h1>
      {me.practice && <p className="mt-2 font-semibold text-pine">Practice night: nothing tonight counts toward XP.</p>}

      <div className="mt-8 grid grid-cols-[auto_1fr] gap-[3px]">
        <div className={`tile ${t.tile} w-24 sm:w-32`}>
          <Picto id={t.picto} className="absolute inset-x-[12%] top-1/2 -translate-y-1/2" />
        </div>
        <div className="theme-pine p-6">
          {me.team ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-dim">Your team</p>
                  <h2 className="mt-1 text-3xl">{me.team.name}</h2>
                  <p className="mt-2 font-semibold">
                    {ordinal(me.team.rank)} of {me.team.of}
                  </p>
                </div>
                <p className="narrow text-7xl leading-none font-extrabold">{me.team.score}</p>
              </div>
              <p className="mt-4 border-t border-line pt-3 text-dim">{me.team.members.join(", ")}</p>
            </>
          ) : (
            <p className="text-xl font-semibold">
              You’re in. Teams get picked in a minute.<span className="blink"> _</span>
            </p>
          )}
        </div>
      </div>

      {(live.timer.startedAt || s.mode === "timer") && (
        <p className={`narrow mt-8 text-center text-8xl leading-none font-extrabold ${hot ? "text-signal" : ""}`}>
          {remaining === 0 && live.timer.startedAt ? "time" : fmtClock(remaining)}
        </p>
      )}

      {s.mode === "card" && s.game && s.index !== undefined && (
        <div className="mt-8">
          {isAnswerGame(s.game) && me.team ? (
            <TeamAnswer key={cardKey(s.game, s.index)} token={token} live={live} game={s.game} index={s.index} remaining={remaining} />
          ) : s.game === "fix" && me.team ? (
            <FixStatus live={live} index={s.index} teamId={me.team._id} />
          ) : (
            <div className="card p-5">
              <CardView game={s.game} index={s.index} answer={!!s.revealed} hint={!!s.hint} />
            </div>
          )}
        </div>
      )}
      {s.mode === "wiki" && s.wikiFrom && s.wikiTo && (
        <div className="mt-8 grid grid-cols-2 gap-[3px]">
          <div className="bg-mist p-5">
            <p className="text-sm text-dim">Start here</p>
            <p className="mt-1 text-2xl font-extrabold">{s.wikiFrom}</p>
          </div>
          <div className="tile tile-sky p-5">
            <p className="text-sm">Get to</p>
            <p className="mt-1 text-2xl font-extrabold">{s.wikiTo}</p>
          </div>
        </div>
      )}
      {s.mode === "message" && s.message && <p className="card mt-8 p-6 text-2xl font-bold">{s.message}</p>}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 text-dim">
        <p>
          Season XP: <strong className="narrow text-2xl text-ink">{me.seasonXp}</strong> across {me.weeks} week
          {me.weeks === 1 ? "" : "s"}
        </p>
        <button onClick={onSwitch} className="link">
          Not {me.name}? Switch player
        </button>
      </div>
    </Wrap>
  );
}

/** The team's answer to the card on the TV: one pick per team, shared live across teammates' phones. */
function TeamAnswer({
  token,
  live,
  game,
  index,
  remaining,
}: {
  token: string;
  live: Live;
  game: AnswerGame;
  index: number;
  remaining: number;
}) {
  const mine = useQuery(api.answers.mine, { token });
  const pick = useMutation(api.answers.pick);
  const lock = useMutation(api.answers.lock);
  const [error, setError] = useState("");
  const key = cardKey(game, index);
  const current = mine?.card === key ? mine : null;
  const open = answersOpen({
    revealed: !!live.screen.revealed,
    scored: live.scored.includes(key),
    endedAt: live.card?.key === key ? live.card.endedAt : undefined,
    own: live.timer.card === key,
    running: !!live.timer.startedAt,
    remaining,
    now: Date.now(),
    grace: 0,
  });
  const send = (p: Promise<unknown>) => {
    setError("");
    p.catch((e: unknown) =>
      setError(e instanceof ConvexError ? String(e.data) : "That didn’t go through. Check your connection and try again."),
    );
  };
  return (
    <PhoneRound
      game={game}
      index={index}
      // Once scored, the result stays up even if an officer hides the answer again.
      revealed={!!live.screen.revealed || live.scored.includes(key)}
      open={open}
      pick={current?.pick ?? NO_PICK}
      result={current?.result ?? null}
      error={error}
      onPick={(p) => send(pick({ token, card: key, ...p }))}
      onLock={(step) => send(lock({ token, card: key, step }))}
    />
  );
}

/** Fix it for real happens on the team computer; the phone shows the card and whether the team has fixed it. */
function FixStatus({ live, index, teamId }: { live: Live; index: number; teamId: Id<"teams"> }) {
  const board = useQuery(api.fixes.board);
  const key = cardKey("fix", index);
  const mine = board?.card === key ? board.fixed.find((f) => f.teamId === teamId) : undefined;
  const done = !!live.screen.revealed || live.scored.includes(key);
  const status = mine
    ? done && mine.result
      ? `Fixed! +${mine.result.points}`
      : `Fixed!${mine.ms === null ? "" : ` at ${fmtElapsed(mine.ms)}`}`
    : done
      ? "Not fixed this time"
      : "Not fixed yet";
  return (
    <div className="space-y-3">
      <div className={`rounded-[10px] p-5 ${mine ? "bg-meadow text-[#12332b]" : "bg-mist"}`} role="status">
        <p className="text-4xl leading-none font-extrabold tracking-[-0.03em]">{status}</p>
        {!done && <p className="mt-2 font-semibold">Fix it on your team computer. This phone keeps you posted.</p>}
        {mine?.result?.first && <p className="mt-2 font-semibold">First team to fix it.</p>}
      </div>
      <div className="card p-5">
        <CardView game="fix" index={index} answer={done} hint={!!live.screen.hint} />
      </div>
    </div>
  );
}
