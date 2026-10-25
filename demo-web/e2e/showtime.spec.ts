import { test, expect } from "@playwright/test";
test("SHOWTIME autoplay completes through the real backend", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "onLine", { get: () => false }),
  );
  await page.goto("/");
  await page
    .locator(".demo-cards")
    .getByRole("button", { name: /^Admin/ })
    .click();
  await page.getByRole("button", { name: /SHOWTIME/ }).click();
  await expect(page.locator(".showtime-caption")).toContainText("8 / 8", {
    timeout: 150000,
  });
  await expect(
    page.locator('[data-role="Parent"]').getByText(/Payment successful/),
  ).toBeVisible();
  await expect(page.locator(".sos-pulse")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("walks all eight SHOWTIME steps against the real API without browser errors", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "onLine", { get: () => false }),
  );
  await page.goto("/");
  await page
    .locator(".demo-cards")
    .getByRole("button", { name: /^Admin/ })
    .click();
  await page.getByRole("button", { name: /SHOWTIME/ }).click();
  await expect(page.locator(".showtime-caption")).toContainText("1 / 8", {
    timeout: 45000,
  });
  await page.getByRole("button", { name: "Pause showtime" }).click();
  const parent = page.locator('[data-role="Parent"]'),
    driver = page.locator('[data-role="Driver"]'),
    admin = page.locator('[data-role="Admin"]');
  await expect(parent.getByText("Usman Ahmed")).toBeVisible();
  await expect(parent.getByText("Verified", { exact: true })).toBeVisible();
  const skip = page.getByRole("button", { name: "Skip to next demo step" });
  await page.screenshot({
    path: "test-results/real-presenter-1920.png",
    fullPage: true,
  });
  await skip.click();
  await expect(page.locator(".showtime-caption")).toContainText("2 / 8");
  await expect(parent.locator(".chip.not-going")).toBeVisible();
  await skip.click();
  await expect(page.locator(".showtime-caption")).toContainText("3 / 8");
  await expect(driver.getByText("IN PROGRESS", { exact: true })).toBeVisible();
  await expect(driver.locator(".stop-list")).not.toContainText("Ayesha Khan");
  await skip.click();
  await expect(page.locator(".showtime-caption")).toContainText("4 / 8");
  await expect(driver.locator(".gauge strong")).toHaveText("76");
  await expect(admin.getByText("76 km/h · limit 60")).toBeVisible();
  await skip.click();
  await expect(page.locator(".showtime-caption")).toContainText("5 / 8", {
    timeout: 30000,
  });
  await expect(
    parent.getByText(/Ayesha Khan: van is .* minutes away/).first(),
  ).toBeVisible();
  await skip.click();
  await expect(page.locator(".showtime-caption")).toContainText("6 / 8", {
    timeout: 30000,
  });
  await expect(parent.getByText("At campus", { exact: true })).toBeVisible();
  await expect(
    driver.getByRole("button", { name: "Dropped at institution" }),
  ).toBeVisible();
  await skip.click();
  await expect(page.locator(".showtime-caption")).toContainText("7 / 8");
  await expect(page.locator(".sos-pulse")).toHaveCount(1);
  await expect(
    admin.getByRole("button", { name: "Resolve SOS" }),
  ).toBeVisible();
  await expect(
    parent.getByRole("link", { name: "View live location" }).first(),
  ).toBeVisible();
  await skip.click();
  await expect(page.locator(".showtime-caption")).toContainText("8 / 8");
  await expect(parent.getByText(/Payment successful/)).toBeVisible();
  await expect(
    admin.getByText("Commission PKR 325 · Net payout PKR 6,175").first(),
  ).toBeVisible();
  await expect(page.locator(".sos-pulse")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/real-showtime-complete.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const role of ["Driver", "Parent", "Admin"]) {
    await page
      .locator(".role-nav")
      .getByRole("button", { name: role, exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: "test-results/real-mobile-390.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
