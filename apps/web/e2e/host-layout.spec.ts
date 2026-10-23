import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// The whole /hello-world/host page (site Layout + host route component) against a local reactive store; see
// fixtures/host-layout.jsx. Screenshots and layout metrics go to this run's output directory, never the repo.

const stub = "/e2e/fixtures/host-layout-convex.jsx";
const fixture = "/e2e/fixtures/host-layout.jsx";
// A Wednesday evening in week 3, so the clock, the likely week, and every countdown are the same on each run.
const NIGHT = new Date("2026-10-28T17:20:00-04:00");

type Scenario = "none" | "lobby" | "active" | "revealed" | "wiki" | "draw";
type Call = { name: string; args: Record<string, unknown> };
type Timer = { durationMs: number; remainingMs: number; startedAt?: number; relay: boolean; card?: string };
type Snapshot = {
  calls: Call[];
  rejected: Call[];
  live: null | {
    round: number | null;
    timer: Timer;
    screen: { mode: string; game?: string; index?: number; revealed?: boolean };
    scored: string[];
    teamSize: number;
    teams: { _id: string; name: string; score: number; members: string[] }[];
  };
};
type Controls = {
  snapshot: () => Snapshot;
  fail: (name: string, message?: string, skip?: number) => void;
  hold: (name: string) => void;
  release: (name: string) => void;
  pending: (name: string) => number;
  answer: (teamId: string, pick: { choice?: string; line?: number }) => void;
  join: (name: string) => void;
  external: (name: string, args: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    __hostLayout: Controls;
  }
}

test.describe.configure({ timeout: 90_000 });

export const VIEWPORTS = {
  laptop: { width: 1366, height: 768 },
  desktop: { width: 1440, height: 900 },
  tablet: { width: 1024, height: 768 },
  phone: { width: 390, height: 844 },
  short: { width: 568, height: 320 },
} as const;
type Viewport = keyof typeof VIEWPORTS;

