import { useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { fmtClock } from "./game";
import { Code } from "./ui";
import { SPOOKY_ART } from "#/lib/spooky";
import type { Bug, Level } from "#/lib/types";
import "./haunted.css";

// Spooky Bugs on the TV. Everyone reads the Bug Hunt card on their own computer, so while it's open the TV shows no
// code: just the poster come alive, its moon sinking with the clock and a bat for every team that locks in. The code
// comes back big on the reveal, for the host to talk over. Like the kickoff deck, it moves even with reduced motion
// on: it's a shared display, run from machines that often have animations off.

export type Lock = { _id: string; name: string; lineAt: number | null; fixAt: number | null };
type Locks = NonNullable<FunctionReturnType<typeof api.haunted.locks>>;
export type HauntResult = {
  _id: string;
  name: string;
  result: { points: number; correct: boolean; line?: boolean; fix?: boolean } | null;
};

/**
 * Each team's lock times on the Bug Hunt card `card`, or null. Read through the client rather than `useQuery`, so a
 * deployment without haunted.locks yet only costs the bats, never the TV.
 */
export function useLocks(card: string | null) {
  const convex = useConvex();
  const [locks, setLocks] = useState<Locks["teams"] | null>(null);
  useEffect(() => {
    setLocks(null);
    if (!card) return;
    const watch = convex.watchQuery(api.haunted.locks, {});
    const read = () => {
      try {
        const r = watch.localQueryResult();
        setLocks(r?.card === card ? r.teams : null);
      } catch {
        setLocks(null);
      }
    };
    read();
    return watch.onUpdate(read);
  }, [convex, card]);
  return locks;
}

/** A piece of the poster's paper art. If its file is missing, `fallback` instead (or nothing): never a broken image. */
export function Art({ src, className, fallback = null }: { src: string; className?: string; fallback?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // One that failed before React was listening (a page rendered on the server) counts too.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed) return fallback;
  return <img ref={ref} src={src} alt="" draggable={false} decoding="async" className={className} onError={() => setFailed(true)} />;
}

export const BatFrames = () => (
  <div className="frames">
    <Art src={SPOOKY_ART.bat} />
    <Art src={SPOOKY_ART.batDown} />
  </div>
);

const LEVEL_CHIP: Record<Level, string> = {
  easy: "bg-[#2f6a6a] text-[#f6efe0]",
  medium: "bg-[var(--haunt-moon)] text-[var(--haunt-ink)]",
  hard: "bg-[var(--haunt-orange)] text-[#f6efe0]",
};

/** The card's name, poster style: the last word in orange, like "spooky bugs". */
export function Title({ name, className, style }: { name: string; className: string; style?: CSSProperties }) {
  const cut = name.lastIndexOf(" ");
  return (
    <h2 className={`lowercase ${className}`} style={style}>
      {name.slice(0, cut + 1)}
      <span className="text-[var(--haunt-orange)]">{name.slice(cut + 1)}</span>
    </h2>
  );
}

const Chips = ({ bug, className }: { bug: Bug; className: string }) => (
  <p className={`flex items-center gap-[0.6cqw] font-bold ${className}`}>
    <span className="haunt-chip rounded-[4px] px-[0.7cqw] py-[0.15cqw]">{bug.lang ?? "Python"}</span>
    <span className={`rounded-[4px] px-[0.7cqw] py-[0.15cqw] capitalize ${LEVEL_CHIP[bug.level]}`}>{bug.level}</span>
  </p>
);

type HuntProps = {
  card: string;
  bug: Bug;
  kicker: string;
  remaining: number;
  durationMs: number;
  running: boolean;
  revealed: boolean;
  locks: Lock[] | null;
  locked: { locked: number; teams: number } | null;
  results: HauntResult[] | null;
  teamsWord: string;
};

/**
 * The haunted Bug Hunt card. `kicker` is its round and place in it, like "round 2 · snippet 1 of 4". `locks` drive
 * the bats; without them, `locked` (from answers.board) still says how many are in. On `revealed`, the code.
 */
export function HauntedHunt(props: HuntProps) {
  return props.revealed ? <Reveal key={props.card} {...props} /> : <Night key={props.card} {...props} />;
}

// Where bats hover, in the order teams lock their lines: under the title, in the sky between the moon and the tree
// tops, clear of the clock, the spider's corner, and the perches, a tag's width apart. A night of more than 10 teams
// gets smaller bats and more, tighter places.
const ROOMY = [
  [37, 48],
  [62.5, 58],
  [20, 48],
  [71, 46],
  [45.5, 58],
  [54, 48],
  [90, 62],
  [78, 68],
  [28.5, 58],
  [76, 36],
];
const CROWD = [
  ...[20, 33, 46, 59, 72].map((x) => [x, 48]),
  ...[39.5, 52.5, 65.5].map((x) => [x, 56]),
  ...[33, 56, 69, 82].map((x) => [x, 65]),
  [77, 37],
];
const skyAt = (n: number, crowd: boolean) => {
  const slots = crowd ? CROWD : ROOMY;
  // Crowded, every 7th place in turn (13 places, so that's each once), so the first few spread out; past the last
  // place, round again a little lower.
  const [x, y] = slots[crowd ? (n * 7) % slots.length : n % slots.length];
  const lap = Math.floor(n / slots.length);
  return { x: x + lap * 3, y: `${y + lap * 2}cqh` };
};

// The pine tips that clear the ridge, measured from pines.webp's alpha: x in % of its width, height in % of its
// height. Bats take them tallest first, then spread out. The art spans the scene's width at 4:1, so a tip's height
// on screen is that % of 25cqw.
const TIPS = [
  [12.17, 96],
  [46.04, 64.3],
  [88.96, 45.5],
  [28.42, 70.7],
  [63.08, 46.5],
  [37, 54.2],
  [5.04, 71.2],
  [52.83, 41.7],
  [22.54, 75.3],
  [95, 25.5],
  [58.17, 43.5],
  [42, 42.3],
  [71.25, 37.7],
  [33.33, 37.7],
  [85.17, 33.8],
];
type Perch = { x: number; y: string; row: number; tag: number };
/**
 * Where each of `total` teams' bats sit, in the order they lock their fixes: one on each tree tip (past the last
 * tip, round again lower down the branches). Each name tag hangs under its bat, a row or two lower when that leaves
 * it more room, and no wider than keeps it clear of the other bats and tags. All in cqw, up from the bottom.
 */
function perches(total: number, size: number): Perch[] {
  const h = size * 0.25 * 1.5; // a tag's height
  const cap = size > 5 ? 17 : 12;
  const all = Array.from({ length: total }, (_, n) => {
    const [x, up] = TIPS[n % TIPS.length];
    const lap = Math.floor(n / TIPS.length);
    return { x: x + lap * 1.5, up: (up - lap * 12) / 4, row: 0 };
  });
  type P = (typeof all)[number];
  // A perched bat's box is half as tall as it's wide, its feet 74% of the way down; its tag hangs from the box.
  const top = (p: P, row: number) => p.up - 0.13 * size - row * 1.15 * h;
  const clash = (lo: number, hi: number, lo2: number, hi2: number) => lo < hi2 && lo2 < hi;
  const room = (p: P, row: number) =>
    all.reduce(
      (w, q) => {
        if (q === p) return w;
        const dx = Math.abs(p.x - q.x);
        const t = top(p, row);
        if (clash(t - h, t, q.up - 0.13 * size, q.up + 0.37 * size)) w = Math.min(w, 2 * (dx - 0.4 * size));
        if (clash(t - h, t, top(q, q.row) - h, top(q, q.row))) w = Math.min(w, dx - 0.6);
        return w;
      },
      Math.min(cap, 2 * Math.min(p.x, 100 - p.x) - 0.6),
    );
  // Twice across, so each row is picked knowing its neighbours' on both sides.
  const byX = [...all].sort((a, b) => a.x - b.x);
  for (const p of [...byX, ...byX]) p.row = [1, 2].reduce((best, r) => (room(p, r) > room(p, best) + 1 ? r : best), 0);
  return all.map((p) => ({ x: p.x, y: `calc(100cqh - ${p.up}cqw)`, row: p.row, tag: Math.max(4, room(p, p.row)) }));
}

// Bats crossing the sky behind the trees, just for the night: height, seconds per crossing, start, size.
const FLYBYS = [
  { y: 42, t: 27, d: -6, size: 3 },
  { y: 56, t: 38, d: -21, size: 2.2 },
];

function Night({ bug, kicker, remaining, durationMs, running, locks, locked, teamsWord }: HuntProps) {
  const over = durationMs > 0 && remaining === 0;
  const ending = running && remaining <= 10_000;
  const p = durationMs > 0 ? 1 - remaining / durationMs : 0;

  const total = locks?.length ?? 0;
  const lined = (locks ?? []).filter((l) => l.lineAt !== null).sort((a, b) => a.lineAt! - b.lineAt!);
  const fixed = lined.filter((l) => l.fixAt !== null).sort((a, b) => a.fixAt! - b.fixAt!);
  const crowd = total > 10;
  const size = crowd ? 5 : 7;
  const perched = perches(total, size);

  return (
    <div className={`haunt absolute inset-0 ${ending || over ? "haunt-dark" : ""}`}>
      <div className="haunt-layer haunt-dusk" />
      <div className="haunt-layer haunt-moon" style={{ "--p": Math.min(1, Math.max(0, p)) } as CSSProperties}>
        <Art src={SPOOKY_ART.moon} fallback={<div className="haunt-moon-disc" />} />
      </div>
      {FLYBYS.map((f, i) => (
        <div
          key={i}
          className="haunt-layer haunt-flyby"
          style={{ "--y": `${f.y}cqh`, "--t": `${f.t}s`, "--d": `${f.d}s` } as CSSProperties}
        >
          <div>
            <div className="haunt-bat" style={{ "--bat": `${f.size}cqw`, "--flap": "0.3s" } as CSSProperties}>
              <BatFrames />
            </div>
          </div>
        </div>
      ))}
      <div className="haunt-layer haunt-fog back">
        <Art src={SPOOKY_ART.fog} />
        <Art src={SPOOKY_ART.fog} />
      </div>
      <div className="haunt-layer haunt-ground haunt-pines">
        <div className="h-full">
          <Art src={SPOOKY_ART.pines} />
        </div>
      </div>
      <div className="haunt-layer haunt-fog">
        <Art src={SPOOKY_ART.fog} />
        <Art src={SPOOKY_ART.fog} />
      </div>
      <div className="haunt-layer haunt-ground haunt-ridge">
        <div className="h-full">
          <Art src={SPOOKY_ART.ridge} fallback={<div className="haunt-hill" />} />
        </div>
      </div>

      {lined.map((l, n) => {
        const j = fixed.indexOf(l);
        return (
          <TeamBat
            key={l._id}
            name={l.name}
            at={j === -1 ? skyAt(n, crowd) : perched[j]}
            perched={j !== -1}
            size={size}
            tag={j === -1 ? (crowd ? 12 : 17) : perched[j].tag}
            row={j === -1 ? 0 : perched[j].row}
            n={n}
          />
        );
      })}
      {fixed.length > 0 && <Spider key={fixed[0]._id} name={fixed[0].name} />}

      {/* No wider than 50cqw: the moon's path starts just right of it. */}
      <div className="haunt-text absolute top-[3cqw] left-[3.6cqw] z-10 max-w-[50cqw]">
        <p className="haunt-kicker text-[1.4cqw] font-semibold">{kicker}</p>
        <Title name={bug.name ?? "bug hunt"} className="mt-[0.5cqw] text-[5.6cqw] leading-[0.92] tracking-[-0.045em]" />
        <div className="mt-[1cqw] flex flex-wrap items-center gap-x-[1.4cqw] gap-y-[0.4cqw]">
          <Chips bug={bug} className="text-[1.5cqw]" />
          <p className="text-[2.2cqw] leading-tight font-extrabold tracking-[-0.02em]">Find the bug on your computer</p>
        </div>
        {bug.context && <p className="haunt-dim mt-[0.3cqw] text-[1.45cqw] leading-snug text-[var(--haunt-dim)]">{bug.context}</p>}
      </div>

      <div className="haunt-text absolute top-[2cqw] right-[3.6cqw] z-10 text-right">
        <p
          className={`narrow text-[11cqw] leading-[0.85] font-extrabold transition-colors duration-700 ${ending || over ? "text-[var(--haunt-orange)]" : ""}`}
        >
          {over && running ? "time" : fmtClock(remaining)}
        </p>
        <p className="haunt-kicker mt-[0.4cqw] text-[1.5cqw] font-bold">
          {locks
            ? `${fixed.length} of ${total} ${teamsWord} done`
            : locked && locked.teams > 0
              ? `${locked.locked} of ${locked.teams} ${teamsWord} locked in`
              : ""}
        </p>
      </div>
    </div>
  );
}

/**
 * A team's bat. It flies in when the team locks its line and hovers; when the fix is locked it flies down to its
 * place on the tree line. Moves are FLIP: it jumps to its new spot and a transform carries it there from the old one.
 */
function TeamBat({
  name,
  at,
  perched,
  size,
  tag,
  row,
  n,
}: {
  name: string;
  at: { x: number; y: string };
  perched: boolean;
  size: number;
  tag: number;
  row: number;
  n: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Layout offsets, not the box on screen, so a flight still under way doesn't throw the next one off.
    const now = { x: el.offsetLeft, y: el.offsetTop };
    const was = last.current;
    last.current = now;
    if (!was) {
      // In from whichever side is nearer, swooping down.
      const from = at.x < 50 ? -at.x - 12 : 112 - at.x;
      el.animate(
        [
          { transform: `translate(${from}cqw, -30cqh) scale(0.5)` },
          { transform: `translate(${from * 0.3}cqw, 6cqh) scale(0.9)`, offset: 0.6 },
          { transform: "none" },
        ],
        { duration: 2000, easing: "cubic-bezier(0.3, 0.6, 0.3, 1)" },
      );
    } else if (was.x !== now.x || was.y !== now.y) {
      const dx = was.x - now.x;
      const dy = was.y - now.y;
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 30}px)`, offset: 0.5 },
          { transform: "translate(0, -6px)", offset: 0.85 },
          { transform: "none" },
        ],
        { duration: 1700, easing: "ease-in-out" },
      );
    }
  }, [at.x, at.y]);
  return (
    <div
      ref={ref}
      className={`haunt-layer haunt-team ${perched ? "haunt-perched" : "haunt-hover"}`}
      style={{ left: `${at.x}cqw`, top: at.y }}
    >
      <div
        className="haunt-bat"
        style={
          {
            "--bat": `${size}cqw`,
            "--loop": `${4.6 + (n % 4) * 0.7}s`,
            "--loop-at": `${-n * 1.3}s`,
            "--flap": `${0.3 + (n % 3) * 0.04}s`,
          } as CSSProperties
        }
      >
        <BatFrames />
        <span
          className="haunt-tag"
          style={
            { maxWidth: `${tag}cqw`, fontSize: `${size * 0.25}cqw`, "--tilt": `${((n * 7) % 5) - 2}deg`, "--row": row } as CSSProperties
          }
        >
          {name}
        </span>
      </div>
    </div>
  );
}

/** The first team to lock both: a spider drops from the clock on its thread, with their name. */
function Spider({ name }: { name: string }) {
  const thread = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const drop = { duration: 1500, easing: "cubic-bezier(0.5, 0, 0.3, 1.4)" };
    thread.current?.animate([{ transform: "scaleY(0)" }, { transform: "none" }], drop);
    body.current?.animate([{ transform: "translateY(-11cqh)", opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: "none" }], drop);
  }, []);
  return (
    <div className="haunt-layer haunt-spider">
      <div>
        <div ref={thread} className="haunt-thread" />
        <div ref={body} className="grid justify-items-center">
          <Art src={SPOOKY_ART.spider} />
          <p className="haunt-kicker haunt-text text-[1.1cqw] font-bold">first done</p>
          <span className="haunt-tag text-[1.6cqw]" style={{ maxWidth: "18cqw" }}>
            {name}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Code with a place to wrap after each dot, bracket, slash, and comma inside long names and paths, so a line too long
 *  for the side column wraps there or at a space, never mid-word. */
const breakable = (code: string) => code.replace(/([.(/,]|->)(?=[A-Za-z_$`'"{])/g, "$1\u200b");

const fmtPublished = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** The answer, for the host to talk over: the code with the bug marked, the fix and why, and where it came from. */
function Reveal({ bug, kicker, results }: HuntProps) {
  // Tabs as spaces: a tab after the line number would only reach the next tab stop, a column or so in.
  const code = bug.code.replace(/\t/g, "    ");
  const lines = code.split("\n");
  const cols = Math.max(...lines.map((l) => l.length));
  const s = bug.source;
  // The long explanations shrink to fit beside the code, but only so far (16px on a 720p projector): past that, the
  // date goes, then the real fix is cut to three lines, then left out.
  const least = 0.92;
  const side = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, cut: 0 });
  useLayoutEffect(() => {
    const el = side.current;
    if (!el || el.scrollHeight <= el.clientHeight + 1) return;
    if (fit.scale > least) setFit({ ...fit, scale: Math.max(least, fit.scale * 0.94) });
    else if (fit.cut < 3) setFit({ ...fit, cut: fit.cut + 1 });
  }, [fit, results]);
  // Measured again once the fonts are in, which can change how the text wraps.
  useEffect(() => void document.fonts.ready.then(() => setFit((f) => ({ ...f }))), []);
  return (
    <div className="haunt haunt-reveal absolute inset-0 grid grid-rows-[auto_minmax(0,1fr)] gap-[1.4cqw] px-[3cqw] pt-[2cqw] pb-[2.4cqw]">
      <header className="flex items-end gap-[1.6cqw]">
        <div className="min-w-0">
          <p className="haunt-kicker text-[1.3cqw] font-semibold">{kicker}</p>
          <div className="mt-[0.3cqw] flex items-center gap-[1.4cqw]">
            <Title name={bug.name ?? "bug hunt"} className="min-w-0 truncate text-[4cqw] leading-[1.05] tracking-[-0.045em]" />
            <Chips bug={bug} className="shrink-0 text-[1.4cqw]" />
          </div>
        </div>
        <Art src={SPOOKY_ART.beetle} className="ml-auto h-[6cqw] w-auto" />
      </header>
      {/* The code gets the width it can use at the height it has (it's sized from both, below), up to 60%; the rest
          goes to the explanations. */}
      <div
        className="grid min-h-0 gap-[2.4cqw]"
        style={{
          gridTemplateColumns: `min(60%, calc((100cqh - 8cqw) * ${(cols * 0.64 + 4.6) / (lines.length * 1.5 + 1.7)})) minmax(0, 1fr)`,
        }}
      >
        <div className="haunt-codebox min-h-0" style={{ "--cols": cols, "--rows": lines.length } as CSSProperties}>
          <Code code={code} lang={bug.lang} mark={bug.lines} />
        </div>
        <div
          ref={side}
          className="flex min-h-0 flex-col gap-[0.9em] overflow-hidden leading-snug"
          style={{ fontSize: `${1.45 * fit.scale}cqw` }}
        >
          <section>
            <p className="haunt-kicker text-[0.8em] font-bold text-[var(--haunt-orange)]">the bug</p>
            <p className="mt-[0.15em]">
              <strong className="font-extrabold">Line {bug.line}.</strong> {bug.why}
            </p>
          </section>
          <section>
            <p className="haunt-kicker text-[0.8em] font-bold text-[#2f6a6a]">the fix</p>
            <Code
              code={breakable(bug.fix)}
              lang={bug.lang}
              numbered={false}
              wrap
              className="haunt-fix mt-[0.3em] p-[0.6em_0.9em] text-[0.92em]"
            />
          </section>
          {s ? (
            <section>
              <p className="haunt-kicker text-[0.8em] font-bold text-[var(--haunt-dim)]">the real bug</p>
              <p className="mt-[0.15em]">
                <strong className="font-extrabold">{s.project}</strong>, {s.blurb}.{" "}
                <span className="font-semibold">
                  {[s.cve, s.severity, fit.cut < 1 && fmtPublished(s.published)].filter(Boolean).join(" · ")}
                </span>
              </p>
              {fit.cut < 3 && (
                <p className={`mt-[0.2em] text-[0.9em] text-[var(--haunt-dim)] ${fit.cut === 2 ? "line-clamp-3" : ""}`}>{s.realFix}</p>
              )}
            </section>
          ) : (
            bug.news && (
              <section>
                <p className="haunt-kicker text-[0.8em] font-bold text-[var(--haunt-dim)]">what happened</p>
                <p className="mt-[0.15em]">{bug.news}</p>
              </section>
            )
          )}
          {results && results.length > 0 && <ResultChips results={results} />}
        </div>
      </div>
    </div>
  );
}

const CHIPS = 14;

/** Who got what, as paper tags: teal for all right, mustard for half, plain for none. Most points first, and past
 * what fits beside the code the rest are counted, since the standings show everyone. */
function ResultChips({ results }: { results: HauntResult[] }) {
  const shown = [...results].sort((a, b) => (b.result?.points ?? 0) - (a.result?.points ?? 0)).slice(0, CHIPS);
  const more = results.length - shown.length;
  return (
    <ul className="mt-auto flex flex-wrap gap-[0.35em] pt-[0.2em] text-[0.85em] font-bold">
      {shown.map(({ _id, name, result: r }) => (
        <li
          key={_id}
          className={`flex max-w-full items-baseline gap-[0.4em] rounded-[3px] px-[0.5em] py-[0.15em] ${
            r?.correct ? "bg-[#2f6a6a] text-[#f6efe0]" : r?.points ? "bg-[var(--haunt-moon)]" : "bg-[#e4dccb] text-[var(--haunt-dim)]"
          }`}
        >
          <span className="truncate">{name}</span>
          <span className="narrow text-[1.15em] font-extrabold">+{r?.points ?? 0}</span>
        </li>
      ))}
      {more > 0 && <li className="px-[0.5em] py-[0.15em] text-[var(--haunt-dim)]">+{more} more</li>}
    </ul>
  );
}
