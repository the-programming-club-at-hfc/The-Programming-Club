// Phone answering for Bug Hunt, Output?, and Guess the Language. Presentational only: the join page wires it
// to Convex, and the officer test page drives it with local state, so both show exactly the same thing.
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { BUGS, LANGS } from "#/lib/content";
import { choices, placeOf } from "#/lib/grading";
import type { AnswerGame } from "#/lib/grading";
import { teamWords } from "#/lib/words";
import type { TeamWords } from "#/lib/words";
import { CardView, LevelChip } from "./game";
import { highlight, ordinal } from "./ui";

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
  /** A solo night: the copy speaks to one player. */
  solo?: boolean;
  /** Tonight's teams, best first, for the standings after the reveal. */
  teams?: Standing[];
  /** This phone's team in `teams`. */
  teamId?: string;
  /** How many teams have locked in, while waiting for the reveal. */
  lockedIn?: { locked: number; of: number };
}

export interface Standing {
  _id: string;
  name: string;
  score: number;
}

/**
 * What a phone shows for an answerable card: the card and the team's answer; once answers close, what the team's
 * answer is; after the reveal, the result and the standings.
 */
export function PhoneRound(p: RoundProps) {
  const w = teamWords(p.solo);
  if (p.revealed)
    return (
      <div className="space-y-3">
        <ResultBanner game={p.game} index={p.index} pick={p.pick} result={p.result} w={w} />
        {p.teams && p.teams.length > 0 && <Standings teams={p.teams} mine={p.teamId} />}
        <div className="card p-5">
          {/* The language and its tell are in the banner already. */}
          <CardView game={p.game} index={p.index} answer={p.game !== "lang"} />
        </div>
      </div>
    );
  if (!p.open)
    return (
      <div className="space-y-3">
        <TimesUp game={p.game} pick={p.pick} lockedIn={p.lockedIn} w={w} />
        <div className="card p-5 opacity-60">
          <CardView game={p.game} index={p.index} answer={false} />
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
                disabled={p.pick.locked}
                onPick={(choice) => p.onPick({ choice })}
                w={w}
              />
              <LockStep
                what={p.pick.choice && short(p.pick.choice)}
                by={p.pick.choiceBy}
                locked={p.pick.locked}
                lockedBy={p.pick.lockedBy}
                onLock={() => p.onLock("answer")}
                w={w}
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
  onLock,
  label,
  w,
}: {
  what?: string;
  by?: string;
  locked: boolean;
  lockedBy?: string;
  onLock: () => void;
  label?: string;
  w: TeamWords;
}) {
  if (locked)
    return (
      <p className="mt-4 rounded-[6px] bg-pine px-4 py-3 font-semibold text-white">
        {w.lockedBy(lockedBy)}: {what}. {w.final}
      </p>
    );
  return (
    <div className="mt-4">
      <p className="text-center font-semibold">{what ? `${w.who(by)} picked ${what}.` : w.nobodyPicked}</p>
      <button className="btn btn-primary mt-3 w-full text-lg" disabled={!what} onClick={onLock}>
        {label ?? w.lockAll}
      </button>
      <p className="mt-2 text-center text-sm text-dim">{w.canChange}</p>
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
  w,
}: {
  options: string[];
  pick: TeamPick;
  disabled: boolean;
  /** Highlight the choices as Python (fixes), rather than plain printed output. */
  code?: boolean;
  onPick: (choice: string) => void;
  w: TeamWords;
}) {
  return (
    <RadioGroup
      aria-label={code ? "Choose a fix" : "Choose an answer"}
      value={pick.choice ?? null}
      disabled={disabled}
      onValueChange={(choice) => choice !== null && onPick(choice)}
      className="mt-4 grid gap-2"
    >
      {options.map((o) => {
        const on = pick.choice === o;
        return (
          <Radio.Root
            key={o}
            value={o}
            nativeButton
            render={<button type="button" />}
            className={`code block w-full text-left break-words whitespace-pre-wrap ${on ? "shadow-[inset_0_0_0_4px_var(--color-sun)]" : disabled ? "opacity-60" : ""}`}
          >
            {code
              ? o.split("\n").map((l, i) => <span key={i} className="block" dangerouslySetInnerHTML={{ __html: highlight(l) || " " }} />)
              : o}
            {on && <span className="mt-1 block font-sans text-sm font-bold text-sun">{w.who(pick.choiceBy, w.You)} picked this</span>}
          </Radio.Root>
        );
      })}
    </RadioGroup>
  );
}

