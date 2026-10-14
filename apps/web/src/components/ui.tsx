import type { ReactNode } from "react";
import { gamesIn } from "#/lib/schedule";
import type { Agenda, Week } from "#/lib/types";

const S = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;
const F = { fill: "currentColor" } as const;

// A joint for an animated part: it rotates or moves around this point in the 96-unit grid.
const at = (x: number, y: number) => ({ transformOrigin: `${x}px ${y}px` });

// Pictograms on a 96-unit grid: round-capped strokes, 45° limbs, heads drawn apart from bodies.
// Parts with a `pa-*` class move when the pictogram is animated (see styles.css, "Pictogram motion").
const PICTOS = {
  wiki: (
    <>
      <path {...S} strokeWidth="3" d="M8 34h12M4 46h14M10 58h10" className="pa pa-speed" />
      <g className="pa pa-run">
        <circle cx="62" cy="15" r="8" {...F} />
        <path {...S} strokeWidth="10" d="M58 29 46 52" />
        <path {...S} strokeWidth="10" d="M57 32l13 6 8-10" className="pa pa-swing" style={at(57, 32)} />
        <path {...S} strokeWidth="10" d="M55 33l-13 7-6 12" className="pa pa-swing pa-late" style={at(55, 33)} />
        <path {...S} strokeWidth="10" d="M46 52l16 8-2 21" className="pa pa-swing pa-late" style={at(46, 52)} />
        <path {...S} strokeWidth="10" d="M46 52l-8 16-16 4" className="pa pa-swing" style={at(46, 52)} />
      </g>
    </>
  ),
  bug: (
    <>
      <circle cx="24" cy="20" r="8" {...F} />
      <path {...S} strokeWidth="10" d="M25 33l3 26M26 41l-8 14M28 59l-8 27M28 59l8 27" />
      <g className="pa pa-scan" style={at(27, 39)}>
        <path {...S} strokeWidth="10" d="M27 39l19 15" />
        <path {...S} strokeWidth="7" d="M46 54l7 4" />
        <circle cx="63" cy="64" r="11" {...S} strokeWidth="6" />
      </g>
      <g className="pa pa-scuttle">
        <ellipse cx="82" cy="86" rx="6.5" ry="4.5" {...F} />
        <circle cx="82" cy="79.5" r="3" {...F} />
        <path {...S} strokeWidth="4" d="M76 84l-5-3M76 89l-5 3M88 84l5-3M88 89l5 3" className="pa pa-legs" style={at(82, 86)} />
      </g>
    </>
  ),
  relay: (
    <>
      {/* A handoff: both runners face the same way; the back runner holds the baton out, the front runner reaches back.
          In motion only their legs stride, in step; the baton stays put. */}
      <path {...S} strokeWidth="3" d="M2 40h8M0 52h9M3 64h7" className="pa pa-speed" />
      <circle cx="20" cy="24" r="7" {...F} />
      <path {...S} strokeWidth="9" d="M23 35l-7 21M22 38l11 1 9-7M21 40l-10 8" />
      <path {...S} strokeWidth="9" d="M16 56l11 8-1 16" className="pa pa-stride" style={at(16, 56)} />
      <path {...S} strokeWidth="9" d="M16 56l-8 12-8 2" className="pa pa-stride pa-late" style={at(16, 56)} />
      <circle cx="70" cy="20" r="7" {...F} />
      <path {...S} strokeWidth="9" d="M68 31l-7 22M66 35l-9 4-8-2M67 34l10-2 6-9" />
      <path {...S} strokeWidth="9" d="M61 53l13 9v16" className="pa pa-stride" style={at(61, 53)} />
      <path {...S} strokeWidth="9" d="M61 53l-8 14-11 3" className="pa pa-stride pa-late" style={at(61, 53)} />
      <path {...S} stroke="#fff" strokeWidth="6" d="M41 33l9 1" />
    </>
  ),
  output: (
    <>
      <circle cx="24" cy="20" r="8" {...F} />
      <path {...S} strokeWidth="10" d="M24 33v26M24 41l-6 15M24 59l-7 27M24 59l7 27" />
      <path {...S} strokeWidth="10" d="M24 38l16-10" className="pa pa-point" style={at(24, 38)} />
      <g className="pa pa-wobble" style={at(66, 78)}>
        <path {...S} strokeWidth="10" d="M54 30a15 15 0 1 1 22 13c-5 3-7 6-7 12" />
        <circle cx="69" cy="79" r="6" {...F} />
      </g>
    </>
  ),
  pictionary: (
    <>
      <rect x="50" y="12" width="40" height="44" rx="2" {...S} strokeWidth="6" />
      <path {...S} strokeWidth="5" d="M58 42c4-10 8-10 10-2s6 8 12-6" pathLength={1} className="pa pa-draw" />
      <path {...S} strokeWidth="6" d="M60 56l-4 30M80 56l4 30" />
      <circle cx="25" cy="20" r="8" {...F} />
      <path {...S} strokeWidth="10" d="M27 33l3 25M28 41l-8 13M30 58l-8 28M30 58l8 28" />
      <path {...S} strokeWidth="10" d="M28 38l13-4 11-5" className="pa pa-sketch" style={at(28, 38)} />
    </>
  ),
  lang: (
    <>
      <circle cx="22" cy="22" r="8" {...F} />
      <path {...S} strokeWidth="10" d="M22 35v24M22 43l-6 14M22 59l-7 27M22 59l7 27" />
      <path {...S} strokeWidth="10" d="M22 40l16-10" className="pa pa-point" style={at(22, 40)} />
      <g className="pa pa-wobble" style={at(58, 58)}>
        <path {...S} strokeWidth="6" d="M50 12h36a4 4 0 0 1 4 4v30a4 4 0 0 1-4 4H64l-10 10v-10h-4a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4Z" />
        <path {...S} strokeWidth="6" d="M60 24l-6 7 6 7M76 24l6 7-6 7M71 22l-6 18" />
      </g>
    </>
  ),
  fix: (
    <>
      {/* At the keyboard: the screen's check mark draws itself in when the tests pass. */}
      <circle cx="20" cy="22" r="8" {...F} />
      <path {...S} strokeWidth="10" d="M20 35v24M20 59l-7 27M20 59l7 27" />
      <path {...S} strokeWidth="10" d="M20 42l20 14" className="pa pa-point" style={at(20, 42)} />
      <rect x="48" y="16" width="40" height="32" rx="3" {...S} strokeWidth="6" />
      <path {...S} strokeWidth="6" d="M42 62h50M68 48v14" />
      <path {...S} strokeWidth="6" d="M58 32l7 7 13-13" pathLength={1} className="pa pa-draw" />
    </>
  ),
  puzzle: (
    <>
      {/* Cheering at a star, like the ones Advent of Code gives for each solved part. */}
      <g className="pa pa-hop">
        <circle cx="28" cy="28" r="8" {...F} />
        <path {...S} strokeWidth="10" d="M28 41v24M28 65l-8 21M28 65l8 21M28 46l-12-14M28 46l12-14" />
      </g>
      <path
        {...S}
        strokeWidth="4"
        fill="currentColor"
        d="M68 8l4.3 12.1 12.8.3-10.2 7.9 3.7 12.3L68 33.3l-10.6 7.3 3.7-12.3-10.2-7.9 12.8-.3Z"
        className="pa pa-wobble"
        style={at(68, 26)}
      />
    </>
  ),
  keycap: (
    <>
      <path {...F} d="M22 16h52c3 0 5 2 5 5l9 58c1 4-2 7-6 7H14c-4 0-7-3-6-7l9-58c0-3 2-5 5-5Z" />
      <g className="pa pa-press">
        <rect x="24" y="12" width="48" height="50" rx="6" fill="#f8da6a" />
        <path {...S} stroke="#12332b" strokeWidth="7" d="M60 25v16H40M46 35l-6 6 6 6" />
      </g>
    </>
  ),
  people: (
    <>
      <g className="pa pa-hop">
        <circle cx="18" cy="24" r="7" {...F} />
        <path {...S} strokeWidth="8" d="M18 36v22M18 58l-5 26M18 58l5 26M18 40l-8 14M18 40l15 12" />
      </g>
      <g className="pa pa-hop pa-late">
        <circle cx="48" cy="18" r="7" {...F} />
        <path {...S} strokeWidth="8" d="M48 30v24M48 54l-5 30M48 54l5 30M48 34l-15 18M48 34l15 18" />
      </g>
      <g className="pa pa-hop pa-later">
        <circle cx="78" cy="24" r="7" {...F} />
        <path {...S} strokeWidth="8" d="M78 36v22M78 58l-5 26M78 58l5 26M78 40l8 14M78 40l-15 12" />
      </g>
    </>
  ),
} satisfies Record<string, ReactNode>;

