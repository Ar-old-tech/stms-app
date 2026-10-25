import { test, expect } from "@playwright/test";
test("eight SHOWTIME steps, responsive views, and no browser errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  // Deterministic offline tiles: test the supported grid fallback without contacting a public server.
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "onLine", { get: () => false }),
  );
  await page.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({ body: "", contentType: "text/css" }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Small journeys.", exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/presenter-1920.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "SHOWTIME" }).click();
  await page.getByRole("button", { name: "Pause showtime" }).click();
  const parent = page.locator('[data-role="Parent"]'),
    driver = page.locator('[data-role="Driver"]'),
    admin = page.locator('[data-role="Admin"]');
  await expect(parent.getByText("Usman Ahmed")).toBeVisible(); // 1 verified identity propagated
  await expect(parent.getByText("Verified", { exact: true })).toBeVisible();
  const skip = page.getByRole("button", { name: "Skip to next demo step" });
  await skip.click();
  await expect(
    parent.getByRole("button", { name: "Not Going", exact: true }),
  ).toHaveClass(/selected/); // 2
  await skip.click();
  await expect(driver.getByText("IN PROGRESS", { exact: true })).toBeVisible();
  await expect(driver.locator(".stop-list")).not.toContainText("Ayesha"); // 3
  await skip.click();
  await expect(driver.locator(".gauge strong")).toHaveText("76");
  await expect(admin.getByText(/76 km\/h.*limit 60/)).toBeVisible(); // 4
  await skip.click();
  await expect(
    parent.getByText(/Ayesha Khan: van is .* minutes away/),
  ).toBeVisible(); // 5
  await skip.click();
  await expect(
    driver.getByRole("button", { name: "Dropped at institution" }),
  ).toBeVisible();
  await expect(parent.getByText("At campus", { exact: true })).toBeVisible(); // 6
  await skip.click();
  await expect(page.locator(".sos-pulse")).toHaveCount(1);
  await expect(
    admin.getByRole("button", { name: "Resolve SOS" }),
  ).toBeVisible(); // 7
  await skip.click();
  await expect(parent.getByText(/Payment successful/)).toBeVisible();
  await expect(
    admin.getByText(/Commission PKR 325.*Net payout PKR 6,175/).first(),
  ).toBeVisible();
  await expect(page.locator(".sos-pulse")).toHaveCount(0); // 8
  await page.screenshot({
    path: "test-results/showtime-complete.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const role of ["Driver", "Parent", "Admin", "Super Admin"]) {
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
    path: "test-results/mobile-390.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Your journey starts here.")).toBeVisible();
  expect(errors).toEqual([]);
});
test("manual attendance lock, CSV import, payment retry, SOS confirmation and tenant creation", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "onLine", { get: () => false }),
  );
  await page.goto("/");
  const parent = page.locator('[data-role="Parent"]'),
    admin = page.locator('[data-role="Admin"]');
  await parent.getByRole("button", { name: "Not Going", exact: true }).click();
  await expect(
    parent.getByRole("button", { name: "Not Going", exact: true }),
  ).toHaveClass(/selected/);
  await page.getByRole("button", { name: "Demo control panel" }).click();
  await page.getByRole("button", { name: "After cut-off" }).click();
  await expect(
    parent.getByRole("button", { name: "✓ Going", exact: true }),
  ).toBeDisabled();
  await parent.getByRole("button", { name: "Request admin override" }).click();
  await admin.getByRole("button", { name: "Alerts", exact: true }).click();
  await admin
    .getByRole("button", { name: "Approve attendance change" })
    .click();
  await expect(parent.locator(".chip.going")).toBeVisible();
  await admin.getByRole("button", { name: "Students", exact: true }).click();
  await admin.getByRole("button", { name: "Load sample CSV" }).click();
  await admin.getByRole("button", { name: "Import & issue STU IDs" }).click();
  await expect(admin.getByRole("cell", { name: /Sara Ahmed/ })).toBeVisible();
  await parent.getByRole("button", { name: "Pay securely" }).click();
  await parent.getByRole("button", { name: "Simulate failure" }).click();
  await expect(parent.locator(".chip.failed")).toBeVisible();
  await parent.getByRole("button", { name: "Pay securely" }).click();
  await parent.getByRole("button", { name: "Simulate success" }).click();
  await expect(
    parent.getByRole("link", { name: "Download receipt" }),
  ).toBeVisible();
  await parent.getByRole("button", { name: "Emergency SOS" }).click();
  await expect(page.locator(".sos-pulse")).toHaveCount(0);
  await parent.getByRole("button", { name: "Confirm emergency" }).click();
  await expect(page.locator(".sos-pulse")).toHaveCount(1);
  await page
    .locator(".role-nav")
    .getByRole("button", { name: "Super Admin", exact: true })
    .click();
  await page.getByLabel("Institution name").fill("Demo Academy");
  await page.getByRole("button", { name: "Create tenant" }).click();
  await expect(page.getByText("Demo Academy", { exact: true })).toBeVisible();
});