/** Bug Hunt in two steps: tap the line and lock it, then pick the fix and lock that. */
function BugAnswer({ index, pick, onPick, onLock, solo }: RoundProps) {
  const w = teamWords(solo);
  const b = BUGS[index];
  const canTap = !pick.lineLocked;
  return (
    <div>
      <p className="text-lg">
        Find the one bug in this Python. Tap the line it’s on.
        <LevelChip level={b.level} />
      </p>
      <RadioGroup
        render={<pre />}
        aria-label="Choose the buggy line"
        value={pick.line ?? null}
        disabled={!canTap}
        onValueChange={(line) => line !== null && onPick({ line })}
        className="code my-3 px-0"
      >
        <code className="block w-max min-w-full">
          {b.code.split("\n").map((l, i) => {
            const n = i + 1;
            const on = pick.line === n;
            return (
              <Radio.Root
                key={i}
                value={n}
                nativeButton
                render={<button type="button" />}
                disabled={!l.trim()}
                aria-label={`Line ${n}: ${l}`}
                className={`cl w-full px-5 py-2 text-left ${on ? "bg-pine shadow-[inset_5px_0_0_var(--color-sun)]" : canTap && l.trim() ? "hover:bg-white/10" : ""}`}
              >
                <span className={`ln ${on ? "!text-sun" : ""}`}>{n}</span>
                <span dangerouslySetInnerHTML={{ __html: highlight(l) || " " }} />
              </Radio.Root>
            );
          })}
        </code>
      </RadioGroup>
      <LockStep
        what={pick.line !== undefined ? `line ${pick.line}` : undefined}
        by={pick.lineBy}
        locked={pick.lineLocked}
        lockedBy={pick.lineLockedBy}
        onLock={() => onLock("line")}
        label={w.lockLine}
        w={w}
      />
      {pick.lineLocked && (
        <div className="mt-6 border-t-2 border-dashed border-line pt-4">
          <p className="text-lg font-bold">Now pick the fix for line {pick.line}.</p>
          <ChoiceList
            options={choices("bug", index)}
            pick={pick}
            disabled={pick.locked}
            code
            onPick={(choice) => onPick({ choice })}
            w={w}
          />
          <LockStep
            what={pick.choice && "a fix"}
            by={pick.choiceBy}
            locked={pick.locked}
            lockedBy={pick.lockedBy}
            onLock={() => onLock("answer")}
            w={w}
          />
        </div>
      )}
    </div>
  );
}

/** Four big language buttons, then the lock that names the pick. */
function LangAnswer({ index, pick, onPick, onLock, solo }: RoundProps) {
  const w = teamWords(solo);
  return (
    <>
      <RadioGroup
        aria-label="Choose a language"
        value={pick.choice ?? null}
        disabled={pick.locked}
        onValueChange={(choice) => choice !== null && onPick({ choice })}
        className="mt-4 grid grid-cols-2 gap-2"
      >
        {choices("lang", index).map((l) => (
          <Radio.Root
            key={l}
            value={l}
            nativeButton
            render={<button type="button" />}
            className={`btn min-h-16 w-full text-lg ${pick.choice === l ? "btn-on disabled:opacity-100" : ""}`}
          >
            {l}
          </Radio.Root>
        ))}
      </RadioGroup>
      <LockStep
        what={pick.choice}
        by={pick.choiceBy}
        locked={pick.locked}
        lockedBy={pick.lockedBy}
        onLock={() => onLock("answer")}
        label={pick.choice && `Lock in ${pick.choice}`}
        w={w}
      />
    </>
  );
}

const mark = (ok?: boolean) => (ok ? "✓" : "✗");

/** The team's answer, big: the language, the printed output, or the line and fix. Marked right or wrong once scored. */
function Picked({ game, pick, result }: { game: AnswerGame; pick: TeamPick; result?: Result | null }) {
  const marked = result !== undefined;
  if (game === "bug")
    return (
      <div className="mt-2 font-semibold">
        <p className="text-2xl font-extrabold">
          Line {pick.line} {marked && mark(result?.line)}
        </p>
        {pick.choice ? (
          <p className="mt-1">
            Fix {marked && mark(result?.fix)} <code className="font-code">{pick.choice}</code>
          </p>
        ) : (
          <p className="mt-1">No fix picked.</p>
        )}
      </div>
    );
  // The mark sits beside the whole block, so it reads as the verdict on every line of a multiline answer.
  return (
    <div className="mt-2 flex items-center gap-3">
      {game === "lang" ? (
        <p className="min-w-0 flex-1 text-4xl leading-none font-extrabold tracking-[-0.03em] wrap-anywhere">{pick.choice}</p>
      ) : (
        <pre className="min-w-0 flex-1 overflow-x-auto rounded-[6px] border-2 border-current/25 px-4 py-2 font-code text-3xl font-bold">
          {pick.choice}
        </pre>
      )}
      {marked && <span className="shrink-0 text-3xl leading-none font-extrabold">{mark(result?.correct)}</span>}
    </div>
  );
}

