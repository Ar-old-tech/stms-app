import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "map.spec.ts",
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1920, height: 1080 },
    trace: "off",
  },
  reporter: "list",
  webServer: {
    command: "npm --prefix ../server run test:serve",
    url: "http://127.0.0.1:3000/api/v1/health",
    reuseExistingServer: !!process.env.STMS_REUSE_SERVER,
    timeout: 120000,
  },
});
