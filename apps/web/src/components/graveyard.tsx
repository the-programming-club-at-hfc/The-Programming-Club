import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Art, BatFrames } from "./haunted";
import { InstagramGlyph } from "./instagram";
import { CLUB } from "#/lib/season";
import { SPOOKY_ART, graveRows } from "#/lib/spooky";
import "./graveyard.css";

// The TV's lobby on the spooky night: a paper graveyard under the moon, a haunted house on the hill. Everyone plays on
// a computer tonight, so there's no QR code: the address is the biggest thing on the screen. Each player who joins
// gets a gravestone that rises out of the ground with their name on it. Like the haunted Bug Hunt, it moves even with
// reduced motion on: it's a shared display.

type Player = { name: string; firstTime: boolean };

// Bats crossing the sky: height, seconds per crossing, start, size.
const FLYBYS = [
  { y: 6, t: 31, d: -9, size: 3.2 },
  { y: 17, t: 44, d: -30, size: 2.2 },
];

// Puffs of dirt when a stone comes up: how far out each goes, in hundredths of the stone's width.
const PUFFS = [-58, -30, 0, 30, 58];

export function Graveyard({ address, code, roster }: { address: string; code: string; roster: Player[] }) {
  // Players with the same name keep their own stones: keyed by name and which one of that name it is.
  const seen = new Map<string, number>();
  const players = roster.map((p) => {
    const k = seen.get(p.name) ?? 0;
    seen.set(p.name, k + 1);
    return { ...p, key: `${p.name}#${k}` };
  });
  const { rows, width, more } = graveRows(players);
  const shown = rows.flat();
  const per = rows[0]?.length ?? 1;
  // Stones already here when the TV opens come up one after another; after that, each comes up as its player joins.
  const [opened, setOpened] = useState(false);
  useEffect(() => setOpened(true), []);

  return (
    <div className="haunt grave absolute inset-0">
      <div className="haunt-layer grave-moon">
        <Art src={SPOOKY_ART.moon} fallback={<div className="haunt-moon-disc" />} />
      </div>
      {FLYBYS.map((f, i) => (
        <div
          key={i}
          className="haunt-layer haunt-flyby"
          style={{ "--y": `${f.y}cqw`, "--t": `${f.t}s`, "--d": `${f.d}s` } as CSSProperties}
        >
          <div>
            <div className="haunt-bat" style={{ "--bat": `${f.size}cqw`, "--flap": "0.32s" } as CSSProperties}>
              <BatFrames />
            </div>
          </div>
        </div>
      ))}
      <div className="haunt-layer grave-hill">
        <Art src={SPOOKY_ART.ridge} fallback={<div className="haunt-hill" />} />
      </div>
      <div className="haunt-layer grave-house">
        <Art src={SPOOKY_ART.house} />
      </div>
      <div className="haunt-layer grave-tree">
        <Art src={SPOOKY_ART.tree} />
      </div>
      <div className="haunt-layer haunt-fog back">
        <Art src={SPOOKY_ART.fog} />
        <Art src={SPOOKY_ART.fog} />
      </div>
      <div className="haunt-layer grave-ghost">
        <div>
          <Art src={SPOOKY_ART.ghost} />
        </div>
      </div>
      <div className="haunt-layer grave-ground" />

      {/* The address is as big as fits on the sign, however long this machine's is. */}
      <div className="grave-sign absolute top-[1.4cqw] left-[2.4cqw] z-[2] w-[63cqw]">
        <Art src={SPOOKY_ART.sign} fallback={<div className="grave-board" />} />
        <div className="grave-face">
          <p className="haunt-kicker text-[1.5cqw] font-bold text-[#8a3412]">join the game</p>
          <p className="mt-[0.2cqw] text-[2.3cqw] leading-tight font-bold">On your computer, go to</p>
          <p
            className="leading-[1.1] font-extrabold tracking-[-0.03em] whitespace-nowrap"
            style={{ fontSize: `min(4.4cqw, ${(48 / (address.length * 0.56)).toFixed(2)}cqw)` }}
          >
            {address}
          </p>
          <div className="mt-[0.7cqw] flex items-center gap-[1.2cqw]">
            <p className="text-[2.3cqw] font-bold">and enter</p>
            <span className="flex gap-[0.4cqw] text-[3.4cqw]" aria-label={`Code ${code.split("").join(" ")}`}>
              {code.split("").map((c, i) => (
                <span key={i} className="narrow grave-square">
                  {c}
                </span>
              ))}
            </span>
          </div>
        </div>
      </div>
      <div className="haunt-layer grave-fence" style={{ backgroundImage: `url(${SPOOKY_ART.fence})` }} />

      {/* One list, wrapped into rows `per` stones wide, so a stone keeps its place in the DOM when the rows reflow. */}
      <ul className="grave-yard" style={{ "--w": `${width}cqw`, "--per": per } as CSSProperties}>
        {players.length === 0 ? (
          <Stone name="waiting" firstTime={false} delay={0} empty />
        ) : (
          shown.map((p, i) => (
            <Stone key={p.key} name={p.name} firstTime={p.firstTime} delay={opened ? 0 : Math.min(i, 30) * 90} back={i >= per} />
          ))
        )}
      </ul>
      <div className="haunt-layer haunt-fog grave-fog">
        <Art src={SPOOKY_ART.fog} />
        <Art src={SPOOKY_ART.fog} />
      </div>
      <div className="haunt-layer grave-pumpkin left-[1.5cqw] w-[8cqw]">
        <Art src={SPOOKY_ART.pumpkin} />
      </div>
      <div className="haunt-layer grave-pumpkin right-[1.8cqw] w-[6.4cqw] [--tilt:4deg]">
        <Art src={SPOOKY_ART.pumpkin} />
      </div>

      <div className="absolute inset-x-[10cqw] bottom-[0.9cqw] z-10 flex items-center gap-[2.4cqw] text-[1.5cqw] text-[#f6efe0]">
        <p className="font-bold">
          <span className="narrow text-[2.6cqw] font-extrabold">{roster.length}</span> player{roster.length === 1 ? "" : "s"} here
          {more > 0 && <span className="font-normal text-[#c9c1ae]"> · {more} more than fit</span>}
        </p>
        {roster.some((p) => p.firstTime) && (
          <p className="flex items-center gap-[0.6cqw] text-[#c9c1ae]">
            <span className="size-[0.9cqw] rounded-full bg-sky" aria-hidden /> First meeting. Say hi.
          </p>
        )}
        <p className="ml-auto flex items-center gap-[0.6cqw] font-bold">
          <InstagramGlyph className="size-[1.2em]" />
          <span className="underline decoration-sky decoration-[0.2cqw] underline-offset-[0.4cqw]">Follow @{CLUB.instagram}</span>
        </p>
      </div>
    </div>
  );
}

