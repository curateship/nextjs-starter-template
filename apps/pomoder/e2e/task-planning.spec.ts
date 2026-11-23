import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import argon2 from "argon2"
import { Client } from "pg"

const titlesIn = (page: Page) => page.locator(".today-tasks-card .today-task-row .task-focus-choice > span").allTextContents()

function watchConsole(page: Page) {
  const errors: string[] = []
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()) })
  return errors
}

// The keyboard sensor measures between key events, so give it a beat per step.
async function keyboardReorder(page: Page, handleName: string, key: "ArrowDown" | "ArrowUp") {
  const handle = page.getByRole("button", { name: handleName })
  await handle.scrollIntoViewIfNeeded()
  await handle.focus()
  await page.keyboard.press("Space")
  await page.waitForTimeout(350)
  await page.keyboard.press(key)
  await page.waitForTimeout(350)
  await page.keyboard.press("Space")
  await page.waitForTimeout(350)
}

test("guest can edit a task's title, priority, and estimate inline", async ({ page }) => {
  const consoleErrors = watchConsole(page)
  await page.goto("/tasks")

  await page.getByRole("button", { name: "Edit Review pull request #142" }).click()
  await page.getByLabel("Title for Review pull request #142").fill("Review the release PR")
  await page.getByLabel("Priority for Review pull request #142").click()
  await page.getByRole("option", { name: "High" }).click()
  await page.getByLabel("Estimated pomodoros for Review pull request #142").fill("3")
  await page.getByRole("button", { name: "Save changes to Review pull request #142" }).click()

  const row = page.locator(".today-task-row", { hasText: "Review the release PR" })
  await expect(row).toContainText("High")
  await expect(row).toContainText("0/3 pomos")

  await page.reload()
  await expect(page.locator(".today-task-row", { hasText: "Review the release PR" })).toContainText("0/3 pomos")

  await page.goto("/")
  await expect(page.locator(".dashboard-task", { hasText: "Review the release PR" })).toContainText("0/3 pomos")
  expect(consoleErrors).toEqual([])
})

test("estimates outside 1-20 cannot be saved", async ({ page }) => {
  await page.goto("/tasks")
  await page.getByRole("button", { name: "Edit Review pull request #142" }).click()
  const estimate = page.getByLabel("Estimated pomodoros for Review pull request #142")
  await estimate.fill("25")
  await expect(estimate).toHaveAttribute("aria-invalid", "true")
  await expect(page.getByRole("button", { name: "Save changes to Review pull request #142" })).toBeDisabled()
  await estimate.fill("2")
  await expect(page.getByRole("button", { name: "Save changes to Review pull request #142" })).toBeEnabled()
})

test("keyboard users can reorder today's tasks and the order persists", async ({ page }) => {
  const consoleErrors = watchConsole(page)
  await page.goto("/tasks")
  expect(await titlesIn(page)).toEqual(["Review pull request #142", "Prep notes for the 6pm group sprint", "Draft the essay introduction"])

  await keyboardReorder(page, "Reorder Review pull request #142", "ArrowDown")

  await expect.poll(() => titlesIn(page)).toEqual(["Prep notes for the 6pm group sprint", "Review pull request #142", "Draft the essay introduction"])
  await page.reload()
  await expect.poll(() => titlesIn(page)).toEqual(["Prep notes for the 6pm group sprint", "Review pull request #142", "Draft the essay introduction"])

  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
  expect(consoleErrors).toEqual([])
})

test("pointer users can drag today's tasks into a new order", async ({ page, isMobile }) => {
  test.skip(isMobile, "Touch reordering uses a long-press; covered by keyboard path on mobile")
  await page.goto("/tasks")

  const source = page.getByRole("button", { name: "Reorder Review pull request #142" })
  const target = page.getByRole("button", { name: "Reorder Prep notes for the 6pm group sprint" })
  await source.scrollIntoViewIfNeeded()
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  if (!sourceBox || !targetBox) throw new Error("Drag handles are not visible")

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2 + 10, { steps: 3 })
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2 + 12, { steps: 8 })
  await page.mouse.up()

  await expect.poll(() => titlesIn(page)).toEqual(["Prep notes for the 6pm group sprint", "Review pull request #142", "Draft the essay introduction"])
})

