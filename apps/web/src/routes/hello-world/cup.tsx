import { createFileRoute } from "@tanstack/react-router";
import { AgendaList, HourDial, Picto, Wrap } from "#/components/ui";
import { CUP_AGENDA, FINAL_AGENDA } from "#/lib/content";
import { useSchedule } from "#/lib/schedule";
import { CLUB, fmtDate } from "#/lib/season";
import type { Agenda } from "#/lib/types";

export const Route = createFileRoute("/hello-world/cup")({
  head: () => ({ meta: [{ title: `Cup nights · ${CLUB.season}` }] }),
  component: Cup,
});

const noSetup = (rows: Agenda[]) => rows.filter((r) => r.what !== "Officers set up");

function Cup() {
  const plan = useSchedule();
  const d = (i: number) => fmtDate(plan[i].start, { month: "long", day: "numeric" });
  return (
    <>
      <Wrap className="grid gap-[3px] pt-14 md:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col justify-end bg-mist p-8 md:p-12">
          <h1 className="text-[clamp(3rem,7vw,6rem)] leading-[0.9]">cup nights</h1>
          <p className="mt-6 max-w-[42ch] text-xl leading-relaxed">
            The Midseason Cup on {d(3)} and the Final on {d(5)}. Everyone starts at zero, so a first-timer can win.
          </p>
        </div>
        <figure className="tile tile-gold aspect-square">
          <Picto id="keycap" className="absolute inset-[16%]" label="The Golden Keycap" />
          <figcaption className="absolute right-5 bottom-4 left-5 text-sm font-semibold">
            The Golden Keycap. Midseason champions sign the side; Season 0 champions sign the top.
          </figcaption>
        </figure>
      </Wrap>

      <Night
        title="the midseason cup"
        intro="Four rounds: Output?, Wiki Race, Code Relay, and Fix it for real. Like every night, the last round counts double."
        rows={noSetup(CUP_AGENDA)}
      />
      <Night
        title="the final"
        intro="Two Advent of Code–style puzzles, and the second one counts double. The Midseason champions defend the Keycap."
        rows={noSetup(FINAL_AGENDA)}
      />

      <Wrap className="mt-28">
        <div className="theme-pine grid gap-12 rounded-[6px] px-8 py-14 md:grid-cols-[1fr_1.2fr] md:px-14">
          <div>
            <h2 className="text-[clamp(2.2rem,4vw,3.4rem)] lowercase">the final’s puzzles</h2>
            <p className="mt-5 max-w-[38ch] text-lg text-dim">
              Built like Advent of Code, so the Final doubles as a warm-up for the real thing in December.
            </p>
          </div>
          <div>
            <ol className="steps text-xl">
              <li>Each puzzle tells a short story and works through a small example.</li>
              <li>Solve part 1 to earn a star and unlock part 2.</li>
              <li>Part 2 twists part 1. Solve it for a second star.</li>
              <li>Puzzle 1 is a relay. Puzzle 2 counts double, and the whole team helps.</li>
            </ol>
            <p className="mt-6 text-dim">Any language works. Tiebreaker: one sudden-death question.</p>
          </div>
        </div>
      </Wrap>
    </>
  );
}

function Night({ title, intro, rows }: { title: string; intro: string; rows: Agenda[] }) {
  return (
    <Wrap className="mt-24 grid items-start gap-x-20 gap-y-10 lg:grid-cols-[minmax(0,24rem)_1fr]">
      <div className="lg:sticky lg:top-24">
        <HourDial rows={rows} className="mx-auto w-full max-w-[24rem]" />
        <p className="mt-4 text-center text-sm text-dim">Officers arrive at 4:45 to set up.</p>
      </div>
      <div>
        <h2 className="text-[clamp(2.4rem,5vw,4rem)] lowercase">{title}</h2>
        <p className="mt-3 max-w-[54ch] text-lg text-dim">{intro}</p>
        <div className="mt-8">
          <AgendaList rows={rows} />
        </div>
      </div>
    </Wrap>
  );
}
