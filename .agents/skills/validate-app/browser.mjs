// The validate-app skill's browser helper. Import it from a check script:
//
//   import { openSignedIn } from "<repo>/.agents/skills/validate-app/browser.mjs"
//   const { browser, page, problems } = await openSignedIn({ port: 3016 })
//
// It finds Playwright under node_modules/.pnpm, signs in with the local test
// account read from SKILL.md beside it, and collects console errors and failed
// requests. The password never appears in a command line, which is what made
// Claude Code stop and ask for permission (Tyler, 5 Nov 2026: "change the
// validate app skill so it never ask me that shit again").

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, "..", "..", "..")

function testAccount() {
  const skill = readFileSync(join(here, "SKILL.md"), "utf8")
  const found = skill.match(/local test account\s*`([^`]+)`\s*\/\s*`([^`]+)`/)
  if (!found) throw new Error("The test account line in SKILL.md has changed shape.")
  return { email: found[1], password: found[2] }
}

async function playwright() {
  const store = join(repoRoot, "node_modules", ".pnpm")
  const folder = readdirSync(store)
    .filter((name) => /^playwright@\d/.test(name))
    .sort()
    .at(-1)
  if (!folder) throw new Error("Playwright is not installed at the repo root.")
  return import(pathToFileURL(join(store, folder, "node_modules", "playwright", "index.mjs")).href)
}

/**
 * A signed-in page on the app's own port. Retries the sign-in while the page
 * hydrates: a form sent before then does a plain GET and goes nowhere.
 */
export async function openSignedIn({ port, width = 1440, height = 900 }) {
  const { chromium } = await playwright()
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width, height } })
  const page = await context.newPage()
  const problems = []
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text().slice(0, 400)}`)
  })
  page.on("pageerror", (error) => problems.push(`page error: ${error.message.slice(0, 400)}`))
  page.on("requestfailed", (request) => problems.push(`failed: ${request.failure()?.errorText} ${request.url().slice(0, 200)}`))
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`http ${response.status()} ${response.url().slice(0, 200)}`)
  })

  const { email, password } = testAccount()
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(`http://localhost:${port}/login`, { waitUntil: "domcontentloaded" })
    await page.waitForSelector('input[type="email"]')
    await page.waitForTimeout(3000 + attempt * 3000)
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')
    try {
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 })
      return { browser, context, page, problems }
    } catch {
      // Not hydrated yet; try again.
    }
  }
  await browser.close()
  throw new Error("Could not sign in with the test account.")
}
