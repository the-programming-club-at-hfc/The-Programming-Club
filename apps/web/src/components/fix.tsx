// Fix it for real on a laptop: the task, the examples, an editor with the buggy program, Run, and Check.
// Presentational: components/workspace.tsx wires it to Convex, and the officer test page drives it with local state.
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { FIXES } from "#/lib/fixes";
import type { FixTest } from "#/lib/fixes";
import { TIMEOUT_MS, runTests } from "#/lib/python";
import type { Python, TestResult } from "#/lib/python";
import { FixHint, LevelChip, fixedLines, fmtElapsed } from "./game";
import { Code } from "./ui";

export interface FixResult {
  points: number;
  first: boolean;
}

interface Props {
  index: number;
  py: Python;
  revealed: boolean;
  hint: boolean;
  /** Fixes close at 0:00 or the reveal. */
  open: boolean;
  /** The team's fix, once the server has it: time on the card's clock (null if the clock never started). */
  fixed: { ms: number | null } | null;
  result: FixResult | null;
  /** Keeps edits through a reload. */
  saveKey?: string;
  /** Called once every test passes. Throw a ConvexError to show why it didn't count. */
  onFixed: (code: string) => Promise<unknown>;
}

export function FixRound({ index, py, revealed, hint, open, fixed, result, saveKey, onFixed }: Props) {
  const card = FIXES[index];
  const [code, setCode] = useState(card.code);
  const [busy, setBusy] = useState<"run" | "check" | null>(null);
  const [results, setResults] = useState<{ kind: "run" | "check"; list: TestResult[]; planned: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = saveKey && localStorage.getItem(saveKey);
    if (saved) setCode(saved);
  }, [saveKey]);
  const edit = (c: string) => {
    setCode(c);
    if (saveKey) localStorage.setItem(saveKey, c);
  };

  const go = async (kind: "run" | "check") => {
    setBusy(kind);
    setError("");
    const tests = card.tests.map((test, i) => ({ i, test })).filter(({ test }) => kind === "check" || test.show);
    const list = await runTests(py, code, tests).catch(() => null);
    if (!list) setError("Python isn’t ready. Reload the page and try again.");
    else {
      setResults({ kind, list, planned: tests.length });
      if (kind === "check" && !fixed && list.length === card.tests.length && list.every((r) => r.pass))
        await onFixed(code).catch((e: unknown) =>
          setError(
            e instanceof ConvexError
              ? String(e.data)
              : "Your fix works, but it didn’t reach the scoreboard. Check the connection and press Check again.",
          ),
        );
    }
    setBusy(null);
  };

  const hidden = card.tests.filter((t) => !t.show).length;
  const can = py.status === "ready" && !busy;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="card space-y-4 p-5">
        <p className="text-xl leading-snug">
          {card.task}
          <LevelChip level={card.level} />
        </p>
        <Examples tests={card.tests.filter((t) => t.show)} />
        <p className="text-sm text-dim">
          {hidden} more hidden test{hidden === 1 ? "" : "s"} check your fix too.
        </p>
        {hint && !revealed && <FixHint card={card} />}
        {revealed && (
          <div className="border-t-2 border-dashed border-line pt-4">
            <p>
              <strong className="font-extrabold">The fix.</strong> {card.why}
            </p>
            <Code code={card.fix} mark={fixedLines(card)} className="mt-2" />
          </div>
        )}
      </div>

      <div className="space-y-3">
        <Status revealed={revealed} open={open} fixed={fixed} result={result} />
        <Editor value={code} onChange={edit} />
        <div className="flex flex-wrap items-center gap-1">
          <button className="btn btn-coin" disabled={!can} onClick={() => void go("run")}>
            {busy === "run" ? "Running…" : "Run"}
          </button>
          <button className="btn btn-primary" disabled={!can || (!open && !fixed)} onClick={() => void go("check")}>
            {busy === "check" ? "Checking…" : "Check my fix"}
          </button>
          <button
            className="btn btn-sm ml-auto text-dim"
            onClick={() =>
              code !== card.code && confirm("Start over from the buggy program? Your changes will be gone.") && edit(card.code)
            }
          >
            Reset code
          </button>
        </div>
        <PyState status={py.status} />
        {error && (
          <p role="alert" className="rounded-[6px] bg-signal/10 px-4 py-3 font-semibold text-signal">
            {error}
          </p>
        )}
        {results && <Results {...results} total={card.tests.length} />}
      </div>
    </div>
  );
}

export function PyState({
  status,
  ready = "Run tries the examples. Check my fix runs every test.",
}: {
  status: Python["status"];
  ready?: string;
}) {
  if (status === "ready") return <p className="text-sm text-dim">{ready}</p>;
  if (status === "failed")
    return (
      <p role="alert" className="font-semibold text-signal">
        Python didn’t load. Check the internet connection, then reload the page.
      </p>
    );
  return (
    <p className="font-semibold" role="status">
      Getting Python ready…<span className="blink"> _</span>
    </p>
  );
}

