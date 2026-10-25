import { defineConfig } from "@playwright/test";
export default defineConfig({
  workers: 2,
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    channel: process.platform === "win32" ? "msedge" : undefined,
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
});
