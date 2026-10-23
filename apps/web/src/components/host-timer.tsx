// The shared clock on /host, with every command saying what it does: Start/Pause/Resume, real additions (+30 sec,
// +1 min), and "Set to …" kept apart, since setting replaces the time and stops the clock.
import { Popover } from "@base-ui/react/popover";
import { Switch } from "@base-ui/react/switch";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLayoutEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { fmtClock, useRemaining } from "./game";
import { useAction } from "./officer";
import { heldKey } from "#/lib/flow";

type Live = NonNullable<FunctionReturnType<typeof api.sessions.live>>;

const PRESETS = [30, 45, 60, 90, 120, 300, 720];

type ClockState = "ready" | "running" | "paused" | "parked" | "done";

/** What the clock is doing. Parked is the server's own flag (its card left the TV mid-play) while the TV shows a
 *  screen with no card on it, the only time the server parks a clock. */
function clockState(live: Live, remaining: number): ClockState {
  const t = live.timer;
  if (remaining <= 0) return "done";
  if (t.startedAt !== undefined) return "running";
  if (t.parked && !["card", "wiki", "draw"].includes(live.screen.mode)) return "parked";
  return remaining >= t.durationMs ? "ready" : "paused";
}

const STATUS: Record<ClockState, string> = {
  ready: "Ready",
  running: "Running",
  paused: "Paused",
  parked: "Paused until the card is back on the TV",
  done: "Time’s up",
};

/** The clock's commands, one at a time, with a short note on what each one did. */
function useClock(live: Live) {
  const run = useAction();
  const timer = useMutation(api.sessions.timer);
  const setScreen = useMutation(api.sessions.setScreen);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const pending = useRef(false);
  const mounted = useRef(false);
  // A function, so a check after an await reads the ref fresh.
  const isMounted = () => mounted.current;
  const clear = useRef<ReturnType<typeof setTimeout>>(undefined);
  // What's being timed: tonight, the round, the clock's card, the TV's card, and whether that play is over (revealed or
  // scored). The clock's own updates (an add moving the time) leave it alone, so +1 min only stops halfway when the
  // activity itself changed or ended.
  const activity = useRef("");
  const held = heldKey(live.screen);
  activity.current = JSON.stringify([
    live._id,
    live.round,
    live.timer.card ?? null,
    held,
    !!live.screen.revealed,
    held !== null && live.scored.includes(held),
    live.timer.card !== undefined && live.scored.includes(live.timer.card),
  ]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(clear.current);
    };
  }, []);

  /** Run a command unless one is already going; what it returns (if anything) is the note. */
  const act = async (go: () => Promise<string | null>) => {
    if (pending.current || !isMounted()) return;
    pending.current = true;
    setBusy(true);
    try {
      const said = await go();
      if (said && isMounted()) {
        setNote(said);
        clearTimeout(clear.current);
        clear.current = setTimeout(() => setNote(""), 6000);
      }
    } finally {
      pending.current = false;
      if (isMounted()) setBusy(false);
    }
  };

  const remaining = useRemaining(live.timer);
  const state = clockState(live, remaining);
  const full = fmtClock(live.timer.durationMs);
  const main =
    state === "running"
      ? {
          label: "Pause",
          go: () =>
            act(async () => {
              await run(timer({ action: "toggle" }));
              return null;
            }),
        }
      : state === "done"
        ? {
            label: `Start again: ${full}`,
            // From full in one step. A clock that ran out still counts as running on the server, where Start/Pause
            // would only pause it, so this sets its own length again and starts it, as Start from full does.
            go: () =>
              act(async () => {
                await run(timer({ action: "set", seconds: live.timer.durationMs / 1000, autostart: true }));
                return null;
              }),
          }
        : {
            label: state === "ready" ? `Start ${full}` : "Resume",
            go: () =>
              act(async () => {
                await run(timer({ action: "toggle" }));
                return null;
              }),
          };

  const add = (minute: boolean) =>
    act(async () => {
      const at = activity.current;
      if (!(await run(timer({ action: "add" })))) return null;
      if (!minute) return "Added 30 seconds.";
      if (!isMounted()) return null;
      if (activity.current !== at) return "Added 30 seconds, then stopped: the game on the TV changed.";
      return (await run(timer({ action: "add" }))) ? "Added 1 minute." : "Only 30 seconds were added.";
    });
  // No relay here: the chime has its own switch, and games that use it turn it on themselves.
  const setTo = (seconds: number) =>
    act(async () =>
      (await run(timer({ action: "set", seconds }))) ? `Set to ${fmtClock(seconds * 1000)} and stopped. Press Start when ready.` : null,
    );
  const reset = () => act(async () => ((await run(timer({ action: "reset" }))) ? `Reset to ${full} and stopped.` : null));
  const relay = () =>
    act(async () => {
      await run(timer({ action: "relay" }));
      return null;
    });
  const bigTimer = () =>
    act(async () => {
      await run(setScreen({ screen: { ...live.screen, mode: "timer" } }));
      return null;
    });
  return { busy, note, remaining, state, full, main, add, setTo, reset, relay, bigTimer };
}