test("completing a task moves it below the active plan", async ({ page }) => {
  await page.goto("/tasks")
  await page.getByRole("button", { name: "Complete Review pull request #142" }).click()
  await expect.poll(() => titlesIn(page)).toEqual(["Prep notes for the 6pm group sprint", "Review pull request #142", "Draft the essay introduction"])
  await expect(page.getByRole("button", { name: "Reopen Review pull request #142" })).toBeVisible()

  await page.getByRole("button", { name: "Reopen Review pull request #142" }).click()
  await expect(page.getByRole("button", { name: "Complete Review pull request #142" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Reorder Review pull request #142" })).toBeVisible()
})

test("signed-in planning syncs, survives reload, and rolls back failed changes", async ({ page, context }) => {
  const account = await seedVerifiedUser()
  await page.goto("/login")
  await page.getByLabel("Email").fill(account.email)
  await page.getByLabel("Password").fill(account.password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/$/)

  await page.goto("/tasks")
  // The empty state only renders once the server task list has replaced the
  // local demo tasks; typing earlier would race that first sync.
  await expect(page.getByText("No active tasks. Add one below to choose your next focus.")).toBeVisible()
  await page.getByLabel("New task").fill("Write the launch notes")
  await page.getByLabel("New task").press("Enter")
  await page.getByLabel("New task").fill("Prepare the demo")
  await page.getByLabel("New task").press("Enter")
  await expect.poll(() => titlesIn(page)).toEqual(["Write the launch notes", "Prepare the demo"])

  await page.getByRole("button", { name: "Edit Write the launch notes" }).click()
  await page.getByLabel("Priority for Write the launch notes").click()
  await page.getByRole("option", { name: "High" }).click()
  await page.getByLabel("Estimated pomodoros for Write the launch notes").fill("4")
  await page.getByRole("button", { name: "Save changes to Write the launch notes" }).click()
  await expect(page.locator(".today-task-row", { hasText: "Write the launch notes" })).toContainText("0/4 pomos")

  await keyboardReorder(page, "Reorder Write the launch notes", "ArrowDown")
  await expect.poll(() => titlesIn(page)).toEqual(["Prepare the demo", "Write the launch notes"])

  // Server-persisted plan: order, priority, and estimate survive a full reload.
  await page.reload()
  await expect.poll(() => titlesIn(page)).toEqual(["Prepare the demo", "Write the launch notes"])
  await expect(page.locator(".today-task-row", { hasText: "Write the launch notes" })).toContainText("High")

  // Failed mutations roll the optimistic change back and surface an error.
  await context.setOffline(true)
  await page.getByRole("button", { name: "Edit Prepare the demo" }).click()
  await page.getByLabel("Title for Prepare the demo").fill("Prepare the big demo")
  await page.getByRole("button", { name: "Save changes to Prepare the demo" }).click()
  await expect(page.getByText("The task could not be updated.")).toBeVisible()
  await expect.poll(() => titlesIn(page)).toEqual(["Prepare the demo", "Write the launch notes"])

  await keyboardReorder(page, "Reorder Write the launch notes", "ArrowUp")
  await expect(page.getByText("The new task order could not be saved.")).toBeVisible()
  await expect.poll(() => titlesIn(page)).toEqual(["Prepare the demo", "Write the launch notes"])
  await context.setOffline(false)
})

async function seedVerifiedUser() {
  const email = `planner-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`
  const password = "planning-pass-1234"
  const client = new Client({ connectionString: process.env.POMODER_DATABASE_URL || `postgresql://postgres:localdev@localhost:${process.env.POMODER_POSTGRES_PORT || "54326"}/pomoder` })
  await client.connect()
  try {
    const passwordHash = await argon2.hash(password)
    const inserted = await client.query<{ id: string }>(
      "insert into users (email, name, password_hash, email_verified_at) values ($1, 'Planner', $2, now()) returning id",
      [email, passwordHash]
    )
    await client.query("insert into user_preferences (user_id) values ($1)", [inserted.rows[0].id])
  } finally {
    await client.end()
  }
  return { email, password }
}
