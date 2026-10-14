import { createFileRoute } from "@tanstack/react-router";
import { GAME_TILE, PageHead, Picto, Wrap } from "#/components/ui";
import { AWARDS, COMEBACKS, GAMES, XP } from "#/lib/content";
import { CLUB } from "#/lib/season";

export const Route = createFileRoute("/hello-world/rules")({
  head: () => ({ meta: [{ title: `Games · ${CLUB.season}` }] }),
  component: Rules,
});

export function XpTable() {
  return (
    <table className="w-full">
      <tbody>
        {XP.map((x) => (
          <tr key={x.what} className="border-t border-line align-baseline first:border-t-0">
            <td className="narrow w-[1%] py-4 pr-6 text-4xl leading-none font-extrabold whitespace-nowrap">{x.pts}</td>
            <td className="py-4">
              <span className="font-semibold">{x.what}</span>
              <span className="block text-sm text-dim">{x.note}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Rules() {
  return (
    <>
      <PageHead title="six games">
        One way to score, and each game takes less than a minute to explain. Teams of 2–3, any language.
      </PageHead>

      <Wrap>
        <nav aria-label="Games" className="grid grid-cols-3 gap-[3px] sm:grid-cols-6">
          {GAMES.map((g) => (
            <a key={g.id} href={`#${g.id}`} className={`tile ${GAME_TILE[g.id].tile} group block aspect-square`}>
              <Picto id={GAME_TILE[g.id].picto} className="absolute inset-[16%] transition-transform group-hover:-translate-y-1" />
              <span className="absolute bottom-2 left-2.5 text-xs font-bold lowercase">{g.name}</span>
            </a>
          ))}
        </nav>
      </Wrap>

      <Wrap className="mt-20 space-y-[3px]">
        {GAMES.map((g) => {
          const t = GAME_TILE[g.id];
          return (
            <article key={g.id} id={g.id} className="grid scroll-mt-24 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <div className={`tile ${t.tile} flex min-h-80 flex-col justify-between p-8`}>
                <h2 className="relative z-10 text-[clamp(2.4rem,4vw,3.4rem)] lowercase">{g.name}</h2>
                <Picto animate="loop" id={t.picto} className="absolute top-[24%] right-[5%] h-[52%] max-h-56" />
                <dl className="relative z-10 max-w-[46%] space-y-2 text-sm">
                  <div>
                    <dt className="opacity-75">Time</dt>
                    <dd className="font-bold">{g.time}</dd>
                  </div>
                  <div>
                    <dt className="opacity-75">You need</dt>
                    <dd className="font-bold">{g.need}</dd>
                  </div>
                </dl>
              </div>
              <div className="bg-mist p-8 md:p-10">
                <p className="max-w-[44ch] text-xl leading-relaxed font-medium">{g.gist}</p>
                <ol className="steps mt-6">
                  {g.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <p className="mt-6 border-t border-line pt-5">
                  <strong>Scoring.</strong> {g.scoring}
                </p>
                <details className="mt-5 text-[0.95rem]">
                  <summary className="cursor-pointer font-semibold text-dim hover:text-ink">Variants and an officer tip</summary>
                  <ul className="prose-list mt-3">
                    {g.variants.map((v) => (
                      <li key={v}>{v}</li>
                    ))}
                  </ul>
                  <p className="text-dim italic">{g.tip}</p>
                </details>
              </div>
            </article>
          );
        })}
      </Wrap>

      <Wrap className="mt-28 grid gap-16 lg:grid-cols-[7fr_5fr]">
        <div>
          <h2 className="text-[clamp(2.4rem,5vw,4rem)] lowercase">scoring</h2>
          <p className="mt-5 max-w-[52ch] text-lg">
            Teams earn points in each game, and the last round of every game night counts double. Team points reset every week.
          </p>
          <p className="mt-3 max-w-[52ch] text-dim">
            Season XP is yours, not your team’s, so switching teams never costs you anything. The app tracks it when you join.
          </p>
          <div className="mt-8">
            <XpTable />
          </div>
        </div>
        <div className="self-start rounded-[6px] bg-mist p-8">
          <h3 className="text-2xl lowercase">built for comebacks</h3>
          <ul className="prose-list mt-5 space-y-2">
            {COMEBACKS.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </Wrap>

      <Wrap className="mt-28">
        <h2 className="text-[clamp(2.4rem,5vw,4rem)] lowercase">season awards</h2>
        <dl className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-5">
          {AWARDS.map((a, i) => (
            <div key={a.name}>
              <span
                className="block size-10 rounded-full"
                style={{
                  background: ["var(--color-gold)", "var(--color-silver)", "var(--color-sky)", "var(--color-meadow)", "var(--color-sun)"][
                    i % 5
                  ],
                }}
                aria-hidden
              />
              <dt className="mt-4 text-lg font-extrabold">{a.name}</dt>
              <dd className="mt-1.5 text-dim">{a.how}</dd>
            </div>
          ))}
        </dl>
      </Wrap>
    </>
  );
}
