import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { listAdminBoard, setBoardHidden } from "@/server/pomodoro/admin-leaderboard"
import { readLeaderboardRows, readYourPlace } from "@/server/pomodoro/leaderboard"
import {
  dailyFocusStats,
  pomodoroAuditLogs,
  pomodoroGroupMembers,
  pomodoroGroups,
  pomodoroProfiles,
} from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/** Taking somebody off the leaderboard, against a real database. */

let client: PGlite
let db: CustomShellDb
const NOW = new Date("2026-10-08T12:00:00Z")
const START = "2026-10-02"

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

async function ranked(name: string, days: { date: string; hours: number }[]) {
  const user = await insertUser(db, { name })
  await db.insert(pomodoroProfiles).values({ userId: user.id, leaderboardOptIn: true, publicDisplayName: name })
  for (const day of days)
    await db.insert(dailyFocusStats).values({
      userId: user.id,
      localDate: day.date,
      focusSessions: day.hours * 2,
      focusSeconds: day.hours * 3_600,
    })
  return user.id
}

describe("taking somebody off the board", () => {
  it("keeps them off the global board and group boards until put back, and leaves their opt-in alone", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const cheat = await ranked("Cheat", [{ date: "2026-10-05", hours: 23 }])
    const honest = await ranked("Honest", [{ date: "2026-10-05", hours: 3 }])
    const [group] = await db
      .insert(pomodoroGroups)
      .values({ ownerUserId: honest, name: "Friends", joinToken: "token-friends" })
      .returning({ id: pomodoroGroups.id })
    await db.insert(pomodoroGroupMembers).values([
      { groupId: group.id, userId: honest },
      { groupId: group.id, userId: cheat },
    ])

    expect(await setBoardHidden({ userIds: [cheat], hidden: true, actorUserId: admin, now: NOW })).toEqual({
      changed: [cheat],
      skipped: [],
    })

    const names = async (rows: Promise<{ name: string | null }[]>) => (await rows).map((row) => row.name)
    expect(await names(readLeaderboardRows({ start: START, viewerUserId: honest }))).toEqual(["Honest"])
    expect(await names(readLeaderboardRows({ start: START, viewerUserId: honest, groupId: group.id }))).toEqual(["Honest"])
    expect(await readYourPlace({ start: START, viewerUserId: cheat })).toBeNull()
    const [profile] = await db.select().from(pomodoroProfiles).where(eq(pomodoroProfiles.userId, cheat))
    expect(profile.leaderboardOptIn).toBe(true)
    expect(profile.hiddenAt).toBeNull()

    // A second press over the same person changes nothing and logs nothing.
    expect(await setBoardHidden({ userIds: [cheat], hidden: true, actorUserId: admin })).toEqual({
      changed: [],
      skipped: [cheat],
    })

    await setBoardHidden({ userIds: [cheat], hidden: false, actorUserId: admin })
    expect(await names(readLeaderboardRows({ start: START, viewerUserId: honest }))).toEqual(["Cheat", "Honest"])
    expect((await db.select().from(pomodoroAuditLogs)).map((row) => row.action)).toEqual([
      "leaderboard_hide",
      "leaderboard_show",
    ])
  })
})

describe("the admin's copy of the board", () => {
  it("ranks as members see it, with ids, places and the days they focused", async () => {
    const top = await ranked("Top", [
      { date: "2026-10-05", hours: 20 },
      { date: "2026-10-06", hours: 22 },
    ])
    const second = await ranked("Second", [{ date: "2026-10-06", hours: 4 }])
    // Before the week's first day, so it counts for nothing.
    await ranked("Old", [{ date: "2026-09-01", hours: 50 }])

    const board = await listAdminBoard({ window: "week", page: 1, pageSize: 25, now: NOW })
    expect(board.start).toBe(START)
    expect(board.rows.slice(0, 2)).toMatchObject([
      { userId: top, place: 1, focusSeconds: 42 * 3_600, focusDays: 2 },
      { userId: second, place: 2, focusSeconds: 4 * 3_600, focusDays: 1 },
    ])
    expect(board.rows[2]).toMatchObject({ name: "Old", focusSeconds: 0, focusDays: 0 })
  })
})
