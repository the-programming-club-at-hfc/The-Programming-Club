// Tech Pictionary's shared drawing surface, used by the drawer's phone, the officer tablet (/hello-world/draw), and
// read-only by the TV and the guessers' phones, plus the join screen's drawing round. See convex/drawings.ts.
import { useMutation, useQueries, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { memo, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ordinal } from "./ui";
import { COLORS, GUESS_MAX, H, MAX_INK_POINTS, SIZES, W, inkPath } from "#/lib/draw";
import { answersOpen, drawKey } from "#/lib/grading";
import { teamWords } from "#/lib/words";

type Live = NonNullable<FunctionReturnType<typeof api.sessions.live>>;
type Ink = FunctionReturnType<typeof api.drawings.inkBlock>[number];

const COLOR_NAMES = ["Black", "Red", "Blue", "Green", "Orange", "Purple"];

const errorText = (e: unknown) => (e instanceof ConvexError ? String(e.data) : "That didn’t go through. Check your connection.");

/** One block of ink rows. Memoized, so drawing and new rows elsewhere don't redraw it. */
const InkRows = memo(function InkRows({ rows }: { rows: Ink[] }) {
  return rows.map((r) => <path key={r._id} d={inkPath(r.points)} stroke={r.color} strokeWidth={r.size} />);
});

/** A stroke being drawn on this device: its points, and how many of them have gone to the server. */
type Stroke = { id: string; pointer: number; touch: boolean; color: string; size: number; points: number[]; sent: number };

/**
 * The 4:3 canvas. With `edit`, it takes finger, mouse, and pen: this device's ink shows at once and goes to the server
 * about every 100ms, so the TV draws live. The drawer's phone passes its `token`; the officer tablet is signed in instead.
 * `rev` is the drawing's word revision: give the canvas a key with it, so a new word starts a fresh canvas.
 */
export function Sketch({
  drawingId,
  token,
  rev = 0,
  edit = false,
  className = "",
  canvasClass = "aspect-[4/3] w-full border-[1.5px] border-line",
  toolsClass = "mt-2 flex flex-wrap items-center gap-2",
}: {
  drawingId: Id<"drawings">;
  token?: string;
  rev?: number;
  edit?: boolean;
  className?: string;
  canvasClass?: string;
  toolsClass?: string;
}) {
  const send = useMutation(api.drawings.ink);
  const undo = useMutation(api.drawings.undo);
  const clear = useMutation(api.drawings.clear);
  const who = token ? { token } : {};
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [error, setError] = useState("");
  // Finished strokes from this device, shown until the server has them all.
  const [mine, setMine] = useState<{ id: string; color: string; size: number; points: number[]; saved: boolean }[]>([]);
  // Every stroke this device drew, oldest first: Undo takes back this device's own, never another's.
  const [own, setOwn] = useState<string[]>([]);
  // Strokes the server turned down (often at time-up): never shown here again, so this device matches the TV.
  const failed = useRef(new Set<string>());
  const svg = useRef<SVGSVGElement>(null);
  const live = useRef<SVGPathElement>(null);
  const cur = useRef<Stroke | null>(null);
  const tick = useRef<ReturnType<typeof setInterval>>(undefined);
  const lastSend = useRef<Promise<unknown>>(Promise.resolve());
  // Once a pen has drawn here, touches are a resting palm, not ink.
  const pen = useRef(false);

  // Every ink row, block by block: a new row only resends the last block.
  const count = useQuery(api.drawings.inkBlocks, { drawingId }) ?? 0;
  const res = useQueries(
    Object.fromEntries(Array.from({ length: count }, (_, b) => [b, { query: api.drawings.inkBlock, args: { drawingId, block: b } }])),
  );
  const blocks = Array.from({ length: count }, (_, b): unknown => res[b]).map((r) => (Array.isArray(r) ? (r as Ink[]) : null));
  const saved = new Set(blocks.flatMap((b) => b?.map((r) => r.stroke) ?? []));
  const pending = mine.filter((m) => !(m.saved && saved.has(m.id)));
  // Strokes the server has are its to show (or to undo, from any device), so they go from here for good.
  useEffect(() =>
    setMine((m) => {
      const left = m.filter((x) => !(x.saved && saved.has(x.id)));
      return left.length === m.length ? m : left;
    }),
  );

  // iOS can still scroll or zoom from a touch on the canvas, so stop touches there outright. Pointer events still come.
  useEffect(() => {
    const el = svg.current;
    if (!el || !edit) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    el.addEventListener("touchstart", stop, { passive: false });
    el.addEventListener("touchmove", stop, { passive: false });
    return () => {
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("touchmove", stop);
    };
  }, [edit]);
  useEffect(() => () => clearInterval(tick.current), []);

  const point = (e: { clientX: number; clientY: number }) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return [Math.round(Math.min(W, Math.max(0, p.x))), Math.round(Math.min(H, Math.max(0, p.y)))];
  };

  // Sends what's new in the stroke, starting from the last point sent so the rows join up.
  const flush = () => {
    const c = cur.current;
    if (!c || c.points.length <= c.sent) return;
    const points = c.points.slice(Math.max(0, c.sent - 2));
    c.sent = c.points.length;
    lastSend.current = send({ drawingId, ...who, rev, stroke: c.id, color: c.color, size: c.size, points }).catch((e: unknown) => {
      setError(errorText(e));
      failed.current.add(c.id);
      setMine((m) => m.filter((x) => x.id !== c.id));
    });
  };

  // Stops the stroke being drawn without finishing it, and returns it.
  const drop = () => {
    const c = cur.current;
    clearInterval(tick.current);
    cur.current = null;
    live.current?.setAttribute("d", "");
    return c;
  };
  // Pens down: time's up or the drawing is over, so a stroke still being drawn goes no further.
  useEffect(() => {
    if (!edit) drop();
  }, [edit]);

  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!edit || e.button > 0 || (e.pointerType === "touch" && pen.current)) return;
    if (e.pointerType === "pen") {
      pen.current = true;
      // A palm that landed before the pen gives way to it: its stroke goes, here and on the server.
      const palm = cur.current?.touch ? drop() : null;
      if (palm?.sent) undo({ drawingId, ...who, stroke: palm.id }).catch(() => undefined);
    }
    if (cur.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setError("");
    const touch = e.pointerType === "touch";
    cur.current = { id: Math.random().toString(36).slice(2, 10), pointer: e.pointerId, touch, color, size, points: point(e), sent: 0 };
    live.current?.setAttribute("d", inkPath(cur.current.points));
    tick.current = setInterval(flush, 100);
  };

  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const c = cur.current;
    if (!c || e.pointerId !== c.pointer) return;
    // Every point the pointer passed since the last event, where the browser keeps them (older Safari doesn't).
    const evs = "getCoalescedEvents" in e.nativeEvent ? e.nativeEvent.getCoalescedEvents() : [];
    for (const ev of evs.length ? evs : [e.nativeEvent]) {
      const [x, y] = point(ev);
      const n = c.points.length;
      if (Math.hypot(x - c.points[n - 2], y - c.points[n - 1]) >= 2) c.points.push(x, y);
    }
    live.current?.setAttribute("d", inkPath(c.points));
    if (c.points.length - c.sent >= MAX_INK_POINTS - 100) flush();
  };

  const up = (e: React.PointerEvent<SVGSVGElement>) => {
    const c = cur.current;
    if (!c || e.pointerId !== c.pointer) return;
    clearInterval(tick.current);
    flush();
    cur.current = null;
    live.current?.setAttribute("d", "");
    setOwn((o) => [...o, c.id]);
    if (failed.current.has(c.id)) return;
    setMine((m) => [...m, { id: c.id, color: c.color, size: c.size, points: c.points, saved: false }]);
    void lastSend.current.then(() => setMine((m) => m.map((x) => (x.id === c.id ? { ...x, saved: true } : x))));
  };

  // This device's last stroke still on the canvas (here or on the server), for Undo.
  const last = own.filter((id) => saved.has(id) || mine.some((m) => m.id === id)).at(-1);
  // Undo or clear: the strokes go from this device at once, saved or still on their way; the server drops any late ink.
  const act = (p: Promise<unknown>, ids?: string[]) => {
    setError("");
    setMine((m) => (ids ? m.filter((x) => !ids.includes(x.id)) : []));
    if (!ids) setOwn([]);
    p.catch((e: unknown) => setError(errorText(e)));
  };

  return (
    <div className={className}>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className={`block ${canvasClass} ${edit ? "cursor-crosshair touch-none select-none [-webkit-touch-callout:none]" : ""}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        role="img"
        aria-label="The drawing"
      >
        <rect width={W} height={H} fill="#fff" />
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {blocks.map((b, i) => b && <InkRows key={i} rows={b} />)}
          {pending.map((m) => (
            <path key={m.id} d={inkPath(m.points)} stroke={m.color} strokeWidth={m.size} />
          ))}
          <path ref={live} stroke={color} strokeWidth={size} />
        </g>
      </svg>
      {edit && (
        <div className={toolsClass}>
          {COLORS.map((c) => (
            <button
              key={c}
              className={`size-11 shrink-0 rounded-full ${c === color ? "ring-4 ring-sky ring-offset-2" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={COLOR_NAMES[COLORS.indexOf(c)]}
              aria-pressed={c === color}
            />
          ))}
          {SIZES.map((s) => (
            <button
              key={s}
              className={`btn btn-sm size-11 shrink-0 p-0 ${s === size ? "btn-on" : ""}`}
              onClick={() => setSize(s)}
              aria-label={`Brush ${SIZES.indexOf(s) + 1} of ${SIZES.length}`}
              aria-pressed={s === size}
            >
              <span className="rounded-full bg-current" style={{ width: s / 2 + 2, height: s / 2 + 2 }} />
            </button>
          ))}
          <button className="btn btn-sm" disabled={!last} onClick={() => last && act(undo({ drawingId, ...who, stroke: last }), [last])}>
            Undo
          </button>
          <button
            className="btn btn-sm"
            onClick={() => confirm("Clear the whole drawing?") && act(clear({ drawingId, ...who, mine: own.slice(-50) }))}
          >
            Clear
          </button>
          {error && <p className="w-full text-sm font-semibold text-signal">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** Whether a drawing on the TV still takes ink, skips, and guesses: the server's rule, with no grace. */
export const drawOpen = (live: Live, key: string, remaining: number) =>
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

/** The word as blanks: one underline per letter, word by word, so a line only ever breaks between words. Sized by the font size. */
export function Blanks({ text, className = "" }: { text: string; className?: string }) {
  return (
    <p
      className={`flex flex-wrap items-end gap-x-[0.5em] gap-y-[0.3em] ${className}`}
      aria-label={`${text.replace(/[^_]/g, "").length} letters`}
    >
      {text.split(" ").map((word, i) => (
        <span key={i} className="inline-flex items-end whitespace-nowrap">
          {word.split("").map((c, j) =>
            c === "_" ? (
              <span key={j} className="mx-[0.06em] inline-block h-[1em] w-[0.6em] border-b-[0.12em] border-current" />
            ) : (
              <span key={j} className="inline-block w-[0.45em] text-center leading-none">
                {c}
              </span>
            ),
          )}
        </span>
      ))}
    </p>
  );
}

/** The join screen while a drawing is up: the drawer gets the word and the canvas; everyone else watches and guesses. */
export function PhoneDraw({
  token,
  live,
  open,
  playing,
  officer,
}: {
  token: string;
  live: Live;
  open: boolean;
  playing: boolean;
  officer: boolean;
}) {
  const board = useQuery(api.drawings.board);
  const me = useQuery(api.drawings.mine, { token });
  const skip = useMutation(api.drawings.skip);
  const [error, setError] = useState("");
  const key = drawKey(live.screen.drawing ?? 0);
  const b = board?.key === key ? board : null;
  const m = me?.key === key ? me : null;
  const w = teamWords(live.teamSize === 1);
  if (!b) return null;
  const done = !!live.screen.revealed || b.scored;
  const result = done && m?.points ? `+${m.points}` : null;

  if (m?.drawer)
    return (
      <div className="space-y-3">
        <div className="rounded-[10px] bg-sun p-5 text-[#12332b]" role="status">
          <p className="font-semibold">{done ? "You drew" : "You’re drawing. Don’t say it!"}</p>
          <p className="mt-1 text-4xl leading-none font-extrabold tracking-[-0.03em] break-words">{m.word}</p>
          {result && <p className="mt-2 text-2xl font-extrabold">{result}</p>}
          {open && b.got.length === 0 && (
            <button
              className="btn btn-sm mt-3"
              onClick={() => skip({ drawingId: b._id, token }).catch((e: unknown) => setError(errorText(e)))}
            >
              Skip this word
            </button>
          )}
          {error && <p className="mt-2 text-sm font-semibold">{error}</p>}
        </div>
        <Sketch key={`${b._id}:${b.rev}`} drawingId={b._id} token={token} rev={b.rev} edit={open} />
        {!done && (
          <p className="text-sm text-dim">
            Draw here, or walk up to the officer tablet: it draws on this same picture. No letters, numbers, or symbols.
            {b.got.length > 0 && ` ${b.got.length} of ${b.guessing} got it so far.`}
          </p>
        )}
      </div>
    );

  const got = m?.place ? `${w.You} got it! ${ordinal(m.place)}${m.by ? ` (${m.by})` : ""}` : null;
  const status = got ?? (m?.teammate ? `${b.drawer} is drawing for ${w.you}` : done && playing ? "Not this time" : null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <p className="font-semibold">{done ? "The word was" : `${b.drawer} is drawing`}</p>
        {done && b.word ? (
          <p className="w-full text-4xl leading-none font-extrabold tracking-[-0.03em] break-words">{b.word}</p>
        ) : (
          <Blanks text={b.blanks} className="w-full text-3xl font-extrabold" />
        )}
      </div>
      {status && (
        <div className={`rounded-[10px] p-5 ${got ? "bg-meadow text-[#12332b]" : "bg-mist"}`} role="status">
          <p className="text-3xl leading-none font-extrabold tracking-[-0.03em]">{status}</p>
          {result && <p className="mt-2 text-2xl font-extrabold">{result}</p>}
          {m?.teammate && !done && <p className="mt-2 font-semibold">Sit this one out and cheer them on.</p>}
        </div>
      )}
      <Sketch key={b._id} drawingId={b._id} />
      {officer && !done ? (
        <p className="text-sm text-dim">Officers see the word, so you draw but don’t guess.</p>
      ) : (
        playing &&
        m &&
        !m.teammate &&
        !got &&
        !done &&
        (open ? <GuessBox token={token} card={key} /> : <p className="font-semibold">Time’s up.</p>)
      )}
    </div>
  );
}

/** Type a guess. Wrong guesses stay on this phone; "So close!" is only for you. */
function GuessBox({ token, card }: { token: string; card: string }) {
  const guess = useMutation(api.drawings.guess);
  const [text, setText] = useState("");
  const [note, setNote] = useState<{ text: string; tone: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const sent = text;
      const r = await guess({ token, card, text: sent });
      // Keep anything typed while the answer was on its way.
      if (r !== "right") setText((t) => (t === sent ? "" : t));
      setNote(
        r === "close"
          ? { text: `So close! “${text.trim()}” isn’t quite it.`, tone: "bg-sun text-[#12332b]" }
          : r === "wrong"
            ? { text: `Not “${text.trim()}”.`, tone: "bg-mist" }
            : null,
      );
    } catch (err) {
      setNote({ text: errorText(err), tone: "bg-signal/10 text-signal" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex gap-2">
        <input
          className="field min-w-0 flex-1 text-lg"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={GUESS_MAX}
          placeholder="Your guess"
          aria-label="Your guess"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="send"
        />
        <button className="btn btn-primary" disabled={busy || !text.trim()}>
          Guess
        </button>
      </div>
      {note && (
        <p className={`rounded-[6px] px-4 py-2 font-semibold ${note.tone}`} role="status">
          {note.text}
        </p>
      )}
    </form>
  );
}
