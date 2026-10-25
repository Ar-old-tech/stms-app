import { test, expect } from "@playwright/test";
test("production shell reloads offline and the complete autoplay advances", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4173");
  await expect(
    page.getByRole("heading", { name: /Small journeys/ }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.screenshot({ path: "test-results/offline-reload.png" });
  expect(errors).toEqual([]);
  await expect(
    page.getByRole("heading", { name: /Small journeys/ }),
  ).toBeVisible();
  await expect(
    page.getByText("OFFLINE GRID", { exact: false }).first(),
  ).toBeVisible();
  await page.clock.install();
  await page.getByRole("button", { name: "SHOWTIME" }).click();
  // runFor invokes every interval; captions use real 11-second beats.
  for (let i = 0; i < 8; i++) {
    await page.clock.runFor(11000);
  }
  await expect(page.locator(".showtime-caption")).toContainText("8 / 8");
  await expect(
    page.locator('[data-role="Parent"]').getByText(/Payment successful/),
  ).toBeVisible();
  await expect(page.locator(".sos-pulse")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("keyboard focus and reduced-motion mode", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "onLine", { get: () => false }),
  );
  await page.goto("/");
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(
    () => getComputedStyle(document.activeElement!).outlineStyle,
  );
  expect(outline).toBe("solid");
  expect(
    await page
      .locator(".route-line")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});
