import { useEffect, useRef, useState } from "react";
import type { Doc } from "../../convex/_generated/dataModel";
import { BUGS, LANGS, OUTPUTS, RELAYS } from "#/lib/content";
import { Code } from "./ui";
import { sfx } from "#/lib/sound";

export type Screen = Doc<"sessions">["screen"];
export type Timer = Doc<"sessions">["timer"];
export type GameId = NonNullable<Screen["game"]>;

export const DECKS: Record<GameId, { name: string; size: number; seconds: (i: number) => number }> = {
  bug: { name: "Bug Hunt", size: BUGS.length, seconds: (i) => (BUGS[i].level === "hard" ? 120 : 90) },
  output: { name: "Output?", size: OUTPUTS.length, seconds: () => 30 },
  relay: { name: "Code Relay", size: RELAYS.length, seconds: () => 720 },
  lang: { name: "Guess the Language", size: LANGS.length, seconds: () => 45 },
};

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Milliseconds left on the shared timer, ticking locally between server updates. */
export function useRemaining(t: Timer | undefined) {
  const [now, setNow] = useState(() => Date.now());
  const running = !!t?.startedAt;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [running]);
  if (!t) return 0;
  return t.startedAt ? Math.max(0, t.remainingMs - (now - t.startedAt)) : t.remainingMs;
}

/** Plays the relay swap chime every 2 minutes and the buzzer at 0:00. Used by the TV. */
export function useChimes(t: Timer | undefined, remaining: number) {
  const swaps = useRef(0);
  const ended = useRef<number | undefined>(undefined);
  const startedAt = t?.startedAt;
  useEffect(() => {
    swaps.current = t ? Math.floor((t.durationMs - remaining) / 120_000) : 0;
    // reset trackers only when a new run starts
  }, [startedAt]);
  useEffect(() => {
    if (!t?.startedAt) return;
    if (t.relay && remaining > 1000) {
      const n = Math.floor((t.durationMs - remaining) / 120_000);
      if (n > swaps.current) {
        swaps.current = n;
        sfx.swap();
      }
    }
    if (remaining === 0 && ended.current !== t.startedAt) {
      ended.current = t.startedAt;
      sfx.timesUp();
    }
  }, [t, remaining]);
}

export const isSwapMoment = (t: Timer | undefined, remaining: number) =>
  !!t?.startedAt && t.relay && remaining > 1000 && (t.durationMs - remaining) % 120_000 < 5000 && t.durationMs - remaining > 5000;

const LEVEL_STYLE = { easy: "bg-meadow text-[#12332b]", medium: "bg-sun text-[#12332b]", hard: "bg-signal text-white" } as const;
export const LevelChip = ({ level }: { level: keyof typeof LEVEL_STYLE }) => (
  <span className={`ml-2 inline-block rounded-[3px] px-2 py-0.5 align-middle text-xs font-bold capitalize ${LEVEL_STYLE[level]}`}>
    {level}
  </span>
);

/** One challenge card. `answer` shows the solution (TV after reveal; always on the host console). */
export function CardView({ game, index, answer, size = "md" }: { game: GameId; index: number; answer: boolean; size?: "md" | "xl" }) {
  const big = size === "xl";
  const codeCls = big ? "text-[clamp(1.4rem,2.6vw,3rem)]" : "";
  if (game === "bug") {
    const b = BUGS[index];
    return (
      <div>
        <p className={big ? "text-2xl" : "text-lg"}>
          Find the one bug in this Python: write down the line number and the fix.
          <LevelChip level={b.level} />
        </p>
        <Code code={b.code} className={`my-3 ${codeCls}`} />
        {answer && (
          <div className="mt-4 border-t-2 border-dashed border-line pt-4">
            <p className={big ? "text-2xl" : ""}>
              <strong className="font-extrabold">Line {b.line}.</strong> {b.why}
            </p>
            <Code code={b.fix} numbered={false} className={`mt-2 ${codeCls}`} />
          </div>
        )}
      </div>
    );
  }
  if (game === "output") {
    const o = OUTPUTS[index];
    return (
      <div>
        <p className={big ? "text-2xl" : "text-lg"}>What does this Python print?{o.tiebreak && <LevelChip level="hard" />}</p>
        <Code code={o.code} className={`my-3 ${codeCls}`} />
        {answer && (
          <div className="mt-4 border-t-2 border-dashed border-line pt-4">
            <pre className={`font-code font-bold ${big ? "text-[clamp(2rem,4vw,4.5rem)]" : "text-3xl"}`}>{o.answer}</pre>
            <p className={big ? "text-2xl" : ""}>{o.why}</p>
          </div>
        )}
      </div>
    );
  }
  if (game === "relay") {
    const r = RELAYS[index];
    return (
      <div>
        <p className="text-dim">
          Any language. Only the driver types; swap at every chime.
          <LevelChip level={r.level} />
        </p>
        <h3 className={`mt-3 lowercase ${big ? "text-[clamp(2.4rem,4.5vw,5rem)]" : "text-3xl"}`}>{r.name}</h3>
        <p className={`mt-2 max-w-[40ch] ${big ? "text-[clamp(1.5rem,2.4vw,2.6rem)] leading-snug" : "text-xl"}`}>{r.task}</p>
        {/* Teams need the tests to know when they're done, so they always show. */}
        <table className={`mt-5 ${big ? "text-2xl" : ""}`}>
          <thead>
            <tr className="text-left text-dim">
              <th className="pr-8 font-normal">Input</th>
              <th className="font-normal">Should print</th>
            </tr>
          </thead>
          <tbody className="font-code">
            {r.tests.map(([i, o]) => (
              <tr key={i + o} className="border-t border-line">
                <td className="py-1 pr-8">{i}</td>
                <td>
                  {o.split(" / ").map((line, j) => (
                    <span key={j} className="block">
                      {line}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={`mt-2 text-dim ${big ? "text-xl" : "text-sm"}`}>
          Commas separate inputs. Numbers pass if the value is right: 60, 60.0, and 60.00 all count.
        </p>
      </div>
    );
  }
  const l = LANGS[index];
  return (
    <div>
      <p className={big ? "text-2xl" : "text-lg"}>Which language is this?</p>
      <Code code={l.code} numbered={false} className={`my-3 ${codeCls}`} />
      {answer && (
        <div className="mt-4 border-t-2 border-dashed border-line pt-4">
          <p className={`font-extrabold tracking-[-0.02em] ${big ? "text-[clamp(2.4rem,4.5vw,5rem)]" : "text-3xl"}`}>{l.lang}</p>
          <p className={big ? "text-2xl" : ""}>{l.tell}</p>
        </div>
      )}
    </div>
  );
}
