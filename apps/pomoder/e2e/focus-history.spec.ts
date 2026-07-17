import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import argon2 from "argon2"
import { Client } from "pg"

function watchConsole(page: Page) {
  const errors: string[] = []
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()) })
  return errors
}

function utcDate(daysAgo: number) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

// A verified UTC user with two active days of history: two sessions on a
// task, one without a task, plus a cancelled session and a completed break
// that reports must never count.
async function seedHistoryUser() {
  const email = `history-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`
  const password = "history-pass-1234"
  const client = new Client({ connectionString: process.env.POMODER_DATABASE_URL || `postgresql://postgres:localdev@localhost:${process.env.POMODER_POSTGRES_PORT || "54326"}/pomoder` })
  await client.connect()
  try {
    const passwordHash = await argon2.hash(password)
    const inserted = await client.query<{ id: string }>(
      "insert into users (email, name, password_hash, email_verified_at, timezone) values ($1, 'Historian', $2, now(), 'UTC') returning id",
      [email, passwordHash]
    )
    const userId = inserted.rows[0].id
    await client.query("insert into user_preferences (user_id) values ($1)", [userId])
    const task = await client.query<{ id: string }>(
      "insert into tasks (user_id, title, planned_date, status) values ($1, 'Write history tests', $2, 'active') returning id",
      [userId, utcDate(0)]
    )
    const taskId = task.rows[0].id
    const yesterday = `${utcDate(1)}T10:00:00Z`
    const today = `${utcDate(0)}T08:00:00Z`
    await client.query(
      `insert into focus_sessions (user_id, task_id, mode, status, planned_seconds, accumulated_seconds, completed_at, idempotency_key) values
       ($1, $2, 'focus', 'completed', 1500, 1500, $3, 'e2e-y-task'),
       ($1, null, 'focus', 'completed', 1500, 1200, $4, 'e2e-y-free'),
       ($1, $2, 'focus', 'completed', 1500, 1500, $5, 'e2e-t-task'),
       ($1, $2, 'focus', 'cancelled', 1500, 300, null, 'e2e-cancelled'),
       ($1, null, 'short', 'completed', 300, 300, $5, 'e2e-break')`,
      [userId, taskId, yesterday, `${utcDate(1)}T11:00:00Z`, today]
    )
    await client.query(
      `insert into daily_focus_stats (user_id, local_date, focus_sessions, focus_seconds, tasks_completed) values
       ($1, $2, 2, 2700, 1), ($1, $3, 1, 1500, 0)`,
      [userId, utcDate(1), utcDate(0)]
    )
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
  // The login page resolves its client-side navigation after the URL flips;
  // navigating away before the dashboard renders interrupts that commit.
  await expect(page.locator(".dashboard-ring")).toBeVisible()
}

test("guests get an honest sign-in prompt instead of fabricated history", async ({ page }) => {
  const consoleErrors = watchConsole(page)
  await page.goto("/history")

  await expect(page.getByRole("heading", { name: "Sign in to see your history" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible()
  await expect(page.locator(".reference-stat-grid")).toHaveCount(0)

  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
  expect(consoleErrors).toEqual([])
})

test("signed-in history reports completed focus only, across ranges", async ({ page }) => {
  const consoleErrors = watchConsole(page)
  const account = await seedHistoryUser()
  await signIn(page, account)
  await page.goto("/history")

  // 3 completed focus sessions, 70 minutes — the cancelled session and the
  // completed break are excluded everywhere.
  await expect(page.locator(".reference-stat-grid article", { hasText: "Focus time" })).toContainText("1h 10m")
  await expect(page.locator(".reference-stat-grid article", { hasText: "Focus sessions" })).toContainText("3")
  await expect(page.locator(".reference-stat-grid article", { hasText: "Active days" })).toContainText("2")
  await expect(page.locator(".history-sessions header")).toContainText("3 in range")
  await expect(page.locator(".history-sessions tbody tr")).toHaveCount(3)

  // Task attribution with a neutral bucket for sessions without a task.
  const topTasks = page.locator(".history-top-tasks li")
  await expect(topTasks.first()).toContainText("Write history tests")
  await expect(topTasks.first()).toContainText("2 sessions")
  await expect(topTasks.nth(1)).toContainText("No task")

  await expect(page.locator(".history-heatmap-card")).toBeVisible()
  await expect(page.locator(".heatmap-grid .heatmap-cell.level-4")).toHaveCount(1)

  await page.getByRole("tab", { name: "30 days" }).click()
  await expect(page.locator(".reference-stat-grid article", { hasText: "Focus time" })).toContainText("1h 10m")

  // Long-range reports are gated for free accounts, without fabricated data.
  await page.getByRole("tab", { name: "12 months" }).click()
  await expect(page.getByRole("heading", { name: "Long-range reports are part of Pomoder Pro" })).toBeVisible()
  await expect(page.getByRole("link", { name: "See Pro plans" })).toBeVisible()
  await expect(page.locator(".reference-stat-grid")).toHaveCount(0)
  await page.getByRole("button", { name: "Back to 30 days" }).click()
  await expect(page.locator(".history-sessions tbody tr")).toHaveCount(3)

  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
  expect(consoleErrors).toEqual([])
})

test("the CSV export matches the visible report and is spreadsheet-safe", async ({ page, isMobile }) => {
  test.skip(isMobile, "Downloads are asserted on the desktop project")
  const account = await seedHistoryUser()
  await signIn(page, account)
  await page.goto("/history")
  await expect(page.locator(".history-sessions tbody tr")).toHaveCount(3)

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export CSV" }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^pomoder-focus-7d-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/)

  const file = await download.path()
  const { readFile } = await import("node:fs/promises")
  const csv = await readFile(file, "utf8")
  const lines = csv.trim().split("\r\n")
  expect(lines[0]).toBe("Date,Completed at,Task,Planned minutes,Focused minutes")
  expect(lines).toHaveLength(4)
  expect(csv).toContain("Write history tests")
  expect(csv).toContain("No task")
})
