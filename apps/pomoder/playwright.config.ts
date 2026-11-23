import { defineConfig, devices } from "@playwright/test"
import localAppPorts from "../../local-apps.json" with { type: "json" }

const baseURL = `http://127.0.0.1:${localAppPorts.pomoder}`

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure", video: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1100 } } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "npm run start",
    url: `${baseURL}/api/health/live`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    // The built server only trusts configured origins, so authenticated
    // spec flows need the local origins allowed explicitly.
    env: { ...process.env, POMODER_ALLOWED_ORIGINS: `${baseURL},http://localhost:${localAppPorts.pomoder}` },
  },
})
