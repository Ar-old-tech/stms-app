import { test, expect } from "@playwright/test";
test("driver documents, required rejection reason, settings and real CSV file input", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "onLine", { get: () => false }),
  );
  await page.goto("/");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const admin = page.locator('[data-role="Admin"]'),
    driver = page.locator('[data-role="Driver"]');
  await admin.getByRole("button", { name: "Drivers", exact: true }).click();
  const pending = admin
    .locator(".panel")
    .filter({
      has: page.getByRole("heading", { name: "Usman Ahmed", exact: true }),
    });
  await pending.getByText("Review documents").click();
  await expect(pending.getByText(/DEMO-IDENTITY-02/)).toBeVisible();
  await expect(
    pending.getByRole("button", { name: "Reject", exact: true }),
  ).toBeDisabled();
  await pending
    .getByLabel("Reason for rejection")
    .fill("Please upload a clearer license");
  await pending.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(
    driver.getByText("Please upload a clearer license", { exact: true }),
  ).toBeVisible();
  await driver.getByRole("button", { name: "Resubmit application" }).click();
  const form = driver.locator("form");
  await form.getByLabel("Full name").fill("Usman Ahmed");
  await form.getByLabel("CNIC (synthetic demo data only)").fill("DEMO-UPDATED");
  await form.getByLabel("License number").fill("DEMO-LICENSE");
  await form.getByLabel("License expiry").fill("2027-12-01");
  await form
    .getByLabel("Vehicle registration", { exact: true })
    .fill("RWP-2094");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=",
    "base64",
  );
  for (const label of [
    "CNIC photo",
    "License photo",
    "Vehicle registration photo",
  ])
    await form
      .getByLabel(label, { exact: true })
      .setInputFiles({ name: "demo.png", mimeType: "image/png", buffer: png });
  await expect(form.getByAltText("License preview")).toBeVisible();
  await form.getByRole("button", { name: "Submit for verification" }).click();
  await expect(pending.locator(".chip.pending")).toBeVisible();
  await pending.getByRole("button", { name: "Approve & issue ID" }).click();
  await expect(
    page.locator('[data-role="Parent"]').getByText("Usman Ahmed"),
  ).toBeVisible();
  await admin.getByRole("button", { name: "Settings", exact: true }).click();
  await admin.getByLabel("Platform commission (%)").fill("10");
  await admin.getByRole("button", { name: "Save settings" }).click();
  await admin.getByRole("button", { name: "Students", exact: true }).click();
  await admin
    .getByLabel("Upload student CSV")
    .setInputFiles({
      name: "students.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("name,stop\nFile Student,Faizabad"),
    });
  await admin.getByRole("button", { name: "Import & issue STU IDs" }).click();
  await expect(admin.getByRole("cell", { name: /File Student/ })).toBeVisible();
  expect(errors).toEqual([]);
});
