import { Slider } from "@base-ui/react/slider";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
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
        <Slider.Root
          name="volume"
          min={0}
          max={1}
          step={0.1}
          largeStep={0.2}
          value={vol}
          format={{ style: "percent" }}
          onValueChange={(value) => {
            setVol(value);
            setVolume(value);
          }}
          className="flex max-w-md items-center gap-3 font-bold"
        >
          <Slider.Label>Volume</Slider.Label>
          <Slider.Control className="flex h-11 min-w-0 flex-1 touch-none items-center select-none">
            <Slider.Track className="relative h-1.5 w-full rounded-full bg-line">
              <Slider.Indicator className="rounded-full bg-ink" />
              <Slider.Thumb className="size-5 rounded-full border-2 border-paper bg-ink shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" />
            </Slider.Track>
          </Slider.Control>
          <Slider.Value className="w-12 text-right text-sm" />
        </Slider.Root>

        <h2 className="mt-10 text-3xl">music</h2>
        <p className="mt-1 text-dim">Put lobby.mp3 or think.mp3 in public/audio to replace a built-in loop.</p>
        <ToggleGroup<Music>
          aria-label="Music"
          value={music ? [music] : []}
          onValueChange={(values) => {
            const next = values[0] ?? null;
            void unlockAudio().then(() => {
              playMusic(next);
              setMusic(next);
            });
          }}
          className="mt-3 flex flex-wrap gap-2"
        >
          {MUSIC.map(([id, label]) => (
            <Toggle key={id} value={id} className={`btn ${music === id ? "btn-on" : ""}`}>
              {music === id ? `Stop ${label.toLowerCase()}` : label}
            </Toggle>
          ))}
        </ToggleGroup>

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
