// Wiki Race on phones: "We made it!" for the team (Fewest Clicks: the click count). Presentational only: the join page
// wires it to Convex, and the officer test page drives it with local state, so both show exactly the same thing.
import { useState } from "react";
import { fmtElapsed } from "./game";
import { ordinal } from "./ui";

/** The team's finish, as every teammate's phone sees it. `ok` is the referee's check; `place` is live until scored. */
export interface RaceFinish {
  ms: number | null;
  clicks: number | null;
  ok: boolean | null;
  by: string | null;
  place: number | null;
}

/** Points at the end (doubled on a double-points round). No place: the team didn't finish. */
export interface RaceResult {
  points: number;
  place?: number;
}

/** The start and target articles. */
export const WikiPair = ({ from, to }: { from: string; to: string }) => (
  <div className="grid grid-cols-2 gap-[3px]">
    <div className="bg-mist p-5">
      <p className="text-sm text-dim">Start here</p>
      <p className="mt-1 text-2xl font-extrabold">{from}</p>
    </div>
    <div className="tile tile-sky p-5">
      <p className="text-sm">Get to</p>
      <p className="mt-1 text-2xl font-extrabold">{to}</p>
    </div>
  </div>
);

interface RoundProps {
  from: string;
  to: string;
  /** Fewest Clicks: the team sends its count instead of racing the clock. */
  clicks: boolean;
  /** Finishes close at 0:00 or when the race ends. */
  open: boolean;
  revealed: boolean;
  finish: RaceFinish | null;
  result: RaceResult | null;
  error?: string;
  onFinish: (clicks?: number) => void;
  onUndo: () => void;
}

/** What a phone shows during a Wiki Race: the race, the team's finish button, then its points once it's scored. */
export function WikiRound(p: RoundProps) {
  const [sure, setSure] = useState(false);
  const [count, setCount] = useState("");
  const n = Number(count);
  const valid = count !== "" && Number.isInteger(n) && n >= 1 && n <= 999;
  const turnedDown = p.finish?.ok === false;
  const finished = p.finish && !turnedDown ? p.finish : null;
  return (
    <div className="space-y-3">
      <WikiPair from={p.from} to={p.to} />
      {p.clicks && !p.revealed && <p className="font-semibold">Fewest clicks wins. Count every link you click.</p>}
      {p.revealed ? (
        <RaceBanner result={p.result} />
      ) : finished ? (
        <div className="rounded-[10px] bg-meadow p-5 text-[#12332b]" role="status">
          <p className="text-4xl leading-none font-extrabold tracking-[-0.03em]">You made it!</p>
          <p className="mt-3 font-semibold">
            {[
              finished.clicks !== null && `${finished.clicks} click${finished.clicks === 1 ? "" : "s"}`,
              finished.place !== null && `${ordinal(finished.place)} so far`,
              finished.ms !== null && `at ${fmtElapsed(finished.ms)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
            {finished.by && <span className="font-normal"> · tapped by {finished.by}</span>}
          </p>
          <p className="mt-1">
            {finished.ok ? "The referee checked it. ✓" : "Raise your hand and keep the target article open so the referee can check it."}
          </p>
          {finished.ok === null && (
            <button className="btn btn-sm mt-3" onClick={p.onUndo}>
              Undo: we’re not there yet
            </button>
          )}
        </div>
      ) : !p.open ? (
        <p className="rounded-[6px] bg-mist px-4 py-3 font-semibold">
          {turnedDown ? "The referee said not yet, and time’s up." : "Time’s up. The race is closed."}
        </p>
      ) : (
        <div className="card p-5">
          {turnedDown && (
            <p className="mb-4 rounded-[6px] bg-sun/30 px-4 py-3 font-semibold">The referee says not yet. Keep going, then tap again.</p>
          )}
          {sure ? (
            <>
              <p className="text-center text-xl font-bold">
                {p.clicks ? `Send ${n} click${n === 1 ? "" : "s"} for your team?` : `On the ${p.to} article?`}
              </p>
              <p className="mt-1 text-center text-dim">You can undo it until the referee checks.</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="btn" onClick={() => setSure(false)}>
                  Not yet
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setSure(false);
                    p.onFinish(p.clicks ? n : undefined);
                  }}
                >
                  {p.clicks ? "Yes, send it" : "Yes, we made it"}
                </button>
              </div>
            </>
          ) : (
            <>
              {p.clicks && (
                <label className="mb-3 block">
                  <span className="font-bold">Clicks to get there</span>
                  <input
                    className="field mt-2 text-center text-3xl font-extrabold"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={999}
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    placeholder="7"
                  />
                </label>
              )}
              <button
                className="btn btn-primary min-h-24 w-full text-3xl font-extrabold"
                disabled={p.clicks && !valid}
                onClick={() => setSure(true)}
              >
                We made it!
              </button>
              <p className="mt-2 text-center text-sm text-dim">Anyone on your team can tap it once you land on {p.to}.</p>
            </>
          )}
        </div>
      )}
      {p.error && (
        <p role="alert" className="rounded-[6px] bg-signal/10 px-4 py-3 font-semibold text-signal">
          {p.error}
        </p>
      )}
    </div>
  );
}

/** "2nd place! +4" or "+1 for playing" once the race is scored. */
function RaceBanner({ result }: { result: RaceResult | null }) {
  const place = result?.place;
  const tone = place !== undefined && place <= 3 ? "bg-meadow text-[#12332b]" : place !== undefined ? "bg-sun text-[#12332b]" : "bg-mist";
  return (
    <div className={`rounded-[10px] p-5 ${tone}`} role="status">
      <p className="text-4xl leading-none font-extrabold tracking-[-0.03em]">
        {!result ? "Race over" : place !== undefined ? `${ordinal(place)} place! +${result.points}` : `+${result.points} for playing`}
      </p>
      {result && place === undefined && <p className="mt-2 font-semibold">Your team didn’t finish this time.</p>}
    </div>
  );
}
