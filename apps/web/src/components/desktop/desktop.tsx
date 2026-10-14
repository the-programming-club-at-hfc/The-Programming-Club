// The club home page as a lab-computer desktop: icons open draggable windows, a taskbar shows the clock and the next meeting.
// Every window has its own address (/about, /meetings, …) so links, search, and the back button work.
// Phones get a home screen of app icons, and each app opens full screen.
import { Show, SignInButton, UserButton } from "@clerk/tanstack-react-start";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { InstagramGlyph, InstagramLink } from "#/components/instagram";
import { useLikelyOfficer } from "#/components/officer";
import { ClubLogo } from "#/components/site";
import { nextMeeting, useSchedule } from "#/lib/schedule";
import { CLUB, INSTAGRAM_URL, isHalloweenMonth } from "#/lib/season";
import { APPS, appFor, countdown } from "./apps";
import { Scene } from "./scene";
import type { App, AppId } from "./apps";

type Pt = { x: number; y: number };
/** Windows animate between states; the state only changes once the animation ends. */
type Phase = "opening" | "closing" | "minimizing" | "restoring" | "zooming";
/** Array order is stacking order; `n` is opening order, which the taskbar keeps. `delay` holds the first windows until startup finishes. */
type Win = { id: AppId; n: number; pos?: Pt; min?: boolean; max?: boolean; phase?: Phase; fly?: Pt; delay?: number };
let opened = 0;
/** The startup animation plays on the first load only, not when coming back from another page. Set in an effect, so never on the server. */
let booted = false;

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Bring a window to the front, un-minimizing it (with the restore animation) if needed. */
function raise(ws: Win[], id: AppId): Win[] {
  const w = ws.find((x) => x.id === id);
  const next: Win = !w
    ? { id, n: ++opened, phase: "opening" }
    : w.min
      ? { ...w, min: false, phase: still() ? undefined : "restoring" }
      : { ...w, phase: w.phase === "closing" ? undefined : w.phase };
  return [...ws.filter((x) => x.id !== id), next];
}

/** How far a window has to travel to land on its taskbar button. */
function flyTo(id: AppId): Pt | undefined {
  const win = document.querySelector(`[data-win="${id}"]`)?.getBoundingClientRect();
  const btn = document.querySelector(`[data-task="${id}"]`)?.getBoundingClientRect();
  if (!win || !btn) return;
  return { x: btn.left + btn.width / 2 - (win.left + win.width / 2), y: btn.top + btn.height / 2 - (win.top + win.height / 2) };
}

/** Desktop and phone icons: everything but the footer-linked "About this site", plus officer apps for officers. */
const useIconApps = () => {
  const officer = useLikelyOfficer();
  return APPS.filter((a) => a.id !== "site" && (!a.officer || officer));
};

const SITE = APPS.find((a) => a.id === "site")!;

function Icon({ app, size = "md" }: { app: App; size?: "md" | "lg" }) {
  return <span className={`desk-icon shrink-0 ${size === "lg" ? "size-16 p-4" : "size-14 p-3.5"}`}>{app.glyph}</span>;
}

