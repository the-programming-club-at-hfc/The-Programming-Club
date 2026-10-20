# Agent notes

## Service access: use CLIs before computer use

On the owner's machine (Juan's), these CLIs are installed and authenticated. Use them for any dashboard-style task (env vars, deploys, logs, settings, users, projects) before reaching for computer use or asking the owner to click through a web console. Fall back to computer use only when the CLI genuinely can't do it, and say why.

| Service | CLI | This repo's target |
| --- | --- | --- |
| Vercel | `vercel` | project `programming-club` (`prj_C7Qrg1YWPB1iPcCYgcVsqbbCpRqa`), root `apps/web` |
| Clerk | `bunx clerk@latest` | app "The Programming Club" (`app_3KTHTX6SIIwCIoHtAOBSdH6lPYq`), linked by git remote |
| Google Cloud | `gcloud` | project `programming-club-auth` (default) |

- Vercel: `vercel env ls|add|pull`, `vercel logs`, `vercel ls`, `vercel project inspect programming-club`. Pass `--scope`/project flags or run from `apps/web` after `vercel link`.
- Clerk: run from `apps/web`. `clerk whoami`, `clerk users`, `clerk config`, `clerk env`, and `clerk api <endpoint>` for anything else (`clerk api ls` to browse). Instances: dev `ins_3KTHTTjAoUNtM0lObFIIYveQZk7`, prod `ins_3KTHjlCwYOKukIoxJ6nZCjposW5` (`clerk.programmingclub.dev`). The CLI's link can miss prod (`whoami` shows `production: null`); pass `--instance <id>` instead.
- Google Cloud: `gcloud services`, `gcloud iam`, `gcloud projects`, etc. Application Default Credentials are set too. A few things (e.g. the OAuth consent screen) are console-only.
- Check auth first (`vercel whoami`, `clerk whoami`, `gcloud auth list`). If a CLI is missing or signed out, tell the owner rather than switching to computer use silently. Other contributors won't have this access.
- Officer access comes from `OFFICER_EMAILS` on each Convex deployment (`bunx convex env get|set OFFICER_EMAILS --deployment <name>`). Never put real emails or other personal data in the repo: it's public.
- Clerk's agent skills (`clerk/skills`, unlicensed) aren't committed. Restore them locally from `skills-lock.json` with `bunx skills add clerk/skills`.
- Confirm before anything destructive or production-facing: deleting resources, rotating keys, production env changes, production deploys.

## Screenshots in PR descriptions

Put them on the `pr-assets` branch, never on a branch of their own: it's an orphan branch (no shared history with `main`) with a folder per PR (`pr-12/`), and a ruleset blocks deleting or force-pushing it. Add a commit with a `pr-<n>/` folder on top of the branch tip (`git hash-object`/`mktree`/`commit-tree` works without touching the checkout), push it, and link images by that commit's SHA so later pushes never change an old PR: `https://raw.githubusercontent.com/the-programming-club-at-hfc/The-Programming-Club/<sha>/pr-<n>/<file>.png`.
