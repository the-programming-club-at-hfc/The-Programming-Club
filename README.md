# Programming Club

Code for The Programming Club at Henry Ford College. A Bun workspace with one app today, room for more.

| Path | What it is |
| --- | --- |
| [`apps/web`](apps/web) | **programmingclub.dev**: the club's home page, plus Hello, World Cup at `/hello-world` (TanStack Start, Convex, Clerk, Tailwind, deployed on Vercel) |

```bash
bun install          # once, from the repo root
bun run dev          # runs apps/web
bun run typecheck    # every workspace
bun run lint
```

New projects (another event, a club tool) go in `apps/<name>` with their own `package.json`. Shared code can move into `packages/<name>` later and be added to `workspaces` in the root `package.json`.

## Contributing

Contributions are welcome from club members and anyone else. Start with [CONTRIBUTING.md](CONTRIBUTING.md): you'll run your own free Convex and Clerk dev setups, so no access to the club's accounts is needed. Everyone follows the [Code of Conduct](CODE_OF_CONDUCT.md), and security problems go through [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). The license covers the code, not Henry Ford College's name or logos.
