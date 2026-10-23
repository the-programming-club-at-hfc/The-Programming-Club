// Local stand-in for convex/react and @clerk/tanstack-react-start, imported only by modules that host-layout.spec.ts
// rewrites in the browser. One in-memory "deployment": mutations change it, queries derive from it, React re-renders.
// Nothing here talks to a network, and nothing outside the test browser can import it.
import { forwardRef, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";
import { awardsFor, cardKey, clockLeft, isAnswerGame, settle, showCard } from "../../src/lib/grading";
import { heldKey } from "../../src/lib/flow";
import { OUTPUTS } from "../../src/lib/content";

const SESSION = "session-local";
const listeners = new Set();
let version = 0;
let state;
// Test controls: queued failures and held (pending) calls, keyed by mutation name.
let failures = [];
let holds = [];

const emit = () => {
  version++;
  for (const listener of listeners) listener();
};
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const useVersion = () => useSyncExternalStore(subscribe, () => version);

// ---- Scenarios -------------------------------------------------------------------------------------------------

const names = ["Ada", "Grace", "Linus", "Margaret", "Alan", "Barbara", "Dennis", "Katherine"];
const people = (n) =>
  names.slice(0, n).map((name, i) => ({
    _id: `att-${i + 1}`,
    name,
    email: `${name.toLowerCase()}@example.test`,
    teamId: null,
    firstTime: i % 3 === 0,
    broughtBy: null,
    bonusXp: 0,
    bonuses: [],
    officer: false,
  }));

function session(over = {}) {
  return {
    _id: SESSION,
    _creationTime: Date.now() - 600_000,
    week: 3,
    code: "SBDS",
    status: "open",
    startedAt: Date.now() - 600_000,
    double: false,
    screen: { mode: "lobby" },
    timer: { durationMs: 90_000, remainingMs: 90_000, relay: false },
    shown: [],
    sound: { music: true, volume: 0.8 },
    card: undefined,
    played: [],
    scored: [],
    practice: true,
    round: undefined,
    roundFrom: undefined,
    autoTeams: true,
    teamSize: 1,
    playerPoints: true,
    ...over,
  };
}

/** Pairs players into teams of `size`, named like the real solo/team modes do. */
function teamUp(players, size) {
  const teams = [];
  players.forEach((p, i) => {
    const t = Math.floor(i / size);
    if (!teams[t]) teams[t] = { _id: `team-${t + 1}`, name: size === 1 ? p.name : `Team ${t + 1}`, score: 0, key: null };
    p.teamId = teams[t]._id;
  });
  return teams;
}

const empty = () => ({ session: null, teams: [], players: [], answers: {}, wiki: {}, drawings: [], recent: [], calls: [], rejected: [] });

const SCENARIOS = {
  /** No night running: the start panel. */
  none: () => ({
    ...empty(),
    recent: [{ ...session({ status: "ended", week: 2, practice: false }), _id: "session-week-2", endedAt: Date.now() - 6 * 864e5 }],
  }),
  /** Night started, nobody has joined. */
  lobby: () => ({ ...empty(), session: session() }),
  /** Teams of 2, round 1 (Output?) with a snippet up, its clock running, and phone answers coming in. */
  active: () => {
    const now = Date.now();
    const players = people(8);
    const teams = teamUp(players, 2);
    teams.forEach((t, i) => (t.score = [4, 3, 2, 1][i]));
    const key = cardKey("output", 0);
    const s = session({
      teamSize: 2,
      round: 0,
      roundFrom: 0,
      shown: [key],
      screen: { mode: "card", game: "output", index: 0, revealed: false },
      timer: { durationMs: 30_000, remainingMs: 30_000, startedAt: now - 12_000, relay: false, card: key },
      card: { key, at: now - 12_000 },
    });
    const right = OUTPUTS[0].answer;
    const answers = {
      [key]: {
        "team-1": { choice: right, lockedAt: now - 9_000 },
        "team-2": { choice: OUTPUTS[0].wrong[0], lockedAt: now - 5_000 },
        "team-3": { choice: right },
      },
    };
    return { ...empty(), session: s, players, teams, answers };
  },
};
/** The active snippet after the host reveals it, scored by the app's real grading. */
SCENARIOS.revealed = () => {
  const next = SCENARIOS.active();
  next.session.timer = { ...next.session.timer, remainingMs: 0, startedAt: undefined };
  return applyScreen(next, { ...next.session.screen, revealed: true });
};
/** A Wiki Race running, picked by hand from Games, with two finishes in. */
SCENARIOS.wiki = () => {
  const next = SCENARIOS.active();
  const now = Date.now();
  const key = "wiki:Pizza>Moon";
  next.answers = {};
  next.wiki = {
    [key]: [
      { teamId: "team-2", name: "Team 2", by: "Linus", ms: 61_000, clicks: null, ok: null },
      { teamId: "team-1", name: "Team 1", by: "Ada", ms: 75_000, clicks: null, ok: true },
    ],
  };
  next.session = {
    ...next.session,
    shown: [...next.session.shown, key],
    screen: { mode: "wiki", wikiFrom: "Pizza", wikiTo: "Moon" },
    timer: { durationMs: 300_000, remainingMs: 300_000, startedAt: now - 90_000, relay: false, card: key },
    card: { key, at: now - 90_000 },
  };
  return next;
};
/** Tech Pictionary drawing 1 up, Grace drawing. */
SCENARIOS.draw = () => {
  const next = SCENARIOS.active();
  const now = Date.now();
  next.answers = {};
  next.drawings = [{ _id: "drawing-1", n: 1, key: "draw:1", word: "recursion", drawer: "att-2", got: [] }];
  next.session = {
    ...next.session,
    shown: [...next.session.shown, "draw:1"],
    screen: { mode: "draw", drawing: 1, revealed: false },
    timer: { durationMs: 90_000, remainingMs: 90_000, startedAt: now - 20_000, relay: false, card: "draw:1" },
    card: { key: "draw:1", at: now - 20_000 },
  };
  return next;
};

// ---- Mutations: the backend's rules, simplified to what the console can observe --------------------------------

const team = (s, id) => s.teams.find((t) => t._id === id);
const wikiParts = (key) => key.slice(5).split(">");

/** Like sessions.setScreen: park/settle the card window, count what's shown, and score a reveal once. */
function applyScreen(s, screen) {
  const now = Date.now();
  const se = s.session;
  const up = (screen.mode === "card" || (screen.mode === "wiki" && !screen.wikiReady) || screen.mode === "draw") && heldKey(screen);
  const settled = { card: se.card && settle([se.card], se.timer, now)[0], played: settle(se.played ?? [], se.timer, now) };
  const windows = showCard({ ...settled, up: up || undefined, now, double: se.double });
  const key = heldKey(screen);
  const shown = key && !se.shown.includes(key) ? [...se.shown, key] : se.shown;
  let next = { ...s, session: { ...se, screen, shown, card: windows.card, played: windows.played } };
  if (screen.revealed && key && !se.scored.includes(key)) next = score(next, key, screen);
  return next;
}

function score(s, key, screen) {
  const se = s.session;
  const teams = s.teams.map((t) => ({ ...t }));
  let scored = [...se.scored, key];
  if (screen.mode === "card" && isAnswerGame(screen.game)) {
    const rows = s.answers[key] ?? {};
    const r = awardsFor({
      game: screen.game,
      index: screen.index,
      start: se.card?.key === key ? se.card.at : 0,
      double: !!se.card?.double || se.double,
      scored: se.scored,
      answers: Object.entries(rows).map(([id, pick]) => ({ id, pick })),
    });
    if (!r) return s;
    scored = r.scored;
    const answers = { ...s.answers, [key]: { ...rows } };
    for (const { id, grade, points } of r.awards) {
      answers[key][id] = { ...rows[id], result: { ...grade, points } };
      const t = teams.find((x) => x._id === id);
      if (t) t.score += points;
    }
    return { ...s, teams, answers, session: { ...se, scored } };
  }
  if (key.startsWith("wiki:")) {
    const ok = (s.wiki[key] ?? []).filter((f) => f.ok !== false);
    const wiki = { ...s.wiki, [key]: (s.wiki[key] ?? []).map((f) => ({ ...f, result: { points: 0 } })) };
    ok.forEach((f, i) => {
      const points = [3, 2, 1][i] ?? 1;
      wiki[key] = wiki[key].map((x) => (x.teamId === f.teamId ? { ...x, result: { points, place: i + 1 } } : x));
      const t = teams.find((x) => x._id === f.teamId);
      if (t) t.score += points;
    });
    return { ...s, teams, wiki, session: { ...se, scored } };
  }
  return { ...s, session: { ...se, scored } };
}

/** sessions.timer, ported from convex/sessions.ts (without the stored-answer check on a fresh start). */
function applyTimer(s, { action, seconds, relay, autostart }) {
  const se = s.session;
  const now = Date.now();
  const t = { ...se.timer };
  const remaining = Math.max(0, clockLeft(t, now));
  const live = se.card?.key;
  const card = live ?? (action === "toggle" && t.parked ? t.card : undefined);
  if (action !== "add" && action !== "relay") Object.assign(t, { parked: undefined, parkedAt: undefined });
  switch (action) {
    case "set": {
      const ms = Math.round((seconds ?? 90) * 1000);
      Object.assign(t, { durationMs: ms, remainingMs: ms, startedAt: autostart ? now : undefined, card: autostart ? card : undefined });
      if (relay !== undefined) t.relay = relay;
      break;
    }
    case "toggle":
      if (t.startedAt) Object.assign(t, { remainingMs: remaining, startedAt: undefined });
      else Object.assign(t, remaining > 0 ? { startedAt: now } : { remainingMs: t.durationMs, startedAt: now }, { card });
      break;
    case "pause":
      if (t.startedAt) Object.assign(t, { remainingMs: remaining, startedAt: undefined });
      break;
    case "reset":
      Object.assign(t, { remainingMs: t.durationMs, startedAt: undefined });
      break;
    case "add":
      Object.assign(t, { remainingMs: remaining + 30_000, startedAt: t.startedAt ? now : undefined });
      t.durationMs = Math.max(t.durationMs, remaining + 30_000);
      break;
    case "relay":
      t.relay = !t.relay;
      break;
    default:
      throw new Error(`Unknown timer action ${action}`);
  }
  return { ...s, session: { ...se, timer: t } };
}

function regroup(s, size) {
  const players = s.players.map((p) => ({ ...p }));
  const teams = teamUp(
    players.filter((p) => !p.officer),
    size,
  );
  return { ...s, players, teams, session: { ...s.session, teamSize: size } };
}

const open = (s) => {
  if (!s.session) throw new Error("No night is running.");
  return s;
};
const patch = (s, over) => ({ ...open(s), session: { ...s.session, ...over } });

const MUTATIONS = {
  "sessions:start": (s, { week, practice }) => ({ ...s, session: session({ week, practice: !!practice, startedAt: Date.now() }) }),
  "sessions:reopen": (s, { sessionId }) => {
    const r = s.recent.find((x) => x._id === sessionId);
    if (!r) throw new Error("That night doesn’t exist.");
    return { ...s, recent: s.recent.filter((x) => x !== r), session: { ...r, status: "open" } };
  },
  "sessions:end": (s) => ({ ...s, recent: [{ ...open(s).session, status: "ended", endedAt: Date.now() }, ...s.recent], session: null }),
  "sessions:setScreen": (s, { screen }) => applyScreen(open(s), screen),
  "sessions:setRound": (s, { round, double, title }) => {
    const se = open(s).session;
    const roundFrom = round === se.round && se.roundFrom !== undefined ? se.roundFrom : se.shown.length;
    const next = patch(s, { round, double, roundFrom });
    return title ? applyScreen(next, { mode: "message", message: title.slice(0, 120) }) : next;
  },
  "sessions:setDouble": (s, { on }) => patch(s, { double: on }),
  "sessions:setSound": (s, { music, volume }) => {
    const cur = open(s).session.sound;
    return patch(s, { sound: { music: music ?? cur.music, volume: volume ?? cur.volume } });
  },
  "sessions:timer": (s, args) => applyTimer(open(s), args),
  "teams:make": (s, { size }) => regroup(open(s), size),
  "teams:setAuto": (s, { on }) => patch(s, { autoTeams: on }),
  "teams:add": (s) => ({
    ...open(s),
    teams: [...s.teams, { _id: `team-${s.teams.length + 1}`, name: `Team ${s.teams.length + 1}`, score: 0, key: null }],
  }),
  "teams:rename": (s, { teamId, name }) => ({ ...s, teams: s.teams.map((t) => (t._id === teamId ? { ...t, name } : t)) }),
  "teams:remove": (s, { teamId }) => ({
    ...s,
    teams: s.teams.filter((t) => t._id !== teamId),
    players: s.players.map((p) => (p.teamId === teamId ? { ...p, teamId: null } : p)),
  }),
  "teams:score": (s, { teamId, delta }) => {
    if (!team(s, teamId)) throw new Error("No such team.");
    return { ...s, teams: s.teams.map((t) => (t._id === teamId ? { ...t, score: t.score + delta } : t)) };
  },
  "teams:resetScores": (s) => ({ ...s, teams: s.teams.map((t) => ({ ...t, score: 0 })) }),
  "teams:move": (s, { attendanceId, teamId }) => ({ ...s, players: s.players.map((p) => (p._id === attendanceId ? { ...p, teamId } : p)) }),
  "teams:addBonus": (s, { attendanceId, xp, why }) => ({
    ...s,
    players: s.players.map((p) => (p._id === attendanceId ? { ...p, bonusXp: p.bonusXp + xp, bonuses: [...p.bonuses, { xp, why }] } : p)),
  }),
  "teams:removeBonus": (s, { attendanceId, index }) => ({
    ...s,
    players: s.players.map((p) =>
      p._id === attendanceId
        ? { ...p, bonusXp: p.bonusXp - (p.bonuses[index]?.xp ?? 0), bonuses: p.bonuses.filter((_, i) => i !== index) }
        : p,
    ),
  }),
  "teams:addPlayer": (s, { name, email }) => {
    const p = { ...people(1)[0], _id: `att-${s.players.length + 1}`, name, email, firstTime: false };
    return { ...open(s), players: [...s.players, p] };
  },
  "teams:removePlayer": (s, { attendanceId }) => ({ ...s, players: s.players.filter((p) => p._id !== attendanceId) }),
  "wiki:check": (s, { teamId, card, ok }) => ({
    ...s,
    wiki: { ...s.wiki, [card]: (s.wiki[card] ?? []).map((f) => (f.teamId === teamId ? { ...f, ok } : f)) },
  }),
  "drawings:start": (s) => {
    const n = s.drawings.length + 1;
    const drawer = s.players.find((p) => p.teamId);
    if (!drawer) throw new Error("Nobody’s playing yet, so nobody can draw.");
    return {
      ...s,
      drawings: [...s.drawings, { _id: `drawing-${n}`, n, key: `draw:${n}`, word: "variable", drawer: drawer._id, got: [] }],
      result: n,
    };
  },
  "drawings:skip": (s) => s,
  "drawings:switchDrawer": (s, { drawingId, attendanceId }) => ({
    ...s,
    drawings: s.drawings.map((d) => (d._id === drawingId ? { ...d, drawer: attendanceId } : d)),
  }),
  "drawings:ownWord": (s, { drawingId, word }) => ({ ...s, drawings: s.drawings.map((d) => (d._id === drawingId ? { ...d, word } : d)) }),
  "schedule:save": (s) => s,
};

const mutationFns = new Map();
export function useMutation(reference) {
  const name = getFunctionName(reference);
  if (!mutationFns.has(name)) {
    mutationFns.set(name, (args = {}) => {
      const call = { name, args: structuredClone(args) };
      state = { ...state, calls: [...state.calls, call] };
      emit();
      const run = () => {
        const failure = failures.findIndex((f) => f.name === name && (f.skip-- ?? 0) <= 0);
        if (failure !== -1) {
          const [f] = failures.splice(failure, 1);
          state = { ...state, rejected: [...state.rejected, call] };
          emit();
          return Promise.reject(new Error(f.message));
        }
        const apply = MUTATIONS[name];
        if (!apply) {
          state = { ...state, rejected: [...state.rejected, call] };
          emit();
          return Promise.reject(new Error(`Unconfigured local host mutation: ${name}`));
        }
        try {
          const { result, ...next } = apply(state, args);
          state = next;
          emit();
          return Promise.resolve(result ?? null);
        } catch (error) {
          state = { ...state, rejected: [...state.rejected, call] };
          emit();
          return Promise.reject(error);
        }
      };
      const hold = holds.find((h) => h.name === name && !h.taken);
      if (!hold) return Promise.resolve().then(run);
      hold.taken = true;
      return new Promise((resolve) => (hold.release = resolve)).then(run);
    });
  }
  return mutationFns.get(name);
}

// ---- Queries ----------------------------------------------------------------------------------------------------

const unrevealed = (s) =>
  Object.entries(s.answers)
    .filter(([key, rows]) => !s.session.scored.includes(key) && Object.values(rows).some((r) => r.lockedAt !== undefined))
    .map(([key]) => key)
    .concat(
      Object.entries(s.wiki)
        .filter(([key, rows]) => !s.session.scored.includes(key) && rows.length)
        .map(([key]) => key),
    );

function live(s) {
  const se = s.session;
  if (!se) return null;
  const roster = s.players.filter((p) => !p.officer).map((p) => ({ name: p.name, teamId: p.teamId, firstTime: p.firstTime }));
  return {
    _id: se._id,
    week: se.week,
    double: se.double,
    screen: se.screen,
    timer: se.timer,
    sound: se.sound,
    card: se.card ?? null,
    scored: se.scored,
    practice: se.practice,
    round: se.round ?? null,
    thisRound: se.roundFrom === undefined ? [] : se.shown.slice(se.roundFrom),
    autoTeams: se.autoTeams,
    teamSize: se.teamSize,
    unrevealed: unrevealed(s),
    teams: s.teams
      .map((t) => ({ _id: t._id, name: t.name, score: t.score, members: roster.filter((r) => r.teamId === t._id).map((r) => r.name) }))
      .sort((a, b) => b.score - a.score),
    roster,
  };
}

const cardOnTv = (s) => {
  const sc = s.session?.screen;
  return sc?.mode === "card" && sc.game && sc.index !== undefined
    ? { game: sc.game, index: sc.index, key: cardKey(sc.game, sc.index) }
    : null;
};
const drawingOnTv = (s) => s.session?.screen.mode === "draw" && s.drawings.find((d) => d.n === s.session.screen.drawing);
const nameOf = (s, id) => s.players.find((p) => p._id === id)?.name ?? "?";

const QUERIES = {
  "officers:me": () => ({ signedIn: true, officer: true, email: "host@example.test" }),
  "schedule:weeks": () => [],
  "sessions:final": () => null,
  "sessions:joinCode": (s) => s.session?.code ?? null,
  "sessions:live": live,
  "sessions:host": (s) =>
    s.session
      ? {
          session: s.session,
          recent: s.recent,
          used: [],
          rows: s.players.map(({ ...p }) => p).sort((a, b) => a.name.localeCompare(b.name)),
          keys: Object.fromEntries(s.teams.map((t) => [t._id, t.key])),
        }
      : { session: null, recent: s.recent },
  "answers:host": (s) => {
    const c = cardOnTv(s);
    if (!c || !isAnswerGame(c.game)) return null;
    const rows = s.answers[c.key] ?? {};
    const start = s.session.card?.key === c.key ? s.session.card.at : undefined;
    return {
      card: c.key,
      scored: s.session.scored.includes(c.key),
      teams: s.teams.map((t) => {
        const r = rows[t._id];
        return {
          _id: t._id,
          name: t.name,
          pick: r ? { line: r.line, choice: r.choice, lineLocked: r.lineLockedAt !== undefined, locked: r.lockedAt !== undefined } : null,
          result: r?.result ?? null,
          lockMs: r?.lockedAt !== undefined && start !== undefined ? r.lockedAt - start : null,
        };
      }),
    };
  },
  "answers:board": (s) => {
    const c = cardOnTv(s);
    if (!c || !isAnswerGame(c.game)) return null;
    const rows = s.answers[c.key] ?? {};
    const scored = s.session.scored.includes(c.key);
    return {
      card: c.key,
      teams: s.teams.length,
      locked: scored ? null : s.teams.filter((t) => rows[t._id]?.lockedAt !== undefined).length,
      results: scored ? s.teams.map((t) => ({ _id: t._id, name: t.name, result: rows[t._id]?.result ?? null })) : null,
    };
  },
  "fixes:board": (s) => {
    const c = cardOnTv(s);
    return c?.game === "fix" ? { card: c.key, teams: s.teams.length, scored: s.session.scored.includes(c.key), fixed: [] } : null;
  },
  "fixes:host": (s) => {
    const c = cardOnTv(s);
    if (c?.game !== "fix") return null;
    return {
      card: c.key,
      scored: s.session.scored.includes(c.key),
      teams: s.teams.map((t) => ({ _id: t._id, name: t.name, fixed: false, first: false, ms: null, code: null, result: null })),
    };
  },
  "puzzles:board": (s) => {
    const c = cardOnTv(s);
    if (c?.game !== "puzzle") return null;
    const teams = s.teams.map((t) => ({
      teamId: t._id,
      name: t.name,
      part1Ms: null,
      part2Ms: null,
      first1: false,
      first2: false,
      lockedUntil: null,
      result: null,
    }));
    return { card: c.key, scored: s.session.scored.includes(c.key), teams };
  },
  "puzzles:host": (s) => {
    const c = cardOnTv(s);
    return c?.game === "puzzle" ? { card: c.key, wrong: [] } : null;
  },
  "puzzles:answers": (s) => {
    const c = cardOnTv(s);
    return c?.game === "puzzle" ? { card: c.key, teams: [] } : null;
  },
  "wiki:board": (s) => {
    const sc = s.session?.screen;
    if (sc?.mode !== "wiki" || !sc.wikiFrom) return null;
    const key = `wiki:${sc.wikiFrom}>${sc.wikiTo}`;
    const [from, to] = wikiParts(key);
    const rows = s.wiki[key] ?? [];
    const scored = s.session.scored.includes(key);
    let place = 0;
    return {
      card: key,
      clicks: !!sc.wikiClicks,
      teams: s.teams.length,
      scored,
      from,
      to,
      finished: rows.map((r) => ({ ...r, place: r.ok === false ? null : ++place, result: r.result ?? null })),
      results: scored
        ? s.teams.map((t) => ({ teamId: t._id, name: t.name, result: rows.find((r) => r.teamId === t._id)?.result ?? null }))
        : null,
    };
  },
  "drawings:host": (s) => {
    if (!s.session) return null;
    const pool = s.players.filter((p) => p.teamId);
    const d = s.session.screen.drawing === undefined ? undefined : s.drawings.find((x) => x.n === s.session.screen.drawing);
    const drawn = new Set(s.drawings.map((x) => x.drawer));
    const next = pool.find((p) => !drawn.has(p._id));
    return {
      next: next && { _id: next._id, name: next.name },
      drawn: drawn.size,
      players: pool.map((p) => ({ _id: p._id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name)),
      current: d && {
        _id: d._id,
        key: d.key,
        n: d.n,
        word: d.word,
        drawer: d.drawer,
        drawerName: nameOf(s, d.drawer),
        rev: 0,
        over: s.session.scored.includes(d.key),
        got: d.got.length,
      },
    };
  },
  "drawings:board": (s) => {
    const d = drawingOnTv(s);
    if (!d) return null;
    const drawer = s.players.find((p) => p._id === d.drawer);
    return {
      _id: d._id,
      key: d.key,
      rev: 0,
      drawer: drawer?.name ?? "?",
      drawerTeam: drawer?.teamId ?? null,
      blanks: d.word.replace(/\S/g, "_"),
      word: s.session.scored.includes(d.key) ? d.word : null,
      guessing: s.teams.length - 1,
      got: [],
      scored: s.session.scored.includes(d.key),
      results: null,
    };
  },
  "drawings:inkBlocks": () => 0,
};

export function useQuery(reference, args) {
  useVersion();
  if (args === "skip") return undefined;
  const name = getFunctionName(reference);
  const query = QUERIES[name];
  if (!query) throw new Error(`Unconfigured local host query: ${name}`);
  return query(state, args);
}

export function useQueries(queries) {
  useVersion();
  return Object.fromEntries(Object.keys(queries).map((key) => [key, []]));
}

export const useConvexAuth = () => ({ isAuthenticated: true, isLoading: false });
export function useConvex() {
  return {
    query: () => Promise.reject(new Error("The host layout fixture has no one-off Convex queries.")),
  };
}

// Clerk: a signed-in officer, without loading Clerk.
export const useAuth = () => ({ isSignedIn: true, isLoaded: true });
export const Show = ({ when, children }) => (when === "signed-in" ? children : null);
export const SignInButton = ({ children }) => children;
export const SignOutButton = ({ children }) => children;
export const UserButton = forwardRef(function LocalUserButton(_, ref) {
  return (
    <span ref={ref} className="inline-grid size-8 place-items-center rounded-full bg-[#e8590c] font-bold text-white" aria-label="Account">
      J
    </span>
  );
});

// ---- Test controls, reached from the spec through window.__hostLayout ------------------------------------------

export function reset(name) {
  const make = SCENARIOS[name];
  if (!make) throw new Error(`Unknown host scenario ${name}`);
  failures = [];
  holds = [];
  state = make();
  emit();
}
reset("lobby");

window.__hostLayout = {
  scenarios: Object.keys(SCENARIOS),
  reset,
  snapshot: () => structuredClone({ ...state, live: live(state) }),
  calls: () => structuredClone(state.calls),
  rejected: () => structuredClone(state.rejected),
  /** The next call to `name` (after `skip` successful ones) rejects with `message`, as a failed server call would. */
  fail: (name, message = "Local failure", skip = 0) => void failures.push({ name, message, skip }),
  /** The next call to `name` waits until release(name), so a test can change the night in between. */
  hold: (name) => void holds.push({ name, taken: false }),
  release: (name) => {
    const h = holds.find((x) => x.name === name && x.release);
    if (!h) throw new Error(`No held call to ${name}`);
    holds = holds.filter((x) => x !== h);
    h.release();
  },
  pending: (name) => holds.filter((x) => x.name === name && x.release).length,
  /** A phone locks in an answer to the card on the TV. */
  answer: (teamId, pick) => {
    const c = cardOnTv(state);
    if (!c) throw new Error("No card on the TV");
    const rows = { ...(state.answers[c.key] ?? {}), [teamId]: { lockedAt: Date.now(), ...pick } };
    state = { ...state, answers: { ...state.answers, [c.key]: rows } };
    emit();
  },
  /** Someone scans the QR code; with auto teams they land on a team like the backend would put them. */
  join: (name) => {
    const p = { ...people(1)[0], _id: `att-${state.players.length + 1}`, name, email: `${name.toLowerCase()}@example.test` };
    let next = { ...state, players: [...state.players, p] };
    if (next.session.autoTeams) {
      const size = next.session.teamSize;
      const open = next.teams.find((t) => next.players.filter((x) => x.teamId === t._id).length < size);
      const t = open ?? {
        _id: `team-${next.teams.length + 1}`,
        name: size === 1 ? name : `Team ${next.teams.length + 1}`,
        score: 0,
        key: null,
      };
      if (!open) next = { ...next, teams: [...next.teams, t] };
      p.teamId = t._id;
    }
    state = next;
    emit();
  },
  /** Something changes on the night from another device, e.g. a second officer. */
  external: (name, args) => {
    const { result: _ignored, ...next } = MUTATIONS[name](state, args);
    state = next;
    emit();
  },
};
