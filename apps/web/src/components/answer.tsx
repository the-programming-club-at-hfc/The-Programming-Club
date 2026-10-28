// Phone answering for Bug Hunt, Output?, and Guess the Language. Presentational only: the join page wires it
// to Convex, and the officer test page drives it with local state, so both show exactly the same thing.
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { BUGS, LANGS } from "#/lib/content";
import type { Bug } from "#/lib/types";
import { choices, hintWindow, placeOf } from "#/lib/grading";
import type { AnswerGame } from "#/lib/grading";
import { teamWords } from "#/lib/words";
import type { TeamWords } from "#/lib/words";
import { AskBeetle, BeetleLayer } from "./beetle";
import { CardView, LevelChip } from "./game";
import { Code, highlight, ordinal } from "./ui";

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
  /** Bug Hunt: someone on the team asked the beetle (no early bonus), and who. */
  hint?: boolean;
  hintBy?: string;
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
  /** Bug Hunt: ask the beetle for a hint. The officer test page leaves it out. */
  onAsk?: () => void;
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
  if (p.game === "bug") return <BugRound {...p} />;
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
      <ErrorNote error={p.error} />
    </div>
  );
}

const ErrorNote = ({ error }: { error?: string }) =>
  error && (
    <p role="alert" className="mt-3 rounded-[6px] bg-signal/10 px-4 py-3 font-semibold text-signal">
      {error}
    </p>
  );

const short = (s: string) => (s.includes("\n") || s.length > 24 ? "an answer" : `“${s}”`);

/** Who picked what, and the button that locks it for the whole team. */
function LockStep({
  what,
  by,
  locked,
  lockedBy,
  onLock,
  label,
  compact = false,
  w,
}: {
  what?: string;
  by?: string;
  locked: boolean;
  lockedBy?: string;
  onLock: () => void;
  label?: string;
  /** Bug Hunt's second lock, beside the code: smaller, and without the reminder the first lock already gave. */
  compact?: boolean;
  w: TeamWords;
}) {
  if (locked)
    return (
      <p className="mt-4 rounded-[6px] bg-pine px-4 py-3 font-semibold text-white @min-[60rem]:py-2 @min-[60rem]:text-sm">
        {w.lockedBy(lockedBy)}: {what}. {w.final}
      </p>
    );
  return (
    <div className="mt-4">
      <p className="text-center font-semibold">{what ? `${w.who(by)} picked ${what}.` : w.nobodyPicked}</p>
      <button
        className={`btn btn-primary mt-3 w-full text-lg ${compact ? "@min-[60rem]:mt-2 @min-[60rem]:text-base" : ""}`}
        disabled={!what}
        onClick={onLock}
      >
        {label ?? w.lockAll}
      </button>
      <p className={`mt-2 text-center text-sm text-dim ${compact ? "@min-[60rem]:hidden" : ""}`}>{w.canChange}</p>
    </div>
  );
}

/** Columns of leading whitespace (a tab is 4, like the code's tab-size). */
const indentOf = (l: string) => [...(l.match(/^\s*/)?.[0] ?? "")].reduce((n, c) => n + (c === "\t" ? 4 : 1), 0);

/**
 * One line of a fix, highlighted, that wraps between tokens and never inside a name: at spaces, before a `.` or `->`,
 * and after an opening bracket, a comma, or a path's `/`. `->`, `${`, and `#{` stay whole, and a short operator ending
 * the line (`=`, `||`, `{`) stays with the word before it, so it never sits alone.
 */
