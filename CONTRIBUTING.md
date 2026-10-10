# Contributing

Thanks for helping build the club's site. Anyone can contribute, club member or not.

## Getting started

1. Fork the repo (officers can branch directly) and clone it.
2. Follow [Local development](apps/web/README.md#local-development). You'll run your own free Convex and Clerk dev setups, so you don't need access to the club's accounts.
3. Make a branch: `git switch -c short-description`.

## Making a change

- Small fixes can go straight to a pull request. For anything bigger (a new page, a new game, a schema change), open an issue first so we can agree on the approach.
- Match the surrounding code: TypeScript (no `any`), Tailwind, short and simple over clever.
- Run `bun run typecheck` and `bun run lint` before pushing. CI runs both on every pull request.
- Keep pull requests focused on one change, and explain what and why in the description. Screenshots help for UI changes.

## Reviews and merging

An officer reviews every pull request (see `.github/CODEOWNERS`). Once it's approved and CI passes, an officer merges it, and merging to `main` deploys the live site.

## Rules from the school

The site has to follow Henry Ford College's student club rules: keep the "not an official HFC site" disclaimer, never recreate or edit the HFC Student Clubs logo, never use the official HFC logo, and call the club "The Programming Club at Henry Ford College". Details are in [apps/web/README.md](apps/web/README.md#editing).

## Conduct and security

Everyone follows the [Code of Conduct](CODE_OF_CONDUCT.md). Report security problems privately, as described in [SECURITY.md](SECURITY.md), not in a public issue.

By contributing, you agree your work is released under the [MIT License](LICENSE).