export async function mountHost(page: Page, scenario: Scenario, viewport: Viewport = "laptop", only?: "timer" | "timer-bar") {
  const base = new URL(test.info().project.use.baseURL ?? "http://127.0.0.1:3137");
  const errors: string[] = [];
  const blocked: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  await page.setViewportSize(VIEWPORTS[viewport]);
  await page.clock.setFixedTime(NIGHT);
  // No socket reaches anything: Vite's HMR socket is held open locally so it never reloads or overlays the page.
  await page.routeWebSocket(/.*/, (socket) => {
    if (new URL(socket.url()).host !== base.host) {
      blocked.push(`WS ${socket.url()}`);
      socket.close();
    }
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    // Use the app's font fallbacks so geometry and interactions never depend on a third-party font request.
    if (!["GET", "HEAD"].includes(request.method()) || url.origin !== base.origin) {
      blocked.push(`${request.method()} ${url.href}`);
      return route.abort();
    }
    if (url.pathname === "/__host-layout") {
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
          <script type="module">
            import RefreshRuntime from "/@react-refresh";
            RefreshRuntime.injectIntoGlobalHook(window);
            window.$RefreshReg$ = () => {};
            window.$RefreshSig$ = () => (type) => type;
            window.__vite_plugin_react_preamble_installed__ = true;
            await import("/src/styles.css");
            const fixture = await import("${fixture}");
            ${only ? `await fixture.mountTimer(${JSON.stringify(scenario)}, ${JSON.stringify(only === "timer" ? "strip" : "bar")});` : `await fixture.mount(${JSON.stringify(scenario)});`}
          </script></body></html>`,
      });
    }
    if (url.pathname.startsWith("/src/") || url.pathname === fixture || url.pathname === stub) {
      const response = await route.fetch();
      let body = await response.text();
      // Service imports (Convex, Clerk) resolve to the one local store, whatever HMR query Vite appended.
      body = body.replace(/from "[^"]*(?:convex_react\.js|@clerk\/tanstack-react-start\/dist\/index\.js)[^"]*"/g, `from "${stub}"`);
      body = body.replace(/from "\/e2e\/fixtures\/host-layout-convex\.jsx[^"]*"/g, `from "${stub}"`);
      // After an edit Vite stamps some imports with ?t=…; one URL per module keeps one instance of each.
      body = body.replace(/((?:from|import)\s*\(?\s*"[^"]+?)[?&]t=\d+(&[^"]*)?"/g, (_, path: string, rest = "") =>
        rest ? `${path}?${rest.slice(1)}"` : `${path}"`,
      );
      return route.fulfill({ response, body });
    }
    return route.continue();
  });
  for (let attempt = 0; ; attempt++) {
    await page.goto("/__host-layout");
    const mounted = await page
      .locator("#host-layout-mount main")
      .first()
      .waitFor({ timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
    // A shared dev server can re-optimize dependencies mid-load, briefly serving two copies of React. Load once more.
    if (mounted || attempt > 0 || !errors.some((e) => e.includes("Invalid hook call"))) break;
    errors.length = 0;
  }
  // Generous: a shared dev server transforms the whole host tree on first load.
  await expect(page.locator("#host-layout-mount main").first())
    .toBeVisible({ timeout: 25_000 })
    .catch((error: unknown) => {
      throw new Error(`Host page failed to mount. Client errors: ${JSON.stringify(errors)}`, { cause: error });
    });
  await expect(page.getByText("Loading…")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  return { errors, blocked };
}

export const snapshot = (page: Page) => page.evaluate(() => window.__hostLayout.snapshot());
export const calls = async (page: Page) => (await snapshot(page)).calls;

export function expectClean(result: { errors: string[]; blocked: string[] }) {
  expect(result.errors, "Client runtime errors").toEqual([]);
  expect(result.blocked, "Blocked network attempts").toEqual([]);
}

/** Document scroll, sideways overflow, and the elements that stick out past the viewport's right edge. */
export async function metrics(page: Page) {
  return page.evaluate(() => {
    const doc = document.scrollingElement ?? document.documentElement;
    const past = [...document.querySelectorAll<HTMLElement>("#host-layout-mount *")].filter(
      (el) => el.getBoundingClientRect().right > innerWidth + 1 && el.getClientRects().length > 0,
    );
    const name = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${[...el.classList].slice(0, 3).join(".")}`;
    const wide = past
      // Inside a scroller (a lineup strip that scrolls sideways) is fine; only what widens the page counts.
      .filter((el) => {
        for (let up = el.parentElement; up && up.id !== "host-layout-mount"; up = up.parentElement)
          if (getComputedStyle(up).overflowX !== "visible") return false;
        return true;
      })
      .slice(0, 5)
      .map(name);
    // Nothing outside a scroller sticks out, yet the page is wide: name the widest candidates anyway.
    if (!wide.length && doc.scrollWidth > innerWidth) {
      // The outermost box that's wider than the page is usually the one to fix.
      const outer = past.find((el) => (el.parentElement?.getBoundingClientRect().right ?? 0) <= innerWidth + 1);
      if (outer) wide.push(`(outermost) ${name(outer)} ${Math.round(outer.getBoundingClientRect().width)}px`);
      wide.push(...past.slice(0, 3).map((el) => `(in scroller) ${name(el)}`));
    }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scrollHeight: doc.scrollHeight,
      scrollWidth: doc.scrollWidth,
      screensTall: Math.round((doc.scrollHeight / innerHeight) * 100) / 100,
      overflowX: doc.scrollWidth > innerWidth,
      wide,
    };
  });
}

/** Full-page and first-screen captures plus metrics, attached to the report and written under the output dir. */
export async function capture(page: Page, name: string) {
  const m = await metrics(page);
  for (const [suffix, fullPage] of [
    ["fold", false],
    ["full", true],
  ] as const) {
    const path = test.info().outputPath(`${name}-${suffix}.png`);
    await page.screenshot({ path, fullPage, animations: "disabled" });
    await test.info().attach(`${name}-${suffix}`, { path, contentType: "image/png" });
  }
  await test.info().attach(`${name}-metrics`, { body: JSON.stringify(m, null, 2), contentType: "application/json" });
  console.log(`[host-layout] ${name} ${JSON.stringify(m)}`);
  return m;
}

