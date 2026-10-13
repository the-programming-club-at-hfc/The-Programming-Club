import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { TrophyViewer } from "#/components/trophy";
import { AgendaList, Wrap } from "#/components/ui";
import {
  ANNOUNCEMENT,
  AWARDS,
  CAPTIONS,
  FEEDBACK,
  KICKOFF_AGENDA,
  MATCH_AGENDA,
  MONEY_NOTE,
  NEWCOMERS,
  POSTER_LINES,
  PREP,
  PROMO,
  ROLES,
  SUPPLIES,
  WALL_CATEGORIES,
} from "#/lib/content";
import { useSchedule } from "#/lib/schedule";
import { CLUB, fmtDate } from "#/lib/season";

// What the Hello, World Cup is and how it runs, for the officers to look over, plus how to run a night.
export const Route = createFileRoute("/hello-world/kit")({
  head: () => ({
    meta: [{ title: `Game plan · ${CLUB.season}` }, { name: "robots", content: "noindex" }],
  }),
  component: GamePlan,
});

const WHY = [
  "We’re a brand-new club. The first semester decides whether people make Wednesday a habit, so every meeting needs a reason to come back next week.",
  "Beginners don’t show up cold to lectures or workshops. Team games are low-pressure, social, and everything happens in the room: no homework, no setup.",
  "Every game works in any language, so people can use whatever they’re learning in class.",
  "Each night already has a plan, so officers aren’t starting from scratch every week. Prep is about ten minutes.",
  "Attendance records itself when members join on their phones, ready for the Student Activities sign-in sheet.",
];

const GOALS = [
  ["15+", "people at the kickoff"],
  ["~10", "at a normal week"],
  ["Half", "of kickoff attendees come back 3+ times"],
];

const PRIZE_IDEAS = [
  "Mini Golden Keycaps: a small version of the keycap (same Blender model, scaled down) for each member of the winning team to keep, since the big trophy stays with the club.",
  "A name plate on the base for each season’s champions, so the trophy builds a history.",
  "Weekly winning team picks from a prize stash: programming stickers, blank keycaps, or candy.",
  "Season awards for MVP, Rookie of the Season, and Best Bug: a printed certificate, or a mini keycap.",
  "Or swap the trophy for something else entirely if the team prefers. Ideas welcome.",
];

const RISKS = [
  ["Low turnout", "Every game works with two teams of two. Officers can play to fill a team."],
  [
    "Beginners feel out of their depth",
    "Teams are reshuffled every week, showing up is worth more XP than winning, and the first rounds are easy.",
  ],
  ["Tech problems in the room", "Every game has a whiteboard or paper version. The site isn’t required to run a night."],
  ["Officer time", "The plan, slides, scoring, and attendance are already built. Officers can swap any week’s games in the planner."],
  [
    "Nov 25 is the night before Thanksgiving",
    "Campus is open, but it’s planned as a short, relaxed night. We can cancel it in the planner.",
  ],
];

const QUESTIONS = [
  "Does the overall idea work for this semester, or should we change it up?",
  "Do the dates work: Midseason Cup Nov 4, Final Nov 18, Wrap Party & Study Hall Dec 2?",
  "Keep the Nov 25 Boss Battle, or skip it for Thanksgiving?",
  "Golden Keycap as the prize? Any of the other prize ideas?",
  "About $30 for trophy paint and prizes, and should we ask Student Activities about pizza?",
  "Do the roles above work for everyone?",
  "Want to go to Hack The Nest (Nov 14–15 at EMU) together?",
];

