import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, Section, contact } from "#/components/legal";
import { CLUB } from "#/lib/season";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: `Privacy policy · ${CLUB.name}` }] }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage title="privacy policy">
      <p>
        {CLUB.url} is run by {CLUB.name}, a student club at {CLUB.school}. We collect as little as we can, only to run club meetings and the{" "}
        {CLUB.season}.
      </p>
      <Section title="What we collect">
        <ul className="prose-list">
          <li>
            <strong>Joining a game night:</strong> the name and email address you type in, which team you were on, and your points and
            attendance for each meeting.
          </li>
          <li>
            <strong>Signing in:</strong> club officers sign in with Google or an emailed code. We receive their name, email address, and
            profile picture. Members only sign in to fill in the member survey or, if they like, to join game nights in one tap; we receive
            the same details.
          </li>
          <li>
            <strong>The member survey:</strong> if you fill it in, your name and HawkMail, what you want from the club, your coding
            experience, how often and where you’d meet, and the hours you’re usually free. Only officers see it.
          </li>
          <li>
            <strong>“I’m interested” hearts:</strong> a random ID stored in your browser so you can’t heart an event twice. It isn’t linked
            to your name or email.
          </li>
        </ul>
      </Section>
      <Section title="How we use it">
        <p>
          To run each meeting (teams, scores, the leaderboard), to award season prizes, and to keep the attendance records that Henry Ford
          College’s Office of Student Activities asks clubs to keep. Officers see names, emails, and attendance; the public leaderboard
          shows only names and points.
        </p>
        <p>We don’t sell your information, show ads, or use it for anything unrelated to the club.</p>
      </Section>
      <Section title="Who handles it">
        <p>
          The site is hosted by Vercel. Game and attendance data is stored with Convex, and officer sign-in is handled by Clerk (and Google,
          if you choose Google). These services process data only to run the site.
        </p>
      </Section>
      <Section title="How long we keep it">
        <p>
          Attendance and scores are kept for the current school year so we can award prizes and report attendance, then deleted. You can ask
          us to delete your information at any time.
        </p>
      </Section>
      <Section title="Questions or deletion requests">
        <p>Email our faculty advisor at {contact}.</p>
      </Section>
    </LegalPage>
  );
}
