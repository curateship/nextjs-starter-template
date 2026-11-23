import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test, type Locator, type Page } from "@playwright/test"
import argon2 from "argon2"
import { Client } from "pg"

// The acceptance path for profile pictures: one account uploads a picture, a
// second account sees it in a room and on the leaderboard, removing it brings
// the coloured initial back, and a moderator can take a picture down.

test.describe.configure({ mode: "serial" })

const avatarFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "avatar.png")

async function connectDb() {
  const client = new Client({ connectionString: process.env.POMODER_DATABASE_URL || `postgresql://postgres:localdev@localhost:${process.env.POMODER_POSTGRES_PORT || "54326"}/pomoder` })
  await client.connect()
  return client
}

async function seedUser(name: string, options: { pro?: boolean; admin?: boolean; displayName?: string; focusSeconds?: number } = {}) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const email = `avatar-${name.toLowerCase()}-${suffix}@example.com`
  const password = "focus-avatar-pass-1234"
  const client = await connectDb()
  let id = ""
  try {
    const inserted = await client.query<{ id: string }>(
      "insert into users (email, name, password_hash, email_verified_at, role, public_display_name, leaderboard_opt_in) values ($1, $2, $3, now(), $4, $5, $6) returning id",
      [email, name, await argon2.hash(password), options.admin ? "admin" : "user", options.displayName ?? null, Boolean(options.displayName)]
    )
    id = inserted.rows[0].id
    await client.query("insert into user_preferences (user_id) values ($1)", [id])
    if (options.pro)
      await client.query(
        "insert into subscriptions (user_id, stripe_customer_id, status, current_period_end) values ($1, $2, 'active', now() + interval '30 days')",
        [id, `cus_avatar_${suffix}`]
      )
    if (options.focusSeconds)
      await client.query(
        "insert into daily_focus_stats (user_id, local_date, focus_seconds, focus_sessions) values ($1, current_date, $2, 4)",
        [id, options.focusSeconds]
      )
  } finally {
    await client.end()
  }
  return { id, email, password, displayName: options.displayName ?? name }
}

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(account.email)
  await page.getByLabel("Password").fill(account.password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/$/)
}

// A picture is an <img> inside the circle; the fallback is the initial as text.
const picture = (avatar: Locator) => avatar.locator("img")
const initial = (avatar: Locator) => avatar.locator("b")

