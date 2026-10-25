import { test, expect } from "@playwright/test";
test("one production service serves the secured client, supports keyboard focus and reduced motion", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "onLine", { get: () => false }),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto("http://127.0.0.1:3000/");
  expect(response?.headers()["content-security-policy"]).toContain(
    "default-src 'self'",
  );
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(
      () => getComputedStyle(document.activeElement!).outlineStyle,
    ),
  ).toBe("solid");
  await page
    .locator(".demo-cards")
    .getByRole("button", { name: /^Super Admin/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "A safer way forward." }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/real-production-390.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
