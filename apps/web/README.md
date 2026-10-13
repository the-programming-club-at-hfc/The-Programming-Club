# programmingclub.dev

The website for The Programming Club at Henry Ford College: the club's home page at `/`, and Hello, World Cup, the Season 0 game league (8 weeks, Wednesdays 5–6 p.m., Oct 14 to Dec 2, 2026), under `/hello-world`.

| Page | Who uses it | What it does |
| --- | --- | --- |
| `/` | Everyone | The club home page, built like a lab-computer desktop. Icons open draggable windows, each with its own address: `/about`, `/meetings`, `/world-cup`, `/officers`, `/how-to-join`, `/site` (the required HFC disclaimer). Phones get a home screen of apps. Code: `src/components/desktop/` |

Hello, World Cup pages, all under `/hello-world` (old addresses like `/join` and `/tv` redirect, see `vercel.json`):

| Page | Who uses it | What it does |
| --- | --- | --- |
| `/hello-world` `/season` `/rules` `/cup` | Everyone | The season, the games, scoring, and the Cup-night agenda |
| `/join` | Members | Scan the TV's QR code, enter a name and HawkMail. No account needed. Shows your team, score, timer, and the current challenge, and lets your team answer Bug Hunt, Output?, and Guess the Language, and tap “We made it!” in a Wiki Race |
| `/fix` | Team computers | Pick the team once. Fix it for real (the double-points final on Bug Hunt nights): edit and run a buggy Python program in the browser (Pyodide from its CDN, in a Web Worker), and the site marks the team fixed when every test passes. Puzzles (Code Relay Night’s final and the Final): the story, the team’s own input (copy or download it as `input.txt`), a Python editor that reads it, and an answer box per part |
| `/tv` | The gaming-room TV | Join screen, scoreboard, timer, and challenge cards, all controlled live from `/host` |
| `/host` | Officers | Sign in with HawkMail (Clerk) to start the night (or a practice night that doesn’t count), make teams, score, run the TV, give bonus XP, and export attendance. One big “Run the night” button (Space or →) walks through tonight’s lineup: start a round, show the next unused card with its timer, reveal, show scores, then another card or the next round; the manual controls stay below. Bug Hunt, Output?, and Guess the Language are answered on phones, Fix it for real and puzzles on team computers, and all are scored when the answer is revealed. Wiki Race finishes come in from phones; the referee checks them with ✓/✗, and the race is scored when it ends |
| `/test` | Officers | Play every Bug Hunt, Fix it for real, puzzle (with any seed and the reference answers), Output?, Guess the Language card, and Wiki Race as a pretend team, see the points the real scoring gives, and flag cards that are too easy, too hard, or broken |
| `/schedule` | Officers | Season planner: change any week's lineup (picking from every game in the season), details, or date, or cancel a week |
| `/kickoff` | Officers | Slides for the first meeting (arrow keys, **F** for full screen) |
| `/scores` | Everyone | Season XP high scores |
| `/kit` | Officers | Roles, prep checklist, supplies, and promo copy |

## Stack

TanStack Start (React, Vite) · Convex (real-time database) · Clerk (officer sign-in) · Tailwind · Vercel. Package manager: Bun.

## Editing

- **A week's games, title, description, mini-lesson, bonus, or date, or cancelling a week:** officers do this at `/schedule` (the season planner). No deploy needed; changes go live right away. "Reset to the original plan" brings back the defaults.
- **Club info, advisor contact, who can join, default season dates, officer names:** `src/lib/season.ts`
- **School rules for the site:** no HFC logos of any kind, including the HFC Student Clubs logo (the manual's social media policy bars HFC logos on club channels), and the required "not an official HFC channel" disclaimer (`src/components/site.tsx`). Name the club "The Programming Club at Henry Ford College", never "Henry Ford College Programming Club". Club web pages need approval from the Office of Student Activities (Student Clubs Policy Manual, "Web Pages").
- **Who can sign in as an officer:** the `OFFICER_EMAILS` env var (comma-separated) on the Convex deployment, read by `convex/officers.ts`. Emails stay out of the repo, and changes need no deploy.
- **Game rules, challenge decks, Wiki Race pairs, the default weekly plan, copy:** `src/lib/content.ts` (the Fix it for real deck is `src/lib/fixes.ts` and the puzzles, with their input generators and solvers, are `src/lib/puzzles.ts`; the Pyodide version is pinned in `public/py-worker.js`)
- **TV sounds and music:** `src/lib/sound.ts`, all synthesized in the browser. Try every sound at `/hello-world/sounds` (unlisted). To use real music, add `public/audio/lobby.mp3` (join screen) or `public/audio/think.mp3` (while the clock runs); the repo is public, so only use tracks whose license allows sharing them (CC0 is safest). Officers turn music on or off and set the volume from `/host`.

## Local development

Contributors run their own free Convex and Clerk dev setups; nobody needs access to the club's accounts. Run these from `apps/web` (dependencies install from the repo root):

1. `bun install`
2. `bunx convex dev` (keep it running). Sign in to Convex and create a new project when asked. This writes `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL` to `.env.local`.
3. Create a free app at [clerk.com](https://dashboard.clerk.com) with email sign-in. In it, enable the Convex integration (Configure → Integrations → Convex), or add a JWT template named `convex` that includes the `email` claim.
4. Copy `.env.example`'s Clerk keys into `.env.local` from the app's API keys page (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`).
5. Point Convex at Clerk and make yourself an officer:
   ```bash
   bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev   # Clerk's Frontend API URL
   bunx convex env set OFFICER_EMAILS you@example.com
   ```
6. Optional sample data (one finished night with three teams): `bunx convex run seed:run`
7. `bun run dev`: app on http://localhost:3000 (and on your network, so phones can scan the TV's join QR code). Sign in at `/host` with the email from step 5.

Officers with access to the club's accounts can skip steps 2–5 with `bunx vercel env pull .env.local` and the club's dev deployment.

Checks: `bun run typecheck`, `bun run lint`, and `bun test` (scoring rules and answer windows in `src/lib/grading.ts`, and the puzzles’ examples and the edge cases every generated input must have).

## Deploying

Pushing to `main` deploys production on Vercel (project root directory: `apps/web`). The build runs `convex deploy` with the `CONVEX_DEPLOY_KEY` stored in Vercel's production env, then builds the app pointed at the production Convex deployment. Branch previews skip the Convex deploy and use the dev deployment through `VITE_CONVEX_URL`, so run `bunx convex dev` to push backend changes there.

Convex project: `hello-world-cup`. Production is `vivid-curlew-846`, dev is `successful-iguana-864`. Both have `OFFICER_EMAILS` set.
