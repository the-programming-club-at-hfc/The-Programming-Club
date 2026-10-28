import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Art, BatFrames, Title } from "./haunted";
import { SPOOKY_ART } from "#/lib/spooky";
import "./spooky-stage.css";

// The spooky night between its games: the round titles and the standings as paper scenes at night, and one way of
// changing screens, a paper theatre's stage flats: torn-paper hills rise from below, cover the screen, and drop away
// again with bats bursting out of the ridge. The new screen is there from the first frame, under the flats: nothing
// waits on it, and a reload never finds it half drawn. Like the haunted Bug Hunt, it moves even with reduced motion
// on: it's a shared display.

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

// The flats, back to front: art, and whether it's flipped. Each waits a little longer than the one behind it, so they
// come up and go down in turn.
const FLATS = [
  { name: "back", src: SPOOKY_ART.pines, flip: false },
  { name: "mid", src: SPOOKY_ART.ridge, flip: true },
  { name: "front", src: SPOOKY_ART.ridge, flip: false },
];

// The bats out of the ridge as it drops, each where its line is as it goes by: across (%), height (%), seconds in,
// size (cqw), and how far out (cqw).
const BURST = [
  [12, 10, 0.61, 4.8, -12],
  [26, 12, 0.6, 3.8, -7],
  [40, 26, 0.62, 5.8, -3],
  [52, 16, 0.59, 4.2, 3],
  [64, 34, 0.62, 5.2, 8],
  [78, 27, 0.6, 4, 12],
  [90, 23, 0.57, 4.6, 15],
];

/** How soon after a change of screen a newer one still swaps in under the same flats, not raising them again (ms). */
const COVERED = 400;

/**
 * The change of screen: each new `screen` raises the flats and sends the bats out. `clear` (a clock is running) sends
 * only the bats, so the time is never covered; a clock that starts while the flats are up fades them. A screen that
 * comes while they're still rising swaps in under them. The first screen after a load gets none.
 */
export function SpookyShift({ screen, clear }: { screen: string; clear: boolean }) {
  const last = useRef(screen);
  const [run, setRun] = useState<{ n: number; clear: boolean; at: number } | null>(null);
  useEffect(() => {
    if (last.current === screen) return;
    last.current = screen;
    const at = Date.now();
    setRun((r) => (r && !r.clear && !clear && at - r.at < COVERED ? r : { n: (r?.n ?? 0) + 1, clear, at }));
  }, [screen, clear]);
  // Gone once they're down, so nothing is left over the screen however the animations went.
  useEffect(() => {
    if (!run) return;
    const id = setTimeout(() => setRun(null), 1500);
    return () => clearTimeout(id);
  }, [run]);
  if (!run) return null;
  return (
    <div key={run.n} className={`shift ${run.clear ? "shift-clear" : ""}`} aria-hidden>
      {!run.clear && (
        <div className={`absolute inset-0 ${clear ? "shift-lift" : ""}`}>
          {FLATS.map((f) => (
            <div key={f.name} className={`shift-flat ${f.name}`}>
              <Art src={f.src} className={f.flip ? "-scale-x-100" : ""} />
              <div />
            </div>
          ))}
        </div>
      )}
      {BURST.map(([x, y, d, size, dx], i) => (
        <div key={i} className="shift-bat" style={{ "--x": `${x}%`, "--y": `${y}%`, "--d": `${d}s`, "--dx": `${dx}cqw` } as CSSProperties}>
          <div className="haunt-bat" style={{ "--bat": `${size}cqw`, "--flap": `${0.14 + (i % 3) * 0.03}s` } as CSSProperties}>
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

/**
 * The spooky night on a player's own computer: the haunted Bug Hunt's paper behind the page, with its moon, two bats
 * crossing and faint hills along the bottom of the window, and the TV's change of screen over it (only the bats while
 * a clock runs). None of it takes a click. A player's own computer follows reduced motion, unlike the TV: no change
 * of screen and a still backdrop then.
 */
export function JoinNight({ screen, clear }: { screen: string; clear: boolean }) {
  return (
    <>
      <div className="haunt join-night" aria-hidden>
        <div className="haunt-layer join-moon">
          <Art src={SPOOKY_ART.moon} fallback={<div className="haunt-moon-disc" />} />
        </div>
        {FLYBYS.map((f, i) => (
          <div
            key={i}
            className="haunt-layer haunt-flyby"
            style={{ "--y": `${f.y + 4}cqh`, "--t": `${f.t}s`, "--d": `${f.d}s` } as CSSProperties}
          >
            <div>
              <div className="haunt-bat" style={{ "--bat": `${f.size}cqw`, "--flap": "0.3s" } as CSSProperties}>
                <BatFrames />
              </div>
            </div>
          </div>
        ))}
        {/* Tiled at their own height, so a low strip still shows whole trees rather than the art's cropped base. */}
        <div className="haunt-layer join-ground join-pines" style={{ backgroundImage: `url(${SPOOKY_ART.pines})` }} />
        <div className="haunt-layer join-ground join-ridge" style={{ backgroundImage: `url(${SPOOKY_ART.ridge})` }} />
      </div>
      <div className="join-shift">
        <SpookyShift screen={screen} clear={clear} />
      </div>
    </>
  );
}
