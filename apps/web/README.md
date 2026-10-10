# programmingclub.dev

The website for The Programming Club at Henry Ford College: the club's home page at `/`, and Hello, World Cup, the Season 0 game league (8 weeks, Wednesdays 5–6 p.m., Oct 14 to Dec 2, 2026), under `/hello-world`.

| Page | Who uses it | What it does |
| --- | --- | --- |
| `/` | Everyone | The club home page, built like a lab-computer desktop. Icons open draggable windows, each with its own address: `/about`, `/meetings`, `/world-cup`, `/officers`, `/how-to-join`, `/site` (the required HFC disclaimer). Phones get a home screen of apps. Code: `src/components/desktop/` |

Hello, World Cup pages, all under `/hello-world` (old addresses like `/join` and `/tv` redirect, see `vercel.json`):

| Page | Who uses it | What it does |
| --- | --- | --- |
| `/hello-world` `/season` `/rules` `/cup` | Everyone | The season, the games, scoring, and the Cup-night agenda |
| `/join` | Members | Scan the TV's QR code, enter a name and HawkMail. No account needed. Shows your team, score, timer, and the current challenge |
| `/tv` | The gaming-room TV | Join screen, scoreboard, timer, and challenge cards, all controlled live from `/host` |
| `/host` | Officers | Sign in with HawkMail (Clerk) to start the night, make teams, score, run the TV, give bonus XP, and export attendance |
| `/schedule` | Officers | Season planner: change any week's lineup (picking from every game in the season), details, or date, or cancel a week |
| `/kickoff` | Officers | Slides for the first meeting (arrow keys, **F** for full screen) |
| `/scores` | Everyone | Season XP high scores |
| `/kit` | Officers | Roles, prep checklist, supplies, and promo copy |

## Stack

TanStack Start (React, Vite) · Convex (real-time database) · Clerk (officer sign-in) · Tailwind · Vercel. Package manager: Bun.

## Editing

- **A week's games, title, description, mini-lesson, bonus, or date, or cancelling a week:** officers do this at `/schedule` (the season planner). No deploy needed; changes go live right away. "Reset to the original plan" brings back the defaults.
- **Club info, advisor contact, who can join, default season dates, officer names:** `src/lib/season.ts`
- **School rules for the site:** the footer carries the HFC Student Clubs logo (`public/hfc-student-clubs.png`, as supplied by the Office of Student Activities; never recreate or edit it, and never use the official HFC logo) and the required "not an official HFC channel" disclaimer (`src/components/site.tsx`). Name the club "The Programming Club at Henry Ford College", never "Henry Ford College Programming Club". Club web pages need approval from the Office of Student Activities (Student Clubs Policy Manual, "Web Pages").
- **Who can sign in as an officer:** the `OFFICER_EMAILS` env var (comma-separated) on the Convex deployment, read by `convex/officers.ts`. Emails stay out of the repo, and changes need no deploy.
- **Game rules, challenge decks, Wiki Race pairs, the default weekly plan, copy:** `src/lib/content.ts`

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
7. `bun run dev`: app on http://localhost:3000. Sign in at `/host` with the email from step 5.

Officers with access to the club's accounts can skip steps 2–5 with `bunx vercel env pull .env.local` and the club's dev deployment.

Checks: `bun run typecheck` and `bun run lint`.

## Deploying

Pushing to `main` deploys production on Vercel (project root directory: `apps/web`). The build runs `convex deploy` with the `CONVEX_DEPLOY_KEY` stored in Vercel's production env, then builds the app pointed at the production Convex deployment. Branch previews skip the Convex deploy and use the dev deployment through `VITE_CONVEX_URL`, so run `bunx convex dev` to push backend changes there.

Convex project: `hello-world-cup`. Production is `vivid-curlew-846`, dev is `successful-iguana-864`. Both have `OFFICER_EMAILS` set.