const wrappable = (line: string, lang: string) =>
  highlight(line.replace(/ (\S{1,2})$/, "\u00a0$1"), lang).replace(
    /(<[^>]*>)|-&gt;|[#$]\{|(?<!\d)\.(?=[A-Za-z_<])|[([,]|\/(?=[^\s/])/g,
    (m, tag?: string) =>
      tag
        ? m
        : m === "-&gt;"
          ? '<wbr><span class="whitespace-nowrap">-&gt;</span>'
          : m.endsWith("{")
            ? `<span class="whitespace-nowrap">${m}</span>`
            : m === "."
              ? "<wbr>."
              : `${m}<wbr>`,
  );

/** Four code-style choices: Output? answers or Bug Hunt fixes. */
function ChoiceList({
  options,
  pick,
  disabled,
  lang,
  onPick,
  w,
}: {
  options: string[];
  pick: TeamPick;
  disabled: boolean;
  /** Highlight the choices as code in this language (fixes), rather than plain printed output. */
  lang?: string;
  onPick: (choice: string) => void;
  w: TeamWords;
}) {
  return (
    <RadioGroup
      aria-label={lang ? "Choose a fix" : "Choose an answer"}
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
            className={`code block w-full text-left break-words whitespace-pre-wrap pointer-fine:px-4 pointer-fine:py-1.5 @min-[60rem]:px-3 @min-[60rem]:py-1 @min-[60rem]:text-[0.9rem] @min-[60rem]:leading-[1.45] ${on ? "shadow-[inset_0_0_0_4px_var(--color-sun)]" : disabled ? "opacity-60" : "pointer-fine:hover:bg-[#1a3d34]"}`}
          >
            {lang
              ? // Each line keeps its indent, and the rest of a long one hangs 2 columns further in.
                o
                  .split("\n")
                  .map((l, i) => (
                    <span
                      key={i}
                      className="block indent-[-2ch]"
                      style={{ paddingLeft: `${indentOf(l) + 2}ch` }}
                      dangerouslySetInnerHTML={{ __html: wrappable(l.trimStart(), lang) || " " }}
                    />
                  ))
              : o}
            {on && (
              <span className="mt-1 block font-sans text-sm font-bold text-sun @min-[60rem]:mt-0.5">
                {w.who(pick.choiceBy, w.You)} picked this
              </span>
            )}
          </Radio.Root>
        );
      })}
    </RadioGroup>
  );
}

/**
 * Bug Hunt, on every screen. On a computer the code sits on the left and the steps (or, later, the result) beside it,
 * sticky, so the fix choices never scroll the code away. On a phone they stack: the steps under the code, the result
 * above it. Wide is a container query (60rem: room for 60 characters of code beside the steps), so the officer test
 * page's phone frame stays a phone on a laptop.
 */
