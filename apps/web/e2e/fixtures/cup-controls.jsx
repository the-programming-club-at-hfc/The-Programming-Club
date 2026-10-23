// Loaded only by Playwright through the Vite development server. All action data is local.
import { StrictMode, Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConvexError } from "convex/values";
import { NO_PICK, PhoneRound } from "../../src/components/answer";
import { FeedbackProvider, useConfirm, useNotify } from "../../src/components/feedback";
import { useAction } from "../../src/components/officer";
import { SearchPicker } from "../../src/components/search-picker";
import { FixRound } from "../../src/components/fix";
import { PuzzleRound } from "../../src/components/puzzle";
import { choices } from "../../src/lib/grading";

function Answers() {
  const [game, setGame] = useState("lang");
  const [pick, setPick] = useState(NO_PICK);
  const [pickEvents, setPickEvents] = useState(0);
  return (
    <section aria-label="Player answers">
      <div className="flex gap-2">
        {["lang", "output", "bug"].map((id) => (
          <button
            key={id}
            className="btn"
            onClick={() => {
              setGame(id);
              setPick(NO_PICK);
            }}
          >
            Test {id}
          </button>
        ))}
      </div>
      <button className="btn" onClick={() => setPick((old) => ({ ...old, choice: choices(game, 0)[2], choiceBy: "Another teammate" }))}>
        Receive teammate pick
      </button>
      <PhoneRound
        game={game}
        index={0}
        revealed={false}
        open
        pick={pick}
        result={null}
        onPick={(value) => {
          setPickEvents((count) => count + 1);
          setPick((old) => ({ ...old, ...value, ...("choice" in value ? { choiceBy: "Test teammate" } : { lineBy: "Test teammate" }) }));
        }}
        onLock={(step) => setPick((old) => (step === "line" ? { ...old, lineLocked: true } : { ...old, locked: true }))}
      />
      <output aria-label="Answer state">{JSON.stringify(pick)}</output>
      <output aria-label="Pick events">{pickEvents}</output>
    </section>
  );
}

function FeedbackCases() {
  const confirm = useConfirm();
  const notify = useNotify();
  const run = useAction();
  const [accepted, setAccepted] = useState(0);
  const [decisions, setDecisions] = useState([]);
  const [ownerVisible, setOwnerVisible] = useState(true);
  const [abandoned, setAbandoned] = useState("");
  const request = (title) => ({
    title,
    description: "This changes only local test state.",
    confirmLabel: "Apply test action",
    cancelLabel: "Keep test state",
    destructive: true,
  });
  return (
    <section aria-label="Feedback cases" className="space-y-3">
      <button
        className="btn"
        onClick={async () => {
          if (await confirm(request("Confirm test action"))) setAccepted((n) => n + 1);
        }}
      >
        Ask to apply
      </button>
      <button
        className="btn"
        onClick={() => {
          void confirm(request("First queued action")).then((value) => setDecisions((old) => [...old, `first:${value}`]));
          void confirm(request("Second queued action")).then((value) => setDecisions((old) => [...old, `second:${value}`]));
        }}
      >
        Queue two actions
      </button>
      <button className="btn" onClick={() => void run(Promise.reject(new ConvexError("Test action failed")))}>
        Fail test action
      </button>
      <button className="btn" onClick={() => notify.info("Test information")}>
        Show information
      </button>
      <output aria-label="Accepted actions">{accepted}</output>
      <output aria-label="Queued decisions">{decisions.join(",")}</output>
      {ownerVisible && <RequestOwner onLeave={() => setOwnerVisible(false)} onDecision={(value) => setAbandoned(String(value))} />}
      <output aria-label="Abandoned decision">{abandoned}</output>
    </section>
  );
}

function RequestOwner({ onLeave, onDecision }) {
  const confirm = useConfirm();
  return (
    <button
      className="btn"
      onClick={() => {
        void confirm({
          title: "Abandoned test action",
          description: "The requesting component is about to leave.",
          confirmLabel: "Apply abandoned action",
        }).then(onDecision);
        onLeave();
      }}
    >
      Ask and leave
    </button>
  );
}

const python = { status: "ready", run: () => Promise.resolve({ stdout: "", error: null, timedOut: false }) };

function CodeCases() {
  const [puzzle, setPuzzle] = useState(false);
  return (
    <section aria-label="Code reset">
      <button className="btn" onClick={() => setPuzzle((value) => !value)}>
        Switch code exercise
      </button>
      {puzzle ? (
        <PuzzleRound
          index={0}
          input="1\n2\n3"
          py={python}
          revealed={false}
          hint={false}
          open
          stars={{ part1Ms: null, part2Ms: null }}
          lockedUntil={null}
          result={null}
          onSubmit={() => Promise.resolve({ right: false, waitMs: 0 })}
        />
      ) : (
        <FixRound index={0} py={python} revealed={false} hint={false} open fixed={null} result={null} onFixed={() => Promise.resolve()} />
      )}
    </section>
  );
}

const options = [
  { value: "bug", label: "Bug Hunt", group: "Code" },
  { value: "output", label: "Output?", group: "Code" },
  { value: "draw", label: "Tech Pictionary", group: "Drawing" },
];

function Pickers() {
  const [added, setAdded] = useState([]);
  const [selected, setSelected] = useState("bug");
  return (
    <section aria-label="Game picker">
      <SearchPicker
        label="Add a game"
        options={options}
        value={null}
        onValueChange={(value) => {
          if (value) setAdded((old) => [...old, value]);
        }}
      />
      <output aria-label="Added games">{added.join(",")}</output>
      <SearchPicker label="Chosen game" options={options} value={selected} onValueChange={setSelected} />
      <SearchPicker label="Disabled game" options={options} value="bug" disabled onValueChange={() => {}} />
    </section>
  );
}

function Fixture() {
  const [view, setView] = useState("feedback");
  return (
    <FeedbackProvider>
      <div id="cup-control-fixture" className="fixed inset-0 z-[90] overflow-auto bg-paper p-5 text-ink">
        <nav aria-label="Test cases" className="mb-5 flex flex-wrap gap-2">
          {["feedback", "answers", "picker", "code"].map((id) => (
            <button key={id} className="btn" onClick={() => setView(id)}>
              {id}
            </button>
          ))}
          <button className="btn" onClick={() => document.getElementById("cup-control-fixture").requestFullscreen()}>
            Enter fullscreen
          </button>
        </nav>
        <Suspense fallback={<p>Loading test case…</p>}>
          {view === "feedback" ? <FeedbackCases /> : view === "answers" ? <Answers /> : view === "picker" ? <Pickers /> : <CodeCases />}
        </Suspense>
      </div>
    </FeedbackProvider>
  );
}

export function mount() {
  const root = document.createElement("div");
  root.id = "cup-test-mount";
  document.body.append(root);
  const app = createRoot(root);
  app.render(
    <StrictMode>
      <Fixture />
    </StrictMode>,
  );
  return () => {
    app.unmount();
    root.remove();
  };
}
