import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, Section, contact } from "#/components/legal";
import { CLUB } from "#/lib/season";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: `Terms of use · ${CLUB.name}` }] }),
  component: Terms,
});

function Terms() {
  return (
    <LegalPage title="terms of use">
      <p>
        {CLUB.url} is a website for {CLUB.name} at {CLUB.school}. By using it, you agree to these terms.
      </p>
      <Section title="Using the site">
        <p>
          Use your real name or a recognizable nickname when you join a game, and only enter your own email address. Be kind: don’t use
          offensive names, and don’t try to break, overload, or cheat the scoreboard.
        </p>
        <p>Officer tools are for club officers only. Officers may remove players, names, or scores that break these rules.</p>
      </Section>
      <Section title="Club events">
        <p>
          Club meetings and events follow Henry Ford College’s Student Code of Conduct and student club policies. Participation is open
          to currently enrolled HFC students.
        </p>
      </Section>
      <Section title="No guarantees">
        <p>
          The site is run by student volunteers and is provided as is. Schedules, games, and prizes can change, and the site may be
          unavailable at times.
        </p>
      </Section>
      <Section title="Changes and contact">
        <p>We may update these terms; the date above shows the latest version. Questions? Email our faculty advisor at {contact}.</p>
      </Section>
    </LegalPage>
  );
}
