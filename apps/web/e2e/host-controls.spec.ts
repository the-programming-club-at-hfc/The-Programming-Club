import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const fixtureModule = "/e2e/fixtures/host-controls-convex.jsx";

async function mountHost(page: Page, view: "phone" | "teams" | "round" | "screen" | "tonight" = "phone") {
  const errors: string[] = [];
  const networkAttempts: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.routeWebSocket("**/*", (socket) => {
    const url = new URL(socket.url());
    if (url.host === new URL(test.info().project.use.baseURL ?? "http://localhost:3117").host && url.pathname === "/") {
      // Only Vite's local HMR transport may connect.
      socket.connectToServer();
      return;
    }
    networkAttempts.push(socket.url());
    socket.close();
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin !== new URL(test.info().project.use.baseURL ?? "http://localhost:3117").origin ||
      !["GET", "HEAD"].includes(route.request().method())
    ) {
      networkAttempts.push(`${route.request().method()} ${url.href}`);
      return route.abort();
    }
    if (url.pathname === "/__host-controls") {
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
          <script type="module">
            import RefreshRuntime from "/@react-refresh";
            RefreshRuntime.injectIntoGlobalHook(window);
            window.$RefreshReg$ = () => {};
            window.$RefreshSig$ = () => (type) => type;
            window.__vite_plugin_react_preamble_installed__ = true;
            await import("/@vite/client");
            await import("/src/styles.css");
            const { mount } = await import("/e2e/fixtures/host-controls.jsx");
            mount();
          </script></body></html>`,
      });
    }
    if (url.pathname.startsWith("/src/") || url.pathname === "/e2e/fixtures/host-controls.jsx") {
      const response = await route.fetch();
      let body = await response.text();
      // Replace service imports in transformed modules, never files or production auth.
      body = body.replace(
        /from "[^"]*(?:convex_react\.js|@clerk\/tanstack-react-start\/dist\/index\.js)[^"]*"/g,
        `from "${fixtureModule}"`,
      );
      // Vite may append HMR timestamps to the fixture's own import. Keep one recorder instance.
      body = body.replace(/from "\/e2e\/fixtures\/host-controls-convex\.jsx[^"]*"/g, `from "${fixtureModule}"`);
      if (url.pathname.endsWith("/host.tsx") && url.searchParams.get("tsr-split") === "component") {
        body = body.replace(/import \{ Link \} from "[^"]+";/, `import { Link } from "${fixtureModule}";`);
        body += "\nexport { PhoneBar, TeamsPanel, ScreenPanel };\n";
      }
      if (url.pathname.endsWith("/join.tsx") && url.searchParams.get("tsr-split") === "component") {
        body += "\nexport { PlayTonight };\n";
      }
      return route.fulfill({ response, body });
    }
    return route.continue();
  });
  await page.goto("/__host-controls");
  await expect(page.locator("#host-control-fixture"))
    .toBeVisible()
    .catch((error: unknown) => {
      throw new Error(`Host fixture failed to mount. Client errors: ${JSON.stringify(errors)}`, { cause: error });
    });
  if (view !== "phone") await page.getByRole("button", { name: view, exact: true }).click();
  await expect(page.getByLabel("Local host mutation calls")).toHaveText("[]");
  return { errors, networkAttempts };
}

function expectClean(result: { errors: string[]; networkAttempts: string[] }) {
  expect(result.errors, "Client runtime errors").toEqual([]);
  expect(result.networkAttempts, "Unexpected backend/network attempts").toEqual([]);
}

async function expectCalls(page: Page, calls: { name: string; args: Record<string, unknown> }[]) {
  await expect(page.getByLabel("Local host mutation calls")).toHaveText(JSON.stringify(calls));
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

test("mobile More menu supports keyboard navigation, Escape, and focus return", async ({ page }) => {
  const result = await mountHost(page);
  const more = page.getByRole("button", { name: "More", exact: true });
  await more.focus();
  await page.keyboard.press("ArrowDown");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Open TV view" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitem", { name: "End night", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(more).toBeFocused();
  await expectCalls(page, []);
  expectClean(result);
});

test("mobile End night waits for approval, cancels safely, and confirms exactly once", async ({ page }) => {
  const result = await mountHost(page);
  const more = page.getByRole("button", { name: "More", exact: true });
  const dialog = page.getByRole("alertdialog", { name: "End the night?" });
  for (const accept of [false, true]) {
    await more.click();
    await page.getByRole("menuitem", { name: "End night", exact: true }).evaluate((item: HTMLElement) => {
      item.click();
      item.click();
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await expectCalls(page, []);
    if (accept) {
      const screenshot = test.info().outputPath("mobile-end-night-confirmation.png");
      await page.screenshot({ path: screenshot });
      await test.info().attach("mobile-end-night-confirmation", { path: screenshot, contentType: "image/png" });
      await dialog.getByRole("button", { name: "End night", exact: true }).evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });
    } else await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect.soft(more).toBeFocused({ timeout: 1000 });
    await expectCalls(page, accept ? [{ name: "sessions:end", args: {} }] : []);
  }
  expectClean(result);
});

test("Reset scores and Remove team never mutate on cancellation", async ({ page }) => {
  const result = await mountHost(page, "teams");
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  for (const action of [
    { trigger: "Reset scores to 0", title: "Reset scores to 0?", confirm: "Reset scores", name: "teams:resetScores", args: {} },
    { trigger: "Remove", title: "Remove Local team?", confirm: "Remove team", name: "teams:remove", args: { teamId: "local-team" } },
  ]) {
    if (action.trigger === "Remove") await page.getByRole("button", { name: "More for Local team" }).click();
    const trigger = page.getByRole("button", { name: action.trigger, exact: true });
    for (const accept of [false, true]) {
      await trigger.focus();
      await trigger.evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });
      const dialog = page.getByRole("alertdialog", { name: action.title });
      await expect(dialog).toBeVisible();
      await expectCalls(page, calls);
      if (accept) {
        await dialog.getByRole("button", { name: action.confirm, exact: true }).evaluate((button: HTMLButtonElement) => {
          button.click();
          button.click();
        });
        calls.push({ name: action.name, args: action.args });
      } else await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect.soft(trigger).toBeFocused({ timeout: 1000 });
      await expectCalls(page, calls);
    }
  }
  expectClean(result);
});

test("team mode waits for activation and confirmation and switches send explicit boolean values", async ({ page }) => {
  const result = await mountHost(page, "teams");
  const solo = page.getByText("Solo", { exact: true });
  const teamsOf2 = page.getByText("Teams of 2", { exact: true });
  await teamsOf2.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Teams of 3", { exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(solo).toBeFocused();
  await expectCalls(page, []);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(teamsOf2).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog", { name: "Put everyone on a team of their own?" });
  await expect(dialog).toBeVisible();
  await expectCalls(page, []);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(teamsOf2).toHaveAttribute("aria-pressed", "true");
  await solo.click();
  await dialog.getByRole("button", { name: "Play solo", exact: true }).click();
  await expectCalls(page, [{ name: "teams:make", args: { size: 1 } }]);
  await page.getByRole("switch", { name: "Double points" }).click();
  await page.getByRole("switch", { name: "Auto teams" }).click();
  await expectCalls(page, [
    { name: "teams:make", args: { size: 1 } },
    { name: "sessions:setDouble", args: { on: true } },
    { name: "teams:setAuto", args: { on: false } },
  ]);
  const calls = [
    { name: "teams:make", args: { size: 1 } },
    { name: "sessions:setDouble", args: { on: true } },
    { name: "teams:setAuto", args: { on: false } },
  ];
  for (const action of [
    { trigger: "Teams of 3", size: 3 },
    { trigger: "Reshuffle teams", size: 2 },
  ]) {
    await page.getByRole("button", { name: action.trigger, exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expectCalls(page, calls);
    await expect(solo).toBeDisabled();
    await page.getByRole("button", { name: "Remake teams", exact: true }).click();
    calls.push({ name: "teams:make", args: { size: action.size } });
    await expectCalls(page, calls);
  }
  await teamsOf2.click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expectCalls(page, calls);
  await page.locator("#host-change-context").click();
  const modeButtons = page.getByRole("group", { name: "How tonight is played" }).getByRole("button");
  for (const button of await modeButtons.all()) {
    await expect(button).toBeDisabled();
    await button.evaluate((element: HTMLButtonElement) => element.click());
  }
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expectCalls(page, calls);
  expectClean(result);
});

test("round change retains the unrevealed-answer warning and awaits the decision", async ({ page }) => {
  const result = await mountHost(page, "round");
  const start = page.getByRole("button", { name: "Start round 1: Bug Hunt", exact: true });
  for (const accept of [false, true]) {
    await start.click();
    const dialog = page.getByRole("alertdialog", { name: /Skip this snippet .* without scoring it/ });
    await expect(dialog).toContainText("Answers on it won’t count unless you bring it back and reveal it.");
    await expectCalls(page, []);
    if (accept) await dialog.getByRole("button", { name: "Skip without scoring" }).click();
    else await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expectCalls(page, accept ? [{ name: "sessions:setRound", args: { round: 0, double: false, title: "Round 1: Bug Hunt" } }] : []);
  }
  expectClean(result);
});

test("a realtime card change invalidates a pending round approval", async ({ page }) => {
  const result = await mountHost(page, "round");
  await page.getByRole("button", { name: "Start round 1: Bug Hunt", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  // Simulate a subscription update, not a user's click through the modal's inert background.
  await page.locator("#host-change-context").evaluate((button: HTMLButtonElement) => button.click());
  await dialog.getByRole("button", { name: "Skip without scoring" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Things changed while you were deciding. Check and try again.", { exact: true })).toHaveCount(1);
  await expectCalls(page, []);
  expectClean(result);
});

test("TV arrows only move focus and explicit activation preserves the held game", async ({ page }) => {
  const result = await mountHost(page, "screen");
  const group = page.getByRole("group", { name: "On the TV", exact: true });
  await page.getByText("Join screen", { exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  const scoreboard = page.getByText("Scoreboard", { exact: true });
  await expect(scoreboard).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Big timer", { exact: true })).toBeFocused();
  await expectCalls(page, []);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(group.getByRole("button", { pressed: true })).toHaveText("Join screen");
  await page.keyboard.press("Space");
  const held = { game: "bug", index: 0, revealed: false };
  const calls: { name: string; args: Record<string, unknown> }[] = [
    { name: "sessions:setScreen", args: { screen: { ...held, mode: "timer" } } },
  ];
  await expectCalls(page, calls);
  await page.getByText("Kickoff slides", { exact: true }).click();
  calls.push({ name: "sessions:setScreen", args: { screen: { ...held, mode: "slides", slide: 0 } } });
  await expectCalls(page, calls);
  // Clicking the selected item cannot clear a required live selection.
  await page.getByText("Join screen", { exact: true }).click();
  await expectCalls(page, calls);
  expectClean(result);
});

test("Tonight arrows only move focus and activation sends exact participation booleans", async ({ page }) => {
  const result = await mountHost(page, "tonight");
  const playing = page.getByText("Playing", { exact: true });
  const hosting = page.getByText("Just hosting", { exact: true });
  await playing.focus();
  await page.keyboard.press("ArrowRight");
  await expect(hosting).toBeFocused();
  await expectCalls(page, []);
  await expect(playing).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expectCalls(page, [{ name: "players:setPlaying", args: { token: "local-player-token", playing: false } }]);
  await page.getByRole("button", { name: "Simulate hosting", exact: true }).click();
  await hosting.focus();
  await page.keyboard.press("ArrowRight");
  await expect(playing).toBeFocused();
  await expectCalls(page, [{ name: "players:setPlaying", args: { token: "local-player-token", playing: false } }]);
  await page.keyboard.press("Space");
  await expectCalls(page, [
    { name: "players:setPlaying", args: { token: "local-player-token", playing: false } },
    { name: "players:setPlaying", args: { token: "local-player-token", playing: true } },
  ]);
  expectClean(result);
});

test("unmounting a pending round approval produces no mutation or stale notice", async ({ page }) => {
  const result = await mountHost(page, "round");
  await page.getByRole("button", { name: "Start round 1: Bug Hunt", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  // Simulate the owning route disappearing while its confirmation is open.
  await page.getByText("teams", { exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  await expect(dialog).toBeHidden();
  await expectCalls(page, []);
  await expect(page.getByText("Things changed while you were deciding. Check and try again.", { exact: true })).toHaveCount(0);
  expectClean(result);
});
