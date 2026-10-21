import { useEffect, useRef, useState } from "react";
import type { Doc } from "../../convex/_generated/dataModel";
import { BUGS, LANGS, OUTPUTS, RELAYS } from "#/lib/content";
import { FIXES } from "#/lib/fixes";
import type { FixCard } from "#/lib/fixes";
import { PUZZLES } from "#/lib/puzzles";
import type { Puzzle } from "#/lib/puzzles";
import { cardSeconds } from "#/lib/grading";
import { Code } from "./ui";
import { sfx } from "#/lib/sound";

export type Screen = Doc<"sessions">["screen"];
export type Timer = Doc<"sessions">["timer"];
export type GameId = NonNullable<Screen["game"]>;

export const DECKS: Record<GameId, { name: string; size: number; seconds: (i: number) => number }> = {
  bug: { name: "Bug Hunt", size: BUGS.length, seconds: (i) => cardSeconds("bug", i) },
  output: { name: "Output?", size: OUTPUTS.length, seconds: (i) => cardSeconds("output", i) },
  relay: { name: "Code Relay", size: RELAYS.length, seconds: (i) => cardSeconds("relay", i) },
  lang: { name: "Guess the Language", size: LANGS.length, seconds: (i) => cardSeconds("lang", i) },
  fix: { name: "Fix it for real", size: FIXES.length, seconds: (i) => cardSeconds("fix", i) },
  puzzle: { name: "Puzzle", size: PUZZLES.length, seconds: (i) => cardSeconds("puzzle", i) },
};

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Time since a card's clock started, like "2:14". */
export const fmtElapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** The lines (1-based) of a Fix it for real card's fix that aren't in the buggy program. */
export const fixedLines = (f: FixCard) => {
  const before = new Set(f.code.split("\n"));
  return f.fix.split("\n").flatMap((l, i) => (before.has(l) ? [] : [i + 1]));
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
export const Hint = ({ text, big = false }: { text: string; big?: boolean }) => (
  <p className={`rounded-[6px] bg-sun px-4 py-3 font-semibold text-[#12332b] ${big ? "text-[clamp(1.3rem,2vw,2.2rem)]" : ""}`}>
    Hint: {text}
  </p>
);
export const FixHint = ({ card, big = false }: { card: FixCard; big?: boolean }) => <Hint text={card.hint} big={big} />;

/** Puzzle text with `backticks` shown as code. */
export const Rich = ({ text }: { text: string }) => (
  <>
    {text.split("`").map((part, i) =>
      i % 2 ? (
        <code key={i} className="rounded-[3px] bg-mist px-1 font-code">
          {part}
        </code>
      ) : (
        part
      ),
    )}
  </>
);

/** A puzzle's example input and how it gets its answers. Part 2 stays hidden until `part2`. */
export function PuzzleExample({ p, part2, big = false }: { p: Puzzle; part2: boolean; big?: boolean }) {
  return (
    <div className={`grid gap-3 ${big ? "grid-cols-[auto_minmax(0,1fr)] gap-[2vw] text-[clamp(1.2rem,1.7vw,2rem)]" : "text-sm"}`}>
      <div>
        <p className="font-bold text-dim">Example input</p>
        <pre className={`code mt-1 ${big ? "text-[clamp(1rem,1.4vw,1.7rem)]" : "text-sm"}`}>{p.example}</pre>
      </div>
      <div className="space-y-2">
        {(part2 ? [0, 1] : [0]).map((i) => (
          <p key={i}>
            <strong className="font-extrabold">
              Part {i + 1}: <span className="font-code">{i ? p.exampleAnswers.part2 : p.exampleAnswers.part1}</span>.
            </strong>{" "}
            {p.exampleWhy[i]}
          </p>
        ))}
      </div>
    </div>
  );
}

export const LevelChip = ({ level }: { level: keyof typeof LEVEL_STYLE }) => (
  <span className={`ml-2 inline-block rounded-[3px] px-2 py-0.5 align-middle text-xs font-bold capitalize ${LEVEL_STYLE[level]}`}>
    {level}
  </span>
);

/**
 * One challenge card. `answer` shows the solution (TV after reveal; always on the host console).
 * `hint` shows a Fix it for real card’s hint (or a puzzle’s part 1 hint) once an officer puts it up.
 */
export function CardView({
  game,
  index,
  answer,
  hint = false,
  size = "md",
  solo = false,
}: {
  game: GameId;
  index: number;
  answer: boolean;
  hint?: boolean;
  size?: "md" | "xl";
  /** A solo night: puzzles are solved alone, on your own computer. */
  solo?: boolean;
}) {
  const big = size === "xl";
  const codeCls = big ? "text-[clamp(1.4rem,2.6vw,3rem)]" : "";
  if (game === "puzzle") {
    const p = PUZZLES[index];
    // The TV swaps the story for the example walkthrough on reveal; the host console shows everything.
    return (
      <div>
        <p className={`text-dim ${big ? "text-[clamp(1.1rem,1.6vw,1.8rem)]" : ""}`}>
          Solve it in any language, then answer on your phone or laptop.{" "}
          {!solo && (p.relay ? "One keyboard: swap drivers at every chime." : "Everyone helps.")}
          <LevelChip level={p.level} />
        </p>
        <h3 className={`mt-3 lowercase ${big ? "text-[clamp(2.4rem,4.5vw,5rem)]" : "text-3xl"}`}>{p.name}</h3>
        {!(answer && big) && (
          <p className={`mt-2 max-w-[62ch] ${big ? "text-[clamp(1.3rem,2vw,2.3rem)] leading-snug" : "text-lg"}`}>
            <Rich text={p.story} />
          </p>
        )}
        {hint && !answer && (
          <div className="mt-4">
            <Hint text={`Part 1: ${p.hint[0]}`} big={big} />
          </div>
        )}
        {answer && !big && (
          <div className="mt-4 space-y-3 border-t-2 border-dashed border-line pt-4">
            <p>
              <strong className="font-extrabold">Part 1.</strong> <Rich text={p.part1} />
            </p>
            <p>
              <strong className="font-extrabold">Part 2.</strong> <Rich text={p.part2} />
            </p>
            <PuzzleExample p={p} part2 />
            <p className="text-sm text-dim">
              Hints: <strong>1.</strong> {p.hint[0]} <strong>2.</strong> {p.hint[1]}
            </p>
            <details className="text-sm">
              <summary className="cursor-pointer py-2 font-bold">A Python solution</summary>
              <Code code={p.solution} className="mt-2" />
            </details>
          </div>
        )}
        {answer && big && (
          <div className="mt-4">
            <PuzzleExample p={p} part2 big />
          </div>
        )}
      </div>
    );
  }
  if (game === "fix") {
    const f = FIXES[index];
    // The TV swaps the buggy program for the fix on reveal, so both fit; the host console shows both.
    return (
      <div>
        <p className={big ? "text-[clamp(1.5rem,2.2vw,2.4rem)] leading-snug" : "text-lg"}>
          {f.task}
          <LevelChip level={f.level} />
        </p>
        {!(answer && big) && <Code code={f.code} className={`my-3 ${big ? "text-[clamp(1.2rem,2vw,2.4rem)]" : ""}`} />}
        {hint && !answer && <FixHint card={f} big={big} />}
        {answer && (
          <div className={big ? "mt-4" : "mt-4 border-t-2 border-dashed border-line pt-4"}>
            <p className={big ? "text-2xl" : ""}>
              <strong className="font-extrabold">The fix.</strong> {f.why}
            </p>
            <Code code={f.fix} mark={fixedLines(f)} className={`mt-2 ${big ? "text-[clamp(1.2rem,2vw,2.4rem)]" : ""}`} />
          </div>
        )}
      </div>
    );
  }
  if (game === "bug") {
    const b = BUGS[index];
    return (
      <div>
        <p className={big ? "text-2xl" : "text-lg"}>
          Find the one bug in this Python: pick its line on a phone, then the fix.
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
          {solo ? "Any language." : "Any language. Only the driver types; swap at every chime."}
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
      {/* Long lines wrap rather than scroll, so a phone shows the whole snippet. */}
      <Code code={l.code} numbered={false} wrap className={`my-3 ${big ? codeCls : "max-sm:px-4 max-sm:text-[0.8125rem]"}`} />
      {answer && (
        <div className="mt-4 border-t-2 border-dashed border-line pt-4">
          <p className={`font-extrabold tracking-[-0.02em] ${big ? "text-[clamp(2.4rem,4.5vw,5rem)]" : "text-3xl"}`}>{l.lang}</p>
          <p className={big ? "text-2xl" : ""}>{l.tell}</p>
        </div>
      )}
    </div>
  );
}
