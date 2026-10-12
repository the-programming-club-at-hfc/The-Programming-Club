import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHead, Wrap } from "#/components/ui";
import { CLUB } from "#/lib/season";
import { playMusic, setVolume, sfx, unlockAudio } from "#/lib/sound";
import type { Music, SfxName } from "#/lib/sound";

// Unlisted: a sound board for trying the TV's sounds without running a night.
export const Route = createFileRoute("/hello-world/sounds")({
  head: () => ({ meta: [{ title: `Sounds · ${CLUB.season}` }, { name: "robots", content: "noindex" }] }),
  component: Sounds,
});

const EFFECTS: [SfxName, string, string][] = [
  ["join", "Player joins", "Each new player pops a step higher"],
  ["shuffle", "Teams made", "Officers make or reshuffle teams"],
  ["card", "Card goes up", "A challenge card, Wiki Race, or message hits the TV"],
  ["reveal", "Answer revealed", "The answer shows on a card"],
  ["go", "Timer starts", ""],
  ["tick", "Last 10 seconds", "Once a second, sharper for the last three. Plays 5…1"],
  ["timesUp", "Time’s up", "The clock hits 0:00"],
  ["swap", "Relay swap", "Every 2 minutes in Code Relay"],
  ["point", "Points scored", ""],
  ["minus", "Points taken away", ""],
  ["scoreboard", "Scoreboard", "Drumroll, then a fanfare"],
];

const MUSIC: [Music, string][] = [
  ["lobby", "Lobby"],
  ["think", "Clock running"],
];

function Sounds() {
  const [music, setMusic] = useState<Music | null>(null);
  const [vol, setVol] = useState(0.8);
  const [joins, setJoins] = useState(0);
  useEffect(() => () => playMusic(null), []);

  const play = (name: SfxName) =>
    void unlockAudio().then(() => {
      if (name === "join") {
        sfx.join(joins + 1);
        setJoins(joins + 1);
      } else if (name === "tick") {
        for (let i = 0; i < 5; i++) setTimeout(() => sfx.tick(i >= 2), i * 1000);
      } else sfx[name]();
    });

  return (
    <>
      <PageHead title="sounds">Every sound the TV makes. Volume and music on game nights are set from the host console.</PageHead>
      <Wrap>
        <label className="flex max-w-md items-center gap-3 font-bold">
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={vol}
            onChange={(e) => {
              setVol(Number(e.target.value));
              setVolume(Number(e.target.value));
            }}
            className="flex-1 accent-ink"
          />
        </label>

        <h2 className="mt-10 text-3xl">music</h2>
        <p className="mt-1 text-dim">Put lobby.mp3 or think.mp3 in public/audio to replace a built-in loop.</p>
        <div className="mt-3 flex flex-wrap">
          {MUSIC.map(([id, label]) => (
            <button
              key={id}
              className={`btn ${music === id ? "btn-on" : ""}`}
              onClick={() =>
                void unlockAudio().then(() => {
                  const next = music === id ? null : id;
                  playMusic(next);
                  setMusic(next);
                })
              }
            >
              {music === id ? `Stop ${label.toLowerCase()}` : label}
            </button>
          ))}
        </div>

        <h2 className="mt-10 text-3xl">effects</h2>
        <ul className="mt-3 grid max-w-3xl gap-[3px] sm:grid-cols-2">
          {EFFECTS.map(([id, label, when]) => (
            <li key={id}>
              <button className="w-full bg-mist p-4 text-left hover:bg-line" onClick={() => play(id)}>
                <span className="block font-extrabold">{label}</span>
                {when && <span className="text-sm text-dim">{when}</span>}
              </button>
            </li>
          ))}
        </ul>
      </Wrap>
    </>
  );
}
