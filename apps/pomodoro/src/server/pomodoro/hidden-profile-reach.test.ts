import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { hideProfilesByAdmin } from "@/server/pomodoro/admin-members"
import { forgetHiddenProfiles } from "@/server/pomodoro/profile-reports"
import { forgetPublicProfile } from "@/server/pomodoro/public-profile"
import { pomodoroProfiles } from "@/server/pomodoro/schema"
import { readCachedShareCard, renderShareCard } from "@/server/pomodoro/share-card"
import {
  enableStreakBadge,
  readCachedBadge,
  readStreakBadge,
  writeCachedBadge,
} from "@/server/pomodoro/streak-badge"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * A profile that is hidden or switched off stops showing everywhere outside
 * the app at once: the streak badge on somebody's blog and the share picture
 * a chat app previews, not only the page itself.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

async function member(handle: string) {
  const user = await insertUser(db, { name: handle })
  await db.insert(pomodoroProfiles).values({
    userId: user.id,
    handle,
    publicDisplayName: handle,
    profilePublic: true,
  })
  return user.id
}

describe("a hidden profile's streak badge", () => {
  it("answers like a revoked badge once an admin hides the profile", async () => {
    const owner = await member("rude-name")
    const token = (await enableStreakBadge(owner))!
    expect(await readStreakBadge(token)).toMatchObject({ displayName: "rude-name" })

    await db
      .update(pomodoroProfiles)
      .set({ hiddenAt: new Date() })
      .where(eq(pomodoroProfiles.userId, owner))

    expect(await readStreakBadge(token)).toBeNull()
  })

  it("drops the held badge and share picture the moment the hide lands", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const owner = await member("held")
    const token = (await enableStreakBadge(owner))!
    writeCachedBadge(token, owner, "<svg/>")
    expect(await renderShareCard("held")).not.toBeNull()
    expect(readCachedShareCard("held")).not.toBeNull()

    const { profiles } = await hideProfilesByAdmin({ userIds: [owner], actorUserId: admin })
    forgetHiddenProfiles(profiles)

    expect(readCachedBadge(token)).toBeNull()
    expect(readCachedShareCard("held")).toBeNull()
    expect(await renderShareCard("held")).toBeNull()
  })
})

describe("a switched-off profile's share picture", () => {
  it("goes with the profile's held page", async () => {
    await member("quiet")
    expect(await renderShareCard("quiet")).not.toBeNull()
    expect(readCachedShareCard("quiet")).not.toBeNull()

    forgetPublicProfile("quiet")

    expect(readCachedShareCard("quiet")).toBeNull()
  })
})
