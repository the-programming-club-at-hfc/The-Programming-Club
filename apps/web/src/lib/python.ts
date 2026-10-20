// Python in the browser for Fix it for real and puzzles. Pyodide runs in a Web Worker (public/py-worker.js, which pins the
// version and loads it from the official CDN), so a program that never ends can be stopped: after TIMEOUT_MS the
// worker is terminated and a fresh one starts loading.
import { useEffect, useRef, useState } from "react";
import type { FixTest } from "./fixes";
import { sameOutput } from "./grading";

export const TIMEOUT_MS = 5000;

export type PyStatus = "loading" | "ready" | "failed";

export interface PyRun {
  stdout: string;
  /** The traceback, exactly as Python prints it, or null if the program finished. */
  error: string | null;
  /** Stopped after TIMEOUT_MS. */
  timedOut: boolean;
}

type FromWorker =
  | { type: "ready" }
  | { type: "failed"; message: string }
  // `fatal`: Pyodide itself broke (e.g. out of memory), so the worker has to start over.
  | { type: "result"; id: number; stdout: string; error: string | null; fatal?: boolean };

class Runner {
  private worker!: Worker;
  private ready!: Promise<void>;
  private next = 0;
  private pending = new Map<number, (r: PyRun) => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private disposed = false;

  constructor(private onStatus: (s: PyStatus) => void) {
    this.start();
  }

  private start() {
    this.onStatus("loading");
    const w = new Worker("/py-worker.js", { type: "module" });
    this.worker = w;
    this.ready = new Promise((resolve, reject) => {
      const fail = (why?: string) => {
        // Officers can see why in the console; players get the reload message.
        if (why) console.error("Python didn’t load:", why);
        this.onStatus("failed");
        reject(new Error("Python didn’t load."));
      };
      w.onerror = (e) => fail(e.message);
      w.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.type === "ready") {
          this.onStatus("ready");
          resolve();
        } else if (m.type === "failed") fail(m.message);
        else {
          this.pending.get(m.id)?.({ stdout: m.stdout, error: m.error, timedOut: false });
          this.pending.delete(m.id);
          if (m.fatal) this.restart();
        }
      };
    });
    this.ready.catch(() => {});
  }

  async run(code: string, stdin: string, files?: Record<string, string>): Promise<PyRun> {
    await this.ready;
    const id = ++this.next;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        this.pending.delete(id);
        this.restart();
        resolve({ stdout: "", error: null, timedOut: true });
      }, TIMEOUT_MS);
      this.timers.add(timer);
      this.pending.set(id, (r) => {
        clearTimeout(timer);
        this.timers.delete(timer);
        resolve(r);
      });
      this.worker.postMessage({ id, code, stdin, files });
    });
  }

  private restart() {
    this.worker.terminate();
    if (!this.disposed) this.start();
  }

  dispose() {
    this.disposed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.worker.terminate();
  }
}

export interface Python {
  status: PyStatus;
  /** Runs a program with `stdin`. `files` are written next to it first, e.g. { "input.txt": "..." }. */
  run: (code: string, stdin: string, files?: Record<string, string>) => Promise<PyRun>;
}

/** Starts loading Python as soon as `enabled` is true (the page opens), and keeps it ready for runs. */
export function usePython(enabled = true): Python {
  const [status, setStatus] = useState<PyStatus>("loading");
  const runner = useRef<Runner | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const r = new Runner(setStatus);
    runner.current = r;
    return () => {
      r.dispose();
      runner.current = null;
    };
  }, [enabled]);
  return {
    status,
    run: (code, stdin, files) =>
      runner.current ? runner.current.run(code, stdin, files) : Promise.reject(new Error("Python isn’t running.")),
  };
}

export interface TestResult {
  /** Position in the card's test list. */
  i: number;
  test: FixTest;
  run: PyRun;
  pass: boolean;
}

/** Runs the program once per test, in order. Stops after a timeout, since Python has to load again. */
export async function runTests(py: Python, code: string, tests: { i: number; test: FixTest }[]) {
  const out: TestResult[] = [];
  for (const { i, test } of tests) {
    const run = await py.run(code, test.input);
    out.push({ i, test, run, pass: !run.timedOut && run.error === null && sameOutput(run.stdout, test.output) });
    if (run.timedOut) break;
  }
  return out;
}