// ---- Baseline: every state at every size mounts cleanly and gets captured ---------------------------------------

const STATES: Scenario[] = ["none", "lobby", "active", "revealed", "wiki", "draw"];
for (const scenario of STATES) {
  test(`captures ${scenario} at every size`, async ({ page }) => {
    const result = await mountHost(page, scenario, "laptop");
    for (const viewport of Object.keys(VIEWPORTS) as Viewport[]) {
      await page.setViewportSize(VIEWPORTS[viewport]);
      await page.evaluate(() => scrollTo(0, 0));
      const measured = await capture(page, `${scenario}-${viewport}`);
      expect(measured.overflowX, `${scenario} at ${viewport}: ${measured.wide.join(", ")}`).toBe(false);
    }
    // Looking never writes.
    expect(await calls(page)).toEqual([]);
    expectClean(result);
  });
}

test("the store scores a reveal through the app's real grading and the page follows it", async ({ page }) => {
  const result = await mountHost(page, "active");
  await page.evaluate(() => window.__hostLayout.answer("team-4", { choice: "11" }));
  // Revealed from another device, so this checks the store and the page's subscription, not a button.
  await page.evaluate(() =>
    window.__hostLayout.external("sessions:setScreen", { screen: { mode: "card", game: "output", index: 0, revealed: true } }),
  );
  const after = await snapshot(page);
  expect(after.live?.scored).toEqual(["output:0"]);
  // Output? is 1 point for a right answer: teams 1, 3 and 4 said 11.
  expect(Object.fromEntries((after.live?.teams ?? []).map((t) => [t._id, t.score]))).toEqual({
    "team-1": 5,
    "team-2": 3,
    "team-3": 3,
    "team-4": 2,
  });
  await expect(page.getByText("Scored from phones").first()).toBeVisible();
  expectClean(result);
});

// ---- HostTimer: the real component on the same store -----------------------------------------------------------

const timerCalls = async (page: Page) => (await calls(page)).filter((c) => c.name === "sessions:timer").map((c) => c.args);
const clock = (page: Page) => page.getByRole("region", { name: "Timer" }).getByRole("timer");
const note = (page: Page) => page.getByRole("region", { name: "Timer" }).locator("[aria-live=polite]");

