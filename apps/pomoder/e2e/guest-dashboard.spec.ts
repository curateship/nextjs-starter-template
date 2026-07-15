import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

test("guest timer and tasks survive reload", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("region", { name: "Lofi focus scene" })).toBeVisible()
  await expect(page.getByText("25:00")).toBeVisible()

  await page.getByLabel("New task").fill("Review the Pomoder plan")
  await page.getByLabel("New task").press("Enter")
  await expect(page.getByText("Review the Pomoder plan")).toBeVisible()

  await page.getByRole("button", { name: "Start", exact: true }).click()
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible()
  await page.waitForTimeout(1_100)
  await page.reload()
  await expect(page.getByText("Review the Pomoder plan")).toBeVisible()
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible()
})

test("guest focus selection survives reload and receives the completed Pomodoro", async ({ page }) => {
  const consoleErrors: string[] = []
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()) })
  await page.goto("/")
  const selectedTask = page.locator(".task-focus-choice").filter({ hasText: "Review pull request #142" })
  await selectedTask.click()
  await expect.poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem("pomoder:guest:v1") || "{}").selectedTaskId)).toBe("pull-request")

  await page.reload()
  await expect(selectedTask).toHaveAttribute("aria-pressed", "true")
  await page.evaluate(() => {
    const key = "pomoder:guest:v1"
    const state = JSON.parse(window.localStorage.getItem(key) || "{}")
    state.durations.focus = 1
    state.timer = { mode: "focus", durationMinutes: 1, remainingSeconds: 1, running: true, targetTimestamp: Date.now() + 250 }
    window.localStorage.setItem(key, JSON.stringify(state))
  })
  await page.reload()

  await expect(selectedTask).toContainText("1 pomo")
  expect(consoleErrors).toEqual([])
})

test("guest daily goal persists and updates after a completed focus session", async ({ page }) => {
  const consoleErrors: string[] = []
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()) })
  await page.goto("/settings")

  const goal = page.getByLabel("Daily session goal")
  await goal.fill("0")
  await expect(page.getByRole("button", { name: "Save focus rhythm" })).toBeDisabled()
  await goal.fill("1")
  await page.getByRole("button", { name: "Save focus rhythm" }).click()
  await expect(page.getByText("Focus rhythm saved locally.")).toBeVisible()

  await page.reload()
  await expect(goal).toHaveValue("1")
  await page.goto("/")
  await expect(page.getByRole("progressbar", { name: "0 of 1 completed focus sessions" })).toBeVisible()

  await page.evaluate(() => {
    const key = "pomoder:guest:v1"
    const state = JSON.parse(window.localStorage.getItem(key) || "{}")
    state.durations.focus = 1
    state.timer = { mode: "focus", durationMinutes: 1, remainingSeconds: 1, running: true, targetTimestamp: Date.now() + 250 }
    window.localStorage.setItem(key, JSON.stringify(state))
  })
  await page.reload()

  await expect(page.getByRole("progressbar", { name: "1 of 1 completed focus sessions" })).toBeVisible()
  await expect(page.getByText("1 of 1 completed today · Goal reached")).toBeVisible()
  await page.reload()
  await expect(page.getByRole("progressbar", { name: "1 of 1 completed focus sessions" })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  expect(consoleErrors).toEqual([])
})

test("public product pages are keyboard-accessible", async ({ page }) => {
  await page.goto("/themes")
  await expect(page.getByRole("heading", { name: "Backgrounds" })).toBeVisible()
  await expect(page.getByRole("button", { name: /Lofi girl/ })).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test("the active background does not remount while navigating", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("pomoder:background", "lofi"))
  await page.goto("/")

  const video = page.getByRole("region", { name: "Lofi focus scene" }).locator("video")
  await expect(video).toBeVisible()
  await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(0.25)
  const element = await video.elementHandle()
  const currentTime = await video.evaluate((node) => node.currentTime)

  await page.getByRole("link", { name: "Browse rooms", exact: true }).click()
  await expect(page).toHaveURL(/\/rooms$/)
  await expect(page.getByRole("heading", { name: "Open to join" })).toBeVisible()

  expect(await page.evaluate((node) => node === document.querySelector(".dashboard-hero video") && node.isConnected, element)).toBe(true)
  await expect.poll(() => video.evaluate((node) => node.currentTime)).toBeGreaterThan(currentTime)
})

test("stale background storage cannot replace the MP4 after refresh", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("pomoder:background", "stars"))
  await page.goto("/")

  const hero = page.getByRole("region", { name: "Lofi focus scene" })
  await expect(hero.locator("video")).toBeVisible()
  await expect(hero.locator('img[src="/pomoder/thumbs-stars.png"]')).toHaveCount(0)
})
