import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function mountControls(page: Page) {
  await page.routeWebSocket(/.*/, () => {});
  await page.route("**/__cup_control_test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
      <body><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/@vite/client');
      await import('/src/styles.css');
      const { mount } = await import('/e2e/fixtures/cup-controls.jsx');
      mount();
      </script></body></html>`,
    }),
  );
  await page.goto("/__cup_control_test");
  await expect(page.locator("#cup-control-fixture")).toBeVisible();
}

test("confirmation cancellation, acceptance, focus return, and queued decisions", async ({ page }) => {
  await mountControls(page);
  const ask = page.getByRole("button", { name: "Ask to apply", exact: true });
  await ask.click();
  const dialog = page.getByRole("alertdialog", { name: "Confirm test action" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Keep test state" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel("Accepted actions")).toHaveText("0");
  await expect(ask).toBeFocused();
  await ask.click();
  await dialog.getByRole("button", { name: "Apply test action" }).click();
  await expect(page.getByLabel("Accepted actions")).toHaveText("1");
  await page.getByRole("button", { name: "Queue two actions" }).click();
  await expect(page.getByRole("alertdialog", { name: "First queued action" })).toBeVisible();
  await page.getByRole("button", { name: "Keep test state" }).click();
  await expect(page.getByRole("alertdialog", { name: "Second queued action" })).toBeVisible();
  await page.getByRole("button", { name: "Apply test action" }).click();
  await expect(page.getByLabel("Queued decisions")).toHaveText("first:false,second:true");
});

test("rejected actions keep an announced error visible", async ({ page }) => {
  await mountControls(page);
  await page.getByRole("button", { name: "Fail test action" }).click();
  const failure = page.getByRole("alertdialog").filter({ hasText: "Test action failed" });
  await expect(failure).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Test action failed" })).toBeAttached();
  await page.getByRole("button", { name: "Show information" }).click();
  await expect(failure).toBeVisible();
  await expect(page.getByRole("heading", { name: "Test information", exact: true })).toBeVisible();
  await failure.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(failure).toBeHidden();
});

test("confirmations stay inside fullscreen and fit a short viewport", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await mountControls(page);
  await page.getByRole("button", { name: "Enter fullscreen" }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe("cup-control-fixture");
  await page.getByRole("button", { name: "Ask to apply" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Confirm test action" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((el) => document.fullscreenElement?.contains(el))).toBe(true);
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) throw new Error("Visible dialog has no bounds");
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(320);
  await dialog.getByRole("button", { name: "Keep test state" }).click();
  await expect(page.getByLabel("Accepted actions")).toHaveText("0");
});

test("a confirmation cancels when its requesting component leaves", async ({ page }) => {
  await mountControls(page);
  await page.getByRole("button", { name: "Ask and leave" }).click();
  await expect(page.getByLabel("Abandoned decision")).toHaveText("false");
  await expect(page.getByRole("alertdialog", { name: "Abandoned test action" })).toBeHidden();
  await expect(page.getByLabel("Accepted actions")).toHaveText("0");
});

test("player radios choose an answer without locking it", async ({ page }) => {
  await mountControls(page);
  await page.getByRole("button", { name: "answers", exact: true }).click();
  const answers = page.getByRole("region", { name: "Player answers" });
  const radios = answers.getByRole("radio");
  await expect(radios).toHaveCount(4);
  await radios.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(radios.nth(1)).toBeChecked();
  await expect(answers.getByLabel("Pick events")).toHaveText("1");
  await answers.getByRole("button", { name: "Receive teammate pick" }).click();
  await expect(radios.nth(2)).toBeChecked();
  await expect(answers.getByLabel("Pick events")).toHaveText("1");
  await expect(answers.getByText(/Another teammate picked/)).toBeVisible();
  await expect(answers.getByLabel("Answer state")).toContainText('"locked":false');
  await answers.getByRole("button", { name: /Lock in/ }).click();
  await expect(answers.getByLabel("Answer state")).toContainText('"locked":true');
  await expect(radios.first()).toBeDisabled();
  await answers.getByRole("button", { name: "Test output" }).click();
  await expect(radios).toHaveCount(4);
  await radios.first().click();
  await expect(answers.getByText(/Test teammate picked this/)).toBeVisible();
  await expect(answers.getByLabel("Answer state")).toContainText('"locked":false');
});

test("game search supports keyboard selection, empty results, and repeat additions", async ({ page }) => {
  await mountControls(page);
  await page.getByRole("button", { name: "picker", exact: true }).click();
  const picker = page.getByRole("combobox", { name: "Add a game" });
  await picker.fill("Pictionary");
  await expect(page.getByRole("option", { name: "Tech Pictionary" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Added games")).toHaveText("draw");
  await picker.fill("Pictionary");
  await page.getByRole("option", { name: "Tech Pictionary" }).click();
  await expect(page.getByLabel("Added games")).toHaveText("draw,draw");
  await picker.fill("No matching test game");
  await expect(page.getByRole("option")).toHaveCount(0);
});

test("game search follows controlled selection and disabled state", async ({ page }) => {
  await mountControls(page);
  await page.getByRole("button", { name: "picker", exact: true }).click();
  const picker = page.getByRole("combobox", { name: "Chosen game" });
  await expect(picker).toHaveValue("Bug Hunt");
  await expect(page.getByRole("combobox", { name: "Disabled game" })).toBeDisabled();
  await picker.fill("Output");
  await page.getByRole("option", { name: "Output?", exact: true }).click();
  await expect(picker).toHaveValue("Output?");
});

test("code reset preserves edits on cancel and resets only after confirmation", async ({ page }) => {
  await mountControls(page);
  await page.getByRole("button", { name: "code", exact: true }).click();
  const code = page.getByRole("region", { name: "Code reset" });
  for (const exercise of ["fix", "puzzle"]) {
    const editor = code.getByRole("textbox", { name: "Your program" });
    const starter = await editor.inputValue();
    await editor.fill("print('keep my edits')");
    await code.getByRole("button", { name: "Reset code", exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(editor).toHaveValue("print('keep my edits')");
    await code.getByRole("button", { name: "Reset code", exact: true }).click();
    await dialog.getByRole("button", { name: "Reset code" }).click();
    await expect(editor).toHaveValue(starter);
    if (exercise === "fix") await code.getByRole("button", { name: "Switch code exercise" }).click();
  }
});
