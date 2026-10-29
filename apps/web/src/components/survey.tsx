// The member survey (/survey): what members want from the club, how they code, and when and where they can come.
// Members fill it in first and sign in with their HawkMail to send it, so they can come back and change it from anywhere.
import { SignInButton, SignOutButton } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Fragment, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ClubLogo } from "#/components/site";
import {
  BARRIERS,
  BLANK,
  CHANNELS,
  DAYS,
  DAY_NAMES,
  EXPERIENCE,
  FREQUENCY,
  HOURS,
  INTERESTS,
  LANGUAGES,
  LOCATIONS,
  NOTE_MAX,
  hourLabel,
  slotLabel,
  slotOf,
  surveyProblem,
} from "#/lib/survey";
import type { Answers } from "#/lib/survey";
import { CLUB } from "#/lib/season";
import { api } from "../../convex/_generated/api";

// Answers typed before signing in, so they're still here when Clerk sends the member back.
const DRAFT = "club.survey";
type Draft = { name: string; answers: Answers; at: number };
const readDraft = (): Draft | null => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) ?? "null") as Draft | null;
    return d && typeof d.at === "number" ? { ...d, answers: { ...BLANK, ...d.answers } } : null;
  } catch {
    return null;
  }
};

// The club meets Wednesdays 5–6 p.m.: marked on the grid so members can say whether it works.
const MEETING = slotOf(2, 17);