function GamePlan() {
  const plan = useSchedule();
  return (
    <>
      <header className="mx-auto w-[min(1240px,100%-2.5rem)] pt-14 pb-10">
        <h1 className="text-[clamp(3rem,7vw,6rem)] leading-[0.9] lowercase">the game plan</h1>
        <p className="mt-6 max-w-[58ch] text-lg text-dim">
          What the {CLUB.season} is, how a season runs, and what’s still up in the air. Have a look, and drop any thoughts or changes in the
          officers’ Teams chat.
        </p>
      </header>

      <Section title="the idea">
        <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["What", "Weekly team coding games (Wiki races, bug hunts, code relays) with XP, two Cup nights, and a trophy."],
            [
              "When",
              `${CLUB.day}, ${CLUB.time}, ${fmtDate(plan[0].start, { month: "short", day: "numeric" })} to ${fmtDate(plan.at(-1)!.start, { month: "short", day: "numeric" })}, in ${CLUB.room}.`,
            ],
            ["Who", `${CLUB.eligibility}. No experience needed.`],
            ["Cost to members", "$0. No dues."],
            ["Cost to the club", "About $30, plus pizza if Student Activities can fund it."],
            ["Officer time", "About 10 minutes of prep a night. The site handles slides, scoring, and attendance."],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm font-semibold text-dim">{k}</dt>
              <dd className="mt-1 text-lg leading-snug">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="why games">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <ul className="prose-list text-lg">
            {WHY.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <div className="card p-6">
            <h3 className="text-lg tracking-normal">A good first season</h3>
            <p className="mt-1 text-sm text-dim">Rough targets, so we can tell in December how it went.</p>
            <dl className="mt-4 space-y-3">
              {GOALS.map(([n, what]) => (
                <div key={what} className="flex items-baseline gap-3">
                  <dt className="narrow w-16 shrink-0 text-3xl font-extrabold">{n}</dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Section>

      <Section title="the season">
        <ol className="divide-y divide-line border-y border-line">
          {plan.map((w) => (
            <li
              key={w.week}
              className={`grid grid-cols-[4.5rem_1fr] gap-4 py-4 sm:grid-cols-[6rem_14rem_1fr] ${w.cancelled ? "opacity-50" : ""}`}
            >
              <span className="narrow text-lg font-bold text-dim">{fmtDate(w.start, { month: "short", day: "numeric" })}</span>
              <span className="font-bold">
                {w.title}
                {w.kind === "cup" && <span className="chip ml-2 bg-gold">Cup</span>}
                {w.cancelled && <span className="chip ml-2">Cancelled</span>}
              </span>
              <span className="text-dim max-sm:col-start-2">{w.pitch}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-dim">
          The Final is on Nov 18 so it stays clear of end-of-semester crunch. Dec 2 is a no-pressure Wrap Party &amp; Study Hall with awards
          and show-and-tell demos. Officers can change any week in the{" "}
          <Link to="/hello-world/schedule" className="underline underline-offset-2">
            season planner
          </Link>
          .
        </p>
      </Section>

      <Section title="a normal night">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
          <AgendaList rows={MATCH_AGENDA} compact />
          <div className="space-y-4 text-lg">
            <p>
              Members scan a QR code on the TV and land on a team. Each night is one main game played over a few rounds, and the last round
              counts double so anyone can still win.
            </p>
            <p>
              Showing up earns more XP than winning, and teams are reshuffled every week. Two Cup nights reset everyone to zero, so a
              first-timer can win.
            </p>
            <p className="text-base text-dim">
              Details:{" "}
              <Link to="/hello-world/rules" className="underline underline-offset-2">
                games and scoring
              </Link>
              ,{" "}
              <Link to="/hello-world/cup" className="underline underline-offset-2">
                Cup nights
              </Link>
              ,{" "}
              <Link to="/hello-world/kickoff" className="underline underline-offset-2">
                kickoff slides
              </Link>
              .
            </p>
          </div>
        </div>
      </Section>

      <Section title="the prize">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <TrophyViewer className="aspect-[4/5] w-full rounded-[14px] sm:aspect-[5/4] lg:aspect-[4/5]" />
          <div>
            <h3 className="text-3xl lowercase">the golden keycap</h3>
            <p className="mt-3 text-lg">
              A giant keycap engraved with our <code>&gt;_</code> logo, spray-painted gold, on a mechanical-keyboard switch and a black base
              with the club plaque. About 14 cm tall. It prints on a Bambu P1S in about 5 hours from 309 g of black PLA, then gets painted.
              Winners sign the keycap, and it stays with the club.
            </p>
            <h4 className="mt-8 text-lg tracking-normal">Other prize ideas</h4>
            <p className="text-sm text-dim">Suggestions only. Pick any, all, or none.</p>
            <ul className="prose-list mt-3">
              {PRIZE_IDEAS.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-dim">Season awards as planned: {AWARDS.map((a) => a.name).join(", ")}.</p>
          </div>
        </div>
      </Section>

      <Section title="who does what">
        <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((r) => (
            <div key={r.role} className="card p-5">
              <dt>
                <span className="text-lg font-bold">{r.role}</span>
                <span className="block text-sm text-dim">{r.who}</span>
              </dt>
              <dd className="mt-2 text-[0.95rem]">{r.does}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="what it costs">
        <div className="grid gap-5 md:grid-cols-3">
          {SUPPLIES.map((t) => (
            <div key={t.tier} className="card p-6">
              <h3 className="text-xl text-ink">{t.tier}</h3>
              <ul className="prose-list mt-3">
                {t.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 border-l-4 border-signal bg-signal/10 px-4 py-3">{MONEY_NOTE}</p>
      </Section>

      <Section title="staying in touch">
        <div className="grid gap-10 lg:grid-cols-2">
          <ul className="prose-list text-lg">
            <li>
              <strong>Teams is the hub.</strong> Members are already in the club’s Microsoft Teams group: reminders go out Tuesday and
              Wednesday at noon, and the leaderboard goes up every Thursday.
            </li>
            <li>
              <strong>Kickoff feedback wall.</strong> Four sheets labeled {WALL_CATEGORIES.join(", ")}. Everyone posts at least one idea,
              and we photograph it for the minutes.
            </li>
            <li>
              <strong>New-member ideas.</strong> The first time someone joins, the join form has an optional box for what they’d like the
              club to do. Answers show up on the officer dashboard.
            </li>
            <li>
              <strong>Quick polls.</strong> A short Microsoft Form posted in Teams after a night, or before planning Season 1.
            </li>
          </ul>
          <div className="card p-6">
            <h3 className="text-lg tracking-normal">Kickoff questions</h3>
            <ol className="steps mt-3 text-dim">
              {FEEDBACK.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      <Section title="open questions">
        <div className="grid gap-10 lg:grid-cols-2">
          <ol className="steps space-y-2 text-lg">
            {QUESTIONS.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ol>
          <div>
            <h3 className="text-lg tracking-normal">If something goes wrong</h3>
            <dl className="mt-3 divide-y divide-line border-y border-line">
              {RISKS.map(([risk, fallback]) => (
                <div key={risk} className="py-3">
                  <dt className="font-bold">{risk}</dt>
                  <dd className="text-dim">{fallback}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <p className="mt-8 rounded-[10px] bg-mist p-5 text-lg">Thoughts, ideas, or changes? Post them in the officers’ Teams chat.</p>
      </Section>

      <div className="mx-auto mt-28 w-[min(1240px,100%-2.5rem)] border-t-2 border-ink pt-10">
        <h2 className="text-[clamp(2.4rem,5vw,4rem)] lowercase">running a night</h2>
        <p className="mt-3 max-w-[54ch] text-lg text-dim">Prep, newcomers, the kickoff, and getting the word out.</p>
      </div>
      <Wrap className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="text-2xl">Ten-minute prep</h3>
          <ul className="prose-list mt-3">
            {PREP.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <h3 className="mt-6 text-2xl">When someone new walks in</h3>
          <ol className="steps mt-3">
            {NEWCOMERS.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ol>
        </div>
        <div className="card p-6">
          <h3 className="text-2xl">Attendance and XP</h3>
          <p className="mt-2">
            Members join on their phones, so attendance and XP record themselves. After each meeting, open <strong>/host</strong> and
            download the attendance CSV. Its columns match the Student Activities sign-in sheet (Full Name, Email, Status/Title).
          </p>
        </div>
      </Wrap>
      <Wrap className="mt-12">
        <h3 className="mb-4 text-3xl">Kickoff night</h3>
        <AgendaList rows={KICKOFF_AGENDA} />
      </Wrap>
      <Wrap className="mt-12">
        <h3 className="text-3xl">Getting people in the door</h3>
        <dl className="mt-5 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {PROMO.map((p) => (
            <div key={p.idea}>
              <dt className="text-lg font-bold text-pine">{p.idea}</dt>
              <dd className="mt-1 text-dim">{p.how}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="card p-6">
            <h4 className="text-xl">20-second class announcement</h4>
            <blockquote className="mt-3 border-l-4 border-sky pl-4 text-lg">{ANNOUNCEMENT}</blockquote>
          </div>
          <div className="card p-6">
            <h4 className="text-xl">Poster headlines</h4>
            <ul className="mt-3 space-y-1 text-2xl font-bold">
              {POSTER_LINES.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <h4 className="mt-5 text-xl">Captions</h4>
            <ul className="prose-list mt-2 text-sm text-dim">
              {CAPTIONS.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </div>
      </Wrap>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-auto mt-20 w-[min(1240px,100%-2.5rem)]">
      <div className="mb-8 border-t border-line pt-6">
        <h2 className="text-[clamp(2rem,4vw,3rem)] lowercase">{title}</h2>
      </div>
      {children}
    </section>
  );
}
