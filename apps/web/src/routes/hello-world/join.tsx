import { SignInButton, SignOutButton } from "@clerk/tanstack-react-start";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { NO_PICK, PhoneRound } from "#/components/answer";
import { CardView, Hint, fmtClock, fmtElapsed, useRemaining } from "#/components/game";
import { Picto, Wrap, ordinal, weekTile } from "#/components/ui";
import { WikiPair, WikiRound } from "#/components/wiki";
import { answersOpen, cardKey, isAnswerGame, wikiKey } from "#/lib/grading";
import { PUZZLES } from "#/lib/puzzles";
import type { AnswerGame } from "#/lib/grading";
import { IDEA_MAX } from "#/lib/ideas";
import { gamesIn, useSchedule, usesTeamComputer } from "#/lib/schedule";
import { CLUB, isHfcEmail } from "#/lib/season";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/hello-world/join")({
  validateSearch: (s: Record<string, unknown>): { code?: string } => (typeof s.code === "string" ? { code: s.code } : {}),
  head: () => ({ meta: [{ title: `Join · ${CLUB.season}` }] }),
  component: Join,
});

const tokenKey = (sessionId: string) => `hwc.token.${sessionId}`;
type Profile = { name: string; email: string };

// Flags a non-HFC email as soon as what's after the @ can't become one, and any non-HFC email once the field is left.
const notHfc = (email: string, left: boolean) => {
  if (left) return email.trim() !== "" && !isHfcEmail(email);
  if (!email.includes("@")) return false;
  const domain = email.toLowerCase().split("@")[1].trim();
  return !["hawkmail.hfcc.edu", "hfcc.edu"].some((d) => d.startsWith(domain));
};

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
  return <JoinForm initialCode={codeFromQr ?? ""} sessionId={live._id} onJoined={setToken} />;
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <Wrap className="grid min-h-dvh place-items-center py-8 text-center">
      <div>{children}</div>
    </Wrap>
  );
}