export function Survey() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const mine = useQuery(api.survey.mine, isAuthenticated ? {} : "skip");
  const save = useMutation(api.survey.save);
  const [name, setName] = useState("");
  const [answers, setAnswers] = useState<Answers>(BLANK);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Start from whichever is newer: answers on this browser not sent yet, or the ones already sent.
  const loaded = !isLoading && (!isAuthenticated || mine !== undefined);
  useEffect(() => {
    if (!loaded || ready) return;
    const draft = readDraft();
    if (draft && draft.at > (mine?.updatedAt ?? 0)) {
      setName(draft.name || mine?.name || "");
      setAnswers(draft.answers);
    } else if (mine) {
      setName(mine.name);
      if (mine.answers) setAnswers(mine.answers);
    }
    setReady(true);
  }, [loaded, ready, mine]);

  // Keep unsent changes on this browser, so signing in (or closing the tab) never loses them.
  useEffect(() => {
    if (dirty) localStorage.setItem(DRAFT, JSON.stringify({ name, answers, at: Date.now() } satisfies Draft));
  }, [dirty, name, answers]);

  if (!ready)
    return (
      <Page>
        <p className="mt-10 text-dim">Loading…</p>
      </Page>
    );

  const set = <TKey extends keyof Answers>(key: TKey, value: Answers[TKey]) => {
    setError("");
    setDirty(true);
    setAnswers((a) => ({ ...a, [key]: value }));
  };
  const signedIn = isAuthenticated && !!mine;
  const wrongAccount = signedIn && !mine.hfc;
  const updating = !!mine?.answers;

  async function submit() {
    const problem = surveyProblem(answers) ?? (name.trim() ? null : "Enter your name.");
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await save({ name, ...answers });
      localStorage.removeItem(DRAFT);
      setDirty(false);
      setSent(true);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : "That didn’t go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <Page>
        <div className="card mt-10 p-8">
          <p className="text-sm font-bold text-[#0b4fa3]">Sent</p>
          <h2 className="mt-2 text-4xl lowercase">thanks, {name.split(" ")[0]}!</h2>
          <p className="mt-4 text-lg text-dim">
            The officers plan meetings from these answers. If your schedule or interests change, come back to {CLUB.url}/survey and update
            them anytime.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button className="btn" onClick={() => setSent(false)}>
              Change my answers
            </button>
            <Link to="/" className="btn btn-primary">
              Back to the club’s site
            </Link>
          </div>
        </div>
      </Page>
    );

  return (
    <Page>
      <header className="mt-10">
        <h1 className="text-[clamp(2.6rem,8vw,4.2rem)] leading-[0.92] lowercase">help us plan the club</h1>
        <p className="mt-4 max-w-[52ch] text-lg text-dim">
          About three minutes. Tell us what you want out of {CLUB.name} and when you can actually come, and we’ll plan around it.
          {updating && " Your answers from last time are filled in: change anything and send again."}
        </p>
      </header>

      <div className="mt-10 space-y-12">
        <Question n={1} title="What do you want out of the club?" hint="Pick as many as you like.">
          <Chips options={INTERESTS} picked={answers.interests} onChange={(v) => set("interests", v)} />
        </Question>

        <Question n={2} title="How much coding have you done?">
          <div className="grid gap-2 sm:grid-cols-2">
            {EXPERIENCE.map((o) => (
              <Choice
                key={o.id}
                type="radio"
                name="experience"
                checked={answers.experience === o.id}
                onChange={() => set("experience", o.id)}
              >
                <span className="block font-bold">{o.label}</span>
                <span className="block text-sm text-dim">{o.hint}</span>
              </Choice>
            ))}
          </div>
          <p className="mt-5 mb-2 font-semibold">
            Languages you’ve used <span className="font-normal text-dim">(optional)</span>
          </p>
          <Chips options={LANGUAGES} picked={answers.languages} onChange={(v) => set("languages", v)} />
        </Question>

        <Question n={3} title="How often would you come?">
          <div className="grid gap-2 sm:grid-cols-4">
            {FREQUENCY.map((o) => (
              <Choice key={o.id} type="radio" name="frequency" checked={answers.frequency === o.id} onChange={() => set("frequency", o.id)}>
                <span className="font-bold">{o.label}</span>
              </Choice>
            ))}
          </div>
        </Question>

        <Question n={4} title="Where would you join in?" hint="Pick every place you’d actually show up.">
          <Chips options={LOCATIONS} picked={answers.locations} onChange={(v) => set("locations", v)} />
        </Question>

        <Question
          n={5}
          title="When are you usually free?"
          hint="In a normal week. Drag across the hours, or tap a day or an hour to fill the whole thing."
        >
          <Availability free={answers.free} onChange={(v) => set("free", v)} />
        </Question>

        <Question n={6} title="What’s made it hard to come so far?" hint="Optional, and honest answers help most.">
          <Chips options={BARRIERS} picked={answers.barriers} onChange={(v) => set("barriers", v)} />
        </Question>

        <Question n={7} title="Where will you actually see club news?" hint="Optional. We’ll post where people look.">
          <Chips options={CHANNELS} picked={answers.channels} onChange={(v) => set("channels", v)} />
        </Question>

        <Question n={8} title="Anything else?" hint="Optional. A workshop idea, a topic, a time we missed, anything.">
          <textarea
            className="field block resize-y"
            rows={4}
            maxLength={NOTE_MAX}
            value={answers.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="A Python workshop, a group trip to a hackathon, a game jam…"
          />
          {answers.note.length > NOTE_MAX - 100 && (
            <p className="mt-1 text-right text-sm text-dim">
              {answers.note.length}/{NOTE_MAX}
            </p>
          )}
        </Question>

        <label className="block">
          <span className="font-bold">Your name</span>
          <input
            className="field mt-1.5"
            value={name}
            onChange={(e) => {
              setDirty(true);
              setName(e.target.value);
            }}
            autoComplete="name"
            maxLength={40}
          />
        </label>
      </div>

      {/* Pinned to the bottom so sending is always in reach. */}
      <div className="sticky bottom-0 mt-10 border-t border-line bg-paper/95 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        {error && (
          <p role="alert" className="mb-3 rounded-[6px] bg-signal/10 px-4 py-3 font-semibold text-signal">
            {error}
          </p>
        )}
        {wrongAccount ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-sm">
              You’re signed in as <strong>{mine.email}</strong>, which isn’t a HawkMail. Your answers stay here while you switch.
            </p>
            <SignOutButton redirectUrl="/survey">
              <button className="btn btn-primary">Switch to HawkMail</button>
            </SignOutButton>
          </div>
        ) : signedIn ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button className="btn btn-primary text-lg max-sm:w-full" disabled={busy} onClick={() => void submit()}>
              {busy ? "Sending…" : updating ? "Update my answers" : "Send my answers"}
            </button>
            <p className="text-sm text-dim">
              As {mine.email} ·{" "}
              <SignOutButton redirectUrl="/survey">
                <button className="link">Not you?</button>
              </SignOutButton>
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <SignInButton mode="modal" withSignUp forceRedirectUrl="/survey">
              <button className="btn btn-primary text-lg max-sm:w-full">Sign in with HawkMail to send</button>
            </SignInButton>
            <p className="max-w-[40ch] text-sm text-dim">We’ll email you a code. Signing in lets you change your answers later.</p>
          </div>
        )}
      </div>
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <main className="theme-club mx-auto min-h-dvh w-[min(760px,100%-2.5rem)] pt-8">
      <Link to="/" className="inline-flex items-center gap-3 text-sm font-semibold text-dim hover:text-ink">
        <ClubLogo className="size-8" />
        {CLUB.name} at {CLUB.school}
      </Link>
      {children}
    </main>
  );
}

function Question({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="flex items-baseline gap-3">
        <span className="narrow text-lg font-extrabold text-[#0b4fa3]" aria-hidden>
          {String(n).padStart(2, "0")}
        </span>
        <span className="text-2xl leading-tight font-extrabold tracking-[-0.02em]">{title}</span>
      </legend>
      {hint && <p className="mt-1 pl-9 text-dim">{hint}</p>}
      <div className="mt-4">{children}</div>
    </fieldset>
  );
}

