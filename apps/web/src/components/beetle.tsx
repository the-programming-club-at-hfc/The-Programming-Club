// The Bug Hunt beetle: the Spooky Bugs poster's paper beetle with a magnifying glass, living in the code's line-number
// gutter on each player's screen. It wanders while the team hunts (at random, so it never gives the bug away), patrols
// the lines it points at once the team asks it (answers.askBeetle, which costs the early bonus), holds its magnifier
// up to the locked line, and at the reveal either jars the bug or scurries off.
//
// Bug Hunt's BugRound (components/answer.tsx) draws BeetleLayer over the code's rows (the `data-bug-code` wrapper, each
// row `data-line={n}`) and puts AskBeetle beside the code until the line is locked in. The join page's TeamAnswer sends
// the ask through PhoneRound's `onAsk`; the officer test page leaves it out, so its phone frame has the beetle but no
// button.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactElement, RefObject } from "react";
import { SPOOKY_ART } from "#/lib/spooky";
import { teamWords } from "#/lib/words";
import "./beetle.css";

interface Row {
  top: number;
  h: number;
}

/** Where the rows are inside the code wrapper, in its own (scrolling) coordinates. */
interface Layout {
  rows: Row[];
  /** The rows' left edge. */
  left: number;
  /** How wide the line-number gutter is: from the row's left edge to its first child's right edge. */
  gutter: number;
}

