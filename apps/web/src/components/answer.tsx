// Phone answering for Bug Hunt, Output?, and Guess the Language. Presentational only: the join page wires it
// to Convex, and the officer test page drives it with local state, so both show exactly the same thing.
import { useState } from "react";
import { BUGS } from "#/lib/content";
import { choices, searchLanguages } from "#/lib/grading";
import type { AnswerGame } from "#/lib/grading";
import { CardView, LevelChip } from "./game";
import { highlight } from "./ui";

/** The team's current answer, as every teammate's phone sees it. */
export interface TeamPick {
  line?: number;
  lineBy?: string;
  lineLocked: boolean;
  lineLockedBy?: string;
  choice?: string;
  choiceBy?: string;
  locked: boolean;
  lockedBy?: string;
}

/** Points awarded at the reveal (doubled on a double-points round). */
export interface Result {
  points: number;
  correct: boolean;
  early: boolean;
  line?: boolean;
  fix?: boolean;
}

export const NO_PICK: TeamPick = { lineLocked: false, locked: false };

export type PickArgs = { line: number } | { choice: string };

interface RoundProps {
  game: AnswerGame;
  index: number;
  revealed: boolean;
  /** Answers close at 0:00 or the reveal. */
  open: boolean;
  pick: TeamPick;
  result: Result | null;
  error?: string;
  onPick: (p: PickArgs) => void;
  onLock: (step: "line" | "answer") => void;
}

/** What a phone shows for an answerable card: the card and the team's answer, then the result after the reveal. */
export function PhoneRound(p: RoundProps) {
  if (p.revealed)
    return (
      <div className="space-y-3">
        <ResultBanner game={p.game} pick={p.pick} result={p.result} />
        <div className="card p-5">
          <CardView game={p.game} index={p.index} answer />
        </div>
      </div>
    );
  return (
    <div className="card p-5">
      {p.game === "bug" ? (
        <BugAnswer {...p} />
      ) : (
        <>
          <CardView game={p.game} index={p.index} answer={false} />
          {p.game === "output" ? (
            <>
              <ChoiceList
                options={choices("output", p.index)}
                pick={p.pick}
                disabled={!p.open || p.pick.locked}
                onPick={(choice) => p.onPick({ choice })}
              />
              <LockStep
                what={p.pick.choice && short(p.pick.choice)}
                by={p.pick.choiceBy}
                locked={p.pick.locked}
                lockedBy={p.pick.lockedBy}
                open={p.open}
                onLock={() => p.onLock("answer")}
              />
            </>
          ) : (
            <LangAnswer {...p} />
          )}
        </>
      )}
      {p.error && (
        <p role="alert" className="mt-3 rounded-[6px] bg-signal/10 px-4 py-3 font-semibold text-signal">
          {p.error}
        </p>
      )}
    </div>
  );
}

const short = (s: string) => (s.includes("\n") || s.length > 24 ? "an answer" : `“${s}”`);

/** Who picked what, and the button that locks it for the whole team. */
function LockStep({
  what,
  by,
  locked,
  lockedBy,
  open,
  onLock,
  label = "Lock in for the whole team",
}: {
  what?: string;
  by?: string;
  locked: boolean;
  lockedBy?: string;
  open: boolean;
  onLock: () => void;
  label?: string;
}) {
  if (locked)
    return (
      <p className="mt-4 rounded-[6px] bg-pine px-4 py-3 font-semibold text-white">
        Locked in by {lockedBy ?? "your team"}: {what}. That’s final for your team.
      </p>
    );
  if (!open)
    return (
      <p className="mt-4 rounded-[6px] bg-mist px-4 py-3 font-semibold">
        {what ? `Time’s up. Your team’s pick (${what}) still counts.` : "Time’s up. Answers are closed."}
      </p>
    );
  return (
    <div className="mt-4">
      <p className="text-center font-semibold">
        {what ? `${by ?? "Someone"} picked ${what}.` : "Nobody has picked yet. Anyone on your team can."}
      </p>
      <button className="btn btn-primary mt-3 w-full text-lg" disabled={!what} onClick={onLock}>
        {label}
      </button>
      <p className="mt-2 text-center text-sm text-dim">Anyone on your team can change the pick until someone locks it in.</p>
    </div>
  );
}

