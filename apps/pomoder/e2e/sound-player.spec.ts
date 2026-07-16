import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

async function navigateInApp(page: Page, linkName: string) {
  const menuButton = page.locator(".menu-button")
  if (await menuButton.isVisible()) await menuButton.click()
  await page.getByRole("link", { name: linkName, exact: true }).click()
}

test("a selected sound really plays and keeps playing across pages", async ({ page }) => {
  const consoleErrors: string[] = []
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()) })
  await page.goto("/sounds")

  const rainCard = page.locator(".reference-catalog-card", { hasText: "Rain" })
  await rainCard.click()

  const audio = page.locator("audio")
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => !element.paused)).toBe(true)
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0.2)
  expect(await audio.evaluate((element: HTMLAudioElement) => element.loop)).toBe(true)
  await expect(rainCard).toHaveClass(/selected/)
  await expect(rainCard).toContainText("playing")
  await expect(page.getByRole("button", { name: "Pause Rain" })).toBeVisible()

  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])

  await navigateInApp(page, "Tasks")
  await expect(page).toHaveURL(/\/tasks$/)
  const timeAfterNavigation = await audio.evaluate((element: HTMLAudioElement) => element.currentTime)
  expect(await audio.evaluate((element: HTMLAudioElement) => !element.paused)).toBe(true)
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(timeAfterNavigation)
  await expect(page.getByRole("button", { name: "Pause Rain" })).toBeVisible()
  expect(consoleErrors).toEqual([])
})

test("playback controls pause, mute, adjust volume, and stop the sound", async ({ page }) => {
  await page.goto("/sounds")
  await page.locator(".reference-catalog-card", { hasText: "Brown noise" }).click()
  const audio = page.locator("audio")
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => !element.paused)).toBe(true)

  await page.getByRole("button", { name: "Pause Brown noise" }).click()
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true)
  await page.getByRole("button", { name: "Play Brown noise" }).click()
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => !element.paused)).toBe(true)

  await page.getByRole("button", { name: "Mute sound" }).click()
  expect(await audio.evaluate((element: HTMLAudioElement) => element.muted)).toBe(true)
  await page.getByRole("button", { name: "Unmute sound" }).click()
  expect(await audio.evaluate((element: HTMLAudioElement) => element.muted)).toBe(false)

  const volume = page.getByLabel("Sound volume")
  if (await volume.isVisible()) {
    await volume.fill("25")
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.volume)).toBeCloseTo(0.25, 2)
  }

  await page.getByRole("button", { name: "Stop sound" }).click()
  await expect(page.getByRole("button", { name: /Play|Pause/ })).toHaveCount(0)
  expect(await audio.evaluate((element: HTMLAudioElement) => element.getAttribute("src"))).toBeNull()
})

test("the selection survives a reload without autoplaying", async ({ page }) => {
  await page.goto("/sounds")
  await page.locator(".reference-catalog-card", { hasText: "Café ambience" }).click()
  const audio = page.locator("audio")
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => !element.paused)).toBe(true)

  await page.reload()
  const resume = page.getByRole("button", { name: "Play Café ambience" })
  await expect(resume).toBeVisible()
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true)

  await resume.click()
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => !element.paused)).toBe(true)
})

test("denied notification permission never breaks timer completion", async ({ page }) => {
  const consoleErrors: string[] = []
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()) })
  await page.goto("/settings")

  const alerts = page.getByLabel("Completion alerts")
  await alerts.check()
  await expect(alerts).toBeChecked()
  await expect.poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem("pomoder:sound:v1") || "{}").completionAlerts)).toBe(true)

  await page.evaluate(() => {
    const key = "pomoder:guest:v1"
    const state = JSON.parse(window.localStorage.getItem(key) || "{}")
    state.durations = { focus: 1, short: 5, long: 15 }
    state.timer = { mode: "focus", durationMinutes: 1, remainingSeconds: 1, running: true, targetTimestamp: Date.now() + 250 }
    window.localStorage.setItem(key, JSON.stringify(state))
  })
  await page.goto("/")

  await expect(page.getByRole("progressbar", { name: /1 of \d+ completed focus sessions/ })).toBeVisible()
  await navigateInApp(page, "Settings")
  await expect(page.getByLabel("Completion alerts")).toBeChecked()
  expect(consoleErrors).toEqual([])
})

test("quick controls and the catalog share one selection", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" })
  const themeButton = page.getByRole("button", { name: "Theme" })
  if (!(await themeButton.isVisible())) test.skip(true, "Quick controls are desktop-only")

  await themeButton.click()
  await page.locator(".quick-sounds button", { hasText: "Lofi beats" }).click()
  const audio = page.locator("audio")
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => !element.paused)).toBe(true)

  await page.getByRole("link", { name: "Sounds", exact: true }).click()
  const lofiCard = page.locator(".reference-catalog-card", { hasText: "Lofi beats" })
  await expect(lofiCard).toHaveClass(/selected/)
  await expect(lofiCard).toContainText("playing")

  await page.getByRole("button", { name: "Theme" }).click()
  await page.locator(".quick-sounds button", { hasText: "Silence" }).click()
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true)
  await expect(lofiCard).not.toHaveClass(/selected/)
})