/** A checkbox or radio drawn as a tile: navy when picked. */
function Choice({
  type,
  name,
  checked,
  onChange,
  children,
  className = "",
}: {
  type: "checkbox" | "radio";
  name?: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`block cursor-pointer rounded-[8px] px-4 py-3 transition-colors select-none has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sun ${
        checked ? "bg-ink text-paper [&_.text-dim]:text-paper/70" : "bg-mist hover:bg-line"
      } ${className}`}
    >
      <input type={type} name={name} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}

function Chips({
  options,
  picked,
  onChange,
}: {
  options: readonly { id: string; label: string }[];
  picked: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = picked.includes(o.id);
        return (
          <Choice
            key={o.id}
            type="checkbox"
            checked={on}
            onChange={() => onChange(on ? picked.filter((p) => p !== o.id) : [...picked, o.id])}
            className="!rounded-full !px-4 !py-2 font-semibold"
          >
            {on && <span aria-hidden>✓ </span>}
            {o.label}
          </Choice>
        );
      })}
    </div>
  );
}

/** A week of one-hour slots. A mouse drags out a rectangle (from a picked hour it erases); a tap or the keyboard
 *  toggles one hour. */
function Availability({ free, onChange }: { free: number[]; onChange: (v: number[]) => void }) {
  // The drag: where it started, whether it paints or erases, and the hours picked before it began.
  const drag = useRef<{ from: number; on: boolean; before: number[] } | null>(null);
  const pointer = useRef("");
  useEffect(() => {
    const stop = () => (drag.current = null);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  const apply = (slots: number[], on: boolean, base = free) => {
    const rest = base.filter((s) => !slots.includes(s));
    onChange(on ? [...rest, ...slots] : rest);
  };
  const dragTo = (to: number) => {
    const d = drag.current;
    if (!d) return;
    const [d1, d2] = [Math.floor(d.from / 24), Math.floor(to / 24)].sort((a, b) => a - b);
    const [h1, h2] = [d.from % 24, to % 24].sort((a, b) => a - b);
    const box = DAYS.flatMap((_, day) =>
      day >= d1 && day <= d2 ? HOURS.filter((h) => h >= h1 && h <= h2).map((h) => slotOf(day, h)) : [],
    );
    apply(box, d.on, d.before);
  };
  const toggleAll = (slots: number[]) => apply(slots, !slots.every((s) => free.includes(s)));

  return (
    <div>
      <div className="grid grid-cols-[3.6rem_repeat(7,minmax(0,1fr))] gap-[3px] select-none" role="group" aria-label="Free hours each week">
        <span />
        {DAYS.map((d, day) => (
          <button
            key={d}
            type="button"
            className="py-1 text-center text-sm font-bold hover:text-[#0b4fa3]"
            aria-label={`All of ${DAY_NAMES[day]}`}
            onClick={() => toggleAll(HOURS.map((h) => slotOf(day, h)))}
          >
            {d}
          </button>
        ))}
        {HOURS.map((h) => (
          <Fragment key={h}>
            <button
              type="button"
              className="narrow pr-1 text-right text-sm text-dim hover:text-ink"
              aria-label={`${hourLabel(h)} every day`}
              onClick={() => toggleAll(DAYS.map((_, day) => slotOf(day, h)))}
            >
              {hourLabel(h)}
            </button>
            {DAYS.map((_, day) => {
              const slot = slotOf(day, h);
              const on = free.includes(slot);
              return (
                <button
                  key={slot}
                  type="button"
                  aria-pressed={on}
                  aria-label={slotLabel(slot)}
                  title={slot === MEETING ? `${slotLabel(slot)}: when the club meets now` : slotLabel(slot)}
                  className={`relative h-8 rounded-[4px] transition-colors ${on ? "bg-[#0b4fa3]" : "bg-mist hover:bg-line"}`}
                  onPointerDown={(e) => {
                    pointer.current = e.pointerType;
                    if (e.pointerType !== "mouse" || e.button !== 0) return;
                    e.preventDefault();
                    drag.current = { from: slot, on: !on, before: free };
                    dragTo(slot);
                  }}
                  onPointerEnter={() => dragTo(slot)}
                  // Mouse presses are handled on pointerdown; taps and the keyboard (detail 0) toggle here.
                  onClick={(e) => (pointer.current !== "mouse" || e.detail === 0) && apply([slot], !on)}
                >
                  {slot === MEETING && (
                    <span
                      className={`absolute inset-x-0 top-1/2 -translate-y-1/2 text-[0.65rem] font-bold ${on ? "text-white" : "text-dim"}`}
                    >
                      now
                    </span>
                  )}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-dim">
        <span>
          <strong className="text-ink">{free.length}</strong> hour{free.length === 1 ? "" : "s"} picked · “now” is when the club meets
        </span>
        {free.length > 0 && (
          <button type="button" className="link" onClick={() => onChange([])}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
