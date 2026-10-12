// Runs Python for Fix it for real, off the page's main thread. src/lib/python.ts starts this worker, sends it one
// program and its stdin at a time, and terminates it (then starts a fresh one) if a program runs too long.
// Pyodide loads from its official CDN, pinned here. Nothing is bundled.
/* global importScripts, loadPyodide */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";

// Runs a program as main.py with the test's input as stdin, and returns [stdout, traceback or None] as JSON.
// The traceback starts at the program's own code, so it reads exactly like running `python main.py`.
const HARNESS = `
import io, json, linecache, sys, traceback

class _Out(io.StringIO):
    # Keeps the first 20,000 characters, so a runaway print loop can't use up memory before the timeout.
    def write(self, s):
        room = 20000 - self.tell()
        if room > 0:
            super().write(s[:room])
        return len(s)

def _run(code, stdin):
    out = _Out()
    linecache.cache["main.py"] = (len(code), None, code.splitlines(True), "main.py")
    sys.stdin, sys.stdout = io.StringIO(stdin), out
    err = None
    try:
        exec(compile(code, "main.py", "exec"), {"__name__": "__main__"})
    except SystemExit:
        pass
    except BaseException as e:
        tb = e.__traceback__
        while tb is not None and tb.tb_frame.f_code.co_filename != "main.py":
            tb = tb.tb_next
        err = "".join(traceback.format_exception(type(e), e, tb))
    finally:
        sys.stdin, sys.stdout = sys.__stdin__, sys.__stdout__
    return json.dumps([out.getvalue(), err])
`;

let run = null;

(async () => {
  try {
    importScripts(PYODIDE + "pyodide.js");
    const py = await loadPyodide({ indexURL: PYODIDE });
    py.runPython(HARNESS);
    run = py.globals.get("_run");
    postMessage({ type: "ready" });
  } catch (e) {
    postMessage({ type: "failed", message: String(e) });
  }
})();

onmessage = (e) => {
  const { id, code, stdin } = e.data;
  try {
    const [stdout, error] = JSON.parse(run(code, stdin));
    postMessage({ type: "result", id, stdout, error });
  } catch (err) {
    postMessage({ type: "result", id, stdout: "", error: String(err) });
  }
};
