import { createFileRoute } from "@tanstack/react-router";
import { AgendaList, HourDial, Picto, Wrap } from "#/components/ui";
import { CUP_AGENDA, FINAL_CHANGES, POWERUPS, POWERUP_RULES } from "#/lib/content";
import { useSchedule } from "#/lib/schedule";
import { CLUB, fmtDate } from "#/lib/season";

export const Route = createFileRoute("/hello-world/cup")({
  head: () => ({ meta: [{ title: `Cup nights · ${CLUB.season}` }] }),
  component: Cup,
});

// What each power-up card shows: the key you'd press for it.
const CARD: Record<string, { face: string; tile: string }> = {
  "Ctrl+Z": { face: "ctrl+z", tile: "tile-sky" },
  "Stack Overflow": { face: "f1", tile: "tile-meadow" },
  "Search Bar": { face: "ctrl+f", tile: "tile-sun" },
  "Double Down": { face: "×2", tile: "tile-gold" },
};

function Cup() {
  const plan = useSchedule();
  const d = (i: number) => fmtDate(plan[i].start, { month: "long", day: "numeric" });
  const night = CUP_AGENDA.filter((r) => r.what !== "Officers set up");
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

      <Wrap className="mt-24 grid items-start gap-x-20 gap-y-10 lg:grid-cols-[minmax(0,24rem)_1fr]">
        <div className="lg:sticky lg:top-24">
          <HourDial rows={night} className="mx-auto w-full max-w-[24rem]" />
          <p className="mt-4 text-center text-sm text-dim">Officers arrive at 4:45 to set up.</p>
        </div>
        <div>
          <h2 className="text-[clamp(2.4rem,5vw,4rem)] lowercase">the hour</h2>
          <div className="mt-8">
            <AgendaList rows={night} />
          </div>
          <div className="mt-8 rounded-[6px] bg-mist p-6">
            <h3 className="text-lg tracking-normal">What changes for the Final</h3>
            <ul className="prose-list mt-3 text-[0.95rem]">
              {FINAL_CHANGES.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </div>
      </Wrap>

      <Wrap className="mt-28">
        <div className="grid gap-x-16 gap-y-4 md:grid-cols-[1fr_1.2fr]">
          <h2 className="text-[clamp(2.4rem,5vw,4rem)] lowercase">power-ups</h2>
          <p className="max-w-[50ch] self-end text-lg text-dim">
            Every week you show up earns a power-up card for the next Cup. Teams pool their cards and play one per round.
          </p>
        </div>
        <ul className="mt-12 grid gap-[3px] sm:grid-cols-2 lg:grid-cols-4">
          {POWERUPS.map((p) => {
            const c = CARD[p.name] ?? { face: p.name, tile: "tile-silver" };
            return (
              <li key={p.name} className={`tile ${c.tile} flex aspect-[4/5] flex-col p-6`}>
                <span className="narrow text-[clamp(3rem,5vw,4.5rem)] leading-none font-extrabold">{c.face}</span>
                <span className="mt-auto text-xl font-extrabold">{p.name}</span>
                <span className="mt-1.5 text-[0.95rem] font-medium">{p.does}</span>
              </li>
            );
          })}
        </ul>
        <ul className="prose-list mt-10 grid max-w-4xl gap-x-12 text-[0.95rem] text-dim md:grid-cols-2">
          {POWERUP_RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Wrap>

      <Wrap className="mt-28">
        <div className="theme-pine grid gap-12 rounded-[6px] px-8 py-14 md:grid-cols-[1fr_1.2fr] md:px-14">
          <div>
            <h2 className="text-[clamp(2.2rem,4vw,3.4rem)] lowercase">the all-in round</h2>
            <p className="mt-5 max-w-[38ch] text-lg text-dim">
              The last round of every Cup night. It’s how a team in last place can still take the Keycap.
            </p>
          </div>
          <div>
            <ol className="steps text-xl">
              <li>Show the standings.</li>
              <li>Each team secretly writes a wager, anywhere from 0 to all of its points.</li>
              <li>Reveal one hard snippet. Two minutes.</li>
              <li>Right line and fix: add the wager. Wrong: subtract it.</li>
            </ol>
            <p className="mt-6 text-dim">Tiebreaker: one sudden-death Output? question. The first correct sheet held up wins.</p>
          </div>
        </div>
      </Wrap>
    </>
  );
}
