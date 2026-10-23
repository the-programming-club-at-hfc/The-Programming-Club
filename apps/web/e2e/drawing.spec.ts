import { expect, test } from "@playwright/test";
import type { CDPSession, Page } from "@playwright/test";

type Call = { name: string; args: Record<string, unknown> };
const browserErrors = new WeakMap<Page, string[]>();

async function calls(page: Page, name?: string): Promise<Call[]> {
  const parsed: unknown = JSON.parse((await page.getByLabel("Drawing mutation calls").textContent()) ?? "null");
  if (!Array.isArray(parsed)) throw new Error("Missing local drawing calls");
  return parsed
    .map((entry: unknown) => {
      if (
        typeof entry !== "object" ||
        entry === null ||
        !("name" in entry) ||
        typeof entry.name !== "string" ||
        !("args" in entry) ||
        typeof entry.args !== "object" ||
        entry.args === null
      )
        throw new Error("Invalid drawing call");
      return { name: entry.name, args: Object.fromEntries(Object.entries(entry.args)) };
    })
    .filter((entry) => !name || entry.name === `drawings:${name}`);
}

async function mountDrawing(page: Page) {
  // Keep concurrent source edits from hot-reloading this isolated test mid-stroke.
  await page.routeWebSocket(/.*/, () => {});
  const fixture = await page.request.get("/e2e/fixtures/drawing.jsx");
  const fixtureSource = await fixture.text();
  // Vite timestamps local imports. Sketch and the observer must share exactly one store module.
  const storeUrl = fixtureSource.match(/from "([^"\n]*\/drawing-convex\.jsx(?:\?[^"\n]*)?)"/)?.[1];
  if (!storeUrl) throw new Error("Missing transformed local drawing store import");
  await page.route(/\/src\/components\/draw\.tsx(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const replaced = source.replace(/from\s+["'][^"']*\/convex_react\.js(?:\?[^"']*)?["']/, `from ${JSON.stringify(storeUrl)}`);
    if (replaced === source) throw new Error("Sketch Convex import was not isolated");
    await route.fulfill({ response, body: replaced });
  });
  await page.route("**/__drawing_test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
      <body><div id="drawing-test-root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/@vite/client');
      const { mountDrawingFixture } = await import('/e2e/fixtures/drawing.jsx');
      mountDrawingFixture();
      </script></body></html>`,
    }),
  );
  // A standalone document prevents mounting the application's Clerk/Convex providers.
  await page.goto("/__drawing_test");
  await expect(page.getByRole("img", { name: "The drawing" })).toBeVisible();
}

async function canvasPoint(page: Page, x: number, y: number) {
  return page.getByRole("img", { name: "The drawing" }).evaluate(
    (element, point) => {
      if (!(element instanceof SVGSVGElement)) throw new Error("Sketch has no SVG canvas");
      const matrix = element.getScreenCTM();
      if (!matrix) throw new Error("Sketch has no canvas transform");
      const result = new DOMPoint(point.x * element.viewBox.baseVal.width, point.y * element.viewBox.baseVal.height).matrixTransform(
        matrix,
      );
      return { x: result.x, y: result.y };
    },
    { x, y },
  );
}

async function mouseStroke(page: Page) {
  const start = await canvasPoint(page, 0.2, 0.3);
  const end = await canvasPoint(page, 0.5, 0.6);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await calls(page, "ink")).length).toBeGreaterThan(0);
}

async function touch(cdp: CDPSession, type: "touchStart" | "touchMove" | "touchEnd", point: { x: number; y: number }) {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ ...point, id: 9, radiusX: 4, radiusY: 4 }],
  });
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await mountDrawing(page);
  test.info().annotations.push({ type: "isolation", description: "Real Sketch and FeedbackProvider; local Convex hook replacement only" });
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), "drawing browser errors").toEqual([]);
});

test("grouped color and brush radios support keyboard selection used by mouse ink and own-stroke Undo", async ({ page }) => {
  const colors = page.getByRole("radiogroup", { name: "Drawing color" });
  const brushes = page.getByRole("radiogroup", { name: "Brush size" });
  await expect(colors.getByRole("radio")).toHaveCount(6);
  await expect(brushes.getByRole("radio")).toHaveCount(3);
  await expect(colors.getByRole("radio", { name: "Black", exact: true })).toBeChecked();
  await expect(brushes.getByRole("radio", { name: "Brush 2 of 3" })).toBeChecked();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await colors.getByRole("radio", { name: "Black", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(colors.getByRole("radio", { name: "Red", exact: true })).toBeChecked();
  await expect(colors.getByRole("radio", { name: "Red", exact: true })).toBeFocused();
  await brushes.getByRole("radio", { name: "Brush 2 of 3" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(brushes.getByRole("radio", { name: "Brush 3 of 3" })).toBeChecked();
  await expect(brushes.getByRole("radio", { name: "Brush 3 of 3" })).toBeFocused();
  expect(await calls(page)).toEqual([]);
  await mouseStroke(page);
  await expect
    .poll(async () => {
      const points = (await calls(page, "ink")).at(-1)?.args.points;
      return Array.isArray(points) ? points.slice(-2) : points;
    })
    .toEqual([500, 450]);
  const ink = await calls(page, "ink");
  const stroke = ink[0].args.stroke;
  expect(typeof stroke).toBe("string");
  // The 100ms ink flush may split a stroke into overlapping batches.
  const batches: unknown[][] = ink.map(({ args }) => {
    expect(args).toMatchObject({ drawingId: "isolated-drawing", token: "local-drawer", rev: 7, color: "#e0472f", size: 32, stroke });
    if (!Array.isArray(args.points)) throw new Error("Missing ink points");
    return args.points;
  });
  expect(batches[0].slice(0, 2)).toEqual([200, 225]);
  for (let i = 1; i < batches.length; i++) expect(batches[i].slice(0, 2)).toEqual(batches[i - 1].slice(-2));
  const paths = page.getByRole("img", { name: "The drawing" }).locator('g path[d]:not([d=""])');
  await expect(paths).toHaveCount(ink.length + 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(() => calls(page, "undo"))
    .toEqual([{ name: "drawings:undo", args: { drawingId: "isolated-drawing", token: "local-drawer", stroke } }]);
  await expect(paths).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
});

test("fullscreen clear cancellation never mutates and repeated acceptance clears exactly once", async ({ page }) => {
  await mouseStroke(page);
  const before = await calls(page);
  await page.getByRole("button", { name: "Enter drawing fullscreen" }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe("drawing-fixture");
  const clear = page.getByRole("button", { name: "Clear", exact: true });
  await clear.click();
  const dialog = page.getByRole("alertdialog", { name: "Clear the whole drawing?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Keep it" })).toBeFocused();
  await expect.poll(() => dialog.evaluate((element) => document.fullscreenElement?.contains(element))).toBe(true);
  await dialog.getByRole("button", { name: "Keep it" }).click();
  await expect(dialog).toBeHidden();
  expect(await calls(page)).toEqual(before);
  await expect(clear).toBeFocused();
  await clear.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(await calls(page)).toEqual(before);
  // Dispatch twice in one task to exercise Sketch's reentrant request guard.
  await clear.evaluate((element) => {
    if (!(element instanceof HTMLButtonElement)) throw new Error("Missing clear control");
    element.click();
    element.click();
  });
  await expect(dialog).toHaveCount(1);
  await dialog.getByRole("button", { name: "Clear", exact: true }).evaluate((element) => {
    if (!(element instanceof HTMLButtonElement)) throw new Error("Missing clear confirmation");
    element.click();
    element.click();
  });
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => calls(page, "clear"))
    .toEqual([
      {
        name: "drawings:clear",
        args: {
          drawingId: "isolated-drawing",
          token: "local-drawer",
          mine: [before[0].args.stroke],
        },
      },
    ]);
  await expect(page.getByRole("img", { name: "The drawing" }).locator('g path[d]:not([d=""])')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe("drawing-fixture");
});

test("unmounting Sketch cancels its pending confirmation while FeedbackProvider stays mounted", async ({ page }) => {
  await mouseStroke(page);
  const before = await calls(page);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  // Simulate parent navigation while the modal makes unrelated controls inert.
  await page.getByRole("button", { name: "Unmount Sketch", includeHidden: true }).evaluate((element) => {
    if (!(element instanceof HTMLButtonElement)) throw new Error("Missing unmount control");
    element.click();
  });
  await expect(page.getByRole("img", { name: "The drawing" })).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(await calls(page)).toEqual(before);
  await page.getByRole("button", { name: "Mount Sketch", exact: true }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Keep it" }).click();
  expect(await calls(page)).toEqual(before);
});

test("touch draws, pen supersedes a sent palm stroke, and nearby touch is rejected", async ({ page, context }) => {
  await page.clock.install();
  const cdp = await context.newCDPSession(page);
  const start = await canvasPoint(page, 0.3, 0.4);
  const end = await canvasPoint(page, 0.6, 0.7);
  await touch(cdp, "touchStart", start);
  await touch(cdp, "touchMove", end);
  await expect.poll(async () => (await calls(page, "ink")).length).toBeGreaterThan(0);
  const palm = (await calls(page, "ink"))[0].args.stroke;
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...start, button: "left", buttons: 1, pointerType: "pen" });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...end, buttons: 1, pointerType: "pen" });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...end, button: "left", buttons: 0, pointerType: "pen" });
  await touch(cdp, "touchEnd", end);
  await expect
    .poll(() => calls(page, "undo"))
    .toEqual([
      {
        name: "drawings:undo",
        args: {
          drawingId: "isolated-drawing",
          token: "local-drawer",
          stroke: palm,
        },
      },
    ]);
  const sent = await calls(page, "ink");
  expect(new Set(sent.map((call) => call.args.stroke)).size).toBe(2);
  const before = await calls(page);
  await touch(cdp, "touchStart", start);
  await touch(cdp, "touchMove", end);
  await touch(cdp, "touchEnd", end);
  expect(await calls(page)).toEqual(before);
  await page.clock.fastForward(2100);
  await touch(cdp, "touchStart", start);
  await touch(cdp, "touchMove", end);
  await touch(cdp, "touchEnd", end);
  await expect.poll(async () => new Set((await calls(page, "ink")).map((call) => call.args.stroke)).size).toBe(3);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
  await cdp.detach();
});

test("pointer capture clamps ink outside the canvas and read-only Sketch does not send strokes", async ({ page }) => {
  const start = await canvasPoint(page, 0.8, 0.8);
  const outside = await canvasPoint(page, 1.05, 1.05);
  await page.mouse.click(start.x, start.y, { button: "right" });
  expect(await calls(page)).toEqual([]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(outside.x, outside.y);
  await page.mouse.up();
  await expect.poll(async () => (await calls(page, "ink")).length).toBeGreaterThan(0);
  expect(await calls(page, "ink")).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        args: expect.objectContaining({
          points: [800, 600, 1000, 750],
        }),
      }),
    ]),
  );
  const before = await calls(page);
  await page.getByRole("button", { name: "Toggle drawing edit" }).click();
  await expect(page.getByRole("radiogroup")).toHaveCount(0);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(outside.x, outside.y);
  await page.mouse.up();
  expect(await calls(page)).toEqual(before);
});
