import { ConvexError } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";

// Accounts that can run the host console: OFFICER_EMAILS (comma-separated) on the Convex deployment.
// Locally, set it to your own email: `bunx convex env set OFFICER_EMAILS you@example.com`.
const officerEmails = () =>
  new Set(
    (process.env.OFFICER_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );

export const isOfficerEmail = (email: string) => officerEmails().has(email.trim().toLowerCase());

async function officerEmail(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  const email = identity?.email?.toLowerCase();
  return email && officerEmails().has(email) ? email : null;
}

export async function requireOfficer(ctx: QueryCtx) {
  const email = await officerEmail(ctx);
  if (!email) throw new ConvexError("Only club officers can do that.");
  return email;
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { signedIn: false, officer: false, email: null };
    return { signedIn: true, officer: !!(await officerEmail(ctx)), email: identity.email ?? null };
  },
});
