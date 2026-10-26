import { test, expect } from "@playwright/test";

test("parent SOS uses review and confirmation, admin receives and resolves it", async ({
  page,
  request,
}) => {
  const diagnostics: string[] = [];
  page.on("pageerror", (e) => diagnostics.push(`ERROR ${e.message}`));
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type()))
      diagnostics.push(`${m.type().toUpperCase()} ${m.text()}`);
  });
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 33.62, longitude: 73.05 });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "onLine", { get: () => false }),
  );
  await page.goto("/");
  await page.locator("input[name=id]").fill("PAR-2026-44");
  await page.locator("input[autocomplete=current-password]").fill("demo123");
  await page.locator(".login-form button.primary.wide").click();
  await page
    .getByRole("button", { name: "Emergency SOS", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Emergency SOS" });
  await dialog.getByRole("button", { name: "Other", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Review emergency" }),
  ).toBeDisabled();
  await dialog.locator("textarea").fill("Demo: child needs assistance");
  await expect(dialog.getByText("28/300")).toBeVisible();
  await dialog.getByRole("button", { name: "Review emergency" }).click();
  await expect(
    dialog.getByRole("button", { name: "Send emergency now" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Send emergency now" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Emergency sent · OPEN")).toBeVisible();
  await expect(page.getByText("SMS not configured").first()).toBeVisible();
  const login = await request.post("http://127.0.0.1:3000/api/v1/auth/login", {
    data: { customId: "SCH-01-ADM", password: "demo123" },
  });
  const admin = await login.json();
  const inbox = await request.get("http://127.0.0.1:3000/api/v1/sos", {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  const events = await inbox.json();
  const event = events.find(
    (e: any) => e.message === "Demo: child needs assistance",
  );
  expect(event).toBeTruthy();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator("input[name=id]").fill("SCH-01-ADM");
  await page.locator("input[autocomplete=current-password]").fill("demo123");
  await page.locator(".login-form button.primary.wide").click();
  const urgent = page
    .locator(".sos-urgent")
    .filter({ hasText: "Demo: child needs assistance" });
  await expect(urgent).toBeVisible();
  for (const width of [390, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(urgent).toBeVisible();
    await page.screenshot({
      path: `test-results/sos-${width}.png`,
      fullPage: true,
    });
  }
  await urgent.getByRole("link", { name: "View live location in app" }).click();
  await expect(
    urgent.locator(".sos-location .leaflet-container"),
  ).toBeVisible();
  await expect(urgent.locator(".sos-location")).toContainText("OpenStreetMap");
  await expect(
    urgent.getByRole("link", { name: "Call", exact: true }),
  ).toHaveAttribute("href", "tel:+12025550144");
  await urgent.getByRole("link", { name: "View live location in app" }).click();
  await urgent.getByRole("button", { name: "I am on it" }).click();
  await expect(urgent).toHaveCount(0);
  await page.getByRole("button", { name: "Alerts", exact: true }).click();
  const row = page
    .locator(".notice")
    .filter({ hasText: "Demo: child needs assistance" });
  await row.getByRole("button", { name: "Resolve SOS" }).click();
  await expect(row).toContainText("RESOLVED");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText("twilio_sms", { exact: true })).toBeVisible();
  await expect(page.getByText("Not configured", { exact: true })).toHaveCount(
    2,
  );
  await page
    .getByRole("button", { name: "Send test message", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "admin account has no phone" }),
  ).toBeVisible();
  console.log("SOS browser diagnostics:", JSON.stringify(diagnostics));
  expect(diagnostics).toEqual([]);
});
