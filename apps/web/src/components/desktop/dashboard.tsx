// The officer dashboard window: tonight's game, turnout for every night, new members' ideas, the season plan, and event interest.
// Officers only; the desktop hides its icon from everyone else, and every query checks on the server.
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useState } from "react";
import type { ReactNode } from "react";
import { ExportButton, OfficerGate } from "#/components/officer";
import { ideasText } from "#/lib/ideas";
import { likelyWeek, useSchedule } from "#/lib/schedule";
import { CLUB, fmtDate } from "#/lib/season";
import { api } from "../../../convex/_generated/api";

export function Dashboard() {
  return (
    <OfficerGate redirect="/dashboard" purpose="open the officer dashboard">
      <Overview />
    </OfficerGate>
  );
}

const Section = ({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) => (
  <section className="border-t border-line pt-4">
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h3 className="text-lg font-extrabold">{title}</h3>
      {action}
    </div>
    {children}
  </section>
);

function Overview() {
  const data = useQuery(api.dashboard.overview);
  const plan = useSchedule();
  if (!data) return <p className="font-bold text-dim">Loading…</p>;
  const { live, nights, totals } = data;
  const upcoming = likelyWeek(plan);

  return (
    <div className="space-y-5">
      {/* Tonight */}
      <div className={`rounded-[10px] p-4 ${live ? "bg-[#0a2147] text-white" : "bg-mist"}`}>
        {live ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#9fd3ff]">
                Live now · Week {live.week}
                {live.practice && " · Practice (doesn’t count)"}
              </p>
              <p className="text-xl leading-tight font-extrabold">{plan[live.week - 1]?.title}</p>
              <p className="mt-1 text-sm text-white/75">
                {live.joined} joined · started{" "}
                {new Date(live.startedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: CLUB.timeZone })}
              </p>
            </div>
            <p className="narrow text-4xl font-extrabold tracking-[0.2em]" title="Join code">
              {live.code}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-dim">No game running</p>
            <p className="text-xl leading-tight font-extrabold">
              Up next: Week {upcoming}, {plan[upcoming - 1]?.title}
            </p>
            <p className="mt-1 text-sm text-dim">
              {fmtDate(plan[upcoming - 1].start, { weekday: "long", month: "long", day: "numeric" })}, {CLUB.time}, {CLUB.room}
            </p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/hello-world/host" className="btn btn-primary btn-sm">
            {live ? "Open host console" : "Start a night"}
          </Link>
          <a href="/hello-world/tv" target="_blank" rel="noreferrer" className="btn btn-sm">
            Open TV view ↗
          </a>
          <Link to="/hello-world/schedule" className="btn btn-sm">
            Season planner
          </Link>
          <Link to="/hello-world/kit" className="btn btn-sm">
            Game plan
          </Link>
        </div>
      </div>

      {/* Season totals */}
      <dl className="grid grid-cols-2 gap-[3px] sm:grid-cols-4">
        {[
          ["Members", totals.members],
          ["Came back", totals.returning],
          ["Avg per night", totals.average],
          ["Check-ins", totals.checkIns],
        ].map(([k, v]) => (
          <div key={k} className="bg-mist p-3">
            <dt className="text-sm text-dim">{k}</dt>
            <dd className="narrow text-3xl font-extrabold">{v}</dd>
          </div>
        ))}
      </dl>

      <Section title="Attendance">
        {nights.length === 0 ? (
          <p className="text-dim">No nights yet. Attendance records itself when members join with the code.</p>
        ) : (
          <ul className="divide-y divide-line">
            {nights.map((n) => (
              <li key={n._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="narrow w-14 shrink-0 text-sm font-bold text-dim">
                  {fmtDate(new Date(n.startedAt), { month: "short", day: "numeric" })}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  Week {n.week}: {plan[n.week - 1]?.title}
                  {n.live && <span className="chip ml-2 bg-[#0b4fa3] text-white">Live</span>}
                </span>
                <span className="text-sm">
                  <strong>{n.headcount}</strong> came{n.firstTimers > 0 && <span className="text-dim">, {n.firstTimers} new</span>}
                </span>
                <ExportButton sessionId={n._id} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-dim">The CSV matches the Student Activities sign-in sheet: Full Name, Email, Status/Title.</p>
      </Section>

      <Ideas />

      <Section
        title="Season plan"
        action={
          <Link to="/hello-world/schedule" className="link text-sm">
            Edit
          </Link>
        }
      >
        <ol className="divide-y divide-line">
          {plan.map((w) => (
            <li key={w.week} className={`flex items-center gap-3 py-1.5 ${w.cancelled ? "opacity-45" : ""}`}>
              <span className="narrow w-14 shrink-0 text-sm font-bold text-dim">
                {fmtDate(w.start, { month: "short", day: "numeric" })}
              </span>
              <span className={`min-w-0 flex-1 truncate font-semibold ${w.cancelled ? "line-through" : ""}`}>{w.title}</span>
              <span className="text-sm text-dim">
                {w.lineup.length} game{w.lineup.length === 1 ? "" : "s"}
              </span>
              {w.week === upcoming && !live && <span className="chip bg-[#0b4fa3] text-white">Next</span>}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Events">
        <div className="flex items-center justify-between gap-3 rounded-[8px] bg-mist p-3">
          <div>
            <p className="font-bold">Hack The Nest</p>
            <p className="text-sm text-dim">Nov 14–15 · EMU</p>
          </div>
          <p className="text-right text-sm">
            <span className="narrow block text-3xl font-extrabold">{data.hackInterest}</span>
            interested
          </p>
        </div>
      </Section>
    </div>
  );
}

/** What new members said they'd like the club to do, asked once on their phone after their first join. */
function Ideas() {
  const ideas = useQuery(api.ideas.list);
  const [copied, setCopied] = useState(false);
  if (!ideas) return null;
  const text = ideasText(ideas);
  return (
    <Section
      title="Ideas from new members"
      action={
        ideas.length > 0 && (
          <button
            className="btn btn-sm"
            onClick={() =>
              void navigator.clipboard.writeText(text).then(
                () => setCopied(true),
                () => alert(text),
              )
            }
          >
            {copied ? "Copied" : "Copy all"}
          </button>
        )
      }
    >
      {ideas.length === 0 ? (
        <p className="text-dim">None yet. New members get asked on their phone after they join for the first time.</p>
      ) : (
        <ul className="max-h-96 divide-y divide-line overflow-y-auto">
          {ideas.map((i) => (
            <li key={i._id} className="py-2">
              <p className="text-sm">
                <strong>{i.name}</strong>{" "}
                <span className="text-dim">· {fmtDate(new Date(i.createdAt), { month: "short", day: "numeric" })}</span>
              </p>
              <p className="whitespace-pre-line">{i.text}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
