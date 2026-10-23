import { expect, test } from "@playwright/test";

test("Start menu retains keyboard behavior and fits phone landscape", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  const start = page.getByRole("button", { name: "Start", exact: true });
  const menu = page.getByRole("menu", { name: "Start" });
  const windows = await page.getByRole("button", { name: /^Close / }).count();
  await start.focus();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Welcome", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitem", { name: "Officer sign-in", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("m");
  await expect(menu.getByRole("menuitem", { name: "Meetings", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(start).toBeFocused();
  await expect(page.getByRole("button", { name: /^Close / })).toHaveCount(windows);
  await page.setViewportSize({ width: 568, height: 320 });
  await start.click();
  // Pointer opening hands focus to the menu asynchronously, before its navigation keys apply.
  await expect(menu).toBeFocused();
  await page.keyboard.press("End");
  const officer = menu.getByRole("menuitem", { name: "Officer sign-in", exact: true });
  await expect(officer).toBeFocused();
  await expect(officer).toBeInViewport();
  const bounds = await menu.boundingBox();
  if (!bounds) throw new Error("Visible Start menu has no bounds");
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(320);
  await page.screenshot({ path: testInfo.outputPath("start-menu-landscape.png") });
});
