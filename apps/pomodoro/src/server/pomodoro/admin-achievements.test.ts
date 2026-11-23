import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { listAdminAchievements, revokeAchievements } from "@/server/pomodoro/admin-achievements"
import { awardAchievements, loadAchievementState } from "@/server/pomodoro/achievements"
import { pomodoroAchievements, pomodoroAuditLogs, pomodoroProfiles } from "@/server/pomodoro/schema"
import { customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/** Revoking a badge, against a real database. */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

const COUNTERS = { focusSessions: 1, focusSeconds: 1_500, tasksCompleted: 0, roomsHosted: 0, bestStreak: 1 }

describe("revoking a badge", () => {
  it("takes it off the member's badges and pins, and the next focus does not hand it back", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const member = (await insertUser(db)).id
    await db.insert(pomodoroProfiles).values({ userId: member, pinnedBadges: ["first-focus"] })
    await awardAchievements(member, COUNTERS)
    const noticesBefore = await db.select().from(customShellNotifications)
    const [earned] = await db.select().from(pomodoroAchievements).where(eq(pomodoroAchievements.badgeId, "first-focus"))

    expect(await revokeAchievements({ ids: [earned.id], actorUserId: admin })).toEqual({
      changed: [earned.id],
      skipped: [],
    })

    const [profile] = await db.select().from(pomodoroProfiles).where(eq(pomodoroProfiles.userId, member))
    expect(profile.pinnedBadges).toEqual([])
    const state = await loadAchievementState(member, "2026-10-08")
    expect(state.earned.map((row) => row.badgeId)).not.toContain("first-focus")

    // The counters still qualify. The row on record keeps the badge away, and
    // no "you earned" notice goes out for it.
    expect(await awardAchievements(member, COUNTERS)).toEqual([])
    expect(await db.select().from(customShellNotifications)).toHaveLength(noticesBefore.length)

    expect(await db.select().from(pomodoroAuditLogs)).toMatchObject([
      { actorUserId: admin, action: "revoke", resource: "achievements", recordIds: [earned.id] },
    ])
    expect(await revokeAchievements({ ids: [earned.id], actorUserId: admin })).toEqual({
      changed: [],
      skipped: [earned.id],
    })
    expect(await db.select().from(pomodoroAuditLogs)).toHaveLength(1)
  })

  it("leaves revoked badges out of the admin list and filters by badge", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const member = (await insertUser(db)).id
    await db.insert(pomodoroAchievements).values([
      { userId: member, badgeId: "first-focus" },
      { userId: member, badgeId: "ten-sessions" },
    ])
    const page = { search: "", sort: "earned" as const, direction: "desc" as const, page: 1, pageSize: 25 }
    const [ten] = (await listAdminAchievements({ ...page, badgeId: "ten-sessions" })).rows
    expect(ten.badgeId).toBe("ten-sessions")
    await revokeAchievements({ ids: [ten.id], actorUserId: admin })
    const left = await listAdminAchievements(page)
    expect(left.rows.map((row) => row.badgeId)).toEqual(["first-focus"])
    expect(left.total).toBe(1)
  })
})
