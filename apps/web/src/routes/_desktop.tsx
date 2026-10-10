import { Outlet, createFileRoute } from "@tanstack/react-router";
import { Desktop } from "#/components/desktop/desktop";
import { isHalloweenMonth } from "#/lib/season";

// The club home page: a desktop whose windows each have their own address (see routes/_desktop/*).
export const Route = createFileRoute("/_desktop")({
  head: () => ({
    links: [{ rel: "preload", as: "image", href: isHalloweenMonth() ? "/wallpaper/desk-october.webp" : "/wallpaper/desk.webp" }],
  }),
  component: () => (
    <>
      <Desktop />
      <Outlet />
    </>
  ),
});
