// The one-time question for brand-new members on their phone. Optional: sending or skipping hides it for good (convex/ideas.ts).
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { IDEA_MAX } from "#/lib/ideas";

export function IdeaPrompt({ token }: { token: string }) {
  const show = useQuery(api.ideas.prompt, { token });
  const send = useMutation(api.ideas.send);
  const skip = useMutation(api.ideas.skip);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"sent" | "skipped" | "gone" | null>(null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (done !== "sent") return;
    const fade = setTimeout(() => setFading(true), 2200);
    const gone = setTimeout(() => setDone("gone"), 2900);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, [done]);

  if (done === "sent")
    return (
      <p
        role="status"
        className={`mt-8 rounded-[10px] bg-meadow p-5 text-xl font-bold text-[#12332b] transition-opacity duration-700 motion-reduce:transition-none ${fading ? "opacity-0" : ""}`}
      >
        Thanks! The officers read every idea.
      </p>
    );
  if (!show || done) return null;

  async function submit(e: { preventDefault: () => void }) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await send({ token, text });
      setDone("sent");
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : "That didn’t go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mt-8 p-5">
      <h2 className="text-2xl">One quick question</h2>
      <label className="mt-2 block">
        <span className="text-dim">What would you like the club to do? Events, projects, games, workshops: anything you’d enjoy.</span>
        <textarea className="field mt-3 min-h-24" value={text} onChange={(e) => setText(e.target.value)} maxLength={IDEA_MAX} />
      </label>
      {text.length > IDEA_MAX - 100 && (
        <p className="mt-1 text-right text-sm text-dim">
          {text.length}/{IDEA_MAX}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-[6px] bg-signal/10 px-4 py-3 font-semibold text-signal">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button className="btn btn-primary" disabled={busy || !text.trim()}>
          {busy ? "Sending…" : "Send"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setDone("skipped");
            void skip({ token }).catch(() => {});
          }}
        >
          Skip
        </button>
      </div>
    </form>
  );
}
