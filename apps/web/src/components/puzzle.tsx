// A puzzle on a laptop: the story, the example, the team's own input, a Python editor, and an answer box per part.
// Presentational: components/workspace.tsx wires it to Convex, and the officer test page drives it with local state.
import { ConvexError } from "convex/values";
import { useEffect, useState } from "react";
import { PUZZLES } from "#/lib/puzzles";
import { TIMEOUT_MS } from "#/lib/python";
import type { PyRun, Python } from "#/lib/python";
import { teamWords } from "#/lib/words";
import { Editor, PyState, Traceback } from "./fix";
import { Hint, LevelChip, PuzzleExample, Rich, fmtElapsed } from "./game";
import { Code } from "./ui";

export interface PuzzleResult {
  points: number;
  first1: boolean;
  first2: boolean;
}

interface Props {
  index: number;
  /** This team's puzzle input. */
  input: string;
  py: Python;
  revealed: boolean;
  hint: boolean;
  /** Answers close at 0:00 or the reveal. */
  open: boolean;
  /** Each star's time on the puzzle's clock, or null if the team doesn't have it yet. */
  stars: { part1Ms: number | null; part2Ms: number | null };
  /** When a wrong answer's lockout ends (this computer's clock), if the server says the team is locked out. */
  lockedUntil: number | null;
  result: PuzzleResult | null;
  /** Keeps code through a reload. */
  saveKey?: string;
  /** Checks an answer. Throw a ConvexError to show why it didn't count. */
  onSubmit: (part: 1 | 2, answer: string) => Promise<{ right: boolean; waitMs: number }>;
  /** A solo night: the input is one player's. */
  solo?: boolean;
}

const STARTER = `# Your puzzle input is in input.txt (and on stdin).
lines = open("input.txt").read().splitlines()
print(len(lines), "lines")
print(lines[0])
`;

export function PuzzleRound({ index, input, py, revealed, hint, open, stars, lockedUntil, result, saveKey, onSubmit, solo }: Props) {
  const p = PUZZLES[index];
  const [code, setCode] = useState(STARTER);
  const [busy, setBusy] = useState<"example" | "input" | null>(null);
  const [run, setRun] = useState<{ on: "example" | "input"; out: PyRun } | null>(null);
  const [error, setError] = useState("");
  const done1 = stars.part1Ms !== null;
  const done2 = stars.part2Ms !== null;
  const part: 1 | 2 = done1 ? 2 : 1;

  useEffect(() => {
    const saved = saveKey && localStorage.getItem(saveKey);
    if (saved) setCode(saved);
  }, [saveKey]);
  const edit = (c: string) => {
    setCode(c);
    if (saveKey) localStorage.setItem(saveKey, c);
  };

  const go = async (on: "example" | "input") => {
    setBusy(on);
    setError("");
    const text = on === "example" ? p.example : input;
    const out = await py.run(code, text, { "input.txt": text }).catch(() => null);
    if (!out) setError("Python isn’t ready. Reload the page and try again.");
    else setRun({ on, out });
    setBusy(null);
  };

  const can = py.status === "ready" && !busy;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="card space-y-4 p-5">
        <div>
          <h2 className="text-3xl lowercase">
            {p.name}
            <LevelChip level={p.level} />
          </h2>
          <p className="mt-2 text-lg leading-snug">
            <Rich text={p.story} />
          </p>
        </div>
        <Part n={1} text={p.part1} done={done1} />
        {(done1 || revealed) && <Part n={2} text={p.part2} done={done2} />}
        {hint && !revealed && !done2 && <Hint text={`Part ${part}: ${p.hint[part - 1]}`} />}
        <div className="border-t-2 border-dashed border-line pt-4">
          <PuzzleExample p={p} part2={done1 || revealed} />
        </div>
        {revealed && (
          <div className="border-t-2 border-dashed border-line pt-4">
            <p className="font-extrabold">One way to solve it in Python</p>
            <Code code={p.solution} className="mt-2 text-sm" />
          </div>
        )}
      </div>

      <div className="space-y-3">
        <Status revealed={revealed} open={open} stars={stars} result={result} />
        {!revealed && (
          <div className="space-y-2">
            <AnswerBox key={`1-${done1}`} part={1} done={done1} open={open} lockedUntil={lockedUntil} onSubmit={onSubmit} />
            {done1 && <AnswerBox key={`2-${done2}`} part={2} done={done2} open={open} lockedUntil={lockedUntil} onSubmit={onSubmit} />}
            <p className="text-sm text-dim">Any language or tool on this computer works. Only the answer counts.</p>
          </div>
        )}
        <InputBox input={input} solo={solo} />
        <Editor value={code} onChange={edit} />
        <div className="flex flex-wrap items-center gap-1">
          <button className="btn" disabled={!can} onClick={() => void go("example")}>
            {busy === "example" ? "Running…" : "Run on the example"}
          </button>
          <button className="btn btn-coin" disabled={!can} onClick={() => void go("input")}>
            {busy === "input" ? "Running…" : "Run on my input"}
          </button>
          <button
            className="btn btn-sm ml-auto text-dim"
            onClick={() => code !== STARTER && confirm("Start over? Your code will be gone.") && edit(STARTER)}
          >
            Reset code
          </button>
        </div>
        <PyState status={py.status} ready="Your input is in input.txt and on stdin. Try the example first: its answers are on the left." />
        {error && (
          <p role="alert" className="rounded-[6px] bg-signal/10 px-4 py-3 font-semibold text-signal">
            {error}
          </p>
        )}
        {run && <Output {...run} />}
      </div>
    </div>
  );
}

