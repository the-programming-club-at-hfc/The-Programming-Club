// The wallpaper as painted layers (public/wallpaper/layers), each moving on its own: the camera sways so the
// snowy shore slides past faster than the sea and cliffs, the clouds drift across, and the moonlight shimmers.
// Layers sit on a 16:9 stage (or a portrait stage on phones) that covers the screen, so nothing stretches.
// Positions are percentages of the stage: [left, top, width, height] on desktop, then on phones.
// When the screen is shorter than the stage, the moon and clouds stay pinned to the top and the rest ("low")
// to the bottom, so the horizon rises a little instead of the moon or the shore getting cropped.
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

type Box = [number, number, number, number];
type Layer = { id: string; depth: number; desk: Box; phone: Box; low?: boolean; kind?: "clouds" | "moon" | "shimmer" };

const CLOUDS: Box = [-5.02, 5.84, 110.05, 48.14];
const CLOUDS_PHONE: Box = [-65, 5.5, 180, 46];
const MOON: Box = [67.88, 8.5, 13.46, 23.91];
// On phones the moon sits top-right, clear of the club name, with its reflection below it.
const MOON_PHONE: Box = [76, 11, 20, 9.24];
const PATH: Box = [64.59, 53.13, 20.93, 44.63];
const PATH_PHONE: Box = [53.5, 55.4, 65, 30];

const LAYERS: Layer[] = [
  { id: "sky", low: true, depth: 0, desk: [-5.02, 0, 110.05, 106.27], phone: [-100, 0, 210, 108] },
  { id: "clouds-far", depth: 0.08, desk: CLOUDS, phone: CLOUDS_PHONE, kind: "clouds" },
  { id: "clouds-near", depth: 0.16, desk: CLOUDS, phone: CLOUDS_PHONE, kind: "clouds" },
  { id: "moon", depth: 0.025, desk: MOON, phone: MOON_PHONE, kind: "moon" },
  { id: "cliffs", low: true, depth: 0.12, desk: [-5.02, 26.57, 110.05, 28.06], phone: [-80, 41.45, 200, 15] },
  { id: "sea", low: true, depth: 0.25, desk: [-5.02, 53.13, 110.05, 53.13], phone: [-90, 55.4, 200, 50] },
  { id: "moonpath", low: true, depth: 0.25, desk: PATH, phone: PATH_PHONE, kind: "shimmer" },
  { id: "shore", low: true, depth: 1, desk: [38.88, 54.2, 66.99, 53.13], phone: [-37, 62.07, 155, 44] },
];

const vars = ([l, t, w, h]: Box, p: string) => ({ [`--${p}l`]: `${l}%`, [`--${p}t`]: `${t}%`, [`--${p}w`]: `${w}%`, [`--${p}h`]: `${h}%` });

export function Scene() {
  const [loaded, setLoaded] = useState(0);
  // Browser-only, so every image's load event is caught (server-rendered images can finish before hydration).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const onLoad = () => setLoaded((n) => n + 1);
  if (!mounted) return null;
  return (
    // The flat painting underneath stays until every layer has loaded, then the scene fades in over it.
    <div aria-hidden className={`scene ${loaded >= LAYERS.length ? "scene-ready" : ""}`}>
      {LAYERS.map((l) => {
        const src = `/wallpaper/layers/${l.id}.webp`;
        const style = { ...vars(l.desk, ""), ...vars(l.phone, "p"), "--depth": l.depth } as CSSProperties;
        return (
          <div key={l.id} className={`scene-layer ${l.low ? "scene-low" : ""}`} style={style}>
            {l.kind === "clouds" ? (
              // Two copies of a seamless strip, scrolled by one strip's width, loop without a seam.
              <div className={`scene-clouds scene-${l.id}`} style={{ backgroundImage: `url(${src})` }}>
                <img src={src} alt="" className="hidden" onLoad={onLoad} />
              </div>
            ) : (
              <img src={src} alt="" decoding="async" onLoad={onLoad} className={`size-full ${l.kind ? `scene-${l.kind}` : ""}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
