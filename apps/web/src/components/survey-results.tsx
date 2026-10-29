// Survey results for officers (/survey/results). Every chart is also a filter: click a bar or an hour and the rest of the
// page narrows to those members, so "who wants AI workshops" and "when can they come" are one click apart.
// Each bar chart counts members with every filter applied except its own, so its unpicked options stay comparable. The
// heatmap counts the selected members, so picking an hour shows who could also stay for the next one.
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Fragment, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { OfficerGate } from "#/components/officer";
import { ClubLogo } from "#/components/site";
import {
  DAYS,
  HOURS,
  NO_FILTERS,
  QUESTIONS,
  bestSlots,
  exampleResponses,
  heat,
  hourLabel,
  matches,
  responsesCsv,
  slotLabel,
  slotOf,
  tally,
} from "#/lib/survey";
import type { Filters, Question, SurveyResponse } from "#/lib/survey";
import { CLUB, fmtDate } from "#/lib/season";
import { api } from "../../convex/_generated/api";

// School blue, the club's accent. Magnitude is this one hue from light to dark.
const BLUE = "#0b4fa3";
const ramp = (t: number) => `color-mix(in oklab, ${BLUE} ${Math.round(6 + t * 94)}%, #eef2f9)`;
// Hours at least this share of the busiest one carry their count. The ramp is dark enough there for white text (4.5:1).
const LABELED = 0.75;
const SURVEY_URL = `https://${CLUB.url}/survey`;

export function SurveyResults() {
  return (
    <main className="theme-club mx-auto w-[min(1240px,100%-2.5rem)] py-8">
      <Link to="/dashboard" className="inline-flex items-center gap-3 text-sm font-semibold text-dim hover:text-ink">
        <ClubLogo className="size-8" />
        Officer dashboard
      </Link>
      <div className="mt-8">
        <OfficerGate redirect="/survey/results" purpose="see the survey results">
          <Results />
        </OfficerGate>
      </div>
    </main>
  );
}

type Waiting = { name: string; email: string; nights: number };

function Results() {
  const data = useQuery(api.survey.results);
  const [example, setExample] = useState(false);
  const sample = useMemo(() => exampleResponses(), []);
  if (!data) return <p className="font-bold text-dim">Loading…</p>;
  const rows = example ? sample : data.responses;
  const waiting = example ? [] : data.waiting;
  return (
    <>
      <header className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="min-w-0 flex-1 basis-[22rem]">
          <h1 className="text-[clamp(2.6rem,6vw,4.4rem)] leading-[0.92] lowercase">
            survey results
            {example && <span className="chip ml-3 align-middle text-sm tracking-normal normal-case">Example data</span>}
          </h1>
          <p className="mt-3 text-dim">
            {rows.length} response{rows.length === 1 ? "" : "s"}
            {rows.length > 0 &&
              ` · latest ${fmtDate(new Date(Math.max(...rows.map((r) => r.updatedAt))), { month: "short", day: "numeric" })}`}{" "}
            · Detroit time
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={SURVEY_URL} label="Copy survey link" />
          {(example || data.responses.length > 0) && (
            <button className="btn btn-sm" onClick={() => setExample(!example)}>
              {example ? "Show real responses" : "Preview with example data"}
            </button>
          )}
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="card mt-8 p-8">
          <h2 className="text-2xl">No responses yet</h2>
          <p className="mt-2 max-w-[60ch] text-dim">
            Send members the link: <span className="font-semibold text-ink">{SURVEY_URL}</span>. They sign in with their HawkMail, so each
            member counts once and can change their answers later.
          </p>
          <button className="btn btn-primary mt-5" onClick={() => setExample(true)}>
            Preview with example data
          </button>
          {waiting.length > 0 && <WaitingList waiting={waiting} />}
        </div>
      ) : (
        <Board rows={rows} waiting={waiting} members={example ? 31 : rows.length + waiting.length} />
      )}
    </>
  );
}