function Part({ n, text, done }: { n: 1 | 2; text: string; done: boolean }) {
  return (
    <div className={`border-l-4 pl-3 ${done ? "border-gold" : "border-line"}`}>
      <p className="font-extrabold">
        Part {n}
        {done && (
          <span className="ml-2 text-pine">
            <span className="text-sun">★</span> solved
          </span>
        )}
      </p>
      <p>
        <Rich text={text} />
      </p>
    </div>
  );
}

function Status({ revealed, open, stars, result }: Pick<Props, "revealed" | "open" | "stars" | "result">) {
  const n = Number(stars.part1Ms !== null) + Number(stars.part2Ms !== null);
  const times = [stars.part1Ms, stars.part2Ms].flatMap((ms, i) => (ms === null ? [] : [`part ${i + 1} at ${fmtElapsed(ms)}`]));
  if (revealed)
    return (
      <p className={`rounded-[10px] p-4 text-2xl font-extrabold ${n ? "bg-meadow text-[#12332b]" : "bg-mist"}`} role="status">
        {n ? `${"★".repeat(n)} +${result?.points ?? 0}` : "No stars this time. One way to solve it is on the left."}
        {result && (result.first1 || result.first2) && (
          <span className="block text-base font-semibold">
            First to {result.first1 && result.first2 ? "both stars" : `the part ${result.first1 ? 1 : 2} star`}.
          </span>
        )}
      </p>
    );
  if (n === 2)
    return (
      <p className="rounded-[10px] bg-meadow p-4 text-2xl font-extrabold text-[#12332b]" role="status">
        ★★ Both stars! Points go up at the reveal.
        <span className="block text-base font-semibold">{times.join(", ")}</span>
      </p>
    );
  if (!open)
    return (
      <p className="rounded-[10px] bg-mist p-4 text-xl font-bold" role="status">
        Time’s up. Waiting for the reveal.
      </p>
    );
  if (n === 1)
    return (
      <p className="rounded-[10px] bg-sun p-4 text-xl font-extrabold text-[#12332b]" role="status">
        ★ Part 1 is right ({times[0]}). Part 2 is on the left.
      </p>
    );
  return null;
}

/** One part's answer. A wrong answer locks the team out for 30 seconds, counted down here. */
export function AnswerBox({
  part,
  done,
  open,
  lockedUntil,
  onSubmit,
}: {
  part: 1 | 2;
  done: boolean;
  open: boolean;
  lockedUntil: number | null;
  onSubmit: Props["onSubmit"];
}) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const end = Math.max(until, lockedUntil ?? 0);
  const wait = Math.ceil((end - now) / 1000);
  useEffect(() => {
    if (end <= Date.now()) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= end) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [end]);

  if (done) return null;
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await onSubmit(part, answer);
      if (!r.right) {
        setUntil(Date.now() + r.waitMs);
        setNow(Date.now());
      }
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : "That didn’t go through. Check the connection and try again.");
    }
    setBusy(false);
  };
  return (
    <form
      className="card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (answer.trim()) void submit();
      }}
    >
      <label className="font-extrabold" htmlFor={`answer-${part}`}>
        Part {part} answer
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id={`answer-${part}`}
          className="field font-code"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={200}
          disabled={!open}
        />
        <button className="btn btn-primary" disabled={!open || busy || wait > 0 || !answer.trim()}>
          {busy ? "Checking…" : "Submit"}
        </button>
      </div>
      {wait > 0 && (
        <p role="alert" className="mt-2 font-semibold text-signal">
          That’s not right. Try again in {wait}s.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 font-semibold text-signal">
          {error}
        </p>
      )}
    </form>
  );
}

/** The team's own input, to copy into another tool or download as input.txt. */
export function InputBox({ input, solo }: { input: string; solo?: boolean }) {
  const [copied, setCopied] = useState(false);
  const download = () => {
    const url = URL.createObjectURL(new Blob([input + "\n"], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "input.txt" });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-1">
        <p className="mr-auto font-extrabold">
          Your puzzle input{" "}
          <span className="font-normal text-dim">
            · {input.split("\n").length} lines, just for {teamWords(solo).you}
          </span>
        </p>
        <button
          className="btn btn-sm"
          onClick={() =>
            void navigator.clipboard.writeText(input).then(
              () => setCopied(true),
              () => alert("Couldn’t copy. Use Download input.txt instead."),
            )
          }
        >
          {copied ? "Copied" : "Copy input"}
        </button>
        <button className="btn btn-sm" onClick={download}>
          Download input.txt
        </button>
      </div>
      <pre className="code mt-2 max-h-48 overflow-auto text-sm">{input}</pre>
    </div>
  );
}

/** What the program printed, and the traceback if it crashed. */
function Output({ on, out }: { on: "example" | "input"; out: PyRun }) {
  return (
    <div className="card p-4">
      <p className="font-bold">{on === "example" ? "On the example, your program printed" : "On your input, your program printed"}</p>
      <pre className="code mt-2 max-h-80 overflow-auto text-sm">{out.stdout.replace(/\n+$/, "") || "(nothing)"}</pre>
      {out.error && <Traceback text={out.error} />}
      {out.timedOut && (
        <p className="mt-2 font-semibold text-signal">Stopped after {TIMEOUT_MS / 1000} seconds. Is there a loop that never ends?</p>
      )}
    </div>
  );
}
