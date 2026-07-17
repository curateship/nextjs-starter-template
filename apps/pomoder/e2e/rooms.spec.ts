import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import argon2 from "argon2"
import { Client } from "pg"

test.describe.configure({ mode: "serial" })

async function seedRoomUser(name: string, options: { pro?: boolean } = {}) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const email = `room-${name.toLowerCase()}-${suffix}@example.com`
  const password = "focus-room-pass-1234"
  const client = new Client({ connectionString: process.env.POMODER_DATABASE_URL || `postgresql://postgres:localdev@localhost:${process.env.POMODER_POSTGRES_PORT || "54326"}/pomoder` })
  await client.connect()
  try {
    const passwordHash = await argon2.hash(password)
    const inserted = await client.query<{ id: string }>(
      "insert into users (email, name, password_hash, email_verified_at) values ($1, $2, $3, now()) returning id",
      [email, name, passwordHash]
    )
    await client.query("insert into user_preferences (user_id) values ($1)", [inserted.rows[0].id])
    if (options.pro) {
      await client.query(
        "insert into subscriptions (user_id, stripe_customer_id, status, current_period_end) values ($1, $2, 'active', now() + interval '30 days')",
        [inserted.rows[0].id, `cus_e2e_${suffix}`]
      )
    }
  } finally {
    await client.end()
  }
  return { email, password }
}

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(account.email)
  await page.getByLabel("Password").fill(account.password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/$/)
}

test("host runs a full room session while a member follows along live", async ({ page: hostPage, browser }) => {
  test.setTimeout(180_000)
  const host = await seedRoomUser("Hosting", { pro: true })
  const member = await seedRoomUser("Member")
  const memberContext = await browser.newContext()
  const memberPage = await memberContext.newPage()
  hostPage.on("dialog", (dialog) => void dialog.accept())

  await login(hostPage, host)
  await login(memberPage, member)

  // Host creates an unlisted room with explicit timer settings.
  await hostPage.goto("/rooms")
  await hostPage.getByRole("button", { name: "Host a room" }).click()
  await hostPage.getByLabel("Room name").fill("E2E Focus Room")
  await hostPage.getByLabel("Visibility").click()
  await hostPage.getByRole("option", { name: "Unlisted — invite link only" }).click()
  await hostPage.getByLabel("Focus minutes").fill("25")
  await hostPage.getByLabel("Short break").fill("5")
  await hostPage.getByLabel("Long break").fill("15")
  await hostPage.getByRole("button", { name: "Create room" }).click()

  const hostPanel = hostPage.locator(".active-room-card")
  await expect(hostPanel.getByRole("heading", { name: "E2E Focus Room" })).toBeVisible()
  await expect(hostPanel).toContainText("Waiting to start")
  await expect(hostPanel).toContainText("1 person in the room")

  // The invite link is visible for manual copying; use it for direct entry.
  const inviteUrl = (await hostPanel.locator(".active-room-invite code").textContent()) ?? ""
  expect(inviteUrl).toMatch(/\/rooms\/[A-Za-z0-9_-]{12,}$/)

  // An unlisted room never shows up in the public browse groups.
  await expect(hostPage.locator(".reference-room-card", { hasText: "E2E Focus Room" })).toHaveCount(0)

  // The member joins through the invite page.
  await memberPage.goto(inviteUrl)
  await expect(memberPage.getByText("You’re invited")).toBeVisible()
  await memberPage.getByRole("button", { name: "Join room" }).click()
  await expect(memberPage).toHaveURL(/\/rooms$/)
  const memberPanel = memberPage.locator(".active-room-card")
  await expect(memberPanel.getByRole("heading", { name: "E2E Focus Room" })).toBeVisible()
  await expect(memberPanel).toContainText("2 people in the room")
  await expect(hostPanel).toContainText("2 people in the room")
  await expect(hostPanel).toContainText("Member")
  await expect(memberPanel).toContainText("HOST")

  // Members never see host controls; they get a leave control instead.
  await expect(memberPanel.getByRole("button", { name: "Start focus" })).toHaveCount(0)
  await expect(memberPanel.getByRole("button", { name: "Close room" })).toHaveCount(0)
  await expect(memberPanel.getByRole("button", { name: "Leave room" })).toBeVisible()

  // Chat reaches everyone.
  await memberPanel.getByLabel("Room message").fill("Let's go!")
  await memberPanel.getByRole("button", { name: "Send message" }).click()
  await expect(hostPanel).toContainText("Let's go!")

  // Host starts focus; both sides see the phase and a server-derived countdown.
  await hostPanel.getByRole("button", { name: "Start focus" }).click()
  await expect(hostPanel).toContainText("Session 1 of 4")
  await expect(memberPanel.locator(".room-phase-chip")).toHaveText("Focus")
  await expect(memberPanel.locator(".room-countdown")).toHaveText(/^2[0-5]:\d\d$/)

  // The countdown recovers after a reload (fresh SSE connection).
  await memberPage.reload()
  await expect(memberPage.locator(".active-room-card .room-countdown")).toHaveText(/^2[0-5]:\d\d$/)

  // Leaving mid-focus works, and rejoining is locked until the break.
  await memberPage.locator(".active-room-card").getByRole("button", { name: "Leave room" }).click()
  await expect(memberPage.getByText("You left the room.")).toBeVisible()
  await expect(memberPage.locator(".active-room-card")).toHaveCount(0)
  await expect(hostPanel).toContainText("1 person in the room")
  await memberPage.goto(inviteUrl)
  await expect(memberPage.getByText("joins unlock at the next break")).toBeVisible()

  // Host starts the break; the invite unlocks and the member rejoins.
  await hostPanel.getByRole("button", { name: "Start break" }).click()
  await expect(hostPage.locator(".active-room-card .room-phase-chip")).toHaveText("Short break")
  await memberPage.getByRole("button", { name: "Check again" }).click()
  await memberPage.getByRole("button", { name: "Join room" }).click()
  await expect(memberPage).toHaveURL(/\/rooms$/)
  await expect(memberPage.locator(".active-room-card")).toContainText("Short break")

  // The room page passes an accessibility scan while a session is live.
  const results = await new AxeBuilder({ page: hostPage }).analyze()
  expect(results.violations).toEqual([])

  // Closing the room tells every member it ended.
  await hostPanel.getByRole("button", { name: "Close room" }).click()
  await expect(hostPage.getByText("You closed the room.")).toBeVisible()
  await expect(memberPage.getByText("This room has ended.")).toBeVisible()
  await expect(memberPage.locator(".active-room-card")).toHaveCount(0)

  // The closed invite link reports a distinct state.
  await memberPage.goto(inviteUrl)
  await expect(memberPage.getByText("This room has ended.")).toBeVisible()

  await memberContext.close()
})

test("invalid invite links get a distinct message", async ({ page }) => {
  await page.goto("/rooms/this-slug-does-not-exist-123")
  await expect(page.getByRole("heading", { name: "Invite not found" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Browse rooms" })).toBeVisible()
})