/** Answers are closed but not revealed yet: what the team's answer is (an unlocked pick still counts), and the wait. */
function TimesUp({ game, pick, lockedIn, w }: { game: AnswerGame; pick: TeamPick; lockedIn?: RoundProps["lockedIn"]; w: TeamWords }) {
  const nothing = pick.line === undefined && pick.choice === undefined;
  const locked = pick.locked && (game !== "bug" || pick.lineLocked);
  return (
    <div className="rounded-[10px] bg-mist p-5" role="status">
      {nothing ? (
        <p className="text-4xl leading-none font-extrabold tracking-[-0.03em]">No answer this time</p>
      ) : (
        <>
          <p className="font-semibold">{locked ? w.lockedBy(pick.lockedBy) : `${w.Your} pick still counts`}</p>
          <Picked game={game} pick={pick} />
        </>
      )}
      <p className="mt-4 font-semibold">Time’s up. Waiting for the answer.</p>
      {lockedIn && (
        <p className="mt-1 text-sm text-dim">
          {lockedIn.locked} of {lockedIn.of} {lockedIn.of === 1 ? w.team : w.teams} locked in.
        </p>
      )}
    </div>
  );
}

/** "Right! +N" or "Not this time", with what the team picked (Guess the Language: the language and its tell). */
function ResultBanner({
  game,
  index,
  pick,
  result,
  w,
}: {
  game: AnswerGame;
  index: number;
  pick: TeamPick;
  result: Result | null;
  w: TeamWords;
}) {
  const pts = result?.points ?? 0;
  const tone = result?.correct ? "bg-meadow text-[#12332b]" : pts > 0 ? "bg-sun text-[#12332b]" : "bg-mist";
  const nothing = pick.line === undefined && pick.choice === undefined;
  const l = LANGS[index];
  return (
    <div className={`rounded-[10px] p-5 ${tone}`} role="status">
      <p className="text-4xl leading-none font-extrabold tracking-[-0.03em]">
        {result?.correct ? `Right! +${pts}` : pts > 0 ? `Partly right. +${pts}` : "Not this time"}
      </p>
      <div className="mt-3 font-semibold">
        {game === "lang" ? (
          <>
            <p className="text-2xl font-extrabold">{result?.correct ? `It’s ${l.lang}.` : `It was ${l.lang}.`}</p>
            <p className="mt-1 font-normal">{l.tell}</p>
          </>
        ) : nothing ? (
          <p>{w.You} didn’t pick an answer.</p>
        ) : (
          <>
            {game === "output" && <p>{w.You} picked</p>}
            <Picked game={game} pick={pick} result={result} />
          </>
        )}
        {result?.early && <p className="mt-1 font-normal">Includes the bonus for locking in early.</p>}
      </div>
    </div>
  );
}

/** The top three and, below them if it isn't one, this team, with its row highlighted. Ties share a place. */
function Standings({ teams, mine }: { teams: Standing[]; mine?: string }) {
  const at = teams.findIndex((t) => t._id === mine);
  const rows = at > 2 ? [...teams.slice(0, 3), ...(at > 3 ? [null] : []), teams[at]] : teams.slice(0, 3);
  const scores = teams.map((t) => t.score);
  return (
    <ol className="card p-2" aria-label="Standings">
      {rows.map((t) =>
        t ? (
          <li
            key={t._id}
            className={`flex items-center gap-3 rounded-[6px] px-3 py-2 ${t._id === mine ? "bg-pine text-white" : ""}`}
            aria-current={t._id === mine || undefined}
          >
            <span className="w-10 shrink-0 font-bold">{ordinal(placeOf(t.score, scores))}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{t.name}</span>
            <span className="narrow text-2xl leading-none font-extrabold">{t.score}</span>
          </li>
        ) : (
          <li key="gap" className="px-3 leading-none text-dim" aria-hidden>
            …
          </li>
        ),
      )}
    </ol>
  );
}
