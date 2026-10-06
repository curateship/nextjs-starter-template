import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { loadAccountMenu } from "@/server/pomodoro/profile"
import { pomodoroProfiles } from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * The header's account menu, against a real database.
 *
 * The rule worth a test: "Your profile" is offered only when `/u/<handle>`
 * would really open, because a menu row leading to a 404 reads as broken.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

async function memberWithProfile(
  profile: Partial<typeof pomodoroProfiles.$inferInsert> | null
) {
  const user = await insertUser(db)
  if (profile) {
    await db.insert(pomodoroProfiles).values({ userId: user.id, ...profile })
  }
  return user.id
}

describe("loadAccountMenu", () => {
  it("offers the profile when the page is switched on", async () => {
    const userId = await memberWithProfile({
      handle: "sam",
      profilePublic: true,
    })
    expect((await loadAccountMenu(userId, db)).profileHandle).toBe("sam")
  })

  it("leaves the profile off with no profile row, no handle, the page off, or the page hidden", async () => {
    const cases = [
      null,
      { profilePublic: true },
      { handle: "off", profilePublic: false },
      { handle: "hidden", profilePublic: true, hiddenAt: new Date() },
    ]
    for (const profile of cases) {
      const userId = await memberWithProfile(profile)
      expect((await loadAccountMenu(userId, db)).profileHandle).toBeNull()
    }
  })

  it("reads a member with no plan as free and an admin as paid", async () => {
    const member = await insertUser(db)
    const admin = await insertUser(db, { role: "admin" })
    expect((await loadAccountMenu(member.id, db)).isPaid).toBe(false)
    expect((await loadAccountMenu(admin.id, db)).isPaid).toBe(true)
  })
})