export function Desktop() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const routeApp = appFor(path);
  const [boot] = useState(() => !booted);
  useEffect(() => {
    booted = true;
  }, []);
  const [wins, setWins] = useState<Win[]>(() =>
    (routeApp ? [routeApp.id] : (["meetings", "about"] as const)).map((id, i) => ({
      id,
      n: ++opened,
      phase: "opening",
      delay: boot ? 700 + i * 120 : 0,
    })),
  );
  const [startOpen, setStartOpen] = useState(false);
  const iconApps = useIconApps();
  const october = isHalloweenMonth();
  // Startup stagger: each icon (and the "About this site" card after them) waits for the one before.
  const bootIn: BootIn = (i) =>
    boot ? { className: "boot-icon", style: { "--i": i } as CSSProperties } : { className: "", style: undefined };

  // Opening a window's address opens (or raises) that window.
  useEffect(() => {
    if (!routeApp) return;
    setWins((ws) => {
      const top = ws.at(-1);
      if (top?.id === routeApp.id && !top.min && top.phase !== "closing") return ws;
      return raise(ws, routeApp.id);
    });
  }, [routeApp]);

  const go = useCallback((to: string, replace = false) => void navigate({ to, replace }), [navigate]);
  const open = (app: App) => {
    setStartOpen(false);
    go(app.path);
  };
  const focus = (id: AppId) => {
    const app = APPS.find((a) => a.id === id)!;
    if (path !== app.path) go(app.path, true);
    setWins((ws) => raise(ws, id));
  };
  const patch = (id: AppId, p: Partial<Win>) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, ...p } : w)));
  // After closing or minimizing, the address follows the window that's now on top.
  const leave = (id: AppId) => {
    const top = [...wins].reverse().find((w) => w.id !== id && !w.min && w.phase !== "closing");
    go(top ? APPS.find((a) => a.id === top.id)!.path : "/", true);
  };
  const close = (id: AppId) => {
    if (still()) setWins((ws) => ws.filter((w) => w.id !== id));
    else patch(id, { phase: "closing" });
    leave(id);
  };
  const minimize = (id: AppId) => {
    const fly = still() ? undefined : flyTo(id);
    patch(id, fly ? { phase: "minimizing", fly } : { min: true, phase: undefined });
    leave(id);
  };
  const maximize = (id: AppId) => {
    const w = wins.find((x) => x.id === id);
    patch(id, { max: !w?.max, phase: still() ? undefined : "zooming" });
  };
  const settle = (id: AppId) =>
    setWins((ws) =>
      ws.flatMap((w) => {
        if (w.id !== id) return [w];
        if (w.phase === "closing") return [];
        if (w.phase === "minimizing") return [{ ...w, min: true, phase: undefined }];
        return [{ ...w, phase: undefined }];
      }),
    );
  const move = (id: AppId, pos: Pt) => patch(id, { pos });

  // Escape closes the window on top.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (startOpen) return setStartOpen(false);
      const top = [...wins].reverse().find((w) => !w.min && w.phase !== "closing");
      if (top && !(e.target as HTMLElement).closest("input, textarea")) close(top.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const visible = wins.filter((w) => !w.min);
  const topId = visible.filter((w) => w.phase !== "closing").at(-1)?.id;

  return (
    <div className="theme-club desk-wallpaper fixed inset-0 overflow-hidden text-ink" data-october={october || undefined}>
      <div aria-hidden className={`absolute inset-0 ${boot ? "boot-wallpaper" : ""}`}>
        <div className="desk-aerial" />
        <Scene october={october} />
      </div>

      {/* Desktop (tablets and up) */}
      <div className="absolute inset-0 bottom-12 max-md:hidden">
        {/* Icons fill a column, then wrap into the next one on short screens. */}
        <nav aria-label="Desktop" className="absolute top-6 left-4 flex h-[calc(100%-7.5rem)] flex-col flex-wrap content-start gap-1">
          {iconApps.map((app, i) => (
            <button
              key={app.id}
              onClick={() => open(app)}
              style={bootIn(i).style}
              className={`group press flex w-28 flex-col items-center gap-2 rounded-[12px] p-2 text-center outline-none ${bootIn(i).className}`}
            >
              <Icon app={app} />
              <span className="rounded-[4px] px-1.5 py-0.5 text-[0.8rem] leading-tight font-semibold text-white [text-shadow:0_1px_2px_rgb(2_12_32/0.6)] group-focus-visible:bg-[#1f63d6]">
                {app.label}
              </span>
            </button>
          ))}
        </nav>

        <a
          href="/site"
          onClick={(e) => {
            e.preventDefault();
            open(SITE);
          }}
          style={bootIn(iconApps.length).style}
          className={`glass absolute bottom-5 left-5 flex max-w-xs items-center gap-3 rounded-[12px] p-2 pr-4 text-xs leading-snug ${bootIn(iconApps.length).className}`}
        >
          <span className="desk-icon size-9 shrink-0 rounded-[8px] p-2">{SITE.glyph}</span>
          <span className="text-white/80">
            Not an official Henry Ford College site.
            <span className="block font-semibold text-white underline decoration-white/40 underline-offset-2">About this site</span>
          </span>
        </a>

        {visible.map((w, n) => {
          const app = APPS.find((a) => a.id === w.id)!;
          return (
            <Window
              key={w.id}
              app={app}
              win={w}
              z={10 + n}
              active={w.id === topId}
              onFocus={() => focus(w.id)}
              onClose={() => close(w.id)}
              onMinimize={() => minimize(w.id)}
              onMaximize={() => maximize(w.id)}
              onMove={(p) => move(w.id, p)}
              onSettle={() => settle(w.id)}
            />
          );
        })}
      </div>

      {/* Phone home screen, or the open app full screen */}
      <Phone routeApp={routeApp} onOpen={open} bootIn={bootIn} />

      <Taskbar
        wins={wins.filter((w) => w.phase !== "closing").sort((a, b) => a.n - b.n)}
        topId={topId}
        startOpen={startOpen}
        setStartOpen={setStartOpen}
        onOpen={open}
        onFocus={focus}
        onMinimize={minimize}
        inApp={!!routeApp}
        boot={boot}
      />
    </div>
  );
}

