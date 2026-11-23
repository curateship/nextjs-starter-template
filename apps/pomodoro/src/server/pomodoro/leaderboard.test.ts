import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import {
  readLeaderboardRows,
  readYourPlace,
} from "@/server/pomodoro/leaderboard"
import {
  dailyFocusStats,
  pomodoroBlocks,
  pomodoroProfiles,
} from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * Your own row below the first hundred, against a real database: the place it
 * reports has to be the place the full board would have drawn.
 */

let client: PGlite
let db: CustomShellDb
const START = "2026-10-01"

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

/** A listed account with this many focus minutes this week. */
async function ranked(minutes: number, profile: Partial<typeof pomodoroProfiles.$inferInsert> = {}) {
  const user = await insertUser(db)
  await db.insert(pomodoroProfiles).values({
    userId: user.id,
    leaderboardOptIn: true,
    publicDisplayName: `Person ${minutes}`,
    ...profile,
  })
  if (minutes)
    await db.insert(dailyFocusStats).values({
      userId: user.id,
      localDate: "2026-10-05",
      focusSessions: Math.ceil(minutes / 25),
      focusSeconds: minutes * 60,
    })
  return user.id
}

describe("your place below the first hundred", () => {
  it("returns your real place when the board leaves you out", async () => {
    for (let index = 0; index < 102; index += 1) await ranked(500 - index)
    const you = await ranked(300)

    const board = await readLeaderboardRows({ start: START, viewerUserId: you })
    expect(board).toHaveLength(100)
    expect(board.some((row) => row.isYou)).toBe(false)

    const place = await readYourPlace({ start: START, viewerUserId: you })
    expect(place).toMatchObject({
      place: 103,
      isYou: true,
      name: "Person 300",
      focusSeconds: 300 * 60,
      focusSessions: 12,
    })
    expect(place).not.toHaveProperty("userId")
  })

  it("leaves out anyone blocked either way, as the board does", async () => {
    const first = await ranked(1000)
    for (let index = 0; index < 101; index += 1) await ranked(500 - index)
    const you = await ranked(300)
    await db
      .insert(pomodoroBlocks)
      .values({ blockerUserId: first, blockedUserId: you })

    const place = await readYourPlace({ start: START, viewerUserId: you })
    expect(place?.place).toBe(102)
  })

  it("orders equal times the same way on the board and in your place", async () => {
    const ids: string[] = []
    for (let index = 0; index < 101; index += 1) ids.push(await ranked(0))
    // All tied at nothing, so the order is by account: the last id is 101st.
    const last = [...ids].sort()[100]
    const place = await readYourPlace({ start: START, viewerUserId: last })
    expect(place?.place).toBe(101)
    const onBoard = await readLeaderboardRows({ start: START, viewerUserId: last })
    expect(onBoard.some((row) => row.isYou)).toBe(false)
  })

  it("returns nothing for somebody who is not on the board", async () => {
    const hidden = await ranked(900, { leaderboardOptIn: false })
    expect(
      await readYourPlace({ start: START, viewerUserId: hidden })
    ).toBeNull()
  })
})
