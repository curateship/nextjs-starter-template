/**
 * Opens a real browser so Tyler can sign in himself, then saves the session for
 * Playwright checks to reuse. His password never passes through the assistant.
 * Run once; re-run whenever the saved session goes stale.
 */
import { chromium } from "../../../node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs"

const browser = await chromium.launch({ headless: false })
const context = await browser.newContext()
const page = await context.newPage()
await page.goto("http://localhost:3014/login")

console.log("Sign in in the window that just opened.")
console.log("Waiting until you are off the login page...")

await page.waitForFunction(() => !location.pathname.startsWith("/login"), {
  timeout: 300_000,
})
await page.waitForTimeout(3000)
await context.storageState({ path: new URL("../storage-state.json", import.meta.url).pathname })
console.log("Saved storage-state.json. You can close the window.")
await browser.close()