function Window({
  app,
  win,
  z,
  active,
  onFocus,
  onClose,
  onMinimize,
  onMaximize,
  onMove,
  onSettle,
}: {
  app: App;
  win: Win;
  z: number;
  active: boolean;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onMove: (p: Pt) => void;
  onSettle: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onDown = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("button") || win.max) return;
    const el = ref.current!;
    drag.current = { dx: e.clientX - el.offsetLeft, dy: e.clientY - el.offsetTop };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onFocus();
  };
  const onDrag = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    const el = ref.current!;
    const parent = el.offsetParent as HTMLElement;
    // Keep the title bar on screen.
    const x = Math.min(Math.max(e.clientX - drag.current.dx, -el.offsetWidth + 120), parent.clientWidth - 120);
    const y = Math.min(Math.max(e.clientY - drag.current.dy, 0), parent.clientHeight - 44);
    onMove({ x, y });
  };
  const onUp = () => (drag.current = null);

  const place = win.max
    ? { left: 0, top: 0, width: "100%", height: "100%" }
    : win.pos
      ? { left: win.pos.x, top: win.pos.y, width: app.width, maxHeight: `calc(100% - ${win.pos.y}px - 1rem)` }
      : // Clear the icon columns (two once officers see the Dashboard) so a fresh window never covers them.
        { left: `max(16rem, ${app.at.left}%)`, top: `${app.at.top}%`, width: app.width, maxHeight: `calc(${100 - app.at.top}% - 1rem)` };
  const fly = win.fly ? { "--fx": `${win.fly.x}px`, "--fy": `${win.fly.y}px` } : {};

  return (
    <section
      ref={ref}
      role="dialog"
      aria-label={app.title}
      data-win={app.id}
      onPointerDown={onFocus}
      onAnimationEnd={(e) => e.target === e.currentTarget && win.phase && onSettle()}
      className={`win absolute flex flex-col ${win.max ? "win-max" : "max-w-[calc(100%-2rem)]"} ${active ? "win-active" : ""} ${win.phase ? `win-${win.phase}` : ""}`}
      style={{ ...place, ...fly, zIndex: z, animationDelay: win.phase === "opening" && win.delay ? `${win.delay}ms` : undefined }}
    >
      <header
        onPointerDown={onDown}
        onPointerMove={onDrag}
        onPointerUp={onUp}
        onDoubleClick={(e) => !(e.target as HTMLElement).closest("button") && onMaximize()}
        className={`win-bar flex h-11 shrink-0 touch-none items-center gap-2.5 pr-2 pl-4 select-none ${win.max ? "" : "cursor-grab active:cursor-grabbing"}`}
      >
        <span className="size-4 shrink-0">{app.glyph}</span>
        <span className="min-w-0 flex-1 truncate text-[0.9rem] font-semibold">{app.title}</span>
        <button onClick={onMinimize} className="win-btn press" aria-label={`Minimize ${app.title}`}>
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
            <path d="M2.5 6h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <button onClick={onMaximize} className="win-btn press" aria-label={`${win.max ? "Restore" : "Maximize"} ${app.title}`}>
          <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            {win.max ? (
              <path d="M2.5 4.5h5v5h-5zM4.5 4.5v-2h5v5h-2" strokeLinejoin="round" />
            ) : (
              <rect x="2.5" y="2.5" width="7" height="7" rx="1.2" />
            )}
          </svg>
        </button>
        <button onClick={onClose} className="win-btn win-btn-close press" aria-label={`Close ${app.title}`}>
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
            <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-6">
        <div className={win.max ? "mx-auto max-w-3xl py-4" : undefined}>
          <app.Content />
        </div>
      </div>
    </section>
  );
}

