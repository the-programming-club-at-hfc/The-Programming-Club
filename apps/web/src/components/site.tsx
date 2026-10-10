import { CLUB } from "#/lib/season";

/**
 * The HFC Student Clubs logo, used as supplied by the Office of Student Activities.
 * Policy: never recreate or modify it, and never use the official HFC logo or seal instead.
 */
export const ClubsLogo = ({ className = "" }: { className?: string }) => (
  <img src="/hfc-student-clubs.png" alt="HFC Student Clubs" width={381} height={342} className={className} />
);

/** The disclaimer HFC requires on student club channels (Student Clubs Policy Manual, social media policy). */
export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={className}>
      This site is not an official Henry Ford College communications channel and is not maintained nor monitored by Henry Ford College. All
      content, including images, views, expressions, and opinions, is created by and is solely the responsibility of {CLUB.name}. Our HFC
      advisor is {CLUB.advisor.name}. Contact us at{" "}
      <a href={`mailto:${CLUB.advisor.email}`} className="underline underline-offset-2">
        {CLUB.advisor.email}
      </a>
      .
    </p>
  );
}

// Accent colors shared by the hero's syntax and the favicon: cursor color first, then the two others.
export const MARK = {
  blue: "#0b4fa3",
  normal: ["#ffb547", "#9fd3ff", "#ff8fa3"],
  october: ["#f47a1f", "#b49bff", "#ffd23f"],
};

/** The club's logo: a glowing CRT prompt (generated art, cleaned up into public/logo.png). The favicon is a flat version of it. */
export const ClubLogo = ({ className = "" }: { className?: string }) => (
  <img src="/logo.png" alt="" width={128} height={128} className={className} />
);
