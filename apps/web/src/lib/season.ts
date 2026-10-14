// Club settings and the season calendar. Edit this file to change names, dates, or links.

export const CLUB = {
  name: "The Programming Club",
  school: "Henry Ford College",
  season: "Hello, World Cup",
  tag: "Season 0",
  day: "Wednesdays",
  time: "5–6 p.m.",
  room: "Room E-178",
  url: "programmingclub.dev",
  // Who can join, word for word as on approved club flyers (Student Clubs Policy Manual: only enrolled students participate).
  eligibility: "Open to all currently enrolled HFC students",
  advisor: { name: "Sreya Sadasivapetkar", email: "ssadasivapetkar@hfcc.edu", office: "E-162I" },
  timeZone: "America/Detroit",
  links: {
    teams: "", // Invite link to the club's Microsoft Teams group (QR code on the last kickoff slide)
  },
};

/** HFC student (@hawkmail.hfcc.edu) and staff (@hfcc.edu) emails: the only ones members join with, since the club is HFC-only. */
export const isHfcEmail = (email: string) => /@(hawkmail\.)?hfcc\.edu$/i.test(email.trim());

// Shown on the kickoff slides. Sign-in permissions come from OFFICER_EMAILS on the Convex deployment (see convex/officers.ts).
export const OFFICERS = [
  { role: "President", name: "Gregory Thomas", fact: "" },
  { role: "Vice President", name: "Juan Quenga", fact: "" },
  { role: "Treasurer", name: "Muhammad Bilal Aziz", fact: "" },
  { role: "Secretary", name: "Virginia Daniel", fact: "" },
  { role: "Faculty advisor", name: "Sri Sai Sreya Sadasivapetkar", fact: "" },
];

// Meeting start times, one per week (Detroit time; clocks change Nov 1).
// To cancel a week, change its date and shift the rest.
export const WEEK_STARTS = [
  "2026-10-14T17:00:00-04:00",
  "2026-10-21T17:00:00-04:00",
  "2026-10-28T17:00:00-04:00",
  "2026-11-04T17:00:00-05:00",
  "2026-11-11T17:00:00-05:00",
  "2026-11-18T17:00:00-05:00",
  "2026-11-25T17:00:00-05:00",
  "2026-12-02T17:00:00-05:00",
].map((s) => new Date(s));

export function fmtDate(d: Date, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  return d.toLocaleDateString("en-US", { ...opts, timeZone: CLUB.timeZone });
}

export const isCupWeek = (week: number) => week === 4 || week === 6;

/** True during October in Detroit, when the site wears its Halloween touches. */
export const isHalloweenMonth = (now = new Date()) =>
  new Intl.DateTimeFormat("en-US", { month: "numeric", timeZone: CLUB.timeZone }).format(now) === "10";
