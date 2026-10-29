// October's wallpaper: the Spooky Bugs TV lobby (components/graveyard.tsx) without the game. A paper graveyard under
// the moon, a haunted house on the hill, bats and a ghost crossing the sky, fog rolling past, and a few stones for
// the bugs we've buried. Its paper art is the TV's (public/spooky). Unlike the TV, it keeps still with reduced motion.
import { Fragment, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { SPOOKY_ART } from "#/lib/spooky";
import "../haunted.css";
import "./spooky-scene.css";

// Bats crossing the sky: height, seconds per crossing, start, size (all sizes in --u, see spooky-scene.css).
const FLYBYS = [
  { y: 7, t: 31, d: -9, size: 3.2 },
  { y: 18, t: 44, d: -30, size: 2.2 },
  { y: 12, t: 57, d: -41, size: 1.6 },
];

// Stars scattered over the sky (never down behind the hill): across and down it in fractions, size, and when each
// twinkles. Made from a fixed sequence, so the sky is the same on every visit.
const STARS = Array.from({ length: 46 }, (_, i) => {
  const r = (k: number) => (((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1) + 1) % 1;
  return { x: r(1), y: r(2) ** 1.4, size: 0.14 + r(3) * 0.2, t: 2.5 + r(4) * 4, d: -r(5) * 6 };
});

// The house's lit windows, in percent of its art: left, top, width, height, and what each does. One flickers like a
// candle, one goes dark now and then, and someone walks past the tall one.
const WINDOWS = [
  { box: [36.9, 65.9, 5.4, 12.1], kind: "candle" },
  { box: [70.4, 52.3, 4, 6.1], kind: "out" },
  { box: [50.5, 28, 6, 15.1], kind: "walker" },
] as const;

// Stones in the yard, back to front: what's buried, how far in from the right and up from the ground, width, tilt.
const STONES = [
  { word: "null", right: 40, up: 14, w: 4.2, tilt: -1.5 },
  { word: "NaN", right: 21, up: 9, w: 5.4, tilt: 2.5 },
  { word: "404", right: 31, up: 3, w: 7, tilt: -3 },
];

export function SpookyScene() {
  const [loaded, setLoaded] = useState(0);
  // Browser-only, so every image's load event is caught (server-rendered images can finish before hydration).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  // Every piece counts toward the fade-in, loaded or missing, so one bad file never keeps the scene hidden.
  let pieces = 0;
  const onDone = () => setLoaded((n) => n + 1);
  const art = (src: string): ReactNode => {
    pieces++;
    return <img src={src} alt="" draggable={false} decoding="async" onLoad={onDone} onError={onDone} />;
  };
  // Two copies of the fog, scrolled by one's width, loop without a seam.
  const fog = () => (
    <>
      {art(SPOOKY_ART.fog)}
      {art(SPOOKY_ART.fog)}
    </>
  );

  // Built before the wrapper below, so `pieces` is counted by the time it's read.
  const scene = (
    <>
      {STARS.map((t, i) => (
        <span
          key={i}
          className="spook-star"
          style={{ "--x": t.x, "--y": t.y, "--s": t.size, "--t": `${t.t}s`, "--d": `${t.d}s` } as CSSProperties}
        />
      ))}
      <div className="spook-moon">{art(SPOOKY_ART.moon)}</div>
      {FLYBYS.map((f, i) => (
        <div
          key={i}
          className="haunt-layer haunt-flyby spook-flyby"
          style={{ "--y": f.y, "--t": `${f.t}s`, "--d": `${f.d}s` } as CSSProperties}
        >
          <div>
            <div className="haunt-bat" style={{ "--bat": `calc(${f.size} * var(--u))`, "--flap": "0.32s" } as CSSProperties}>
              <div className="frames">
                {art(SPOOKY_ART.bat)}
                {art(SPOOKY_ART.batDown)}
              </div>
            </div>
          </div>
        </div>
      ))}
      <div className="spook-hill">{art(SPOOKY_ART.ridge)}</div>
      <div className="spook-house">
        {art(SPOOKY_ART.house)}
        {WINDOWS.map(({ box: [l, t, w, h], kind }) => (
          <span
            key={kind}
            className={`spook-window spook-${kind}`}
            style={{ left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%` }}
          >
            {kind === "walker" && <span />}
          </span>
        ))}
      </div>
      <div className="spook-tree">{art(SPOOKY_ART.tree)}</div>
      <div className="haunt-layer haunt-fog spook-fog-back">{fog()}</div>
      <div className="spook-ghost">
        <div>{art(SPOOKY_ART.ghost)}</div>
      </div>
      <div className="spook-ground" style={{ "--yard": `url(${SPOOKY_ART.yard})` } as CSSProperties}>
        {/* Hidden: it's the ground's background, here only so the fade-in waits for it. */}
        <span className="hidden">{art(SPOOKY_ART.yard)}</span>
      </div>
      <div className="haunt-layer haunt-fog spook-fog-yard">{fog()}</div>
      <div className="spook-fence" style={{ backgroundImage: `url(${SPOOKY_ART.fence})` }} />
      {STONES.map((s, i) => {
        const at = { "--r": s.right, "--up": s.up, "--w": s.w } as CSSProperties;
        return (
          <Fragment key={s.word}>
            <div className="spook-stone" style={{ ...at, "--tilt": `${s.tilt}deg`, "--at": `${0.5 + i * 0.25}s` } as CSSProperties}>
              <div>
                {art(SPOOKY_ART.gravestone)}
                <p>{s.word}</p>
              </div>
            </div>
            <div className="spook-tufts" style={at}>
              {art(SPOOKY_ART.tufts)}
            </div>
          </Fragment>
        );
      })}
      {/* Now and then the Bug Hunt beetle wanders across the yard, magnifying glass first. */}
      <div className="spook-beetle">
        <div>
          {art(SPOOKY_ART.beetle)}
          {art(SPOOKY_ART.beetleStep)}
        </div>
      </div>
      <div className="haunt-layer haunt-fog spook-fog">{fog()}</div>
      <div className="spook-pumpkin right-[calc(22*var(--u))] w-[calc(6.4*var(--u))]">{art(SPOOKY_ART.pumpkin)}</div>
      <div className="spook-pumpkin right-[calc(2*var(--u))] w-[calc(5.6*var(--u))] [--tilt:4deg]">{art(SPOOKY_ART.pumpkin)}</div>
    </>
  );
  return (
    // The night sky underneath (.desk-aerial) shows until every piece has loaded, then the scene fades in over it.
    <div aria-hidden className={`spook ${loaded >= pieces ? "spook-ready" : ""}`}>
      {scene}
    </div>
  );
}
