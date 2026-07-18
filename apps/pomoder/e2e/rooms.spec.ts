import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import argon2 from "argon2"
import { Client } from "pg"

test.describe.configure({ mode: "serial" })

async function connectDb() {
  const client = new Client({ connectionString: process.env.POMODER_DATABASE_URL || `postgresql://postgres:localdev@localhost:${process.env.POMODER_POSTGRES_PORT || "54326"}/pomoder` })
  await client.connect()
  return client
}

async function seedRoomUser(name: string, options: { pro?: boolean; admin?: boolean } = {}) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const email = `room-${name.toLowerCase()}-${suffix}@example.com`
  const password = "focus-room-pass-1234"
  const client = await connectDb()
  let id = ""
  try {
    const passwordHash = await argon2.hash(password)
    const inserted = await client.query<{ id: string }>(
      "insert into users (email, name, password_hash, email_verified_at, role) values ($1, $2, $3, now(), $4) returning id",
      [email, name, passwordHash, options.admin ? "admin" : "user"]
    )
    id = inserted.rows[0].id
    await client.query("insert into user_preferences (user_id) values ($1)", [id])
    if (options.pro) {
      await client.query(
        "insert into subscriptions (user_id, stripe_customer_id, status, current_period_end) values ($1, $2, 'active', now() + interval '30 days')",
        [id, `cus_e2e_${suffix}`]
      )
    }
  } finally {
    await client.end()
  }
  return { id, email, password }
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

  // Reactions: the host reacts from the palette; the member sees the count live.
  const hostMessage = hostPanel.locator(".chat-message", { hasText: "Let's go!" })
  const memberMessage = memberPanel.locator(".chat-message", { hasText: "Let's go!" })
  await hostMessage.hover()
  await hostMessage.getByRole("button", { name: "Add reaction" }).click()
  await hostPage.getByRole("button", { name: "React with fire" }).click()
  await expect(hostMessage.locator(".chat-reaction")).toContainText("1")
  await expect(memberMessage.locator(".chat-reaction")).toContainText("1")

  // The member taps the same chip to add their own reaction; both counts rise.
  await memberMessage.locator(".chat-reaction").click()
  await expect(memberMessage.locator(".chat-reaction")).toContainText("2")
  await expect(hostMessage.locator(".chat-reaction")).toContainText("2")

  // Tapping again toggles the member's reaction off; the host's still remains.
  await memberMessage.locator(".chat-reaction").click()
  await expect(memberMessage.locator(".chat-reaction")).toContainText("1")
  await expect(hostMessage.locator(".chat-reaction")).toContainText("1")

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

  // Closing the room asks for confirmation, then tells every member it ended.
  await hostPanel.getByRole("button", { name: "Close room" }).click()
  await hostPage.getByRole("dialog").getByRole("button", { name: "Close room" }).click()
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

