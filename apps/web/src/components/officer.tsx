import { Show, SignInButton, SignOutButton, useAuth } from "@clerk/tanstack-react-start";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useSchedule } from "#/lib/schedule";
import { CLUB } from "#/lib/season";

/** Runs an officer action, with a plain alert if it fails. */
export async function run(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    alert(e instanceof ConvexError ? String(e.data) : "That didn’t work. Check your connection and try again.");
  }
}

/** True once the signed-in user is confirmed as an officer; false while loading or for everyone else. */
export function useOfficer() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.officers.me, isAuthenticated ? {} : "skip");
  return !!me?.officer;
}

/**
 * For officer-only icons: true for any signed-in user until the database says they aren't an officer.
 * Clerk's sign-in state is known from the server's first render, so officers don't wait on the Convex round trips.
 */
export function useLikelyOfficer() {
  const { isSignedIn } = useAuth();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.officers.me, isAuthenticated ? {} : "skip");
  if (!isSignedIn) return false;
  return isLoading || (isAuthenticated && me === undefined) || !!me?.officer;
}

/** Tonight's join code, or null until an officer is signed in and a night is running. */
export function useJoinCode() {
  const officer = useOfficer();
  return useQuery(api.sessions.joinCode, officer ? {} : "skip") ?? null;
}

/** Shows its children only to a signed-in officer; everyone else gets a sign-in prompt or an explanation. */
export function OfficerGate({ children, redirect, purpose }: { children: ReactNode; redirect: string; purpose: string }) {
  return (
    <>
      <Show when="signed-out">
        <div className="card mx-auto max-w-md p-8 text-center">
          <h1 className="text-3xl lowercase">officers only</h1>
          <p className="mt-3 text-dim">Sign in with your HawkMail address to {purpose}. We’ll email you a code.</p>
          <SignInButton mode="modal" forceRedirectUrl={redirect}>
            <button className="btn btn-primary mt-6 text-lg">Sign in with HawkMail</button>
          </SignInButton>
        </div>
      </Show>
      <Show when="signed-in">
        <Check>{children}</Check>
      </Show>
    </>
  );
}

function Check({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.officers.me, isAuthenticated ? {} : "skip");
  if (isLoading || (isAuthenticated && me === undefined)) return <p className="font-bold text-dim">Loading…</p>;
  if (!isAuthenticated)
    return (
      <p className="card p-6">
        You’re signed in, but the database didn’t accept the session. Check the Clerk “convex” JWT template and CLERK_JWT_ISSUER_DOMAIN on
        Convex.
      </p>
    );
  if (!me?.officer)
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <h1 className="text-3xl lowercase">not an officer account</h1>
        <p className="mt-3 text-dim">
          {me?.email} isn’t on the officer list. Members don’t need to sign in: join from the TV’s QR code instead.
        </p>
        <SignOutButton>
          <button className="btn mt-6">Sign out</button>
        </SignOutButton>
      </div>
    );
  return children;
}

const csvCell = (v: string | number | boolean) => `"${String(v).replace(/"/g, '""')}"`;

/** Downloads a night's attendance in the Student Activities sign-in sheet's columns. */
export function ExportButton({ sessionId }: { sessionId: Id<"sessions"> }) {
  const convex = useConvex();
  const plan = useSchedule();
  async function download() {
    const d = await convex.query(api.sessions.attendanceExport, { sessionId });
    const date = new Date(d.startedAt);
    const lines = [
      ["Date", date.toLocaleDateString("en-US", { timeZone: CLUB.timeZone })],
      ["Event/Activity/Meeting", `${CLUB.season} Week ${d.week}: ${plan[d.week - 1]?.title ?? ""}`],
      ["Sponsor", "HFC Programming Club"],
      [],
      ["Full Name", "Email Address", "Status/Title", "Team", "First time", "XP"],
      ...d.rows.map((r) => [r.name, r.email, r.status, r.team, r.firstTime ? "yes" : "", r.xp]),
    ];
    const blob = new Blob([lines.map((l) => l.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hfc-programming-club-week-${d.week}-${date.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <button
      className="btn btn-sm"
      onClick={() =>
        download().catch((e: unknown) =>
          alert(e instanceof ConvexError ? String(e.data) : "That didn’t work. Check your connection and try again."),
        )
      }
    >
      Attendance CSV
    </button>
  );
}