test("a picture follows someone into rooms and the leaderboard, and removing it restores the initial", async ({ page: hostPage, browser }) => {
  test.setTimeout(180_000)
  const host = await seedUser("Hosting", { pro: true, displayName: "Hosting Human", focusSeconds: 7_200 })
  const member = await seedUser("Member")
  const memberContext = await browser.newContext()
  const memberPage = await memberContext.newPage()

  await login(hostPage, host)
  await login(memberPage, member)

  // Settings starts on the coloured initial, then takes the upload.
  await hostPage.goto("/settings")
  const settingsAvatar = hostPage.locator(".avatar-setting-preview")
  await expect(initial(settingsAvatar)).toHaveText("HH")
  await hostPage.locator(".avatar-setting-actions input[type=file]").setInputFiles(avatarFile)
  await expect(hostPage.getByText("Profile picture updated.")).toBeVisible()
  await expect(picture(settingsAvatar)).toBeVisible()
  const pictureUrl = await picture(settingsAvatar).getAttribute("src")
  expect(pictureUrl).toMatch(/^\/api\/avatars\/[0-9a-f-]{36}\/file$/)

  // It survives a reload, so it is stored rather than held in the page.
  await hostPage.reload()
  await expect(picture(hostPage.locator(".avatar-setting-preview"))).toHaveAttribute("src", pictureUrl!)

  // The second account sees it in the room member list and on a chat message.
  await hostPage.goto("/rooms")
  await hostPage.getByRole("button", { name: "Host a room" }).click()
  await hostPage.getByLabel("Room name").fill("Avatar Room")
  await hostPage.getByRole("button", { name: "Create room" }).click()
  const hostPanel = hostPage.locator(".active-room-card")
  await expect(hostPanel.getByRole("heading", { name: "Avatar Room" })).toBeVisible()
  const inviteUrl = (await hostPanel.locator(".active-room-invite code").textContent()) ?? ""

  await memberPage.goto(inviteUrl)
  await memberPage.getByRole("button", { name: "Join room" }).click()
  await expect(memberPage).toHaveURL(/\/rooms$/)
  const memberPanel = memberPage.locator(".active-room-card")
  const hostRow = memberPanel.locator(".active-room-members li", { hasText: "Hosting Human" })
  await expect(picture(hostRow)).toHaveAttribute("src", pictureUrl!)
  // The member has no picture of their own, so they stay an initial.
  await expect(initial(memberPanel.locator(".active-room-members li", { hasText: "Member" }))).toHaveText("M")

  await hostPanel.getByLabel("Room message").fill("Morning all")
  await hostPanel.getByRole("button", { name: "Send message" }).click()
  const chatLine = memberPanel.locator(".chat-message", { hasText: "Morning all" })
  await expect(picture(chatLine)).toHaveAttribute("src", pictureUrl!)

  // And on the leaderboard, which the second account reads for itself.
  await memberPage.goto("/leaderboard")
  const leaderRow = memberPage.locator(".reference-ranking article", { hasText: "Hosting Human" })
  await expect(picture(leaderRow)).toHaveAttribute("src", pictureUrl!)

  // Removing the picture brings the initial back everywhere.
  await hostPage.goto("/settings")
  await hostPage.getByRole("button", { name: "Remove" }).click()
  await expect(hostPage.getByText("Profile picture removed.")).toBeVisible()
  await expect(initial(hostPage.locator(".avatar-setting-preview"))).toHaveText("HH")

  await memberPage.reload()
  await expect(initial(memberPage.locator(".reference-ranking article", { hasText: "Hosting Human" }))).toHaveText("HH")
  await memberPage.goto("/rooms")
  await expect(initial(memberPage.locator(".active-room-members li", { hasText: "Hosting Human" }))).toHaveText("HH")

  await memberContext.close()
})

test("a moderator removes an unwanted picture from the media tools", async ({ page }) => {
  const owner = await seedUser("Moderated", { displayName: "Moderated Member", focusSeconds: 3_600 })
  const moderator = await seedUser("Moderator", { admin: true })

  await login(page, owner)
  await page.goto("/settings")
  await page.locator(".avatar-setting-actions input[type=file]").setInputFiles(avatarFile)
  await expect(page.getByText("Profile picture updated.")).toBeVisible()
  const pictureUrl = await picture(page.locator(".avatar-setting-preview")).getAttribute("src")

  // The moderator finds it in the media table, sees the picture itself, and
  // deletes it with the row's own control.
  const moderatorContext = await page.context().browser()!.newContext()
  const moderatorPage = await moderatorContext.newPage()
  await login(moderatorPage, moderator)
  await moderatorPage.goto("/admin/pomoder/media")
  const mediaRow = moderatorPage.locator("tr", { hasText: owner.email })
  await expect(mediaRow).toContainText("Profile avatar")
  await expect(mediaRow).toContainText("profile picture")
  await expect(mediaRow.locator("img")).toHaveAttribute("src", pictureUrl!)
  await mediaRow.getByRole("button", { name: "Delete record" }).click()
  await moderatorPage.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(moderatorPage.locator("tr", { hasText: owner.email })).toHaveCount(0)

  // The owner falls back to their initial instead of a broken picture.
  await page.reload()
  await expect(initial(page.locator(".avatar-setting-preview"))).toHaveText("MM")
  expect((await page.request.get(pictureUrl!)).status()).toBe(404)

  await moderatorContext.close()
})