function Taskbar({
  wins,
  topId,
  startOpen,
  setStartOpen,
  onOpen,
  onFocus,
  onMinimize,
  inApp,
  boot,
}: {
  wins: Win[];
  topId?: AppId;
  startOpen: boolean;
  setStartOpen: (v: boolean) => void;
  onOpen: (a: App) => void;
  onFocus: (id: AppId) => void;
  onMinimize: (id: AppId) => void;
  /** A phone has an app open full screen: the taskbar's first button goes back home. */
  inApp: boolean;
  boot: boolean;
}) {
  return (
    <>
      {startOpen && (
        <div className="fixed inset-0 z-40" onPointerDown={() => setStartOpen(false)}>
          <div
            className="win menu-open absolute bottom-16 left-3 w-72 p-2"
            role="menu"
            aria-label="Start"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-line px-2 pt-1.5 pb-3">
              <ClubLogo className="size-10" />
              <p className="text-sm leading-tight text-dim">
                {CLUB.name}
                <br />
                <span className="font-semibold text-ink">at {CLUB.school}</span>
              </p>
            </div>
            <div className="pt-1.5" />
            {APPS.filter((a) => !a.officer).map((a) => (
              <button
                key={a.id}
                role="menuitem"
                onClick={() => onOpen(a)}
                className="press flex w-full items-center gap-3 rounded-[8px] px-2 py-1.5 text-left hover:bg-mist focus-visible:bg-mist"
              >
                <span className="grid size-8 place-items-center rounded-[8px] bg-[#0b4fa3] p-1.5 text-white">{a.glyph}</span>
                <span className="font-semibold">{a.label}</span>
              </button>
            ))}
            <a
              role="menuitem"
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="press flex w-full items-center gap-3 rounded-[8px] px-2 py-1.5 hover:bg-mist focus-visible:bg-mist"
            >
              <span className="grid size-8 place-items-center rounded-[8px] bg-[linear-gradient(135deg,#d62976,#962fbf_55%,#4f5bd5)] p-1.5 text-white">
                <InstagramGlyph className="size-full" />
              </span>
              <span className="font-semibold">Instagram</span>
              <span className="ml-auto text-sm text-dim">@{CLUB.instagram}</span>
            </a>
            <div className="mt-2 border-t border-line pt-2">
              <Link to="/hello-world/host" className="block rounded-[8px] px-2 py-1.5 text-sm text-dim hover:bg-mist">
                Officer sign-in
              </Link>
            </div>
          </div>
        </div>
      )}
      <footer className={`glass taskbar fixed inset-x-0 bottom-0 z-50 flex h-12 items-center gap-1.5 px-2 ${boot ? "boot-taskbar" : ""}`}>
        {inApp && (
          <Link
            to="/"
            className="press flex h-9 items-center gap-1.5 rounded-[8px] pr-3 pl-2 text-sm font-bold hover:bg-white/12 md:hidden"
            aria-label="Back to the home screen"
          >
            <svg viewBox="0 0 12 12" className="size-3.5" aria-hidden>
              <path
                d="M7.5 2.5L4 6l3.5 3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Home
          </Link>
        )}
        <button
          onClick={() => setStartOpen(!startOpen)}
          aria-expanded={startOpen}
          aria-label="Start"
          className={`press flex h-9 items-center gap-2 rounded-[8px] px-2 pr-3 text-sm font-bold hover:bg-white/12 ${startOpen ? "bg-white/15" : ""} ${inApp ? "max-md:hidden" : ""}`}
        >
          <ClubLogo className="size-6" />
          <span className="max-sm:hidden">Programming Club</span>
        </button>
        <span className="mx-1 h-6 w-px bg-white/15 max-md:hidden" aria-hidden />
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto max-md:hidden">
          {wins.map((w) => {
            const a = APPS.find((x) => x.id === w.id)!;
            return (
              <button
                key={w.id}
                data-task={w.id}
                // Like a real taskbar: clicking the window that's already in front minimizes it.
                onClick={() => (w.id === topId && !w.min ? onMinimize(w.id) : onFocus(w.id))}
                className={`press task-in relative flex h-9 max-w-48 min-w-0 shrink-0 items-center gap-2 rounded-[8px] px-2.5 text-sm hover:bg-white/10 ${w.id === topId && !w.min ? "bg-white/15 font-semibold" : "text-white/75"}`}
              >
                <span className="size-4 shrink-0">{a.glyph}</span>
                <span className="truncate">{a.title}</span>
                {w.id === topId && !w.min && <span className="absolute inset-x-3 bottom-0.5 h-0.5 rounded-full bg-[#7fb0ff]" aria-hidden />}
              </button>
            );
          })}
        </div>
        <NextChip onOpen={onOpen} />
        <Clock />
        <Account />
      </footer>
    </>
  );
}

