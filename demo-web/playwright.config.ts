import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1920, height: 1080 },
    trace: "retain-on-failure",
  },
  reporter: "list",
  webServer: [
    {
      command: "npm run dev -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
    },
    {
      command: "npm run preview -- --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: true,
    },
  ],
});