function Board({ rows, waiting, members }: { rows: SurveyResponse[]; waiting: Waiting[]; members: number }) {
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [hover, setHover] = useState<number | null>(null);
  const cohort = rows.filter((r) => matches(r, f));
  /** Members matching every filter but this question's, so a chart's own picks don't empty the rest of it. */
  const except = (q: keyof Filters) => rows.filter((r) => matches(r, { ...f, [q]: [] }));
  const toggle = (q: Question, id: string) =>
    setF((x) => ({ ...x, [q]: x[q].includes(id) ? x[q].filter((p) => p !== id) : [...x[q], id] }));
  const toggleSlot = (slot: number) =>
    setF((x) => ({ ...x, free: x.free.includes(slot) ? x.free.filter((s) => s !== slot) : [...x.free, slot] }));
  const active = (Object.keys(QUESTIONS) as Question[]).flatMap((q) =>
    f[q].map((id) => ({ q, id, label: QUESTIONS[q].options.find((o) => o.id === id)?.label ?? id })),
  );
  const filtered = active.length + f.free.length > 0;

  const counts = heat(cohort);
  const best = bestSlots(counts, 4);
  const wants = tally(cohort, "interests").sort((a, b) => b.n - a.n);
  const weeklyish = cohort.filter((r) => r.frequency === "weekly" || r.frequency === "biweekly").length;

  const chart = (q: Question, title: string, sub?: string, sort = false) => (
    <Bars title={title} sub={sub} q={q} rows={except(q)} all={rows} picked={f[q]} onPick={(id) => toggle(q, id)} sort={sort} />
  );

  return (
    <div className="mt-8 space-y-4">
      {/* Headline numbers for whoever is selected. */}
      <dl className="grid grid-cols-2 gap-[3px] lg:grid-cols-4">
        <Tile
          label={filtered ? "Members selected" : "Responses"}
          value={cohort.length}
          sub={`of ${filtered ? rows.length : members} ${filtered ? "responses" : "members"}`}
        />
        <Tile
          label="Best hour"
          value={best[0] ? slotLabel(best[0].slot).replace(/^(\w{3})\w*day/, "$1") : "–"}
          sub={best[0] ? `${best[0].n} of ${cohort.length} free` : "No hours picked"}
        />
        <Tile label="Most wanted" value={wants[0]?.n ? wants[0].label : "–"} sub={wants[0]?.n ? `${wants[0].n} of ${cohort.length}` : ""} />
        <Tile
          label="Would come every week or two"
          value={cohort.length ? `${Math.round((weeklyish / cohort.length) * 100)}%` : "–"}
          sub={`${weeklyish} of ${cohort.length}`}
        />
      </dl>

      {/* The one filter row: every pick from the charts below, plus who's come before. */}
      <div className="z-20 -mx-2 flex lg:sticky lg:top-0 flex-wrap items-center gap-2 bg-paper/95 px-2 py-3 backdrop-blur">
        <Segmented
          value={f.attended[0] ?? ""}
          onChange={(v) => setF((x) => ({ ...x, attended: v ? [v] : [] }))}
          options={[
            { id: "", label: "Everyone" },
            { id: "came", label: "Came to a meeting" },
            { id: "never", label: "Haven’t come yet" },
          ]}
        />
        {active
          .filter((a) => a.q !== "attended")
          .map((a) => (
            <FilterChip key={a.q + a.id} onRemove={() => toggle(a.q, a.id)}>
              {a.label}
            </FilterChip>
          ))}
        {f.free.map((s) => (
          <FilterChip key={s} onRemove={() => toggleSlot(s)}>
            Free {slotLabel(s)}
          </FilterChip>
        ))}
        {filtered ? (
          <>
            <span className="text-sm text-dim">
              <strong className="text-ink">{cohort.length}</strong> of {rows.length} match
            </span>
            <button className="link text-sm" onClick={() => setF(NO_FILTERS)}>
              Clear all
            </button>
          </>
        ) : (
          <span className="text-sm text-dim">Click any bar or hour below to narrow everything to those members.</span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Card
          title="When they’re free"
          sub={
            f.free.length
              ? "Counting only members free at every picked hour: pick the next hour to test a longer meeting"
              : "Click an hour to see who’s free then"
          }
        >
          <Heatmap counts={counts} picked={f.free} onPick={toggleSlot} hover={hover} onHover={setHover} />
          <Readout slot={hover ?? f.free.at(-1) ?? null} rows={cohort} />
        </Card>
        {/* When, how often, and where, side by side: what picking a meeting comes down to. */}
        <div className="grid content-start gap-4">
          <Card title="Best times" sub={`For the ${cohort.length} selected`}>
            {best.length === 0 ? (
              <p className="text-dim">Nobody selected has picked hours.</p>
            ) : (
              <ol className="space-y-1">
                {best.map((b, i) => (
                  <li key={b.slot}>
                    <button
                      className={`grid w-full grid-cols-[1.4rem_1fr_auto] items-center gap-x-3 rounded-[6px] px-2 py-2 text-left hover:bg-mist ${f.free.includes(b.slot) ? "bg-mist" : ""}`}
                      onClick={() => toggleSlot(b.slot)}
                      onMouseEnter={() => setHover(b.slot)}
                      onMouseLeave={() => setHover(null)}
                    >
                      <span className="narrow font-bold text-dim">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="block font-semibold">{slotLabel(b.slot)}</span>
                        <Meter value={b.n} max={cohort.length} />
                      </span>
                      <span className="text-right text-sm">
                        <strong className="text-base">{b.n}</strong> free
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-xs text-dim">Availability isn’t an RSVP: confirm a time and room before announcing it.</p>
          </Card>
          {chart("frequency", "How often they’d come")}
          {chart("locations", "Where they’d join in", "On campus, Discord, or Teams: more than one allowed")}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {chart("interests", "What they want", "Pick as many as they like, so bars add up to more than the members", true)}
        {chart("barriers", "What’s made it hard to come", undefined, true)}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {chart("experience", "Coding experience")}
        {chart("languages", "Languages they’ve used", undefined, true)}
        {chart("channels", "Where they’ll see club news", undefined, true)}
      </div>

      <Notes rows={cohort} />

      <Responses rows={cohort} />
      {waiting.length > 0 && (
        <Card title={`Haven’t answered yet (${waiting.length})`} sub="Everyone who has joined a game night, minus officers">
          <WaitingList waiting={waiting} />
        </Card>
      )}
    </div>
  );
}

function Card({ title, sub, action, children }: { title: string; sub?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card min-w-0 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl tracking-[-0.02em]">{title}</h2>
          {sub && <p className="mt-1 text-sm text-dim">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub: string }) {
  return (
    <div className="min-w-0 bg-mist p-4">
      <dt className="text-sm text-dim">{label}</dt>
      <dd className="mt-1 text-[clamp(1.3rem,2.2vw,2rem)] leading-[1.1] text-balance font-extrabold tracking-[-0.03em]">{value}</dd>
      <dd className="text-sm text-dim">{sub}</dd>
    </div>
  );
}

const Meter = ({ value, max }: { value: number; max: number }) => (
  <span className="mt-1 block h-1.5 rounded-full bg-[#dfe6f3]">
    <span className="block h-full rounded-full" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: BLUE }} />
  </span>
);

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-[6px] bg-mist p-[3px]" role="radiogroup" aria-label="Who to include">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          className={`rounded-[4px] px-3 py-1.5 text-sm font-semibold ${value === o.id ? "bg-paper shadow-[0_0_0_1.5px_var(--color-line)]" : "text-dim hover:text-ink"}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const FilterChip = ({ children, onRemove }: { children: ReactNode; onRemove: () => void }) => (
  <button
    className="inline-flex items-center gap-2 rounded-full bg-ink py-1.5 pr-2.5 pl-3.5 text-sm font-semibold text-paper hover:bg-[#0b4fa3]"
    onClick={onRemove}
    aria-label={`Remove filter: ${String(children)}`}
  >
    {children}
    <span aria-hidden className="text-paper/70">
      ✕
    </span>
  </button>
);

/** One horizontal bar per option. Picked options stay dark, the rest fade while something is picked. */
function Bars({
  title,
  sub,
  q,
  rows,
  all,
  picked,
  onPick,
  sort,
}: {
  title: string;
  sub?: string;
  q: Question;
  rows: SurveyResponse[];
  all: SurveyResponse[];
  picked: string[];
  onPick: (id: string) => void;
  sort?: boolean;
}) {
  // Sorted by everyone's answers, so bars never jump around as filters change.
  const overall = new Map(tally(all, q).map((t) => [t.id, t.n]));
  const bars = tally(rows, q);
  if (sort) bars.sort((a, b) => (overall.get(b.id) ?? 0) - (overall.get(a.id) ?? 0));
  const max = Math.max(1, ...bars.map((b) => b.n));
  const narrowed = rows.length < all.length;
  return (
    <Card title={title} sub={sub}>
      <ul className="space-y-0.5">
        {bars.map((b) => {
          const on = picked.includes(b.id);
          const faded = picked.length > 0 && !on;
          return (
            <li key={b.id}>
              <button
                aria-pressed={on}
                title={`${b.label}: ${b.n} of ${rows.length}${narrowed ? ` selected (${overall.get(b.id)} of ${all.length} overall)` : ""}`}
                className={`group grid w-full grid-cols-[minmax(7rem,42%)_1fr_2.2rem] items-center gap-3 rounded-[6px] px-2 py-1.5 text-left hover:bg-mist ${on ? "bg-mist" : ""}`}
                onClick={() => onPick(b.id)}
              >
                <span className={`text-sm leading-tight ${on ? "font-bold" : "font-medium"} ${faded ? "text-dim" : ""}`}>{b.label}</span>
                <span className="relative block h-3.5">
                  <span
                    className="absolute inset-y-0 left-0 rounded-r-[4px] transition-[width,opacity] duration-300"
                    style={{ width: `${(b.n / max) * 100}%`, background: BLUE, opacity: faded ? 0.3 : 1 }}
                  />
                </span>
                <span className="narrow text-right text-sm font-bold">{b.n}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Days across, hours down, darker where more members are free. */
function Heatmap({
  counts,
  picked,
  onPick,
  hover,
  onHover,
}: {
  counts: Map<number, number>;
  picked: number[];
  onPick: (slot: number) => void;
  hover: number | null;
  onHover: (slot: number | null) => void;
}) {
  const max = Math.max(1, ...counts.values());
  return (
    <div>
      <div className="grid grid-cols-[3.4rem_repeat(7,minmax(0,1fr))] gap-[2px]" onMouseLeave={() => onHover(null)}>
        <span />
        {DAYS.map((d) => (
          <span key={d} className="pb-1 text-center text-sm font-bold">
            {d}
          </span>
        ))}
        {HOURS.map((h) => (
          <Fragment key={h}>
            <span className="narrow self-center pr-1.5 text-right text-xs text-dim">{hourLabel(h)}</span>
            {DAYS.map((_, day) => {
              const slot = slotOf(day, h);
              const n = counts.get(slot) ?? 0;
              const t = n / max;
              const on = picked.includes(slot);
              return (
                <button
                  key={slot}
                  aria-pressed={on}
                  aria-label={`${slotLabel(slot)}: ${n} free`}
                  className={`narrow h-8 rounded-[3px] text-xs font-bold text-white transition-colors ${on ? "outline-[2.5px] -outline-offset-[2.5px] outline-sun" : ""} ${hover === slot && !on ? "outline-2 -outline-offset-2 outline-ink" : ""}`}
                  style={{ background: n ? ramp(t) : "#f3f5f9" }}
                  onClick={() => onPick(slot)}
                  onMouseEnter={() => onHover(slot)}
                  onFocus={() => onHover(slot)}
                  onBlur={() => onHover(null)}
                >
                  {/* Only the busiest hours get a number, in white on a fill dark enough for it; hovering any hour shows its
                      count below. */}
                  {n > 0 && t >= LABELED ? n : ""}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 pl-[3.6rem] text-xs text-dim">
        <span>0</span>
        <span className="h-2 w-40 rounded-full" style={{ background: `linear-gradient(90deg, ${ramp(0)}, ${ramp(1)})` }} />
        <span>{max} free</span>
        <span className="ml-3 inline-flex items-center gap-1.5">
          <span className="size-3 rounded-[2px] outline-2 -outline-offset-2 outline-sun" /> picked
        </span>
      </div>
    </div>
  );
}

/** The hour under the pointer (or the last one picked): who's free then and what those members want most. */
function Readout({ slot, rows }: { slot: number | null; rows: SurveyResponse[] }) {
  if (slot === null)
    return (
      <p className="mt-4 min-h-[4.5rem] rounded-[8px] bg-mist p-3 text-sm text-dim">
        Point at an hour to see who’s free and what they want.
      </p>
    );
  const free = rows.filter((r) => r.free.includes(slot));
  const wants = tally(free, "interests")
    .filter((t) => t.n)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);
  return (
    <div className="mt-4 min-h-[4.5rem] rounded-[8px] bg-mist p-3 text-sm" aria-live="polite">
      <p>
        <strong>{slotLabel(slot)}</strong>: {free.length} of {rows.length} free
        {wants.length > 0 && <span className="text-dim"> · they want {wants.map((w) => `${w.label} (${w.n})`).join(", ")}</span>}
      </p>
      {free.length > 0 && <p className="mt-1 truncate text-dim">{free.map((r) => r.name).join(", ")}</p>}
    </div>
  );
}

function Notes({ rows }: { rows: SurveyResponse[] }) {
  const notes = rows.filter((r) => r.note);
  return (
    <Card title="In their words" sub={`${notes.length} note${notes.length === 1 ? "" : "s"} from the selected members`}>
      {notes.length === 0 ? (
        <p className="text-dim">No notes from these members.</p>
      ) : (
        <ul className="max-h-80 divide-y divide-line overflow-y-auto">
          {notes.map((r) => (
            <li key={r.email} className="py-2.5">
              <p className="whitespace-pre-line">{r.note}</p>
              <p className="mt-0.5 text-sm text-dim">{r.name}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const labelOf = (q: Question, ids: string[]) =>
  ids.map((id) => QUESTIONS[q].options.find((o) => o.id === id)?.label ?? id).join(", ") || "–";

function Responses({ rows }: { rows: SurveyResponse[] }) {
  return (
    <Card
      title={`Responses (${rows.length})`}
      sub="The members selected above"
      action={
        rows.length > 0 && (
          <button className="btn btn-sm" onClick={() => download(responsesCsv(rows))}>
            Download CSV
          </button>
        )
      }
    >
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="text-dim">
            <tr className="border-b border-line">
              {["Name", "Meetings", "Wants", "Experience", "How often", "Where", "Hours free"].map((h) => (
                <th key={h} className="py-2 pr-4 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.email} className="align-top">
                <td className="py-2 pr-4">
                  <span className="block font-semibold">{r.name}</span>
                  <span className="text-dim">{r.email}</span>
                </td>
                <td className="narrow py-2 pr-4 font-bold">{r.nights}</td>
                <td className="max-w-[18rem] py-2 pr-4">{labelOf("interests", r.interests)}</td>
                <td className="py-2 pr-4">{labelOf("experience", [r.experience])}</td>
                <td className="py-2 pr-4">{labelOf("frequency", [r.frequency])}</td>
                <td className="py-2 pr-4">{labelOf("locations", r.locations)}</td>
                <td className="narrow py-2 pr-4 font-bold">{r.free.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function WaitingList({ waiting }: { waiting: Waiting[] }) {
  return (
    <div className="mt-2">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <CopyButton text={waiting.map((w) => w.email).join(", ")} label="Copy their emails" />
        <span className="text-sm text-dim">Paste into BCC for a reminder. Most meetings attended first.</span>
      </div>
      <ul className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
        {waiting.map((w) => (
          <li key={w.email} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-sm">
            <span className="min-w-0 truncate">
              <strong>{w.name}</strong> <span className="text-dim">{w.email}</span>
            </span>
            <span className="shrink-0 text-dim">
              {w.nights} meeting{w.nights === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-sm"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          },
          () => prompt("Copy this:", text),
        )
      }
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function download(csv: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `club-survey-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
