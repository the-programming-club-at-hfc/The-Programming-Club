import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { OfficerGate } from "#/components/officer";
import { GAME_TILE, PageHead, Picto, Wrap, weekTile } from "#/components/ui";
import { CATALOG, DEFAULT_PLAN, IDEA_GROUPS, gamesIn, ideaTile, lineText, useSchedule } from "#/lib/schedule";
import type { LineupItem, WeekPlan } from "#/lib/schedule";
import { CLUB, fmtDate } from "#/lib/season";

export const Route = createFileRoute("/hello-world/schedule")({
  head: () => ({ meta: [{ title: `Season planner · ${CLUB.season}` }, { name: "robots", content: "noindex" }] }),
  component: Schedule,
});

function Schedule() {
  return (
    <>
      <PageHead title="season planner">
        Change a week’s games, details, or date. Saved changes show up on the site, the TV, and the kickoff slides right away.
      </PageHead>
      <Wrap>
        <OfficerGate redirect="/hello-world/schedule" purpose="plan the season">
          <Planner />
        </OfficerGate>
      </Wrap>
    </>
  );
}

function Planner() {
  const plan = useSchedule();
  const [sel, setSel] = useState(1);
  const w = plan[sel - 1];
  return (
    <div className="grid items-start gap-10 lg:grid-cols-[17rem_1fr]">
      <nav aria-label="Weeks" className="lg:sticky lg:top-24">
        <ol className="grid gap-[3px] sm:grid-cols-2 lg:grid-cols-1">
          {plan.map((wk) => {
            const t = weekTile(wk);
            const on = wk.week === sel;
            return (
              <li key={wk.week}>
                <button
                  onClick={() => setSel(wk.week)}
                  aria-current={on ? "true" : undefined}
                  className={`flex w-full items-center gap-3 p-2 text-left ${on ? "bg-ink text-paper" : "bg-mist hover:bg-line"}`}
                >
                  <span className={`tile ${t.tile} size-11 shrink-0 ${wk.cancelled ? "opacity-40" : ""}`}>
                    <Picto id={t.picto} className="absolute inset-[10%]" />
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className="narrow block text-sm font-bold opacity-70">
                      {wk.week}. {fmtDate(wk.start, { month: "short", day: "numeric" }).toLowerCase()}
                      {wk.cancelled ? ", cancelled" : ""}
                    </span>
                    <span className={`block truncate font-bold ${wk.cancelled ? "line-through" : ""}`}>{wk.title}</span>
                  </span>
                  {wk.edited && <span className="ml-auto size-2.5 shrink-0 rounded-full bg-sky" title="Edited" />}
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 flex items-center gap-2 text-sm text-dim">
          <span className="size-2.5 rounded-full bg-sky" aria-hidden /> Edited by an officer
        </p>
      </nav>
      {/* key starts a fresh draft whenever another week is picked. */}
      <Editor key={w.week} w={w} />
    </div>
  );
}

type Draft = { title: string; pitch: string; lesson: string; bonus: string; start: string; cancelled: boolean; lineup: LineupItem[] };

// <input type="datetime-local"> works in the browser's time zone.
const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const draftOf = (w: WeekPlan): Draft => ({
  title: w.title,
  pitch: w.pitch,
  lesson: w.lesson ?? "",
  bonus: w.bonus ?? "",
  start: toLocal(w.start),
  cancelled: w.cancelled,
  lineup: w.lineup,
});
// Field order matters to JSON.stringify, and Convex returns object keys sorted, so compare a fixed shape.
const sameDraft = (a: Draft, b: Draft) =>
  JSON.stringify({ ...a, lineup: a.lineup.map((g) => [g.label, g.double]) }) ===
  JSON.stringify({ ...b, lineup: b.lineup.map((g) => [g.label, g.double]) });

function Editor({ w }: { w: WeekPlan }) {
  const save = useMutation(api.schedule.save);
  const reset = useMutation(api.schedule.reset);
  const original = draftOf(w);
  const [d, setD] = useState<Draft>(original);
  const [custom, setCustom] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  const dirty = !sameDraft(d, original);
  const t = weekTile({ kind: w.kind, games: d.lineup.map(lineText) });
  const set = (patch: Partial<Draft>) => {
    setD({ ...d, ...patch });
    setStatus("idle");
  };
  const setLine = (i: number, patch: Partial<LineupItem>) => set({ lineup: d.lineup.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  const move = (i: number, by: number) => {
    const l = [...d.lineup];
    [l[i], l[i + by]] = [l[i + by], l[i]];
    set({ lineup: l });
  };
  const add = (label: string) => label.trim() && set({ lineup: [...d.lineup, { label: label.trim(), double: false }] });
  const inLineup = new Set(d.lineup.map((g) => g.label));

  async function submit() {
    setError("");
    setStatus("saving");
    try {
      await save({
        week: w.week,
        title: d.title,
        pitch: d.pitch,
        lesson: d.lesson,
        bonus: d.bonus,
        startsAt: new Date(d.start).getTime(),
        cancelled: d.cancelled,
        lineup: d.lineup,
      });
      setStatus("saved");
    } catch (e) {
      setStatus("idle");
      setError(e instanceof ConvexError ? String(e.data) : "Couldn’t save. Check your connection and try again.");
    }
  }

  async function restore() {
    if (!confirm(`Put week ${w.week} back to the original plan? Your edits to this week will be lost.`)) return;
    try {
      await reset({ week: w.week });
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : "Couldn’t reset. Check your connection and try again.");
    }
  }

  return (
    <div className="min-w-0">
      <header className="flex flex-wrap items-center gap-5">
        <span className={`tile ${t.tile} size-20 shrink-0`}>
          <Picto id={t.picto} className="absolute inset-[12%]" />
        </span>
        <div>
          <p className="text-dim">
            Week {w.week}
            {w.kind === "cup" ? ", Cup night" : w.kind === "kickoff" ? ", kickoff" : ""}
          </p>
          <h2 className="text-[clamp(2rem,3.4vw,2.8rem)] lowercase">{d.title || "untitled week"}</h2>
        </div>
        <Link to="/hello-world/season" hash={`week-${w.week}`} className="link ml-auto text-sm">
          See it on the site
        </Link>
      </header>

      {DEFAULT_PLAN[w.week - 1].note && <p className="mt-6 bg-sun/20 px-4 py-3 text-[0.95rem]">{DEFAULT_PLAN[w.week - 1].note}</p>}

      <section className="mt-8 grid gap-5 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="font-bold">Title</span>
          <input className="field mt-1.5" value={d.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} />
        </label>
        <label className="block sm:col-span-2">
          <span className="font-bold">Description</span>
          <span className="ml-2 text-sm text-dim">One or two sentences for the home page and the season page.</span>
          <textarea className="field mt-1.5 min-h-20" value={d.pitch} onChange={(e) => set({ pitch: e.target.value })} maxLength={400} />
        </label>
        <label className="block">
          <span className="font-bold">Mini-lesson</span> <span className="text-sm text-dim">Optional</span>
          <textarea className="field mt-1.5 min-h-24" value={d.lesson} onChange={(e) => set({ lesson: e.target.value })} maxLength={400} />
        </label>
        <label className="block">
          <span className="font-bold">Bonus</span> <span className="text-sm text-dim">Optional</span>
          <textarea className="field mt-1.5 min-h-24" value={d.bonus} onChange={(e) => set({ bonus: e.target.value })} maxLength={300} />
        </label>
        <label className="block">
          <span className="font-bold">Date and start time</span>
          <input
            type="datetime-local"
            className="field mt-1.5"
            value={d.start}
            onChange={(e) => e.target.value && set({ start: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-3 self-end pb-3">
          <input
            type="checkbox"
            className="size-5 accent-[#12332b]"
            checked={d.cancelled}
            onChange={(e) => set({ cancelled: e.target.checked })}
          />
          <span className="font-bold">No meeting this week</span>
        </label>
      </section>

      <section className="mt-12">
        <h3 className="text-2xl lowercase">lineup</h3>
        <p className="mt-1 text-dim">Played top to bottom. Turn on “Double” for the last round so it’s worth double points.</p>
        {d.lineup.length === 0 ? (
          <p className="mt-4 bg-mist px-4 py-6 text-center text-dim">No games yet. Add some from the catalog below.</p>
        ) : (
          <ol className="mt-4 space-y-[3px]">
            {d.lineup.map((g, i) => {
              const id = gamesIn(g.label)[0];
              const gt = id ? GAME_TILE[id] : null;
              return (
                <li key={i} className="flex items-center gap-2 bg-mist p-2">
                  <span className="narrow w-6 text-center text-lg font-extrabold">{i + 1}</span>
                  <span className={`tile ${gt?.tile ?? ideaTile(g.label) ?? "bg-line"} size-10 shrink-0`}>
                    {gt && <Picto id={gt.picto} className="absolute inset-[10%]" />}
                  </span>
                  <input
                    className="field min-w-0 flex-1 py-2"
                    value={g.label}
                    onChange={(e) => setLine(i, { label: e.target.value })}
                    maxLength={80}
                    aria-label={`Game ${i + 1}`}
                  />
                  <button
                    className={`btn btn-sm ${g.double ? "btn-on" : ""}`}
                    onClick={() => setLine(i, { double: !g.double })}
                    aria-pressed={g.double}
                    title="Double points"
                  >
                    Double
                  </button>
                  <button className="btn btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                    ↑
                  </button>
                  <button className="btn btn-sm" onClick={() => move(i, 1)} disabled={i === d.lineup.length - 1} aria-label="Move down">
                    ↓
                  </button>
                  <button className="btn btn-sm" onClick={() => set({ lineup: d.lineup.filter((_, j) => j !== i) })} aria-label="Remove">
                    Remove
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        <div className="mt-8">
          <h4 className="text-lg font-extrabold">Add from the catalog</h4>
          <p className="text-sm text-dim">Every game and variant from the whole season. Click one to add it to this night.</p>
          <div className="mt-4 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {CATALOG.map((grp) => {
              const gt = grp.id ? GAME_TILE[grp.id] : null;
              return (
                <div key={grp.name}>
                  <p className="flex items-center gap-2 font-bold">
                    <span className={`tile ${gt?.tile ?? "bg-line"} size-6`}>
                      {gt && <Picto id={gt.picto} className="absolute inset-[8%]" />}
                    </span>
                    {grp.name}
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {grp.items.map((label) => (
                      <li key={label}>
                        <button
                          className={`rounded-[4px] px-2.5 py-1.5 text-sm font-semibold ${inLineup.has(label) ? "bg-ink text-paper" : "bg-mist hover:bg-line"}`}
                          onClick={() => add(label)}
                          title={inLineup.has(label) ? "Already in this night. Click to add it again." : "Add to this night"}
                        >
                          {inLineup.has(label) ? "✓ " : "+ "}
                          {label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <div className="mt-12">
            <h4 className="text-lg font-extrabold">More ideas</h4>
            <p className="text-sm text-dim">
              {IDEA_GROUPS.reduce((n, g) => n + g.ideas.length, 0)} more activities from other clubs, classrooms, and events. Each round
              fits in a 60-minute night.
            </p>
            <div className="mt-4 space-y-[3px]">
              {IDEA_GROUPS.map((grp, gi) => (
                <details key={grp.name} open={gi === 0} className="group bg-mist">
                  <summary className="flex cursor-pointer items-center gap-3 p-3 font-bold select-none">
                    <span className={`tile ${grp.tile} size-5`} aria-hidden />
                    {grp.name}
                    <span className="font-normal text-dim">{grp.ideas.length}</span>
                    <span className="ml-auto text-dim transition-transform group-open:rotate-90" aria-hidden>
                      ›
                    </span>
                  </summary>
                  <ul className="divide-y divide-line border-t border-line bg-paper">
                    {grp.ideas.map((idea) => (
                      <li key={idea.name} className="grid gap-x-6 gap-y-2 p-4 sm:grid-cols-[1fr_auto]">
                        <div>
                          <p className="flex flex-wrap items-center gap-2">
                            <strong>{idea.name}</strong>
                            <span className="chip">{idea.time}</span>
                            {idea.cup && <span className="chip bg-gold">Good for Cup nights</span>}
                          </p>
                          <p className="mt-1 max-w-[70ch] text-[0.95rem]">{idea.how}</p>
                          <p className="mt-1 text-sm text-dim">
                            <span className="font-semibold">You need:</span> {idea.need}
                            {idea.link && (
                              <>
                                {" "}
                                <a href={idea.link} target="_blank" rel="noreferrer" className="link font-semibold">
                                  Open link
                                </a>
                              </>
                            )}
                          </p>
                          {idea.check && <p className="mt-1 text-sm font-semibold text-signal">{idea.check}</p>}
                        </div>
                        <button
                          className={`btn btn-sm self-start ${inLineup.has(idea.name) ? "btn-on" : ""}`}
                          onClick={() => add(idea.name)}
                          title={inLineup.has(idea.name) ? "Already in this night. Click to add it again." : "Add to this night"}
                        >
                          {inLineup.has(idea.name) ? "Added" : "Add"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </div>

          <form
            className="mt-8 flex max-w-lg gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add(custom);
              setCustom("");
            }}
          >
            <input
              className="field flex-1"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Something else, e.g. Guest speaker"
              maxLength={80}
              aria-label="Add something else"
            />
            <button className="btn" disabled={!custom.trim()}>
              Add
            </button>
          </form>
        </div>
      </section>

      <div className="sticky bottom-0 mt-12 flex flex-wrap items-center gap-3 border-t border-line bg-paper/95 py-4 backdrop-blur">
        <button className="btn btn-primary" onClick={() => void submit()} disabled={!dirty || status === "saving"}>
          {status === "saving" ? "Saving…" : `Save week ${w.week}`}
        </button>
        <button className="btn" onClick={() => setD(original)} disabled={!dirty}>
          Discard changes
        </button>
        {status === "saved" && !dirty && <span className="font-semibold text-pine">Saved. It’s live.</span>}
        {dirty && <span className="text-sm text-dim">Unsaved changes</span>}
        {error && (
          <span role="alert" className="font-semibold text-signal">
            {error}
          </span>
        )}
        {w.edited && (
          <button className="link ml-auto text-sm" onClick={() => void restore()}>
            Reset to the original plan
          </button>
        )}
      </div>
    </div>
  );
}