test("host moderates chat and members while reports stay private", async ({ page: hostPage, browser }) => {
  test.setTimeout(180_000)
  const host = await seedRoomUser("ModHost", { pro: true })
  const member = await seedRoomUser("ModMember")
  const reportReason = `Spamming the room ${Date.now()}`
  const memberContext = await browser.newContext()
  const memberPage = await memberContext.newPage()

  await login(hostPage, host)
  await login(memberPage, member)

  await hostPage.goto("/rooms")
  await hostPage.getByRole("button", { name: "Host a room" }).click()
  await hostPage.getByLabel("Room name").fill("Moderated Room")
  await hostPage.getByRole("button", { name: "Create room" }).click()
  const hostPanel = hostPage.locator(".active-room-card")
  await expect(hostPanel.getByRole("heading", { name: "Moderated Room" })).toBeVisible()
  const inviteUrl = (await hostPanel.locator(".active-room-invite code").textContent()) ?? ""

  await memberPage.goto(inviteUrl)
  await memberPage.getByRole("button", { name: "Join room" }).click()
  const memberPanel = memberPage.locator(".active-room-card")
  await expect(memberPanel.getByRole("heading", { name: "Moderated Room" })).toBeVisible()

  await hostPanel.getByLabel("Room message").fill("Welcome to focus club")
  await hostPanel.getByRole("button", { name: "Send message" }).click()
  await memberPanel.getByLabel("Room message").fill("Total spam content")
  await memberPanel.getByRole("button", { name: "Send message" }).click()
  await expect(hostPanel).toContainText("Total spam content")
  await expect(memberPanel).toContainText("Welcome to focus club")

  // Members can report other people's messages but never get host tools.
  await expect(memberPanel.getByRole("button", { name: "Report message from ModHost" })).toBeVisible()
  await expect(memberPanel.getByRole("button", { name: /Delete message/ })).toHaveCount(0)
  await expect(memberPanel.locator(".member-menu-trigger")).toHaveCount(0)

  // The member reports the host's message; the host page never shows it.
  await memberPanel.getByRole("button", { name: "Report message from ModHost" }).click()
  await memberPage.getByLabel("Reason").fill(reportReason)
  await memberPage.getByRole("button", { name: "Send report" }).click()
  await expect(memberPage.getByText("Report sent. A moderator will review it.")).toBeVisible()
  await expect(hostPage.getByText(reportReason)).toHaveCount(0)
  const db = await connectDb()
  try {
    const reports = await db.query("select status from room_reports where reason = $1", [reportReason])
    expect(reports.rows).toEqual([{ status: "pending" }])
  } finally {
    await db.end()
  }

  // The host deletes the spam message; both sides get a neutral tombstone.
  await hostPanel.getByRole("button", { name: "Delete message from ModMember" }).click()
  await hostPage.getByRole("dialog").getByRole("button", { name: "Delete message" }).click()
  await expect(hostPanel.getByText("Message removed by the host")).toBeVisible()
  await expect(memberPanel.getByText("Message removed by the host")).toBeVisible()
  await expect(memberPanel).not.toContainText("Total spam content")

  // Moderation affordances pass an accessibility scan.
  const results = await new AxeBuilder({ page: hostPage }).analyze()
  expect(results.violations).toEqual([])

  // Removal ejects the member, who may rejoin.
  await hostPanel.getByRole("button", { name: "Moderate ModMember" }).click()
  await hostPage.getByRole("menuitem", { name: "Remove from room" }).click()
  await hostPage.getByRole("dialog").getByRole("button", { name: "Remove member" }).click()
  await expect(hostPage.getByText("ModMember was removed from the room.")).toBeVisible()
  await expect(memberPage.getByText("You are no longer in this room.")).toBeVisible()
  await expect(memberPage.locator(".active-room-card")).toHaveCount(0)
  await memberPage.goto(inviteUrl)
  await memberPage.getByRole("button", { name: "Join room" }).click()
  await expect(memberPage.locator(".active-room-card")).toBeVisible()

  // A ban ejects the member and blocks the invite.
  await hostPanel.getByRole("button", { name: "Moderate ModMember" }).click()
  await hostPage.getByRole("menuitem", { name: "Ban from room" }).click()
  await hostPage.getByRole("dialog").getByRole("button", { name: "Ban member" }).click()
  await expect(hostPage.getByText("ModMember was banned from the room.")).toBeVisible()
  await expect(memberPage.getByText("You are no longer in this room.")).toBeVisible()
  await memberPage.goto(inviteUrl)
  await expect(memberPage.getByText("You can’t join this room.")).toBeVisible()

  await memberContext.close()
})

test("an administrator triages reports with sanitized context", async ({ page }) => {
  const suffix = Date.now()
  const admin = await seedRoomUser("ReviewAdmin", { admin: true })
  const roomHost = await seedRoomUser("ReviewedHost")
  const reporter = await seedRoomUser("Reporter")
  const reason = `Harassment in chat ${suffix}`

  const db = await connectDb()
  try {
    // Start from a clean queue so filters and pagination are deterministic.
    await db.query("delete from room_reports")
    const room = await db.query<{ id: string }>(
      "insert into rooms (host_user_id, slug, name) values ($1, $2, $3) returning id",
      [roomHost.id, `review-room-${suffix}`, "Review Room"]
    )
    const message = await db.query<{ id: string }>(
      "insert into room_messages (room_id, user_id, body) values ($1, $2, 'Rude message body') returning id",
      [room.rows[0].id, roomHost.id]
    )
    await db.query(
      "insert into room_reports (room_id, reporter_user_id, message_id, reason) values ($1, $2, $3, $4)",
      [room.rows[0].id, reporter.id, message.rows[0].id, reason]
    )
  } finally {
    await db.end()
  }

  await login(page, admin)
  await page.goto("/admin/pomoder/reports")
  const row = page.locator("tr", { hasText: reason })
  await expect(row).toContainText("Pending")
  await expect(row).toContainText("Rude message body")
  await expect(row).toContainText(reporter.email)

  await row.getByRole("button", { name: "Resolve" }).click()
  await expect(row).toContainText("Resolved")
  await expect(row).toContainText(admin.email)

  // The pending filter hides the resolved report.
  await page.getByLabel("Filter by status").click()
  await page.getByRole("option", { name: "Pending" }).click()
  await expect(page.locator("tr", { hasText: reason })).toHaveCount(0)
  await expect(page.getByText("No moderation reports found.")).toBeVisible()

  // Reopening from the resolved view returns it to the pending queue.
  await page.getByLabel("Filter by status").click()
  await page.getByRole("option", { name: "Resolved" }).click()
  await page.locator("tr", { hasText: reason }).getByRole("button", { name: "Reopen" }).click()
  await expect(page.locator("tr", { hasText: reason })).toHaveCount(0)
  await page.getByLabel("Filter by status").click()
  await page.getByRole("option", { name: "Pending" }).click()
  await expect(page.locator("tr", { hasText: reason })).toContainText("Pending")
})