function NextChip({ onOpen }: { onOpen: (a: App) => void }) {
  const plan = useSchedule();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const next = now === null ? null : nextMeeting(plan, now);
  if (!next || now === null) return null;
  return (
    <button
      onClick={() => onOpen(APPS.find((a) => a.id === "meetings")!)}
      className="press ml-auto flex h-9 items-center gap-2 rounded-[8px] px-3 text-sm font-semibold hover:bg-white/10 max-md:flex-1"
    >
      <span className="relative flex size-2" aria-hidden>
        <span className="absolute inset-0 animate-ping rounded-full bg-[#ffb547] opacity-60 motion-reduce:hidden" />
        <span className="relative size-2 rounded-full bg-[#ffb547]" />
      </span>
      <span className="truncate">
        {next.live ? "Meeting happening now" : `Next meeting ${countdown(plan[next.i].start.getTime(), now)}`}
      </span>
    </button>
  );
}

/** Signed in: the officer's photo, with a menu that links to the host console. Signed out: a sign-in button. */
function Account() {
  return (
    <span className="flex h-9 shrink-0 items-center rounded-[8px] px-1.5 hover:bg-white/10">
      <Show when="signed-in">
        {/* Holds the avatar's place while Clerk's scripts load, so the taskbar doesn't jump. */}
        <UserButton fallback={<span className="block size-7 rounded-full bg-white/20" />}>
          <UserButton.MenuItems>
            <UserButton.Link label="Host console" labelIcon={<ClubLogo className="size-4" />} href="/hello-world/host" />
          </UserButton.MenuItems>
        </UserButton>
      </Show>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button
            className="press grid size-8 place-items-center rounded-full text-white/85 hover:text-white"
            aria-label="Officer sign-in"
            title="Officer sign-in"
          >
            <svg viewBox="0 0 20 20" className="size-6" aria-hidden>
              <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="10" cy="8" r="3" fill="currentColor" />
              <path d="M4.5 15.5c1.2-2.2 3.2-3.3 5.5-3.3s4.3 1.1 5.5 3.3" fill="currentColor" />
            </svg>
          </button>
        </SignInButton>
      </Show>
    </span>
  );
}

function Clock() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setT(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: CLUB.timeZone }));
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);
  return <span className="w-[4.5rem] shrink-0 pr-1 text-right text-sm text-white/85 tabular-nums max-sm:hidden">{t}</span>;
}

/** Phones: a home screen of apps; with an app open, it fills the screen. */
type BootIn = (i: number) => { className: string; style?: CSSProperties };

function Phone({ routeApp, onOpen, bootIn }: { routeApp: App | null; onOpen: (a: App) => void; bootIn: BootIn }) {
  const iconApps = useIconApps();
  if (routeApp)
    return (
      <div key={routeApp.id} className="phone-in absolute inset-0 bottom-12 z-30 flex flex-col bg-paper md:hidden">
        <header className="win-bar flex h-12 shrink-0 items-center justify-center gap-2 bg-white px-4 text-ink shadow-[inset_0_2px_0_#1f63d6]">
          <span className="size-4 shrink-0">{routeApp.glyph}</span>
          <span className="truncate font-semibold">{routeApp.title}</span>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <routeApp.Content />
        </div>
      </div>
    );
  return (
    <div className="absolute inset-0 bottom-12 overflow-y-auto px-6 pt-8 pb-6 md:hidden">
      <div {...bootIn(0)}>
        <ClubLogo className="size-12" />
      </div>
      <div {...bootIn(1)}>
        <p className="mt-4 text-2xl leading-tight font-extrabold tracking-[-0.02em] text-white">{CLUB.name}</p>
        <p className="text-white/65">at {CLUB.school}</p>
      </div>
      <a
        style={bootIn(2).style}
        href="/site"
        onClick={(e) => {
          e.preventDefault();
          onOpen(APPS.find((a) => a.id === "site")!);
        }}
        className={`mt-3 inline-block text-xs text-white/60 underline decoration-white/30 underline-offset-2 ${bootIn(2).className}`}
      >
        Not an official Henry Ford College site
      </a>
      <div className="mt-10 grid grid-cols-3 gap-x-3 gap-y-7">
        {iconApps.map((a, i) => (
          <button
            key={a.id}
            onClick={() => onOpen(a)}
            style={bootIn(3 + i).style}
            className={`press flex flex-col items-center gap-2 text-center ${bootIn(3 + i).className}`}
          >
            <Icon app={a} size="lg" />
            <span className="text-[0.8rem] leading-tight font-semibold text-white">{a.label}</span>
          </button>
        ))}
      </div>
      <div {...bootIn(3 + iconApps.length)}>
        <InstagramLink className="mt-10 rounded-full bg-white/12 px-4 py-2.5 text-sm text-white hover:bg-white/20" />
      </div>
    </div>
  );
}