function JoinForm({ initialCode, sessionId, onJoined }: { initialCode: string; sessionId: string; onJoined: (t: string) => void }) {
  const join = useMutation(api.players.join);
  const joinSignedIn = useMutation(api.players.joinSignedIn);
  const checkInOfficer = useMutation(api.players.checkInOfficer);
  // A phone signed in to an account joins in one tap; an officer's account checks in to run the night instead.
  const { isLoading, isAuthenticated } = useConvexAuth();
  const account = useQuery(api.players.account, isAuthenticated ? {} : "skip");
  const officer = !!account?.officer;
  const member = !!account && !officer && account.hfc;
  // Signed in, but not with an HFC email: they get the regular form, with a nudge to switch accounts.
  const wrongAccount = !!account && !officer && !account.hfc;
  // Give sign-in a moment to load, so a signed-in phone goes straight to "Join as…". If it's slow or blocked, guests
  // get the form anyway.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setWaited(true), 1500);
    return () => clearTimeout(id);
  }, []);
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [profile, setProfile] = useState<Profile>({ name: "", email: "" });
  const [broughtBy, setBroughtBy] = useState("");
  const [idea, setIdea] = useState("");
  // Only a phone that has never joined gets the idea box (and, when signed in, "Who brought you?"). Joining leaves a
  // token behind, so that's the test; the saved profile isn't, since the sign-in link saves it before any join.
  const [firstPhone, setFirstPhone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const [emailLeft, setEmailLeft] = useState(false);
  const emailBad = notHfc(profile.email, emailLeft);

  useEffect(() => {
    const saved = localStorage.getItem("hwc.profile");
    if (saved) setProfile(JSON.parse(saved) as Profile);
    setFirstPhone(!Object.keys(localStorage).some((k) => k.startsWith("hwc.token.")));
  }, []);

  useEffect(() => {
    if (officer && account.email) setProfile((p) => (p.email ? p : { ...p, email: account.email }));
  }, [officer, account?.email]);

  async function submit(e: { preventDefault: () => void }) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const extras = { broughtBy: broughtBy || undefined, idea: (firstPhone && idea) || undefined };
      const token = officer
        ? await checkInOfficer(profile)
        : member
          ? await joinSignedIn({ code, name: account.name ? undefined : profile.name, ...extras })
          : await join({ code, ...profile, ...extras });
      if (!member) localStorage.setItem("hwc.profile", JSON.stringify(profile));
      localStorage.setItem(tokenKey(sessionId), token);
      onJoined(token);
    } catch (err) {
      const msg = err instanceof ConvexError ? String(err.data) : "Couldn’t join. Check your connection and try again.";
      // The server's HawkMail check shows on the email field instead.
      if (msg.startsWith("Use your HawkMail")) setEmailLeft(true);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  }

  if ((isLoading && !waited) || (isAuthenticated && account === undefined))
    return (
      <Center>
        <p className="text-dim">Loading…</p>
      </Center>
    );
  const letters = code.padEnd(4, " ").slice(0, 4).split("");
  // Clerk sends people back here after signing in, with the code typed so far.
  const here = code ? `/join?code=${code}` : "/join";
  const askName = !officer && !(member && account.name);
  return (
    <Wrap className="flex min-h-dvh max-w-xl flex-col py-5">
      <form onSubmit={submit} className="flex flex-1 flex-col gap-4">
        <div>
          <h1 className="text-[clamp(2.2rem,10vw,3.2rem)] leading-[0.9] lowercase">{officer ? "officer check-in" : "join the game"}</h1>
          {(officer || wrongAccount) && (
            <p className="mt-2 text-dim">
              {officer
                ? "You’re signed in as an officer. You’ll be counted here and kept off the teams so you can run the night."
                : `You’re signed in as ${account.email}, which isn’t an HFC email. Sign out and sign in with your HawkMail, or join with it below.`}
            </p>
          )}
        </div>

        {!officer && (
          <label className="block">
            <span className="font-bold">Code on the TV</span>
            <span className="relative mt-1.5 grid grid-cols-4 gap-[3px]">
              {letters.map((c, i) => (
                <span
                  key={i}
                  aria-hidden
                  className={`narrow grid h-14 place-items-center text-4xl font-extrabold ${c.trim() ? "bg-ink text-paper" : "bg-mist"} ${focused && i === Math.min(code.length, 3) ? "outline-[3px] -outline-offset-[3px] outline-sun" : ""}`}
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
        )}

        {(askName || officer) && (
          <label className="block">
            <span className="font-bold">Your name</span>
            <input
              className="field mt-1.5"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              autoComplete="name"
              required
              maxLength={40}
            />
          </label>
        )}
        {!member && (
          <label className="block">
            <span className="font-bold">HawkMail</span> <span className="text-sm text-dim">Keeps your XP together week to week.</span>
            <input
              className="field mt-1.5"
              type="email"
              value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              onBlur={() => setEmailLeft(true)}
              autoComplete="email"
              required
              placeholder="jsmith@hawkmail.hfcc.edu"
              aria-invalid={emailBad}
              aria-describedby={emailBad ? "email-error" : undefined}
            />
            {emailBad && (
              <span id="email-error" className="mt-1 block text-sm font-semibold text-signal">
                Use your HawkMail (@hawkmail.hfcc.edu). The club is for HFC students.
              </span>
            )}
          </label>
        )}
        {!officer && firstPhone && (
          <label className="block">
            <span className="font-bold">What do you want from this club?</span>
            <span className="block text-sm text-dim">
              Optional. Things to learn or build, events to run, hackathons or trips to go to together.
            </span>
            <textarea
              className="field mt-1.5 block resize-none"
              rows={3}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              maxLength={IDEA_MAX}
              placeholder="A Python workshop, a group trip to a hackathon, a game jam…"
            />
            {idea.length > IDEA_MAX - 100 && (
              <span className="mt-1 block text-right text-sm text-dim">
                {idea.length}/{IDEA_MAX}
              </span>
            )}
          </label>
        )}
        {/* Signed-in members skip it after their first night, to keep joining one tap. */}
        {!officer && (!member || firstPhone) && (
          <label className="block">
            <span className="font-bold">Who brought you?</span> <span className="text-sm text-dim">Optional. You both get +2 XP.</span>
            <input className="field mt-1.5" value={broughtBy} onChange={(e) => setBroughtBy(e.target.value)} maxLength={40} />
          </label>
        )}
        {error && (
          <p role="alert" className="rounded-[6px] bg-signal/10 px-4 py-3 font-semibold text-signal">
            {error}
          </p>
        )}
        {/* Pinned to the bottom of the screen so Join is always one tap away. */}
        <div className="sticky bottom-0 mt-auto bg-paper pt-2 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          <button className="btn btn-primary w-full text-lg" disabled={busy}>
            {busy ? "Joining…" : officer ? "Check in" : member && account.name ? `Join as ${account.name}` : "Join the game"}
          </button>
          <p className="mt-2 text-center text-sm text-dim">
            {isAuthenticated ? (
              <SignOutButton redirectUrl={here}>
                <button type="button" className="link">
                  Not you? Sign out
                </button>
              </SignOutButton>
            ) : (
              <SignInButton mode="modal" withSignUp forceRedirectUrl={here} initialValues={{ emailAddress: profile.email || undefined }}>
                {/* Keeps the name typed so far for after signing in. */}
                <button type="button" className="link" onClick={() => localStorage.setItem("hwc.profile", JSON.stringify(profile))}>
                  Sign in with your HawkMail to join in one tap next time
                </button>
              </SignInButton>
            )}
          </p>
        </div>
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
  // The team key only matters while a team-computer game is the round being played or the card on the TV.
  const round = live.round !== null && live.round < wk.lineup.length ? wk.lineup[live.round].label : "";
  const teamComputer = gamesIn(round).some(usesTeamComputer) || (s.mode === "card" && !!s.game && usesTeamComputer(s.game));
  return (
    <Wrap className="flex min-h-dvh max-w-2xl flex-col py-5">
      <p className="text-sm text-dim">
        Week {live.week}: {wk.title}
      </p>
      <h1 className="mt-0.5 text-[clamp(2rem,8vw,3rem)] lowercase">{me.name}</h1>
      {me.practice && <p className="mt-2 font-semibold text-pine">Practice night: nothing tonight counts toward XP.</p>}

      <div className="mt-4 grid grid-cols-[auto_1fr] gap-[3px]">
        <div className={`tile ${t.tile} w-16 sm:w-32`}>
          <Picto id={t.picto} className="absolute inset-x-[12%] top-1/2 -translate-y-1/2" />
        </div>
        <div className="theme-pine p-4 sm:p-6">
          {me.officer && !me.playing ? (
            <>
              <p className="text-dim">Officer</p>
              <h2 className="mt-1 text-2xl sm:text-3xl">You’re running tonight</h2>
              <p className="mt-2 text-dim">Checked in and off the teams.</p>
              <Link to="/hello-world/host" className="btn btn-primary mt-4 w-full">
                Open host controls
              </Link>
            </>
          ) : me.team ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-dim">Your team</p>
                  <h2 className="mt-1 text-2xl sm:text-3xl">{me.team.name}</h2>
                  <p className="mt-2 font-semibold">
                    {ordinal(me.team.rank)} of {me.team.of}
                  </p>
                </div>
                <p className="narrow text-6xl leading-none font-extrabold sm:text-7xl">{me.team.score}</p>
              </div>
              <p className="mt-3 border-t border-line pt-2 text-sm text-dim">{me.team.members.join(", ")}</p>
              {me.team.key && teamComputer && (
                <p className="mt-1 text-sm text-dim">
                  Team computer key: <strong className="narrow text-lg tracking-[0.15em] text-ink">{me.team.key}</strong>
                </p>
              )}
            </>
          ) : (
            <p className="text-xl font-semibold">
              You’re in. Teams get picked in a minute.<span className="blink"> _</span>
            </p>
          )}
        </div>
      </div>

      {(live.timer.startedAt || s.mode === "timer") && (
        <p className={`narrow mt-5 text-center text-7xl leading-none font-extrabold ${hot ? "text-signal" : ""}`}>
          {remaining === 0 && live.timer.startedAt ? "time" : fmtClock(remaining)}
        </p>
      )}

      {s.mode === "card" && s.game && s.index !== undefined && (
        <div className="mt-5">
          {isAnswerGame(s.game) && me.team ? (
            <TeamAnswer key={cardKey(s.game, s.index)} token={token} live={live} game={s.game} index={s.index} remaining={remaining} />
          ) : s.game === "fix" && me.team ? (
            <FixStatus live={live} index={s.index} teamId={me.team._id} />
          ) : s.game === "puzzle" && me.team ? (
            <PuzzleStatus live={live} index={s.index} teamId={me.team._id} />
          ) : (
            <div className="card p-5">
              <CardView game={s.game} index={s.index} answer={!!s.revealed} hint={!!s.hint} />
            </div>
          )}
        </div>
      )}
      {s.mode === "wiki" && s.wikiFrom && s.wikiTo && (
        <div className="mt-5">
          {me.team ? (
            <TeamRace
              key={wikiKey(s.wikiFrom, s.wikiTo)}
              token={token}
              live={live}
              from={s.wikiFrom}
              to={s.wikiTo}
              teamId={me.team._id}
              remaining={remaining}
            />
          ) : (
            <WikiPair from={s.wikiFrom} to={s.wikiTo} />
          )}
        </div>
      )}
      {s.mode === "message" && s.message && <p className="card mt-5 p-6 text-2xl font-bold">{s.message}</p>}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-8 text-sm text-dim">
        {!me.officer && me.team && <p className="w-full">Want to team up with a friend? Ask an officer to switch your team.</p>}
        {me.officer ? (
          <PlayTonight token={token} playing={me.playing} />
        ) : (
          <p>
            Season XP: <strong className="narrow text-xl text-ink">{me.seasonXp}</strong> across {me.weeks} week
            {me.weeks === 1 ? "" : "s"}
          </p>
        )}
        <button onClick={onSwitch} className="link">
          Not {me.name}? Switch player
        </button>
      </div>
    </Wrap>
  );
}

/** An officer's switch for nights when a team is short: on puts them on the smallest team. */
function PlayTonight({ token, playing }: { token: string; playing: boolean }) {
  const setPlaying = useMutation(api.players.setPlaying);
  const [error, setError] = useState("");
  return (
    <label className="flex items-center gap-2 font-semibold text-ink">
      <input
        type="checkbox"
        className="size-5 accent-pine"
        checked={playing}
        onChange={(e) => sender(setError)(setPlaying({ token, playing: e.target.checked }))}
      />
      Play tonight
      {!playing && <span className="font-normal text-dim">(when a team is short)</span>}
      {error && <span className="font-normal text-signal">{error}</span>}
    </label>
  );
}

/** Whether this phone can still answer the card (or race) on the TV: the server's rule, with no grace. */
const phoneOpen = (live: Live, key: string, remaining: number) =>
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

/** Sends a mutation, showing what went wrong on the phone. */
const sender = (setError: (e: string) => void) => (p: Promise<unknown>) => {
  setError("");
  p.catch((e: unknown) =>
    setError(e instanceof ConvexError ? String(e.data) : "That didn’t go through. Check your connection and try again."),
  );
};

/** The team's Wiki Race: one "We made it!" per team, shared live across teammates' phones. */
function TeamRace({
  token,
  live,
  from,
  to,
  teamId,
  remaining,
}: {
  token: string;
  live: Live;
  from: string;
  to: string;
  teamId: Id<"teams">;
  remaining: number;
}) {
  const board = useQuery(api.wiki.board);
  const finish = useMutation(api.wiki.finish);
  const undo = useMutation(api.wiki.undo);
  const [error, setError] = useState("");
  const send = sender(setError);
  const key = wikiKey(from, to);
  const b = board?.card === key ? board : null;
  const mine = b?.finished.find((f) => f.teamId === teamId);
  return (
    <WikiRound
      from={from}
      to={to}
      clicks={!!live.screen.wikiClicks}
      open={phoneOpen(live, key, remaining)}
      revealed={!!live.screen.revealed || live.scored.includes(key)}
      finish={mine ?? null}
      result={b?.results?.find((r) => r.teamId === teamId)?.result ?? null}
      error={error}
      onFinish={(clicks) => send(finish({ token, card: key, clicks }))}
      onUndo={() => send(undo({ token, card: key }))}
    />
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
  const open = phoneOpen(live, key, remaining);
  const send = sender(setError);
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

/** Puzzles are answered on the team computer; the phone shows the story and the team's stars. */
function PuzzleStatus({ live, index, teamId }: { live: Live; index: number; teamId: Id<"teams"> }) {
  const board = useQuery(api.puzzles.board);
  const key = cardKey("puzzle", index);
  const mine = board?.card === key ? board.teams.find((t) => t.teamId === teamId) : undefined;
  const done = !!live.screen.revealed || live.scored.includes(key);
  const times = [mine?.part1Ms ?? null, mine?.part2Ms ?? null];
  const n = times.filter((ms) => ms !== null).length;
  const status = done
    ? n
      ? `${"★".repeat(n)} +${mine?.result?.points ?? 0}`
      : "No stars this time"
    : ["No stars yet", "★ Part 1 done", "★★ Both stars!"][n];
  const firsts = [mine?.first1, mine?.first2].flatMap((f, i) => (f ? [`part ${i + 1}`] : []));
  return (
    <div className="space-y-3">
      <div className={`rounded-[10px] p-5 ${n ? "bg-meadow text-[#12332b]" : "bg-mist"}`} role="status">
        <p className="text-4xl leading-none font-extrabold tracking-[-0.03em]">{status}</p>
        <p className="mt-2 font-semibold">
          {times.map((ms, i) => `Part ${i + 1}: ${ms === null ? "not yet" : `★ at ${fmtElapsed(ms)}`}`).join(" · ")}
        </p>
        {firsts.length > 0 && <p className="mt-1 font-semibold">First team to the {firsts.join(" and ")} star.</p>}
        {!done && <p className="mt-1">Answers go in on your team computer. This phone keeps you posted.</p>}
      </div>
      {!done && live.screen.hint && <Hint text={`Part ${n ? 2 : 1}: ${PUZZLES[index].hint[n ? 1 : 0]}`} />}
      <div className="card p-5">
        <CardView game="puzzle" index={index} answer={done} />
      </div>
    </div>
  );
}
