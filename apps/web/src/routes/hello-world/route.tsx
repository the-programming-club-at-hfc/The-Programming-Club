import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { InstagramLink } from "#/components/instagram";
import { Disclaimer } from "#/components/site";
import { CLUB } from "#/lib/season";

// Layout for every Hello, World Cup page. The TV, the kickoff slides, the phone join page, and the drawing pad run full
// screen without it.
export const Route = createFileRoute("/hello-world")({
  head: () => ({
    meta: [
      { title: `${CLUB.season} · ${CLUB.name} at ${CLUB.school}` },
      {
        name: "description",
        content: "An eight-week coding game league for HFC programmers of every level. Wednesdays 5–6 p.m., no experience needed.",
      },
    ],
  }),
  component: Layout,
});

const NAV = [
  { to: "/hello-world/season", label: "Season" },
  { to: "/hello-world/rules", label: "Games" },
  { to: "/hello-world/cup", label: "Cup nights" },
  { to: "/hello-world/scores", label: "Scores" },
] as const;

const STRIP = ["tile-sky", "tile-meadow", "tile-sun", "tile-silver", "tile-pine", "tile-gold"];

function Layout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const bare = ["/hello-world/tv", "/hello-world/kickoff", "/hello-world/join", "/hello-world/draw"].some((p) => path.startsWith(p));
  if (bare) return <Outlet />;
  // The host console on a phone has its own bar at the top, so the site's header and footer step aside there.
  const chrome = path.startsWith("/hello-world/host") ? "max-lg:hidden" : "";
  return (
    <>
      <Nav className={chrome} />
      <main id="main">
        <Outlet />
      </main>
      <Footer className={chrome} />
    </>
  );
}

function Nav({ className }: { className: string }) {
  return (
    <header className={`no-print sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-md ${className}`}>
      <div className="mx-auto flex h-16 w-[min(1240px,100%-2.5rem)] items-center gap-6">
        <Link to="/hello-world" className="flex items-center gap-3 text-[1.15rem] font-extrabold tracking-[-0.03em] whitespace-nowrap">
          <span className="grid grid-cols-3 gap-[2px]" aria-hidden>
            {STRIP.map((t) => (
              <span key={t} className={`tile ${t} size-2.5`} />
            ))}
          </span>
          hello, world cup
        </Link>
        <nav className="ml-auto flex items-center gap-1 text-[0.95rem] font-semibold">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="px-3 py-2 whitespace-nowrap text-dim hover:text-ink max-md:hidden"
              activeProps={{ className: "!text-ink underline decoration-sky decoration-[3px] underline-offset-[10px]" }}
            >
              {n.label}
            </Link>
          ))}
          <Link to="/hello-world/join" className="btn btn-primary btn-sm ml-3 whitespace-nowrap">
            Join tonight
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Footer({ className }: { className: string }) {
  return (
    <footer className={`no-print theme-pine mt-32 ${className}`}>
      <div className="flex" aria-hidden>
        {STRIP.map((t) => (
          <span key={t} className={`tile ${t} h-2 flex-1`} />
        ))}
      </div>
      <div className="mx-auto grid w-[min(1240px,100%-2.5rem)] gap-10 py-14 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <p className="text-3xl font-extrabold tracking-[-0.03em]">hello, world cup</p>
          <p className="mt-3 max-w-[38ch] text-dim">
            {CLUB.tag} of{" "}
            <Link to="/" className="underline underline-offset-2 hover:text-ink">
              {CLUB.name} at {CLUB.school}
            </Link>
            . {CLUB.day}, {CLUB.time}, in {CLUB.room}. {CLUB.eligibility}.
          </p>
          <InstagramLink className="mt-5 hover:text-sky" />
        </div>
        <nav className="grid content-start gap-2">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="text-dim hover:text-ink">
              {n.label}
            </Link>
          ))}
          <Link to="/hello-world/join" className="text-dim hover:text-ink">
            Join tonight’s game
          </Link>
          <Link to="/" className="text-dim hover:text-ink">
            About the club
          </Link>
        </nav>
        <nav className="grid content-start gap-2">
          <span className="text-sm text-dim/70">For officers</span>
          <Link to="/hello-world/host" className="text-dim hover:text-ink">
            Run tonight’s game
          </Link>
          <Link to="/hello-world/schedule" className="text-dim hover:text-ink">
            Season planner
          </Link>
          <Link to="/hello-world/kickoff" className="text-dim hover:text-ink">
            Kickoff slides
          </Link>
          <Link to="/hello-world/kit" className="text-dim hover:text-ink">
            Game plan
          </Link>
        </nav>
      </div>
      <div className="mx-auto flex w-[min(1240px,100%-2.5rem)] flex-wrap items-center gap-6 border-t border-line py-8">
        <Disclaimer className="max-w-[90ch] flex-1 text-sm text-dim" />
      </div>
    </footer>
  );
}