export type PictoId = keyof typeof PICTOS;

/**
 * A pictogram. `animate="loop"` keeps it moving (use where pictograms are the star); by default it
 * moves while it, or the `.group` around it, is hovered or focused.
 */
export function Picto({ id, className = "", label, animate }: { id: PictoId; className?: string; label?: string; animate?: "loop" }) {
  return (
    <svg
      viewBox="0 0 96 96"
      className={`picto ${animate === "loop" ? "picto-loop" : ""} ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {PICTOS[id]}
    </svg>
  );
}

/** The trophy, as a pictogram. */
export const Keycap = ({ className = "", animate }: { className?: string; animate?: "loop" }) => (
  <Picto id="keycap" className={className} label="The Golden Keycap" animate={animate} />
);

export const GAME_TILE: Record<string, { picto: PictoId; tile: string }> = {
  wiki: { picto: "wiki", tile: "tile-sky" },
  bug: { picto: "bug", tile: "tile-meadow" },
  relay: { picto: "relay", tile: "tile-sun" },
  output: { picto: "output", tile: "tile-silver" },
  pictionary: { picto: "pictionary", tile: "tile-pine" },
  lang: { picto: "lang", tile: "tile-sky" },
  fix: { picto: "fix", tile: "tile-meadow" },
  puzzle: { picto: "puzzle", tile: "tile-sun" },
};

/** The pictogram and color that stand for a week: its main game (the first one that isn't a warm-up), or the keycap on Cup nights. */
export function weekTile(w: Pick<Week, "kind" | "games">): { picto: PictoId; tile: string } {
  if (w.kind === "cup") return { picto: "keycap", tile: "tile-gold" };
  if (w.kind === "kickoff") return { picto: "people", tile: "tile-pine" };
  if (w.kind === "wrap") return { picto: "people", tile: "tile-sky" };
  const id = w.games.filter((g) => !g.includes("(warm-up)")).flatMap(gamesIn)[0];
  return id ? GAME_TILE[id] : { picto: "people", tile: "tile-silver" };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const TOKEN =
  /(#.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)|\b(\d+(?:\.\d+)?)\b|\b(def|return|if|elif|else|for|while|in|not|and|or|True|False|None)\b|\b(print|input|len|range|int|str|round|max)\b(?=\()/g;

export function highlight(line: string) {
  let out = "";
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    const kind = m[1] ? "com" : m[2] ? "str" : m[3] ? "num" : m[4] ? "kw" : "fn";
    out += esc(line.slice(last, m.index)) + `<span class="t-${kind}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(line.slice(last));
}

/** Highlighted Python. `mark` lists 1-based lines to call out, like the lines a fix changed. */
export function Code({
  code,
  numbered = true,
  mark = [],
  className = "",
}: {
  code: string;
  numbered?: boolean;
  mark?: number[];
  className?: string;
}) {
  return (
    <pre className={`code ${className}`}>
      <code>
        {code.split("\n").map((l, i) => (
          <span className={`cl ${mark.includes(i + 1) ? "-mx-2 bg-sun/20 px-2" : ""}`} key={i}>
            {numbered && <span className="ln">{i + 1}</span>}
            <span dangerouslySetInnerHTML={{ __html: highlight(l) || " " }} />
          </span>
        ))}
      </code>
    </pre>
  );
}

export function PageHead({ title, children, picto }: { title: string; children?: ReactNode; picto?: { picto: PictoId; tile: string } }) {
  return (
    <header className="mx-auto grid w-[min(1240px,100%-2.5rem)] items-end gap-8 pt-14 pb-12 md:grid-cols-[1fr_auto]">
      <div>
        <h1 className="text-[clamp(3rem,7vw,6rem)] leading-[0.9] lowercase">{title}</h1>
        {children && <p className="mt-6 max-w-[54ch] text-lg text-dim">{children}</p>}
      </div>
      {picto && (
        <div className={`tile ${picto.tile} size-36 rounded-[4px] max-md:hidden`}>
          <Picto id={picto.picto} className="absolute inset-[14%]" />
        </div>
      )}
    </header>
  );
}

export const Wrap = ({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) => (
  <section id={id} className={`mx-auto w-[min(1240px,100%-2.5rem)] ${className}`}>
    {children}
  </section>
);

const toneOf = (r: Agenda) =>
  /Trophy/.test(r.what)
    ? "var(--color-gold)"
    : /double points/.test(r.what)
      ? "var(--color-sun)"
      : /Round|Race|Relay|Hunt|Output|Puzzle/.test(r.what)
        ? "var(--color-meadow)"
        : /lesson|Opening|Meet|club is|Season 0 works/.test(r.what)
          ? "var(--color-sky)"
          : /Standings|standings|feedback|Wrap/.test(r.what)
            ? "var(--color-pine)"
            : "var(--color-silver)";

/** The hour as a clock face: each arc is that part of the night, drawn to scale. */
export function HourDial({ rows, className = "" }: { rows: Agenda[]; className?: string }) {
  const total = rows.reduce((n, r) => n + r.len, 0);
  const R = 80;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label={`The ${total}-minute plan as a clock face`}>
      <g transform="rotate(-90 100 100)">
        {rows.map((r) => {
          const len = (r.len / total) * C;
          const el = (
            <circle
              key={r.t}
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke={toneOf(r)}
              strokeWidth="34"
              strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`}
              strokeDashoffset={-acc}
            />
          );
          acc += len;
          return el;
        })}
      </g>
      {Array.from({ length: 12 }, (_, i) => (
        <line
          key={i}
          x1="100"
          y1="6"
          x2="100"
          y2="12"
          stroke="var(--color-ink)"
          strokeWidth="1.5"
          transform={`rotate(${i * 30} 100 100)`}
        />
      ))}
      <text x="100" y="98" textAnchor="middle" fontSize="34" fontWeight="800" fill="var(--color-ink)" style={{ fontStretch: "75%" }}>
        {total}
      </text>
      <text x="100" y="120" textAnchor="middle" fontSize="13" fill="var(--color-dim)">
        minutes
      </text>
    </svg>
  );
}

export function AgendaList({ rows, compact = false }: { rows: Agenda[]; compact?: boolean }) {
  return (
    <ol>
      {rows.map((r) => (
        <li
          key={r.t + r.what}
          className={`grid items-baseline gap-x-4 border-t border-line first:border-t-0 ${compact ? "grid-cols-[0.75rem_3.4rem_1fr] py-2" : "grid-cols-[0.75rem_3.6rem_1fr_auto] py-3.5"}`}
        >
          <span className="size-3 translate-y-0.5 rounded-full" style={{ background: toneOf(r) }} aria-hidden />
          <time className="narrow text-lg font-bold">{r.t}</time>
          <div>
            <strong className="font-bold">{r.what}</strong>
            {!compact && <p className="mt-0.5 max-w-[58ch] text-[0.95rem] text-dim">{r.detail}</p>}
          </div>
          {!compact && <span className="text-sm text-dim tabular-nums max-sm:hidden">{r.len} min</span>}
        </li>
      ))}
    </ol>
  );
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
