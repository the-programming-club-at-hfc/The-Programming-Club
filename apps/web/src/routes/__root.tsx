import { HeadContent, Link, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Providers } from "#/components/providers";
import { CLUB } from "#/lib/season";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: `${CLUB.name} at ${CLUB.school}` },
      {
        name: "description",
        content: `A student programming club at ${CLUB.school} for every skill level. ${CLUB.day}, ${CLUB.time}, in ${CLUB.room}`,
      },
      { name: "theme-color", content: "#ffffff" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Mona+Sans:wdth,wght@75..125,200..900&family=Atkinson+Hyperlegible+Mono:wght@400;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      // The CRT prompt logo at tab sizes, plus an .ico for older browsers.
      { rel: "icon", href: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { rel: "icon", href: "/favicon-48.png", sizes: "48x48", type: "image/png" },
      { rel: "icon", href: "/favicon-192.png", sizes: "192x192", type: "image/png" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: () => (
    <div className="mx-auto grid min-h-[70vh] w-[min(1240px,100%-2.5rem)] content-center">
      <p className="narrow text-[10rem] leading-none font-extrabold">404</p>
      <p className="mt-2 text-lg text-dim">There’s no page at this address.</p>
      <Link to="/" className="btn btn-primary mt-8 justify-self-start">
        Go to the club’s home page
      </Link>
    </div>
  ),
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Providers>{children}</Providers>
        <Scripts />
      </body>
    </html>
  );
}
