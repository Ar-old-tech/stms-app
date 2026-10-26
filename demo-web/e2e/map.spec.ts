import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
const tiles = "https://tile.openstreetmap.org/**";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=",
  "base64",
);
async function login(page: Page) {
  await page.goto("/");
  await page
    .locator(".demo-cards")
    .getByRole("button", { name: /^Admin/ })
    .click();
  await expect(
    page.locator(".map-wrap .leaflet-container").first(),
  ).toBeVisible();
}

test("retains maps and one tile pane across tab/frame/workspace/socket updates", async ({
  page,
  request,
}) => {
  await page.route(tiles, (r) =>
    r.fulfill({ status: 200, contentType: "image/png", body: png }),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  const host = page.locator('[data-role="Admin"] .leaflet-container');
  const original = await host.elementHandle();
  await page.getByRole("button", { name: "Alerts", exact: true }).click();
  await expect(host).toBeHidden();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  expect(
    await host.evaluate((node, original) => node === original, original),
  ).toBe(true);
  await page
    .locator(".role-nav")
    .getByRole("button", { name: "Presenter", exact: true })
    .click();
  await expect(page.locator(".leaflet-container")).toHaveCount(3);
  await page
    .locator(".role-nav")
    .getByRole("button", { name: "Driver", exact: true })
    .click();
  await expect(host).toBeHidden();
  await page
    .locator(".role-nav")
    .getByRole("button", { name: "Admin", exact: true })
    .click();
  expect(
    await host.evaluate((node, original) => node === original, original),
  ).toBe(true);
  const auth = await request.post("/api/v1/auth/login", {
    data: { customId: "DRV-4821", password: "demo123" },
  });
  const { token } = await auth.json();
  const headers = { Authorization: `Bearer ${token}` };
  const w = await (await request.get("/api/v1/workspace", { headers })).json();
  expect(
    (
      await request.post(`/api/v1/trips/${w.trip.id}/start`, {
        headers,
        data: {},
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.post(`/api/v1/trips/${w.trip.id}/telemetry`, {
        headers,
        data: {
          point: [33.6, 73.05],
          speed: 30,
          timestamp: Date.now(),
          simulated: true,
        },
      })
    ).ok(),
  ).toBe(true);
  await expect(page.locator('[data-role="Admin"] .van-marker')).toHaveCount(1);
  const van = await page
    .locator('[data-role="Admin"] .van-marker')
    .getAttribute("d");
  expect(
    (
      await request.post(`/api/v1/trips/${w.trip.id}/telemetry`, {
        headers,
        data: {
          point: [33.601, 73.051],
          speed: 32,
          timestamp: Date.now() + 10,
          simulated: true,
        },
      })
    ).ok(),
  ).toBe(true);
  await expect
    .poll(() =>
      page.locator('[data-role="Admin"] .van-marker').getAttribute("d"),
    )
    .not.toBe(van);
  expect(
    await host.evaluate((node, original) => node === original, original),
  ).toBe(true);
  for (const width of [390, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await host.evaluate((n) => n.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(200);
  }
  expect(
    await page
      .locator(".leaflet-container")
      .evaluateAll((nodes) =>
        nodes.every(
          (n) => n.querySelectorAll(".leaflet-tile-pane").length === 1,
        ),
      ),
  ).toBe(true);
  await expect(host.locator(".leaflet-control-attribution")).toContainText(
    "© OpenStreetMap contributors",
  );
  expect(errors).toEqual([]);
});

test("keeps attribution and overlays, showing fallback at the third error without replacing tiles", async ({
  page,
}) => {
  const waiting: (() => void)[] = [];
  await page.route(tiles, async (route) => {
    await new Promise<void>((resolve) => waiting.push(resolve));
    await route.fulfill({ status: 403, body: "Blocked tile" });
  });
  await login(page);
  await expect.poll(() => waiting.length).toBeGreaterThanOrEqual(3);
  const pane = await page.locator(".leaflet-tile-pane").elementHandle();
  waiting.shift()!();
  waiting.shift()!();
  await expect
    .poll(() => page.locator(".leaflet-tile").evaluateAll(nodes => nodes.filter(node => {
      const image = node as HTMLImageElement;
      return image.complete && image.naturalWidth === 0;
    }).length))
    .toBeGreaterThanOrEqual(2);
  await expect(
    page.getByText("Map tiles unavailable, tracking still works", {
      exact: true,
    }),
  ).toHaveCount(0);
  waiting.shift()!();
  await expect(
    page.getByText("Map tiles unavailable, tracking still works", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.locator(".leaflet-tile-pane").evaluate((n, p) => n === p, pane),
  ).toBe(true);
  await expect(page.locator(".leaflet-control-attribution")).toContainText(
    "© OpenStreetMap contributors",
  );
  while (waiting.length) waiting.shift()!();
});

test("real OSM Network check: HTTP 200 and origin Referer", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.STMS_VERIFY_OSM !== "1",
    "Opt-in live provider check; other tests use local mock tiles.",
  );
  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  const records = new Map<
    string,
    { url: string; referer?: string; status?: number }
  >();
  client.on("Network.requestWillBeSent", (e) => {
    if (e.request.url.startsWith("https://tile.openstreetmap.org/"))
      records.set(e.requestId, {
        url: e.request.url,
        referer: e.request.headers.Referer ?? e.request.headers.referer,
      });
  });
  client.on("Network.requestWillBeSentExtraInfo", (e) => {
    const r = records.get(e.requestId);
    if (r) r.referer = e.headers.Referer ?? e.headers.referer ?? r.referer;
  });
  client.on("Network.responseReceived", (e) => {
    const r = records.get(e.requestId);
    if (r) r.status = e.response.status;
  });
  await login(page);
  await expect
    .poll(
      () => [...records.values()].filter((r) => r.status !== undefined).length,
      { timeout: 30000 },
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() => page.locator(".leaflet-tile-loaded").count(), {
      timeout: 30000,
    })
    .toBeGreaterThan(0);
  const report = [...records.values()];
  console.log("REAL OSM NETWORK", JSON.stringify(report));
  await testInfo.attach("tile-network.json", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
  await page.screenshot({ path: testInfo.outputPath("live-map.png") });
  expect(report.some((r) => r.status === 200)).toBe(true);
  expect(
    report.filter((r) => r.status !== undefined).every((r) => r.status === 200),
  ).toBe(true);
  expect(report.every((r) => r.referer === "http://127.0.0.1:3000/")).toBe(
    true,
  );
});