type Clock = ReturnType<typeof useClock>;

/** +30 sec and +1 min: real additions to the time left. */
const AddTime = ({ c }: { c: Clock }) => (
  <div role="group" aria-label="Add time" className="flex gap-1.5">
    <button className="btn btn-sm min-h-11" disabled={c.busy} onClick={() => void c.add(false)}>
      +30 sec
    </button>
    <button className="btn btn-sm min-h-11" disabled={c.busy} onClick={() => void c.add(true)}>
      +1 min
    </button>
  </div>
);

/** The "Set to …" presets, which replace the time and stop the clock, with what that means for the card on the TV. */
function SetTime({ c, live, onSet }: { c: Clock; live: Live; onSet: () => void }) {
  // Answers on the TV's card wait on the clock: set it, and the card stays open until Start gives it a fresh clock.
  const key = heldKey(live.screen);
  const cardOpen = key !== null && !live.screen.revealed && !live.scored.includes(key);
  return (
    <div role="group" aria-label="Replace the clock">
      <p className="font-bold">Replace the clock</p>
      <p className="mt-1 text-sm text-dim">
        Stops the clock at the new time. Press Start when ready.
        {cardOpen && " Answers on the TV stay open until you start it, and starting gives the card a fresh clock."}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {PRESETS.map((s) => (
          <button
            key={s}
            className="btn btn-sm min-h-11"
            disabled={c.busy}
            onClick={() => {
              onSet();
              void c.setTo(s);
            }}
          >
            Set to {fmtClock(s * 1000)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Reset, the relay chime, and the big timer: the clock's less frequent controls. */
const Extras = ({ c, live }: { c: Clock; live: Live }) => (
  <>
    {c.state !== "ready" && (
      <button className="btn btn-sm min-h-11" disabled={c.busy} onClick={() => void c.reset()}>
        Reset to {c.full}
      </button>
    )}
    {(live.teamSize > 1 || live.timer.relay) && (
      <Switch.Root
        nativeButton
        render={<button type="button" />}
        checked={live.timer.relay}
        disabled={c.busy}
        className={`btn btn-sm min-h-11 ${live.timer.relay ? "btn-on" : ""}`}
        onCheckedChange={() => void c.relay()}
        title="Chimes every 2 minutes, for teams to swap"
      >
        Relay chime: {live.timer.relay ? "on" : "off"}
      </Switch.Root>
    )}
    {live.screen.mode === "timer" ? (
      <span className="chip">Big timer is on the TV</span>
    ) : (
      <button className="btn btn-sm min-h-11" disabled={c.busy} onClick={() => void c.bigTimer()}>
        Big timer on TV
      </button>
    )}
  </>
);

// Short enough for a phone, and it scrolls when the screen is short.
const POPUP = "card max-h-[var(--available-height)] max-w-[var(--available-width)] overflow-y-auto bg-paper p-3 text-ink shadow-lg";

export function HostTimer({
  live,
  variant = "strip",
  cardLabel,
  className = "",
}: {
  live: Live;
  /** "strip" for the run console; "bar" for a phone's header: the clock, its main button, and Time controls. */
  variant?: "strip" | "bar";
  /** What the clock is timing, e.g. "Bug Hunt #3". */
  cardLabel?: string;
  className?: string;
}) {
  const c = useClock(live);
  const [open, setOpen] = useState(false);
  // Popovers open inside the timer, so they keep its theme and its own keys.
  const portal = useRef<HTMLDivElement>(null);
  const urgent = c.state === "done" || (c.state === "running" && c.remaining <= 10_000);
  const clock = fmtClock(c.remaining);
  const tone = c.state === "done" ? "text-signal" : c.state === "running" ? "text-pine" : "text-dim";
  const status = `${STATUS[c.state]}${cardLabel ? `: ${cardLabel}` : ""}`;

  if (variant === "bar") {
    // A word fits a phone's header where "Start again: 12:00" wouldn't; its full name is the accessible one. The name
    // leaves the ticking clock to role=timer, so a focused button isn't re-announced every tick.
    const word = c.state === "running" ? "Pause" : c.state === "done" ? "Again" : c.state === "ready" ? "Start" : "Resume";
    return (
      // Its own keys: Space on these buttons presses them, never the Run the night button.
      <div ref={portal} data-own-keys className={`flex items-center gap-1.5 ${className}`}>
        <p className="leading-none" title={status}>
          <span role="timer" className={`narrow block text-xl font-extrabold tabular-nums ${urgent ? "text-signal" : ""}`}>
            {clock}
          </span>
          <span className={`block max-w-20 truncate text-[11px] font-bold ${tone}`}>{STATUS[c.state]}</span>
        </p>
        <button
          className="btn btn-sm btn-coin min-h-11 px-2.5"
          disabled={c.busy}
          onClick={() => void c.main.go()}
          aria-label={`${c.main.label}, timer${cardLabel ? ` for ${cardLabel}` : ""}`}
        >
          {word}
        </button>
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger className="btn btn-sm min-h-11 px-2.5" aria-label="Time controls">
            Time ▾
          </Popover.Trigger>
          <Popover.Portal container={portal}>
            <Popover.Positioner sideOffset={8} align="end" collisionPadding={8} positionMethod="fixed" className="z-50">
              <Popover.Popup className={`${POPUP} w-80`}>
                <Popover.Title className="font-bold">Time controls</Popover.Title>
                <Popover.Description className={`text-sm font-bold ${tone}`}>
                  {clock} · {status}
                </Popover.Description>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button className="btn btn-sm btn-coin min-h-11" disabled={c.busy} onClick={() => void c.main.go()}>
                    {c.main.label}
                  </button>
                  <AddTime c={c} />
                </div>
                {c.note && <p className="mt-2 text-sm font-semibold text-pine">{c.note}</p>}
                <hr className="my-3 border-line" />
                <SetTime c={c} live={live} onSet={() => setOpen(false)} />
                <hr className="my-3 border-line" />
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <Extras c={c} live={live} />
                </div>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
        {/* Always mounted, so a note is heard with the controls closed too. */}
        <p aria-live="polite" className="sr-only">
          {c.note}
        </p>
      </div>
    );
  }

  return (
    <section data-own-keys aria-label="Timer" className={`rounded-[8px] bg-mist p-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-baseline gap-3">
          <p role="timer" className={`narrow text-5xl leading-none font-extrabold tabular-nums ${urgent ? "text-signal" : ""}`}>
            {clock}
          </p>
          <p className={`min-w-0 text-sm font-bold ${tone}`}>{status}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-coin min-w-32" disabled={c.busy} onClick={() => void c.main.go()}>
            {c.main.label}
          </button>
          <AddTime c={c} />
        </div>
        <div ref={portal} className="flex flex-wrap items-center gap-2 border-line sm:ml-auto sm:border-l-2 sm:pl-3">
          <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger className="btn btn-sm min-h-11">Set time…</Popover.Trigger>
            <Popover.Portal container={portal}>
              <Popover.Positioner sideOffset={8} align="end" collisionPadding={8} positionMethod="fixed" className="z-50">
                <Popover.Popup className={`${POPUP} w-72`}>
                  <Popover.Title className="sr-only">Set time</Popover.Title>
                  <SetTime c={c} live={live} onSet={() => setOpen(false)} />
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <Extras c={c} live={live} />
        <p aria-live="polite" className="font-semibold text-pine">
          {c.note}
        </p>
      </div>
    </section>
  );
}