/**
 * A player's gravestone. It rises out of the ground in a puff of dirt `delay` ms after it mounts. When others join and
 * the rows reflow, it slides to its new place (FLIP: it jumps there and a transform carries it from the old one).
 */
function Stone({
  name,
  firstTime,
  delay,
  back = false,
  empty = false,
}: {
  name: string;
  firstTime: boolean;
  delay: number;
  back?: boolean;
  empty?: boolean;
}) {
  // Its delay as it mounted: one already up never rises again.
  const [at] = useState(delay);
  // Type as big as a stone's face takes, smaller for a long word so it never breaks mid-word.
  const longest = Math.max(...name.split(/\s+/).map((w) => w.length));
  const size = Math.max(0.1, Math.min(0.17, 0.7 / (longest * 0.52)));
  const ref = useRef<HTMLLIElement>(null);
  const face = useRef<HTMLParagraphElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  // The guess above runs wide for some letters: measure the words in the stone's own font, to the fraction of a pixel
  // (a box's scrollWidth rounds, so a word a hair too wide still broke), and size the type so each fits on a line and
  // the name on two, again once the font has loaded. Widths scale with the size, and it all scales together, so one fit
  // holds at any screen size.
  useLayoutEffect(() => {
    const fit = () => {
      const p = face.current;
      const span = p?.firstElementChild;
      const ctx = document.createElement("canvas").getContext("2d");
      if (!p || !(span instanceof HTMLElement) || !ctx) return;
      p.style.setProperty("--name", String(size));
      const style = getComputedStyle(span);
      ctx.font = style.font;
      ctx.letterSpacing = style.letterSpacing;
      const words = name.split(/\s+/).map((w) => ctx.measureText(w).width);
      const space = ctx.measureText(" ").width;
      const room = p.clientWidth - 2;
      // Lines at `k` times this size, wrapping word by word: no more than the two the stone shows.
      const lines = (k: number) => {
        let n = 1;
        let x = 0;
        for (const w of words) {
          if (x && x + (space + w) * k > room) {
            n++;
            x = w * k;
          } else x += (x ? space + w : w) * k;
        }
        return n;
      };
      let s = Math.min(size, (size * room) / Math.max(1, ...words));
      while (s > 0.08 && lines(s / size) > 2) s -= 0.005;
      p.style.setProperty("--name", String(Math.max(0.08, s)));
    };
    fit();
    void document.fonts.ready.then(fit);
  }, [name, size]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // From the yard's bottom middle, where it's pinned, so a yard that grows doesn't count as a move. Layout offsets,
    // not the box on screen, so a slide still under way doesn't throw the next one off.
    const yard = el.parentElement!;
    const now = { x: el.offsetLeft - yard.offsetWidth / 2, y: el.offsetTop - yard.offsetHeight };
    const was = last.current;
    last.current = now;
    if (was && (was.x !== now.x || was.y !== now.y))
      el.animate([{ transform: `translate(${was.x - now.x}px, ${was.y - now.y}px)` }, { transform: "none" }], {
        duration: 900,
        easing: "cubic-bezier(0.3, 0.7, 0.3, 1)",
      });
  });
  return (
    <li
      ref={ref}
      className={`grave-plot ${back ? "grave-behind" : ""} ${empty ? "grave-empty" : ""}`}
      style={{ "--at": `${at}ms` } as CSSProperties}
    >
      <div className="grave-dig">
        <div className="grave-stone">
          <Art src={SPOOKY_ART.gravestone} fallback={<div className="grave-blank" />} />
          {firstTime && <span className="grave-dot bg-sky" aria-label="First meeting" />}
          <p ref={face} className="grave-name" style={{ "--name": size } as CSSProperties}>
            <span>
              {name}
              {/* The placeholder's ellipsis on a line of its own, under the word. */}
              {empty && (
                <>
                  <br />…
                </>
              )}
            </span>
          </p>
        </div>
      </div>
      <span className="grave-mound" aria-hidden />
      {!empty && PUFFS.map((dx) => <span key={dx} className="grave-puff" style={{ "--dx": dx } as CSSProperties} aria-hidden />)}
    </li>
  );
}