test.describe("HostTimer", () => {
  test("labels say what they do: additions are +, replacements are Set to … behind Set time", async ({ page }) => {
    const result = await mountHost(page, "active", "laptop", "timer");
    const timer = page.getByRole("region", { name: "Timer" });
    await expect(clock(page)).toHaveText("0:18");
    const add = timer.getByRole("group", { name: "Add time" });
    await expect(add.getByRole("button")).toHaveText(["+30 sec", "+1 min"]);
    // No bare preset like "1:00" sits next to the additions.
    await expect(timer.getByRole("button", { name: /^\d+:\d\d$/ })).toHaveCount(0);
    await timer.getByRole("button", { name: "Set time…" }).click();
    const presets = page.getByRole("dialog").getByRole("button");
    await expect(presets.first()).toBeVisible();
    for (const label of await presets.allTextContents()) expect(label).toMatch(/^Set to \d+:\d\d$/);
    await capture(page, "timer-set-popover");
    await page.keyboard.press("Escape");
    expect(await timerCalls(page)).toEqual([]);
    expectClean(result);
  });

  test("+1 min is two serialized adds and shows the real total", async ({ page }) => {
    const result = await mountHost(page, "active", "laptop", "timer");
    await page.evaluate(() => window.__hostLayout.hold("sessions:timer"));
    await page.getByRole("button", { name: "+1 min" }).click();
    await expect.poll(() => timerCalls(page)).toEqual([{ action: "add" }]);
    // While the first is in flight the clock's buttons wait, and no second call goes out early.
    await expect(page.getByRole("button", { name: "+30 sec" })).toBeDisabled();
    await page.evaluate(() => window.__hostLayout.release("sessions:timer"));
    await expect(clock(page)).toHaveText("1:18");
    expect(await timerCalls(page)).toEqual([{ action: "add" }, { action: "add" }]);
    await expect(note(page)).toHaveText("Added 1 minute.");
    await page.getByRole("button", { name: "+30 sec" }).click();
    await expect(clock(page)).toHaveText("1:48");
    expect((await snapshot(page)).live?.timer.startedAt).toBeDefined();
    expectClean(result);
  });

  test("+1 min reports a failed second add instead of claiming a minute", async ({ page }) => {
    const result = await mountHost(page, "active", "laptop", "timer");
    await page.evaluate(() => window.__hostLayout.fail("sessions:timer", "Lost the connection", 1));
    await page.getByRole("button", { name: "+1 min" }).click();
    await expect(note(page)).toHaveText("Only 30 seconds were added.");
    await expect(clock(page)).toHaveText("0:48");
    await expect(page.getByText("Lost the connection").first()).toBeVisible();
    expect((await snapshot(page)).rejected).toEqual([{ name: "sessions:timer", args: { action: "add" } }]);
    expectClean(result);
  });

  test("+1 min stops after 30 seconds if the game on the TV changes in between", async ({ page }) => {
    const result = await mountHost(page, "active", "laptop", "timer");
    await page.evaluate(() => window.__hostLayout.hold("sessions:timer"));
    await page.getByRole("button", { name: "+1 min" }).click();
    await expect.poll(() => page.evaluate(() => window.__hostLayout.pending("sessions:timer"))).toBe(1);
    // Another officer puts the next snippet up while the first add is in flight.
    await page.evaluate(() =>
      window.__hostLayout.external("sessions:setScreen", { screen: { mode: "card", game: "output", index: 1, revealed: false } }),
    );
    await page.evaluate(() => window.__hostLayout.release("sessions:timer"));
    await expect(note(page)).toHaveText("Added 30 seconds, then stopped: the game on the TV changed.");
    expect(await timerCalls(page)).toEqual([{ action: "add" }]);
    expectClean(result);
  });

  test("Set to replaces and stops without touching the relay chime; Start, Pause, Resume and Reset", async ({ page }) => {
    const result = await mountHost(page, "active", "laptop", "timer");
    const timer = page.getByRole("region", { name: "Timer" });
    await timer.getByRole("button", { name: "Set time…" }).click();
    await page.getByRole("button", { name: "Set to 1:00" }).click();
    await expect(clock(page)).toHaveText("1:00");
    await expect(note(page)).toHaveText("Set to 1:00 and stopped. Press Start when ready.");
    expect((await snapshot(page)).live?.timer).toMatchObject({ remainingMs: 60_000, durationMs: 60_000, relay: false });
    expect((await snapshot(page)).live?.timer.startedAt).toBeUndefined();
    await timer.getByRole("button", { name: "Start 1:00" }).click();
    await expect(timer.getByRole("button", { name: "Pause" })).toBeVisible();
    await page.clock.setFixedTime(NIGHT.getTime() + 15_000);
    await expect(clock(page)).toHaveText("0:45");
    await timer.getByRole("button", { name: "Pause" }).click();
    await expect(timer.getByRole("button", { name: "Resume" })).toBeVisible();
    await timer.getByRole("button", { name: "Reset to 1:00" }).click();
    await expect(clock(page)).toHaveText("1:00");
    expect(await timerCalls(page)).toEqual([
      { action: "set", seconds: 60 },
      { action: "toggle" },
      { action: "toggle" },
      { action: "reset" },
    ]);
    expectClean(result);
  });

  test("a finished clock offers Start again from its full length", async ({ page }) => {
    const result = await mountHost(page, "active", "laptop", "timer");
    await page.clock.setFixedTime(NIGHT.getTime() + 20_000);
    await expect(clock(page)).toHaveText("0:00");
    await page.getByRole("button", { name: "Start again: 0:30" }).click();
    expect(await timerCalls(page)).toEqual([{ action: "set", seconds: 30, autostart: true }]);
    await expect(clock(page)).toHaveText("0:30");
    expectClean(result);
  });

  test("+1 min stops after 30 seconds if the card is revealed in between", async ({ page }) => {
    const result = await mountHost(page, "active", "laptop", "timer");
    await page.evaluate(() => window.__hostLayout.hold("sessions:timer"));
    await page.getByRole("button", { name: "+1 min" }).click();
    await expect.poll(() => page.evaluate(() => window.__hostLayout.pending("sessions:timer"))).toBe(1);
    // The same card is revealed (and scored) from another device while the first add is in flight.
    await page.evaluate(() =>
      window.__hostLayout.external("sessions:setScreen", { screen: { mode: "card", game: "output", index: 0, revealed: true } }),
    );
    await page.evaluate(() => window.__hostLayout.release("sessions:timer"));
    await expect(note(page)).toContainText("stopped");
    expect(await timerCalls(page)).toEqual([{ action: "add" }]);
    expectClean(result);
  });

  for (const viewport of ["phone", "short"] as const) {
    test(`${viewport} bar reaches +30 sec, +1 min and Set to …, inside the viewport`, async ({ page }) => {
      const result = await mountHost(page, "active", viewport, "timer-bar");
      // The bar's own command stays one tap; everything else is one tap on Time controls.
      await expect(page.getByRole("button", { name: "Pause, timer for Output? #1", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Time controls" }).click();
      const popup = page.getByRole("dialog", { name: "Time controls" });
      for (const name of ["+30 sec", "+1 min", "Set to 1:00", "Set to 12:00"]) {
        const button = popup.getByRole("button", { name, exact: true });
        await button.scrollIntoViewIfNeeded();
        await expect(button, name).toBeInViewport({ ratio: 1 });
      }
      const box = await popup.boundingBox();
      const { width, height } = VIEWPORTS[viewport];
      expect(box, "popup").not.toBeNull();
      // Sideways it fits; downwards it fits or scrolls inside itself.
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height);
      expect((await metrics(page)).overflowX).toBe(false);
      await capture(page, `timer-bar-${viewport}-open`);
      await popup.getByRole("button", { name: "+1 min" }).click();
      await expect.poll(() => timerCalls(page)).toEqual([{ action: "add" }, { action: "add" }]);
      if (!(await popup.isVisible())) await page.getByRole("button", { name: "Time controls" }).click();
      await popup.getByRole("button", { name: "Set to 1:00" }).click();
      await expect.poll(async () => (await timerCalls(page)).at(-1)).toEqual({ action: "set", seconds: 60 });
      await expect(page.getByRole("timer")).toHaveText("1:00");
      expectClean(result);
    });
  }

  test("phone bar is the clock and one command, named for what it does", async ({ page }) => {
    const result = await mountHost(page, "active", "phone", "timer-bar");
    const bar = page.getByRole("button", { name: "Pause, timer for Output? #1", exact: true });
    await expect(bar).toBeVisible();
    await page.clock.setFixedTime(new Date(NIGHT.getTime() + 1000));
    await expect(page.getByRole("timer")).toHaveText("0:17");
    await expect(bar).toHaveAccessibleName("Pause, timer for Output? #1");
    await bar.click();
    await expect(page.getByRole("button", { name: "Resume, timer for Output? #1", exact: true })).toBeVisible();
    expect(await timerCalls(page)).toEqual([{ action: "toggle" }]);
    expectClean(result);
  });
});

// ---- The run desk (design A) on the real page ------------------------------------------------------------------
// Names here are the design's (design.md), not the old console's. Fit means the live loop needs no page scroll.

async function inView(locators: [string, Locator][]) {
  for (const [what, locator] of locators) await expect(locator.first(), what).toBeInViewport({ ratio: 1 });
}

test.describe("run desk", () => {
  for (const viewport of ["laptop", "desktop"] as const) {
    test(`active round fits a ${viewport} with the live loop in view`, async ({ page }) => {
      const result = await mountHost(page, "active", viewport);
      const m = await capture(page, `desk-active-${viewport}`);
      expect(m.overflowX, `sideways overflow: ${m.wide.join(", ")}`).toBe(false);
      expect(m.scrollHeight, "document scrolls on a laptop").toBeLessThanOrEqual(m.viewport.height + 1);
      // The host console replaces the public site chrome.
      await expect(page.getByRole("link", { name: "Join tonight" })).toHaveCount(0);
      await inView([
        ["primary action", page.getByRole("button", { name: "Reveal answer", exact: true })],
        ["clock", page.getByRole("region", { name: "Timer" }).getByRole("timer")],
        ["+1 min", page.getByRole("button", { name: "+1 min" })],
        ["live tag", page.getByText(/live on tv/i)],
        ["phone answers", page.getByText(/2 of 4 locked in/)],
        ["score buttons", page.getByRole("button", { name: "+1", exact: true })],
        ["Night menu", page.getByRole("button", { name: /^Night/ })],
        ["manual games", page.getByRole("button", { name: /Play something else|Pick a game by hand/ })],
        ["lineup", page.getByRole("button", { name: /Edit lineup/ })],
        ["rail tabs", page.getByRole("tab", { name: /^Players/ })],
      ]);
      expectClean(result);
    });
  }

  test("reveal goes through the primary action and scores show without scrolling", async ({ page }) => {
    const result = await mountHost(page, "active", "laptop");
    await page.evaluate(() => window.__hostLayout.answer("team-4", { choice: "11" }));
    await page.getByRole("button", { name: "Reveal answer", exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).live?.scored).toEqual(["output:0"]);
    const reveal = (await calls(page)).find((c) => c.name === "sessions:setScreen");
    expect(reveal?.args).toEqual({ screen: { mode: "card", game: "output", index: 0, revealed: true } });
    await inView([
      ["phone results", page.getByText("Scored from phones")],
      ["team totals", page.getByText("5", { exact: true })],
    ]);
    const m = await capture(page, "desk-revealed-laptop");
    expect(m.scrollHeight).toBeLessThanOrEqual(m.viewport.height + 1);
    expectClean(result);
  });

  test("Night menu holds End night behind its confirmation", async ({ page }) => {
    const result = await mountHost(page, "active", "laptop");
    await page.getByRole("button", { name: /^Night/ }).click();
    await page.getByRole("menuitem", { name: /End night/ }).click();
    const dialog = page.getByRole("alertdialog", { name: "End the night?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(await calls(page)).toEqual([]);
    expectClean(result);
  });

  test("setup puts How tonight is played on the stage", async ({ page }) => {
    const result = await mountHost(page, "lobby", "laptop");
    await inView([
      ["mode group", page.getByRole("group", { name: "How tonight is played" })],
      ["primary", page.getByRole("button", { name: /^Start round 1/ })],
      ["clock", page.getByRole("region", { name: "Timer" })],
    ]);
    await page.evaluate(() => window.__hostLayout.join("Ada"));
    await expect(page.getByText("Ada").first()).toBeVisible();
    await capture(page, "desk-lobby-laptop");
    expectClean(result);
  });

  for (const viewport of ["phone", "short"] as const) {
    test(`${viewport}: stacks without sideways overflow and keeps the action and clock reachable`, async ({ page }) => {
      const result = await mountHost(page, "active", viewport);
      const m = await capture(page, `desk-active-${viewport}`);
      expect(m.overflowX, `sideways overflow: ${m.wide.join(", ")}`).toBe(false);
      // The command row is sticky: scrolled to the bottom, the next action and the clock are still there.
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      await inView([
        ["primary action", page.getByRole("button", { name: "Reveal answer", exact: true })],
        ["clock", page.getByRole("button", { name: "Pause, timer for Output? #1", exact: true })],
      ]);
      // The night's title wraps as a phrase, never a word per line.
      const lines = await page
        .getByText("Spooky Bugs", { exact: true })
        .first()
        .evaluate((el) => {
          const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.2;
          return Math.round(el.getBoundingClientRect().height / lh);
        });
      expect(lines).toBeLessThanOrEqual(1);
      expectClean(result);
    });
  }

  test("phone tabs: arrows move between panes and a draft survives switching panes and sizes", async ({ page }) => {
    const result = await mountHost(page, "active", "phone");
    const tabs = page.getByRole("tablist").filter({ has: page.getByRole("tab", { name: "Play", exact: true }) });
    await expect(tabs.getByRole("tab")).toHaveText([/^Play$/, /^Scores$/, /^Players/, /^TV( & sound)?$/]);
    await tabs.getByRole("tab", { name: "Play", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.getByRole("tab", { name: "Scores", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(tabs.getByRole("tab", { name: "Scores", exact: true })).toHaveAttribute("aria-selected", "true");
    await tabs.getByRole("tab", { name: /^Players/ }).click();
    const name = page.getByPlaceholder(/^Name/);
    await name.fill("Draft player");
    await tabs.getByRole("tab", { name: /^TV( & sound)?$/ }).click();
    const message = page.getByPlaceholder(/Big message/);
    await message.fill("Five minute break");
    await tabs.getByRole("tab", { name: "Play", exact: true }).click();
    await page.setViewportSize(VIEWPORTS.laptop);
    await page.setViewportSize(VIEWPORTS.phone);
    await page
      .getByRole("tablist")
      .filter({ has: page.getByRole("tab", { name: "Play", exact: true }) })
      .getByRole("tab", { name: /^Players/ })
      .click();
    await expect(name).toHaveValue("Draft player");
    await page
      .getByRole("tablist")
      .filter({ has: page.getByRole("tab", { name: "Play", exact: true }) })
      .getByRole("tab", { name: /^TV( & sound)?$/ })
      .click();
    await expect(message).toHaveValue("Five minute break");
    expect(await calls(page)).toEqual([]);
    expectClean(result);
  });

  test("desktop rail: a draft survives switching Scores, Players and TV & sound", async ({ page }) => {
    const result = await mountHost(page, "active", "laptop");
    const rail = page.getByRole("tablist").filter({ has: page.getByRole("tab", { name: /^TV & sound/ }) });
    await rail.getByRole("tab", { name: /^Players/ }).click();
    const name = page.getByPlaceholder(/^Name/);
    await name.fill("Draft player");
    await rail.getByRole("tab", { name: /^TV & sound/ }).click();
    await rail.getByRole("tab", { name: "Scores", exact: true }).click();
    await rail.getByRole("tab", { name: /^Players/ }).click();
    await expect(name).toHaveValue("Draft player");
    await rail.getByRole("tab", { name: /^Players/ }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(rail.getByRole("tab", { name: /^TV & sound/ })).toBeFocused();
    expect(await calls(page)).toEqual([]);
    expectClean(result);
  });

  test("desktop rail keeps a visible selected tab after picking a game by hand", async ({ page }) => {
    const result = await mountHost(page, "active", "laptop");
    const rail = page.getByRole("tablist", { name: "Host panes" });
    await expect(rail.getByRole("tab", { selected: true })).toHaveCount(1);
    await page.getByRole("button", { name: "Pick a game by hand" }).click();
    await page.getByRole("menuitemradio", { name: "Bug Hunt", exact: true }).click();
    await expect(rail.getByRole("tab", { selected: true })).toHaveCount(1);
    await page
      .getByRole("navigation", { name: "Tonight’s rounds" })
      .getByRole("button", { name: /playing now/ })
      .click();
    await expect(rail.getByRole("tab", { selected: true })).toHaveCount(1);
    await page.setViewportSize(VIEWPORTS.phone);
    await rail.getByRole("tab", { name: "Play", exact: true }).click();
    await page.setViewportSize(VIEWPORTS.laptop);
    await expect(rail.getByRole("tab", { selected: true })).toHaveCount(1);
    expect(await calls(page)).toEqual([]);
    expectClean(result);
  });

  test("Space on a phone score button scores that team without revealing the card", async ({ page }) => {
    const result = await mountHost(page, "active", "phone");
    await page.getByRole("tab", { name: "Scores", exact: true }).click();
    await page.getByRole("button", { name: "+1", exact: true }).first().focus();
    await page.keyboard.press("Space");
    await expect.poll(() => calls(page)).toEqual([{ name: "teams:score", args: { teamId: "team-1", delta: 1 } }]);
    expectClean(result);
  });

  test("background shortcuts and focused primary buttons each reveal exactly once", async ({ page }) => {
    const result = await mountHost(page, "active", "laptop");
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => calls(page))
      .toEqual([
        { name: "sessions:setScreen", args: { screen: { mode: "card", game: "output", index: 0, revealed: true } } },
        { name: "sessions:timer", args: { action: "pause" } },
      ]);
    await page.getByRole("button", { name: "Hide answer on TV", exact: true }).click();
    await page.getByRole("button", { name: "Reveal answer", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect
      .poll(() => calls(page))
      .toEqual([
        { name: "sessions:setScreen", args: { screen: { mode: "card", game: "output", index: 0, revealed: true } } },
        { name: "sessions:timer", args: { action: "pause" } },
        { name: "sessions:setScreen", args: { screen: { mode: "card", game: "output", index: 0, revealed: false } } },
        { name: "sessions:setScreen", args: { screen: { mode: "card", game: "output", index: 0, revealed: true } } },
      ]);
    expect((await snapshot(page)).live?.scored).toEqual(["output:0"]);
    expectClean(result);
  });

  test("mouse scoring followed by arrow and N keeps the host shortcuts working", async ({ page }) => {
    const result = await mountHost(page, "active", "laptop");
    const score = page.getByRole("button", { name: "+1", exact: true }).first();
    await score.click();
    await expect(score).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => calls(page))
      .toEqual([
        { name: "teams:score", args: { teamId: "team-1", delta: 1 } },
        { name: "sessions:setScreen", args: { screen: { mode: "card", game: "output", index: 0, revealed: true } } },
        { name: "sessions:timer", args: { action: "pause" } },
      ]);
    await page.getByRole("button", { name: "Show scores", exact: true }).click();
    const next = page.getByRole("button", { name: /^Next snippet/ });
    await expect(next).toBeEnabled();
    await expect(next).toBeFocused();
    await page.keyboard.press("n");
    await expect.poll(async () => (await calls(page)).at(-1)).toMatchObject({ name: "sessions:setRound", args: { round: 1 } });
    expect((await calls(page)).filter((call) => call.name === "teams:score")).toHaveLength(1);
    expectClean(result);
  });

  test("notifications leave shortcuts working while a real confirmation still owns the keys", async ({ page }) => {
    const result = await mountHost(page, "active", "laptop");
    await page.evaluate(() => window.__hostLayout.fail("teams:score", "Fixture score unavailable"));
    await page.getByRole("button", { name: "+1", exact: true }).first().click();
    const notice = page.getByRole("alertdialog").filter({ hasText: "Fixture score unavailable" });
    await expect(notice).toBeVisible();
    await expect(notice.locator('xpath=ancestor::*[@data-feedback="notifications"]')).toHaveCount(1);
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await snapshot(page)).live?.scored).toEqual(["output:0"]);
    expect((await calls(page)).filter((call) => call.name === "sessions:setScreen")).toHaveLength(1);
    await expect(notice).toBeVisible();
    await page.getByRole("button", { name: "Night", exact: true }).click();
    await page.getByRole("menuitem", { name: /^End night/ }).click();
    const confirm = page.getByRole("alertdialog", { name: "End the night?" });
    await expect(confirm).toBeVisible();
    const before = await calls(page);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("n");
    expect(await calls(page)).toEqual(before);
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    expectClean(result);
  });
});