function BugRound(p: RoundProps) {
  const w = teamWords(p.solo);
  const b = BUGS[p.index];
  const answering = p.open && !p.revealed;
  const code = useRef<HTMLElement>(null);
  const hint = p.pick.hint ? hintWindow(p.index) : undefined;
  return (
    <div className="@container">
      <div className="mx-auto grid max-w-2xl grid-cols-[minmax(0,1fr)] gap-3 @min-[60rem]:max-w-none @min-[60rem]:grid-cols-[minmax(0,46rem)_minmax(24rem,1fr)] @min-[60rem]:items-start @min-[60rem]:gap-5">
        {/* Wide, the code needs no card around it: the room goes to the code. */}
        <div
          className={`card p-5 @min-[60rem]:bg-transparent @min-[60rem]:p-0 @min-[60rem]:shadow-none ${p.open || p.revealed ? "" : "opacity-60"}`}
        >
          <p className="text-lg">
            Find the one bug in this {b.lang ?? "Python"}. <span className="pointer-fine:hidden">Tap</span>
            <span className="hidden pointer-fine:inline">Click</span> the line it’s on.
            <LevelChip level={b.level} />
          </p>
          {(b.name || b.context) && (
            <p className="mt-1">
              {b.name && <strong className="font-extrabold">{b.name}</strong>}
              {b.name && b.context && " · "}
              {b.context && <span className="text-dim">{b.context}</span>}
            </p>
          )}
          <BugCode
            b={b}
            pick={p.pick}
            canTap={answering && !p.pick.lineLocked}
            // The answer's lines, once it's out.
            mark={p.revealed ? b.lines : []}
            onPick={(line) => p.onPick({ line })}
            codeRef={code}
          >
            <BeetleLayer
              code={code}
              lines={b.code.split("\n").length}
              hint={hint}
              lockedLine={p.pick.lineLocked || p.revealed ? p.pick.line : undefined}
              outcome={p.revealed ? (p.result?.line ? "caught" : "escaped") : undefined}
            />
          </BugCode>
          {/* Under the code, where a long fix has room; why it's the fix is beside it. */}
          {p.revealed && (
            <>
              <p className="mt-4 font-bold">The fix</p>
              <Code code={b.fix} numbered={false} wrap lang={b.lang} className="mt-1" />
            </>
          )}
        </div>
        {/* Clear of join's sticky bar, and scrolling on its own if a card's fixes run long. */}
        <div
          className={`space-y-3 @min-[60rem]:sticky @min-[60rem]:top-20 @min-[60rem]:max-h-[calc(100dvh-6rem)] @min-[60rem]:overflow-y-auto ${answering ? "" : "order-first @min-[60rem]:order-none"}`}
        >
          {p.revealed ? (
            <>
              <ResultBanner game="bug" index={p.index} pick={p.pick} result={p.result} w={w} />
              <BugReveal b={b} />
              {p.teams && p.teams.length > 0 && <Standings teams={p.teams} mine={p.teamId} />}
            </>
          ) : p.open ? (
            <>
              <BugSteps {...p} />
              {/* Once the line is locked the beetle can't help, and the fixes need the room. */}
              {p.onAsk && !p.pick.lineLocked && (
                <AskBeetle
                  asked={!!p.pick.hint}
                  askedBy={p.pick.hintBy}
                  hint={hint}
                  lineLocked={p.pick.lineLocked}
                  open={p.open}
                  onAsk={p.onAsk}
                  solo={p.solo}
                />
              )}
            </>
          ) : (
            <TimesUp game="bug" pick={p.pick} lockedIn={p.lockedIn} w={w} />
          )}
          <ErrorNote error={p.error} />
        </div>
      </div>
    </div>
  );
}

/**
 * A Bug Hunt card's code, a row per line, each a radio button for "the buggy line". The rows sit in a positioned
 * `[data-bug-code]` wrapper that doesn't clip, each with `data-line` (1-based), so an overlay can be placed against a
 * row; the line numbers are a gutter at least 2.5rem wide.
 */
function BugCode({
  b,
  pick,
  canTap,
  mark,
  onPick,
  codeRef,
  children,
}: {
  b: Bug;
  pick: TeamPick;
  canTap: boolean;
  mark: number[];
  onPick: (line: number) => void;
  codeRef?: RefObject<HTMLElement | null>;
  /** Drawn over the rows, like the beetle. */
  children?: ReactNode;
}) {
  return (
    <RadioGroup
      render={<pre />}
      aria-label="Choose the buggy line"
      value={pick.line ?? null}
      disabled={!canTap}
      onValueChange={(line) => line !== null && onPick(line)}
      className="code mt-3 px-0 pointer-fine:py-2 @min-[60rem]:mt-2"
    >
      <code ref={codeRef} data-bug-code className="relative block w-max min-w-full">
        {b.code.split("\n").map((l, i) => {
          const n = i + 1;
          const on = pick.line === n;
          const bug = mark.includes(n);
          // Once the answer is out, the bug's line is the one marked, and the team's pick reads right or wrong.
          const tone = !mark.length
            ? on
              ? "bg-pine shadow-[inset_5px_0_0_var(--color-sun)]"
              : canTap && l.trim()
                ? "cursor-pointer hover:bg-white/10"
                : ""
            : on && bug
              ? "bg-pine shadow-[inset_5px_0_0_var(--color-meadow)]"
              : on
                ? "bg-signal/25 shadow-[inset_5px_0_0_var(--color-signal)]"
                : bug
                  ? "bg-sun/25 shadow-[inset_5px_0_0_var(--color-sun)]"
                  : "";
          const verdict = mark.length > 0 && on ? (bug ? "✓" : "✗") : null;
          return (
            <Radio.Root
              key={i}
              value={n}
              nativeButton
              render={<button type="button" />}
              disabled={!l.trim()}
              aria-label={`Line ${n}: ${l}${bug ? " (the bug)" : ""}${verdict ? ` (${verdict === "✓" ? "your pick, right" : "your pick, wrong"})` : ""}`}
              data-line={n}
              className={`cl relative w-full py-2 pr-5 text-left focus-visible:-outline-offset-3 pointer-fine:py-0 pointer-fine:leading-[1.4] ${tone}`}
            >
              <span
                className={`ln w-12 pr-3.5 text-right ${verdict === "✗" ? "!text-signal" : bug ? (on ? "!text-meadow" : "!text-sun") : on ? "!text-sun" : ""}`}
              >
                {n}
              </span>
              <span dangerouslySetInnerHTML={{ __html: highlight(l, b.lang) || " " }} />
              {verdict && (
                <span
                  className={`absolute right-1.5 font-sans font-extrabold ${verdict === "✓" ? "text-meadow" : "text-signal"}`}
                  aria-hidden
                >
                  {verdict}
                </span>
              )}
            </Radio.Root>
          );
        })}
        {children}
      </code>
    </RadioGroup>
  );
}

