import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Art, BatFrames, Title } from "./haunted";
import { SPOOKY_ART } from "#/lib/spooky";
import "./spooky-stage.css";

// The spooky night between its games: the round titles and the standings as paper scenes at night, and one way of
// changing screens, a veil of fog with a swarm of bats that sweeps across as the new screen comes in. The new screen is
// there from the first frame, under the veil: nothing waits on it, and a reload never finds it half drawn. Like the
// haunted Bug Hunt, it moves even with reduced motion on: it's a shared display.

/** What the TV is showing, as far as a change of screen goes: a reveal or a hint is the same screen. */
export const screenKey = (s: {
  mode: string;
  game?: string;
  index?: number;
  message?: string;
  drawing?: number;
  wikiFrom?: string;
  wikiReady?: boolean;
  slide?: number;
}) => [s.mode, s.game, s.index, s.message, s.drawing, s.wikiFrom, s.wikiReady, s.slide].join("|");

// The swarm: height (% of the screen), seconds across, delay, size (cqw).
const SWARM = [
  [18, 1.1, 0, 4.2],
  [34, 0.95, 0.08, 3],
  [52, 1.2, 0.02, 5],
  [66, 1.0, 0.14, 3.4],
  [27, 1.25, 0.2, 2.6],
  [44, 1.05, 0.26, 3.8],
  [78, 1.15, 0.1, 2.8],
  [60, 0.9, 0.3, 2.4],
  [12, 1.0, 0.34, 2.2],
];

/**
 * The change of screen: each new `screen` sends the veil and the bats across. `clear` (a clock is running) sends only
 * the bats, so the time is never covered; a clock that starts while the veil is across lifts it. The first screen
 * after a load gets none.
 */
export function SpookyShift({ screen, clear }: { screen: string; clear: boolean }) {
  const last = useRef(screen);
  const [run, setRun] = useState<{ n: number; clear: boolean } | null>(null);
  useEffect(() => {
    if (last.current === screen) return;
    last.current = screen;
    setRun((r) => ({ n: (r?.n ?? 0) + 1, clear }));
  }, [screen, clear]);
  // Gone once it's across, so nothing is left over the screen however the animations went.
  useEffect(() => {
    if (!run) return;
    const id = setTimeout(() => setRun(null), 1700);
    return () => clearTimeout(id);
  }, [run]);
  if (!run) return null;
  return (
    <div key={run.n} className="shift" aria-hidden>
      {!run.clear && (
        <div className={`shift-veil ${clear ? "shift-lift" : ""}`}>
          <Art src={SPOOKY_ART.fog} />
          <Art src={SPOOKY_ART.fog} />
        </div>
      )}
      {SWARM.map(([y, t, d, size], i) => (
        <div key={i} className="shift-bat" style={{ top: `${y}%`, animationDuration: `${t}s`, animationDelay: `${d}s` }}>
          <div className="haunt-bat" style={{ "--bat": `${size}cqw`, "--flap": `${0.18 + (i % 3) * 0.03}s` } as CSSProperties}>
            <BatFrames />
          </div>
        </div>
      ))}
    </div>
  );
}

// Bats crossing the sky: height (cqw), seconds per crossing, start, size.
const FLYBYS = [
  { y: 7, t: 29, d: -8, size: 3 },
  { y: 15, t: 41, d: -27, size: 2.2 },
];

/** The night sky behind a spooky screen: the moon, bats, fog, and along the bottom pines (`pines`) or a low ridge. */
function Night({ pines, children }: { pines: boolean; children: ReactNode }) {
  return (
    <div className={`haunt night absolute inset-0 ${pines ? "" : "night-low"}`}>
      <div className="haunt-layer night-moon">
        <Art src={SPOOKY_ART.moon} fallback={<div className="haunt-moon-disc" />} />
      </div>
      {FLYBYS.map((f, i) => (
        <div
          key={i}
          className="haunt-layer haunt-flyby"
          style={{ "--y": `${f.y}cqw`, "--t": `${f.t}s`, "--d": `${f.d}s` } as CSSProperties}
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
      {pines && (
        <div className="haunt-layer haunt-ground haunt-pines">
          <div className="h-full">
            <Art src={SPOOKY_ART.pines} />
          </div>
        </div>
      )}
      {children}
      <div className="haunt-layer haunt-ground haunt-ridge">
        <div className="h-full">
          <Art src={SPOOKY_ART.ridge} fallback={<div className="haunt-hill" />} />
        </div>
      </div>
      <div className="haunt-layer haunt-fog">
        <Art src={SPOOKY_ART.fog} />
        <Art src={SPOOKY_ART.fog} />
      </div>
    </div>
  );
}

/**
 * A message on the TV, on a signboard that rises out of the pines. A round's title ("Round 2, double points: Bug
 * Hunt: hard") puts its number above the sign and its game on it.
 */
export function SpookyMessage({ message }: { message: string }) {
  const round = message.match(/^Round (\d+)(, double points)?: (.+)$/);
  const text = round ? round[3] : message;
  // As big as fits on the board's face, about 61 × 17cqw, however long it is.
  const size = Math.min(5.6, Math.sqrt((61 * 17) / (text.length * 0.6 * 1.6)));
  return (
    <Night pines>
      {round && (
        <p className="night-kicker haunt-kicker absolute inset-x-0 top-[6.5cqw] z-[6] text-center text-[3cqw] font-bold">
          round {round[1]}
          {round[2] && <span className="text-[var(--haunt-orange)]"> · double points</span>}
        </p>
      )}
      <div className="night-sign haunt-layer">
        <Art src={SPOOKY_ART.sign} fallback={<div className="night-plank" />} />
        <div className="night-face">
          <Title name={text} className="leading-[1.05] tracking-[-0.035em] text-balance" style={{ fontSize: `${size.toFixed(2)}cqw` }} />
        </div>
      </div>
    </Night>
  );
}

/** The standings (or anything else that fills the screen) over the night, with a low ridge along the bottom. */
export function SpookyBoard({ children }: { children: ReactNode }) {
  return (
    <Night pines={false}>
      <div className="night-board absolute inset-0 z-[6] p-[3.5vw] pb-[5.5cqw]">{children}</div>
    </Night>
  );
}