function Status({ revealed, open, fixed, result }: Pick<Props, "revealed" | "open" | "fixed" | "result">) {
  const at = fixed && fixed.ms !== null ? ` at ${fmtElapsed(fixed.ms)}` : "";
  if (revealed)
    return (
      <p className={`rounded-[10px] p-4 text-2xl font-extrabold ${result ? "bg-meadow text-[#12332b]" : "bg-mist"}`} role="status">
        {result ? `Fixed! +${result.points}${result.first ? ", first to fix it" : ""}` : "Not fixed this time. The fix is on the left."}
      </p>
    );
  if (fixed)
    return (
      <p className="rounded-[10px] bg-meadow p-4 text-2xl font-extrabold text-[#12332b]" role="status">
        Fixed!{at} Points go up at the reveal.
      </p>
    );
  if (!open)
    return (
      <p className="rounded-[10px] bg-mist p-4 text-xl font-bold" role="status">
        Time’s up. Waiting for the reveal.
      </p>
    );
  return null;
}

const lines = (s: string) => s || "(nothing)";

function Examples({ tests }: { tests: FixTest[] }) {
  return (
    <div className="space-y-2">
      {tests.map((t, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="font-bold text-dim">{tests.length > 1 ? `Example ${i + 1} input` : "Example input"}</p>
            <pre className="code mt-1 text-sm">{t.input || "(no input)"}</pre>
          </div>
          <div>
            <p className="font-bold text-dim">Should print</p>
            <pre className="code mt-1 text-sm">{lines(t.output)}</pre>
          </div>
        </div>
      ))}
    </div>
  );
}

/** A plain editor: line numbers, Tab adds 4 spaces (Esc, then Tab, moves on). */
export function Editor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const n = value.split("\n").length;
  const escaped = useRef(false);
  return (
    <div className="code flex p-0 focus-within:shadow-[inset_0_0_0_3px_var(--color-sun)]">
      <pre aria-hidden className="py-4 pr-3 pl-4 text-right text-[#7d9a92] select-none">
        {Array.from({ length: n }, (_, i) => i + 1).join("\n")}
      </pre>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            escaped.current = true;
            return;
          }
          if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !escaped.current) {
            e.preventDefault();
            const t = e.currentTarget;
            t.setRangeText("    ", t.selectionStart, t.selectionEnd, "end");
            onChange(t.value);
          }
          escaped.current = false;
        }}
        rows={n + 1}
        wrap="off"
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        aria-label="Your program"
        className="min-w-0 flex-1 resize-none overflow-y-hidden bg-transparent py-4 pr-4 outline-none"
      />
    </div>
  );
}

/** What Run or Check found: examples in full; hidden tests only pass or fail, never their input or output. */
function Results({ kind, list, planned, total }: { kind: "run" | "check"; list: TestResult[]; planned: number; total: number }) {
  const passed = list.filter((r) => r.pass).length;
  const all = kind === "check" && passed === total;
  let ex = 0;
  let hid = 0;
  return (
    <div className="space-y-3">
      <p className={`text-xl font-extrabold ${all ? "text-pine" : ""}`}>
        {all
          ? "Every test passes!"
          : kind === "run"
            ? `${passed} of ${list.length} example${list.length === 1 ? "" : "s"} right`
            : `${passed} of ${total} tests pass`}
      </p>
      {list.map((r) => {
        const label = r.test.show ? `Example ${++ex}` : `Hidden test ${++hid}`;
        if (!r.test.show)
          return (
            <p key={r.i} className="font-semibold">
              {r.pass ? "✓" : "✗"} {label}
              {!r.pass && <span className="font-normal text-dim">: {problem(r)}</span>}
            </p>
          );
        return (
          <div key={r.i} className="card p-4">
            <p className="font-bold">
              {r.pass ? "✓" : "✗"} {label}
            </p>
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <p className="font-bold text-dim">Should print</p>
                <pre className="code mt-1 text-sm">{lines(r.test.output)}</pre>
              </div>
              <div>
                <p className="font-bold text-dim">Your program printed</p>
                <pre className={`code mt-1 text-sm ${r.pass ? "" : "shadow-[inset_4px_0_0_var(--color-signal)]"}`}>
                  {lines(r.run.stdout.replace(/\n+$/, ""))}
                </pre>
              </div>
            </div>
            {r.run.error && <Traceback text={r.run.error} />}
            {r.run.timedOut && <p className="mt-2 font-semibold text-signal">{TIMED_OUT}</p>}
          </div>
        );
      })}
      {list.length < planned && <p className="text-sm text-dim">The other tests didn’t run. Fix the loop, then try again.</p>}
    </div>
  );
}

const TIMED_OUT = `Stopped after ${TIMEOUT_MS / 1000} seconds. Is there a loop that never ends?`;

/** Why a hidden test failed, without showing its input or output. */
function problem(r: TestResult) {
  if (r.run.timedOut) return "took too long";
  if (!r.run.error) return "wrong output";
  const name = /^([A-Za-z_][\w.]*)(?::|$)/.exec(lastLine(r.run.error))?.[1];
  return `crashed with ${name ?? "an error"}`;
}

const lastLine = (s: string) => s.trimEnd().split("\n").at(-1) ?? "";

/** The traceback as Python prints it, with the last line (what went wrong) big and bold. */
export function Traceback({ text }: { text: string }) {
  const all = text.trimEnd().split("\n");
  return (
    <div className="mt-3">
      <p className="rounded-t-[6px] bg-signal px-3 py-2 font-code text-lg font-bold break-words text-white">{all.at(-1)}</p>
      <pre className="code rounded-t-none text-sm">{all.join("\n")}</pre>
    </div>
  );
}