/** Bug Hunt in two steps: pick the line and lock it, then pick the fix and lock that. */
function BugSteps({ index, pick, onPick, onLock, solo }: RoundProps) {
  const w = teamWords(solo);
  return (
    <div className="card p-5 @min-[60rem]:p-4 [&>:first-child]:mt-0">
      <LockStep
        what={pick.line !== undefined ? `line ${pick.line}` : undefined}
        by={pick.lineBy}
        locked={pick.lineLocked}
        lockedBy={pick.lineLockedBy}
        onLock={() => onLock("line")}
        label={w.lockLine}
        w={w}
      />
      {pick.lineLocked ? (
        <div className="mt-5 border-t-2 border-dashed border-line pt-4 @min-[60rem]:mt-3 @min-[60rem]:pt-3">
          <p className="text-lg font-bold">Now pick the fix for line {pick.line}.</p>
          <ChoiceList
            options={choices("bug", index)}
            pick={pick}
            disabled={pick.locked}
            lang={BUGS[index].lang ?? "Python"}
            onPick={(choice) => onPick({ choice })}
            w={w}
          />
          {/* Wide, the lock stays in view at the foot of the column however long the fixes run. */}
          <div className="bg-paper @min-[60rem]:sticky @min-[60rem]:bottom-0 @min-[60rem]:pb-1">
            <LockStep
              what={pick.choice && "a fix"}
              by={pick.choiceBy}
              locked={pick.locked}
              lockedBy={pick.lockedBy}
              onLock={() => onLock("answer")}
              compact
              w={w}
            />
          </div>
        </div>
      ) : (
        <p className="mt-5 hidden border-t-2 border-dashed border-line pt-4 text-dim @min-[60rem]:block">
          Lock the line in and the four fixes show up here.
        </p>
      )}
    </div>
  );
}

/** The answer's line and why (the fix is under the code), then the news a made-up card is based on, or the real bug's credit. */
function BugReveal({ b }: { b: Bug }) {
  return (
    <div className="card p-5">
      <p>
        <strong className="font-extrabold">Line {b.line}.</strong> {b.why}
      </p>
      {b.news && (
        <p className="mt-3 text-sm text-dim">
          <strong className="text-ink">In the news.</strong> {b.news}
        </p>
      )}
      {b.source && (
        <p className="mt-3 text-sm text-dim">
          <strong className="text-ink">Real bug:</strong>{" "}
          <a href={b.source.url} target="_blank" rel="noreferrer" className="link text-ink">
            {b.source.project}, {b.source.cve}
          </a>
          . {b.source.realFix}
        </p>
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
            Fix {marked && mark(result?.fix)} <code className="font-code wrap-anywhere">{pick.choice}</code>
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
        {/* Asking the beetle costs the early bonus, so a right line says why it's missing. */}
        {game === "bug" && pick.hint && result?.line && !result.early && (
          <p className="mt-1 font-normal">No early bonus: {w.who(pick.hintBy, w.You)} asked the beetle.</p>
        )}
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
