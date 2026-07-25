import { defineConfig } from "@playwright/test";

const baseURL = process.env.QA_BASE_URL;

if (!baseURL) {
  throw new Error("QA_BASE_URL must point to the MailFlow environment under test.");
}

export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html"], ["json", { outputFile: "test-results/results.json" }], ["line"]] : "list",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  }
});
