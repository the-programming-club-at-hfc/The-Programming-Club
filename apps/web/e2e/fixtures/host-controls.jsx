// This fixture mounts real source controls once, after the test intercepts their service imports.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { FeedbackProvider } from "../../src/components/feedback";
import { NextPanel } from "../../src/components/next";
import { HostBar, ScoresPane, ScreenPanel } from "../../src/routes/hello-world/host.tsx?tsr-split=component";
import { PlayTonight } from "../../src/routes/hello-world/join.tsx?tsr-split=component";
import { useRecordedCalls } from "./host-controls-convex.jsx";

const live = {
  _id: "local-session",
  week: 1,
  double: false,
  screen: { mode: "lobby" },
  timer: { durationMs: 90000, remainingMs: 90000, relay: false },
  sound: { music: false, volume: 0 },
  card: null,
  scored: [],
  practice: true,
  round: null,
  thisRound: [],
  autoTeams: true,
  teamSize: 2,
  unrevealed: [],
  teams: [{ _id: "local-team", name: "Local team", score: 7, members: ["Local player"] }],
  roster: [],
};
const lineup = [{ label: "Bug Hunt", double: false }];

function Fixture() {
  const [view, setView] = useState("phone");
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [changed, setChanged] = useState(false);
  const [playing, setPlaying] = useState(true);
  const calls = useRecordedCalls();
  const roundLive = {
    ...live,
    screen: { mode: "card", game: "bug", index: changed ? 1 : 0, revealed: false },
    unrevealed: [changed ? "bug:1" : "bug:0"],
  };
  return (
    <FeedbackProvider>
      <main id="host-control-fixture" className="fixed inset-0 z-[90] overflow-auto bg-paper p-5 text-ink">
        <nav aria-label="Host test cases" className="mb-5 flex flex-wrap gap-2">
          {["phone", "teams", "round", "screen", "tonight"].map((name) => (
            <button key={name} className="btn" onClick={() => setView(name)}>
              {name}
            </button>
          ))}
        </nav>
        {view === "phone" && <HostBar live={live} />}
        {view === "teams" && <ScoresPane live={changed ? roundLive : live} keys={{}} open={settingsOpen} setOpen={setSettingsOpen} />}
        {view === "screen" && <ScreenPanel live={{ ...live, screen: { game: "bug", index: 0, revealed: false, mode: "lobby" } }} />}
        {view === "tonight" && (
          <>
            <PlayTonight token="local-player-token" playing={playing} />
            <button className="btn" onClick={() => setPlaying(false)}>
              Simulate hosting
            </button>
          </>
        )}
        {view === "round" && <NextPanel live={roundLive} lineup={lineup} used={[]} shown={[]} />}
        {/* Outside the modal tree: tests can simulate a realtime update while approval is pending. */}
        <button id="host-change-context" className="btn mt-4" onClick={() => setChanged(true)}>
          Simulate another card arriving
        </button>
        <output aria-label="Local host mutation calls" className="mt-5 block">
          {JSON.stringify(calls)}
        </output>
      </main>
    </FeedbackProvider>
  );
}

export function mount() {
  if (document.getElementById("host-test-mount")) throw new Error("Host fixture already mounted");
  const element = document.createElement("div");
  element.id = "host-test-mount";
  document.body.append(element);
  const root = createRoot(element);
  root.render(
    <StrictMode>
      <Fixture />
    </StrictMode>,
  );
  return () => {
    root.unmount();
    element.remove();
  };
}
