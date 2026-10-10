// The privacy policy and terms pages (routes/privacy.tsx, routes/terms.tsx). Google's sign-in consent screen links to both.
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ClubLogo, Disclaimer } from "#/components/site";
import { CLUB } from "#/lib/season";

export const UPDATED = "October 9, 2026";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-[min(720px,100%-2.5rem)] py-14">
      <Link to="/" className="inline-flex items-center gap-3 text-sm font-semibold text-dim hover:text-ink">
        <ClubLogo className="size-8" />
        {CLUB.name} at {CLUB.school}
      </Link>
      <h1 className="mt-10 text-[clamp(2.6rem,6vw,4rem)] leading-[0.95] lowercase">{title}</h1>
      <p className="mt-3 text-sm text-dim">Last updated {UPDATED}</p>
      <div className="legal mt-10 space-y-8 text-[1.05rem] leading-relaxed">{children}</div>
      <Disclaimer className="mt-14 border-t border-line pt-6 text-sm text-dim" />
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl tracking-normal">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

export const contact = (
  <a href={`mailto:${CLUB.advisor.email}`} className="underline underline-offset-2">
    {CLUB.advisor.email}
  </a>
);
