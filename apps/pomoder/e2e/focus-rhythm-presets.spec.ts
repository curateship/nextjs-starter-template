import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import argon2 from "argon2"
import { Client } from "pg"

function watchConsole(page: Page) {
  const errors: string[] = []
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()) })
  return errors
}

async function seedVerifiedUser() {
  const email = `presets-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`
  const password = "presets-pass-1234"
  const client = new Client({ connectionString: process.env.POMODER_DATABASE_URL || `postgresql://postgres:localdev@localhost:${process.env.POMODER_POSTGRES_PORT || "54326"}/pomoder` })
  await client.connect()
  try {
    const passwordHash = await argon2.hash(password)
    const inserted = await client.query<{ id: string }>(
      "insert into users (email, name, password_hash, email_verified_at) values ($1, 'Rhythm', $2, now()) returning id",
      [email, passwordHash]
    )
    await client.query("insert into user_preferences (user_id) values ($1)", [inserted.rows[0].id])
  } finally {
    await client.end()
  }
  return { email, password }
}

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(account.email)
  await page.getByLabel("Password").fill(account.password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator(".dashboard-ring")).toBeVisible()
}

async function applyPresetFromSettings(page: Page, optionName: RegExp) {
  await page.getByLabel("Focus rhythm preset").click()
  await page.getByRole("option", { name: optionName }).click()
}

test("guest can apply a built-in preset that persists locally", async ({ page }) => {
  const consoleErrors = watchConsole(page)
  await page.goto("/settings")

  // Guest defaults 25/5/15 without auto-start match the Classic built-in.
  await expect(page.getByLabel("Focus rhythm preset")).toContainText("Classic")

  await applyPresetFromSettings(page, /Deep Work/)
  await expect(page.getByText("Deep Work applied and saved locally.")).toBeVisible()
  await expect(page.locator(".settings-card label", { hasText: "Focus minutes" }).getByRole("spinbutton")).toHaveValue("50")

  await page.goto("/")
  await expect(page.locator(".dashboard-ring-content time")).toHaveText("50:00")

  await page.goto("/settings")
  await expect(page.getByLabel("Focus rhythm preset")).toContainText("Deep Work")

  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
  expect(consoleErrors).toEqual([])
})

test("guest can create, edit, apply, and delete a custom preset", async ({ page }) => {
  await page.goto("/settings")

  await applyPresetFromSettings(page, /Study Sprint/)
  await expect(page.getByText("Study Sprint applied and saved locally.")).toBeVisible()

  await page.getByLabel("New preset name").fill("Sprint Copy")
  await page.getByRole("button", { name: "Save preset" }).click()
  const row = page.locator(".preset-row", { hasText: "Sprint Copy" })
  await expect(row).toContainText("15 · 3 · 10 · auto")

  await page.getByRole("button", { name: "Edit preset Sprint Copy" }).click()
  const editor = page.locator(".preset-editor")
  await editor.locator("label", { hasText: "Focus" }).first().getByRole("spinbutton").fill("22")
  await page.getByRole("button", { name: "Save changes" }).click()
  await expect(row).toContainText("22 · 3 · 10 · auto")

  await applyPresetFromSettings(page, /Sprint Copy/)
  await expect(page.locator(".settings-card label", { hasText: "Focus minutes" }).getByRole("spinbutton")).toHaveValue("22")

  // Deleting asks for confirmation and never touches the applied rhythm.
  await page.getByRole("button", { name: "Delete preset Sprint Copy" }).click()
  await expect(page.getByText("This removes the saved preset only")).toBeVisible()
  await page.getByRole("button", { name: "Delete preset", exact: true }).click()
  await expect(row).toHaveCount(0)
  await expect(page.locator(".settings-card label", { hasText: "Focus minutes" }).getByRole("spinbutton")).toHaveValue("22")

  await page.reload()
  await expect(page.locator(".preset-row", { hasText: "Sprint Copy" })).toHaveCount(0)
  // 22/3/10 no longer matches any preset, so the picker reports Custom.
  await expect(page.getByLabel("Focus rhythm preset")).toContainText("Custom")
})

test("a running or paused timer blocks preset application", async ({ page, isMobile }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Start" }).click()

  await page.goto("/settings")
  await expect(page.getByLabel("Focus rhythm preset")).toBeDisabled()
  await expect(page.getByText("Presets apply while the timer is stopped.", { exact: false })).toBeVisible()

  if (!isMobile) {
    // The header quick controls disable presets too while the timer runs.
    await page.getByRole("button", { name: "Timer", exact: true }).click()
    await expect(page.getByRole("button", { name: /Classic/ })).toBeDisabled()
    await expect(page.getByText("Reset or finish the timer to switch presets.")).toBeVisible()
    await page.getByRole("button", { name: "Timer", exact: true }).click()
  }

  await page.goto("/")
  await page.getByRole("button", { name: "Pause" }).click()
  await page.getByRole("button", { name: "Reset timer" }).click()

  await page.goto("/settings")
  await expect(page.getByLabel("Focus rhythm preset")).toBeEnabled()
})

test("quick controls apply presets on pages that host the timer", async ({ page, isMobile }) => {
  test.skip(isMobile, "Quick controls are hidden on narrow screens")
  await page.goto("/")

  await page.getByRole("button", { name: "Timer", exact: true }).click()
  await page.getByRole("button", { name: /Study Sprint/ }).click()
  await expect(page.locator(".duration-row", { hasText: "Focus" }).locator("b")).toHaveText("15 min")
  await expect(page.locator(".dashboard-ring-content time")).toHaveText("15:00")

  // Pages without a mounted timer say so instead of silently doing nothing.
  await page.goto("/rooms")
  await page.getByRole("button", { name: "Timer", exact: true }).click()
  await expect(page.getByRole("button", { name: /Classic/ })).toBeDisabled()
  await expect(page.getByText("Open the dashboard, tasks, or settings page to apply a preset.")).toBeVisible()
})

test("signed-in presets sync, dedupe names, and survive reload", async ({ page }) => {
  const consoleErrors = watchConsole(page)
  const account = await seedVerifiedUser()
  await signIn(page, account)

  await page.goto("/settings")
  await applyPresetFromSettings(page, /Deep Work/)
  await expect(page.getByText("Deep Work applied.")).toBeVisible()

  await page.getByLabel("New preset name").fill("Evening")
  await page.getByRole("button", { name: "Save preset" }).click()
  await expect(page.locator(".preset-row", { hasText: "Evening" })).toContainText("50 · 10 · 30")

  await page.getByLabel("New preset name").fill("evening")
  await page.getByRole("button", { name: "Save preset" }).click()
  await expect(page.getByText("You already have a preset with that name.")).toBeVisible()

  await page.reload()
  await expect(page.locator(".preset-row", { hasText: "Evening" })).toContainText("50 · 10 · 30")
  await expect(page.locator(".settings-card label", { hasText: "Focus minutes" }).getByRole("spinbutton")).toHaveValue("50")

  expect(consoleErrors).toEqual([])
})
