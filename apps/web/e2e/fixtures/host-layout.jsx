// Mounts the real /hello-world/host page: the hello-world Layout (site header and footer) around the route's own
// component, in a memory router at /hello-world/host. host-layout.spec.ts swaps their Convex and Clerk imports for
// host-layout-convex.jsx in the browser, so the page runs against a local reactive store.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Outlet, RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { FeedbackProvider } from "../../src/components/feedback";
import { reset, useQuery } from "./host-layout-convex.jsx";
import { api } from "../../convex/_generated/api";

export async function mount(scenario) {
  if (document.getElementById("host-layout-mount")) throw new Error("Host layout fixture already mounted");
  // Loaded here, not at the top, so the timer-only mount still works while the page itself is mid-change.
  const [{ component: Layout }, { component: Host }] = await Promise.all([
    import("../../src/routes/hello-world/route.tsx?tsr-split=component"),
    import("../../src/routes/hello-world/host.tsx?tsr-split=component"),
  ]);
  reset(scenario);
  const root = createRootRoute({ component: Outlet });
  const layout = createRoute({ getParentRoute: () => root, path: "/hello-world", component: Layout });
  const host = createRoute({ getParentRoute: () => layout, path: "/host", component: Host });
  const router = createRouter({
    routeTree: root.addChildren([layout.addChildren([host])]),
    history: createMemoryHistory({ initialEntries: ["/hello-world/host"] }),
    defaultPreload: false,
  });
  const element = document.createElement("div");
  element.id = "host-layout-mount";
  document.body.append(element);
  createRoot(element).render(
    <StrictMode>
      <FeedbackProvider>
        <RouterProvider router={router} />
      </FeedbackProvider>
    </StrictMode>,
  );
  return router;
}

/** The real HostTimer alone, bound to the same store, for clock behaviour that doesn't depend on the page around it. */
export async function mountTimer(scenario, variant = "strip") {
  const { HostTimer } = await import("../../src/components/host-timer.tsx");
  reset(scenario);
  function Clock() {
    const live = useQuery(api.sessions.live);
    return live ? <HostTimer live={live} variant={variant} cardLabel="Output? #1" /> : <p>No night</p>;
  }
  const element = document.createElement("div");
  element.id = "host-layout-mount";
  element.className = "p-5";
  document.body.append(element);
  createRoot(element).render(
    <StrictMode>
      <FeedbackProvider>
        <main>
          <Clock />
        </main>
      </FeedbackProvider>
    </StrictMode>,
  );
}
