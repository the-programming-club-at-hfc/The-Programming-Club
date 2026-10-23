// Vite serves the real source and CSS; no application root, auth, or backend is mounted.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Sketch } from "../../src/components/draw";
import { FeedbackProvider } from "../../src/components/feedback";
import { useDrawingState } from "./drawing-convex";
import "../../src/styles.css";

function DrawingFixture() {
  const [mounted, setMounted] = useState(true);
  const [editable, setEditable] = useState(true);
  const { calls } = useDrawingState();
  return (
    <FeedbackProvider>
      <main id="drawing-fixture" className="theme-cup min-h-screen overflow-auto bg-paper p-4 text-ink">
        <nav className="mb-3 flex gap-3">
          <button className="btn" onClick={() => document.getElementById("drawing-fixture").requestFullscreen()}>
            Enter drawing fullscreen
          </button>
          <button className="btn" onClick={() => setMounted((value) => !value)}>
            {mounted ? "Unmount Sketch" : "Mount Sketch"}
          </button>
          <button className="btn" onClick={() => setEditable((value) => !value)}>
            Toggle drawing edit
          </button>
        </nav>
        <section aria-label="Sketch fixture" className="max-w-xl">
          {mounted && <Sketch drawingId="isolated-drawing" token="local-drawer" rev={7} edit={editable} />}
        </section>
        <output aria-label="Drawing mutation calls" className="sr-only">
          {JSON.stringify(calls)}
        </output>
      </main>
    </FeedbackProvider>
  );
}

export function mountDrawingFixture() {
  createRoot(document.getElementById("drawing-test-root")).render(
    <StrictMode>
      <DrawingFixture />
    </StrictMode>,
  );
}