function measure(wrap: HTMLElement, lines: number): Layout | null {
  const box = wrap.getBoundingClientRect();
  const ox = box.left + wrap.clientLeft - wrap.scrollLeft;
  const oy = box.top + wrap.clientTop - wrap.scrollTop;
  const rows: Row[] = [];
  let left = Infinity;
  let gutter = 0;
  for (let n = 1; n <= lines; n++) {
    const el = wrap.querySelector(`[data-line="${n}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    rows.push({ top: Math.round(r.top - oy), h: Math.round(r.height) });
    left = Math.min(left, Math.round(r.left - ox));
    const num = el.firstElementChild?.getBoundingClientRect();
    if (num) gutter = Math.max(gutter, Math.round(num.right - r.left));
  }
  return { rows, left, gutter: Math.min(Math.max(gutter, 36), 64) };
}

const sameLayout = (a: Layout | null, b: Layout | null) => JSON.stringify(a) === JSON.stringify(b);

/** How far the beetle sits in from the rows' left edge, so its legs and tilted poses aren't cut off. */
const INSET = 5;

/** The beetle's size: fits the gutter (so it never covers code) and a row. */
const sizeOf = (l: Layout) =>
  Math.round(Math.min(Math.max(Math.min(l.gutter - INSET - 2, Math.min(...l.rows.map((r) => r.h)) * 1.05), 24), 44));

const center = (l: Layout, line: number) => {
  const r = l.rows[Math.min(Math.max(line, 1), l.rows.length) - 1];
  return r.top + r.h / 2;
};

type Plan =
  | { kind: "idle" }
  | { kind: "hint"; from: number; to: number }
  | { kind: "locked"; line: number }
  | { kind: "caught"; line: number }
  | { kind: "escaped" };

type Act = "rest" | "walk" | "scurry" | "sniff" | "hold" | "hop" | "gone";
type Face = "right" | "up" | "down";

function planOf(p: BeetleLayerProps): Plan {
  if (p.outcome === "escaped") return { kind: "escaped" };
  if (p.lockedLine !== undefined) return { kind: p.outcome === "caught" ? "caught" : "locked", line: p.lockedLine };
  if (p.hint) return { kind: "hint", from: p.hint[0], to: p.hint[1] };
  return { kind: "idle" };
}

/** The row next to the jar, where the beetle celebrates. */
const beside = (line: number, lines: number) => (line > 1 ? line - 1 : Math.min(line + 1, lines));

const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
/** A random line from..to other than `not`, if there's another. */
const randomLine = (from: number, to: number, not?: number) => {
  const all = Array.from({ length: to - from + 1 }, (_, i) => from + i).filter((n) => n !== not);
  return all.length ? all[Math.floor(Math.random() * all.length)] : from;
};

const SPEED = { walk: 70, patrol: 85, go: 120, scurry: 380 };

export interface BeetleLayerProps {
  /** The element wrapping the code rows: `position: relative` and `data-bug-code`, rows marked `data-line={n}`. */
  code: RefObject<HTMLElement | null>;
  /** How many lines the card has. */
  lines: number;
  /** The lines the beetle points at, from hintWindow(index), once the team asked it. */
  hint?: [number, number];
  /** The team's locked line (after the reveal, its line even if it never locked it). */
  lockedLine?: number;
  /** After the reveal: whether the team's line was the bug ("caught") or not, or it had none ("escaped"). */
  outcome?: "caught" | "escaped";
}

/** The beetle and its glow, absolutely positioned inside the code wrapper. Never blocks a tap on a row. */
export function BeetleLayer(props: BeetleLayerProps) {
  const { code, lines, hint, lockedLine, outcome } = props;
  const [layout, setLayout] = useState<Layout | null>(null);
  const beetle = useRef<HTMLDivElement>(null);
  const layoutRef = useRef(layout);
  const plan = planOf(props);

  // Measure the rows now and whenever the wrapper or any row changes size.
  useEffect(() => {
    const wrap = code.current;
    if (!wrap) return;
    const watched = new Set<Element>();
    const update = () => {
      // Rows can show up after the wrapper does, so pick up new ones each time.
      for (const el of wrap.querySelectorAll("[data-line]")) {
        if (watched.has(el)) continue;
        watched.add(el);
        ro.observe(el);
      }
      const next = measure(wrap, lines);
      if (!sameLayout(next, layoutRef.current)) setLayout((layoutRef.current = next));
    };
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    update();
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [code, lines]);

  // The walk engine: one requestAnimationFrame loop moving the beetle with transforms; CSS does the legs and poses.
  const planRef = useRef(plan);
  useEffect(() => {
    planRef.current = plan;
  });
  // It moves even when the computer asks for reduced motion: lab PCs often have animation effects off, like the TV.
  const moving = layout !== null;
  useEffect(() => {
    if (!moving) return;
    const el = beetle.current!;
    const s = {
      y: NaN,
      goal: 0 as number | "off",
      speed: SPEED.walk,
      phase: "walk" as "walk" | "wait" | "stay",
      until: 0,
      act: "" as Act,
      face: "" as Face,
      line: 0,
      plan: "",
    };
    const goalY = (l: Layout) => (s.goal === "off" ? -sizeOf(l) * 1.5 : center(l, s.goal));
    const walk = (goal: number | "off", speed: number) => Object.assign(s, { goal, speed, phase: "walk" });
    // Where to go next for the plan, from wherever the beetle is.
    const head = () => {
      const p = planRef.current;
      if (p.kind === "idle") walk(randomLine(1, lines, s.line), SPEED.walk);
      else if (p.kind === "hint") walk(randomLine(p.from, p.to, s.line), SPEED.patrol);
      else if (p.kind === "locked") walk(p.line, SPEED.go);
      else if (p.kind === "caught") walk(beside(p.line, lines), SPEED.go);
      else walk("off", SPEED.scurry);
    };
    const arrive = (t: number) => {
      const p = planRef.current;
      if (s.goal !== "off") s.line = s.goal;
      if (p.kind === "idle" || p.kind === "hint") {
        s.phase = "wait";
        s.until = t + (p.kind === "idle" ? between(1400, 3200) : between(700, 1400));
      } else s.phase = "stay";
    };
    const set = (act: Act, face: Face) => {
      if (act !== s.act) el.dataset.act = s.act = act;
      if (face !== s.face) el.dataset.face = s.face = face;
    };
    let last = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const l = layoutRef.current;
      if (!l) return;
      const dt = Math.min(t - last, 50) / 1000;
      last = t;
      const key = JSON.stringify(planRef.current);
      if (key !== s.plan) {
        s.plan = key;
        head();
      }
      const size = sizeOf(l);
      if (Number.isNaN(s.y)) s.y = -size; // Walks in from the top.
      const to = goalY(l);
      const p = planRef.current.kind;
      if (s.phase === "walk") {
        const d = to - s.y;
        const step = s.speed * dt;
        if (Math.abs(d) > step) {
          s.y += Math.sign(d) * step;
          set(p === "escaped" ? "scurry" : "walk", d > 0 ? "down" : "up");
        } else {
          s.y = to;
          arrive(t);
        }
      } else {
        s.y = to; // Rows can move under a resting beetle.
        if (s.phase === "wait" && t >= s.until) head();
        set(s.phase === "wait" ? "sniff" : p === "escaped" ? "gone" : p === "caught" ? "hop" : "hold", "right");
      }
      el.style.transform = `translate3d(${l.left + INSET}px, ${Math.round((s.y - size / 2) * 10) / 10}px, 0)`;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [moving, lines]);

  if (!layout) return null;
  const size = sizeOf(layout);
  const glow = hint && plan.kind !== "escaped" && plan.kind !== "caught" && rowsBox(layout, hint[0], hint[1]);
  const jar = outcome === "caught" && lockedLine !== undefined ? rowsBox(layout, lockedLine, lockedLine) : null;
  const jarSize = Math.round(size * 1.15);
  return (
    <div className="beetle-layer" aria-hidden style={{ "--beetle": `${size}px`, "--jar": `${jarSize}px` } as CSSProperties}>
      {glow && <div className="beetle-glow" style={{ left: layout.left, top: glow.top - 2, width: layout.gutter, height: glow.h + 4 }} />}
      {jar && (
        <div
          className="beetle-jar"
          style={
            {
              left: layout.left + INSET,
              top: jar.top + jar.h / 2 - jarSize / 2,
              "--jar-from": `${-(jar.top + jarSize * 2)}px`,
            } as CSSProperties
          }
        >
          <Art src={SPOOKY_ART.spider} fallback={<SpiderSvg />} className="beetle-caught" />
          <Art src={SPOOKY_ART.jar} fallback={<JarSvg />} />
        </div>
      )}
      <div
        ref={beetle}
        className="beetle"
        data-face="right"
        data-act="rest"
        style={{ transform: `translate3d(${layout.left + INSET}px, ${-size * 1.5}px, 0)` }}
      >
        <div className="beetle-turn">
          <div className="beetle-pose">
            <BeetleFrames />
          </div>
        </div>
      </div>
    </div>
  );
}

const rowsBox = (l: Layout, from: number, to: number) => {
  const a = l.rows.at(from - 1);
  const b = l.rows.at(to - 1);
  return a && b ? { top: a.top, h: b.top + b.h - a.top } : null;
};

/** The two walk frames, or a little drawn beetle if the art doesn't load. */
function BeetleFrames() {
  const [broken, setBroken] = useState(false);
  if (broken)
    return (
      <>
        <BeetleSvg step={1} />
        <BeetleSvg step={2} />
      </>
    );
  return (
    <>
      <img className="beetle-frame" src={SPOOKY_ART.beetle} alt="" draggable={false} onError={() => setBroken(true)} />
      <img className="beetle-frame" src={SPOOKY_ART.beetleStep} alt="" draggable={false} onError={() => setBroken(true)} />
    </>
  );
}

function Art({ src, fallback, className }: { src: string; fallback: ReactElement; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <span className={className}>{fallback}</span>;
  return <img className={className} src={src} alt="" draggable={false} onError={() => setBroken(true)} />;
}

const INK = "#2a1d12";
const PAPER = "#f4ead2";

/** A paper beetle facing right, holding its magnifier out front; `step` picks the leg pose. */
function BeetleSvg({ step }: { step: 1 | 2 }) {
  const legs = step === 1 ? "M15 30 11 38M23 31v8M31 30l4 8" : "M15 30l4 8M23 31l-4 8M31 30l-1 9";
  return (
    <svg className="beetle-frame" viewBox="8 9 40 32" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round">
      <path d={legs} />
      <path d="M38 22q2-7 7-8" />
      <ellipse cx="22" cy="25" rx="13" ry="9" fill={PAPER} />
      <path d="M11 25q11-5 24-2" />
      <circle cx="36" cy="27" r="5" fill={PAPER} />
      <path d="M39 31l3-3" strokeWidth={2.5} />
      <circle cx="44" cy="25" r="3.5" fill="#bfe3f2" fillOpacity={0.6} />
    </svg>
  );
}

function JarSvg() {
  return (
    <svg viewBox="0 0 40 48" fill="none" stroke="#e8f4f8" strokeWidth={2}>
      <rect x="12" y="2" width="16" height="7" rx="2" fill="#b07a4a" stroke={INK} />
      <path d="M10 10h20v4q5 2 5 8v18q0 6-6 6H11q-6 0-6-6V22q0-6 5-8z" fill="#dff1f8" fillOpacity={0.25} />
      <path d="M10 22v14" strokeOpacity={0.7} strokeLinecap="round" />
    </svg>
  );
}

function SpiderSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={PAPER} strokeWidth={1.5} strokeLinecap="round">
      <path d="M8 10 3 7M8 12H2M8 14l-5 3M9 16l-3 5M16 10l5-3M16 12h6M16 14l5 3M15 16l3 5" />
      <circle cx="12" cy="13" r="4.5" fill={INK} />
      <circle cx="12" cy="8" r="2.5" fill={INK} />
    </svg>
  );
}

const range = ([from, to]: [number, number]) => (from === to ? `line ${from}` : `lines ${from}–${to}`);

/**
 * "Ask the beetle": it points at a few lines with the bug among them, for the whole team, at the cost of the early
 * bonus. Asks once more before going through. Only before the line is locked and while answers are open.
 */
export function AskBeetle({
  asked,
  askedBy,
  hint,
  lineLocked,
  open,
  onAsk,
  solo,
}: {
  /** Someone on the team asked already. */
  asked: boolean;
  askedBy?: string;
  /** The beetle's lines, from hintWindow(index), to say in words once asked. */
  hint?: [number, number];
  lineLocked: boolean;
  open: boolean;
  onAsk: () => void;
  solo?: boolean;
}) {
  const w = teamWords(solo);
  const [sure, setSure] = useState(false);
  if (asked)
    return (
      <p className="mt-4 rounded-[6px] bg-sun/15 px-4 py-3 font-semibold" role="status">
        {w.who(askedBy, w.You)} asked the beetle.{hint && ` It’s pointing at ${range(hint)}.`}
      </p>
    );
  const off = lineLocked || !open;
  return (
    <div className="mt-4">
      {sure && !off ? (
        <div className="flex gap-2">
          <button
            className="btn btn-primary flex-1"
            onClick={() => {
              setSure(false);
              onAsk();
            }}
          >
            Ask, no early bonus
          </button>
          <button className="btn" onClick={() => setSure(false)}>
            Never mind
          </button>
        </div>
      ) : (
        <button className="btn w-full" disabled={off} onClick={() => setSure(true)}>
          Ask the beetle
        </button>
      )}
      <p className="mt-2 text-center text-sm text-dim">
        {lineLocked
          ? "The beetle only helps before a line is locked in."
          : !open
            ? "Answers are closed."
            : `It points out a few lines, the bug among them. Costs ${w.you} the early bonus point.`}
      </p>
    </div>
  );
}
