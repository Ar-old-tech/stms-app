import { test, expect } from "@playwright/test";
test("two browser devices share phone GPS and flush buffered positions after reconnect", async ({
  browser,
  request,
}) => {
  test.setTimeout(120000);
  const admin = await (
    await request.post("/api/v1/auth/login", {
      data: { customId: "SCH-01-ADM", password: "demo123" },
    })
  ).json();
  expect(
    (
      await request.post("/api/v1/admin/demo/reset", {
        headers: { Authorization: `Bearer ${admin.token}` },
        data: { confirm: "RESET DEMO DATA" },
      })
    ).ok(),
  ).toBe(true);
  const parentAuth = await (
    await request.post("/api/v1/auth/login", {
      data: { customId: "STU-2026-44", password: "demo123" },
    })
  ).json();
  const phone = await browser.newContext({
      permissions: ["geolocation"],
      geolocation: { latitude: 33.5973, longitude: 73.0479, accuracy: 1 },
    }),
    family = await browser.newContext();
  await phone.addInitScript(() => {
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: async () => ({ release: async () => {} }) },
    });
  });
  const driver = await phone.newPage(),
    parent = await family.newPage();
  for (const [page, id] of [
    [driver, "DRV-4821"],
    [parent, "STU-2026-44"],
  ] as const) {
    await page.route("https://tile.openstreetmap.org/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=",
          "base64",
        ),
      }),
    );
    await page.goto("http://127.0.0.1:5173");
    await page.getByLabel("Login identifier").fill(id);
    await page.getByLabel("Password", { exact: true }).fill("demo123");
    await page
      .locator(".login-form")
      .getByRole("button", { name: "Sign in", exact: false })
      .click();
  }
  await driver.getByRole("button", { name: "Start morning trip" }).click();
  const snapshot = async () => {
    const r = await request.get("/api/v1/workspace", {
      headers: { Authorization: `Bearer ${parentAuth.token}` },
    });
    return r.json();
  };
  await expect
    .poll(async () => (await snapshot()).trip.timestamp)
    .not.toBeNull();
  await phone.setGeolocation({
    latitude: 33.603,
    longitude: 73.068,
    accuracy: 1,
  });
  await expect
    .poll(async () => (await snapshot()).trip.point[0])
    .toBeCloseTo(33.603, 4);
  expect((await snapshot()).trip.simulated).toBe(false);
  await expect(
    parent.getByText(/Ayesha Khan: van is .* minutes away/).first(),
  ).toBeVisible();
  await phone.setOffline(true);
  await phone.setGeolocation({
    latitude: 33.604,
    longitude: 73.069,
    accuracy: 1,
  });
  await expect(driver.getByText(/1 buffered points/)).toBeVisible();
  await phone.setOffline(false);
  await expect
    .poll(async () => (await snapshot()).trip.point[0], { timeout: 20000 })
    .toBeCloseTo(33.604, 4);
  await expect(driver.getByText(/0 buffered points/)).toBeVisible();
  await phone.close();
  await family.close();
  await request.post("/api/v1/admin/demo/reset", {
    headers: { Authorization: `Bearer ${admin.token}` },
    data: { confirm: "RESET DEMO DATA" },
  });
});