/** Four code-style choices: Output? answers or Bug Hunt fixes. */
function ChoiceList({
  options,
  pick,
  disabled,
  code = false,
  onPick,
}: {
  options: string[];
  pick: TeamPick;
  disabled: boolean;
  /** Highlight the choices as Python (fixes), rather than plain printed output. */
  code?: boolean;
  onPick: (choice: string) => void;
}) {
  return (
    <div className="mt-4 grid gap-2">
      {options.map((o) => {
        const on = pick.choice === o;
        return (
          <button
            key={o}
            type="button"
            disabled={disabled}
            onClick={() => onPick(o)}
            aria-pressed={on}
            className={`code block w-full text-left break-words whitespace-pre-wrap ${on ? "shadow-[inset_0_0_0_4px_var(--color-sun)]" : disabled ? "opacity-60" : ""}`}
          >
            {code
              ? o.split("\n").map((l, i) => <span key={i} className="block" dangerouslySetInnerHTML={{ __html: highlight(l) || " " }} />)
              : o}
            {on && <span className="mt-1 block font-sans text-sm font-bold text-sun">{pick.choiceBy ?? "Your team"} picked this</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Bug Hunt in two steps: tap the line and lock it, then pick the fix and lock that. */
function BugAnswer({ index, open, pick, onPick, onLock }: RoundProps) {
  const b = BUGS[index];
  const canTap = open && !pick.lineLocked;
  return (
    <div>
      <p className="text-lg">
        Find the one bug in this Python. Tap the line it’s on.
        <LevelChip level={b.level} />
      </p>
      <pre className="code my-3 px-0">
        <code className="block w-max min-w-full">
          {b.code.split("\n").map((l, i) => {
            const n = i + 1;
            const on = pick.line === n;
            return (
              <button
                key={i}
                type="button"
                disabled={!canTap || !l.trim()}
                onClick={() => onPick({ line: n })}
                aria-pressed={on}
                className={`cl w-full px-5 py-2 text-left ${on ? "bg-pine shadow-[inset_5px_0_0_var(--color-sun)]" : canTap && l.trim() ? "hover:bg-white/10" : ""}`}
              >
                <span className={`ln ${on ? "!text-sun" : ""}`}>{n}</span>
                <span dangerouslySetInnerHTML={{ __html: highlight(l) || " " }} />
              </button>
            );
          })}
        </code>
      </pre>
      <LockStep
        what={pick.line !== undefined ? `line ${pick.line}` : undefined}
        by={pick.lineBy}
        locked={pick.lineLocked}
        lockedBy={pick.lineLockedBy}
        open={open}
        onLock={() => onLock("line")}
        label="Lock in this line for the whole team"
      />
      {pick.lineLocked && (
        <div className="mt-6 border-t-2 border-dashed border-line pt-4">
          <p className="text-lg font-bold">Now pick the fix for line {pick.line}.</p>
          <ChoiceList
            options={choices("bug", index)}
            pick={pick}
            disabled={!open || pick.locked}
            code
            onPick={(choice) => onPick({ choice })}
          />
          <LockStep
            what={pick.choice && "a fix"}
            by={pick.choiceBy}
            locked={pick.locked}
            lockedBy={pick.lockedBy}
            open={open}
            onLock={() => onLock("answer")}
          />
        </div>
      )}
    </div>
  );
}

/** Search or scroll a list of languages, then tap one. */
function LangAnswer({ open, pick, onPick, onLock }: RoundProps) {
  const [q, setQ] = useState("");
  const list = searchLanguages(q);
  const disabled = !open || pick.locked;
  return (
    <div className="mt-4">
      <input
        type="search"
        className="field"
        placeholder="Search, or scroll the list"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Search languages"
      />
      <ul className="mt-2 grid max-h-80 grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain p-0.5">
        {list.map((l) => (
          <li key={l}>
            <button
              type="button"
              className={`btn w-full ${pick.choice === l ? "btn-on disabled:opacity-100" : ""}`}
              disabled={disabled}
              onClick={() => onPick({ choice: l })}
              aria-pressed={pick.choice === l}
            >
              {l}
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="col-span-2 p-3 text-dim">No match. Try another spelling, or clear the search and scroll.</li>}
      </ul>
      <LockStep
        what={pick.choice}
        by={pick.choiceBy}
        locked={pick.locked}
        lockedBy={pick.lockedBy}
        open={open}
        onLock={() => onLock("answer")}
      />
    </div>
  );
}

const mark = (ok?: boolean) => (ok ? "✓" : "✗");

/** "Correct! +N" or "Not this time", with what the team picked. */
function ResultBanner({ game, pick, result }: { game: AnswerGame; pick: TeamPick; result: Result | null }) {
  const pts = result?.points ?? 0;
  const tone = result?.correct ? "bg-meadow text-[#12332b]" : pts > 0 ? "bg-sun text-[#12332b]" : "bg-mist";
  const nothing = pick.line === undefined && pick.choice === undefined;
  return (
    <div className={`rounded-[10px] p-5 ${tone}`} role="status">
      <p className="text-4xl leading-none font-extrabold tracking-[-0.03em]">
        {result?.correct ? `Correct! +${pts}` : pts > 0 ? `Partly right. +${pts}` : "Not this time"}
      </p>
      <div className="mt-3 font-semibold">
        {nothing ? (
          <p>Your team didn’t pick an answer.</p>
        ) : game === "bug" ? (
          <>
            <p>
              Line {pick.line} {mark(result?.line)}
            </p>
            {pick.choice ? (
              <p className="mt-1">
                Fix {mark(result?.fix)} <code className="font-code">{pick.choice}</code>
              </p>
            ) : (
              <p className="mt-1">No fix picked.</p>
            )}
          </>
        ) : (
          <p>
            Your team picked <span className="font-code whitespace-pre-wrap">{pick.choice}</span> {mark(result?.correct)}
          </p>
        )}
        {result?.early && <p className="mt-1 font-normal">Includes the bonus for locking in early.</p>}
      </div>
    </div>
  );
}
