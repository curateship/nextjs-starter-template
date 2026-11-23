import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import {
  cancelOtherLiveSessions,
  pauseLiveSession,
  readLiveSession,
  readSessionEnding,
  resumeLiveSession,
} from "@/server/pomodoro/live-session"
import {
  completeProductivitySession,
  startProductivitySession,
} from "@/server/pomodoro/productivity"
import { dailyFocusStats, focusSessions } from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * One timer across devices, against a real database: the row is the truth,
 * pause and resume use the server's clock, a new start ends the old one, and
 * two devices finishing the same session count it once.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

const TODAY = "2026-10-07"

async function start(userId: string, key: string = crypto.randomUUID()) {
  return startProductivitySession(userId, TODAY, {
    mode: "focus",
    plannedSeconds: 1500,
    taskId: null,
    idempotencyKey: key,
  })
}

/** Moves a running session's end so that `leftSeconds` remain. */
async function leaveRemaining(sessionId: string, leftSeconds: number) {
  await db
    .update(focusSessions)
    .set({ targetEndsAt: new Date(Date.now() + leftSeconds * 1000) })
    .where(eq(focusSessions.id, sessionId))
}

describe("the live session", () => {
  it("is what every device reads, running with its end time", async () => {
    const { id: userId } = await insertUser(db)
    const session = await start(userId)
    const live = await readLiveSession(userId)
    expect(live).toMatchObject({ id: session.id, status: "running", mode: "focus" })
    expect(live?.targetEndsAt).toBeInstanceOf(Date)
  })

  it("pauses on the server's clock and resumes from what was left", async () => {
    const { id: userId } = await insertUser(db)
    const session = await start(userId)
    await leaveRemaining(session.id, 600)

    const paused = await pauseLiveSession(userId, session.id)
    expect(paused?.status).toBe("paused")
    expect(paused?.targetEndsAt).toBeNull()
    expect(paused?.accumulatedSeconds).toBeGreaterThanOrEqual(899)
    expect(paused?.accumulatedSeconds).toBeLessThanOrEqual(901)

    const resumed = await resumeLiveSession(userId, session.id)
    expect(resumed?.status).toBe("running")
    const left = (resumed!.targetEndsAt!.getTime() - Date.now()) / 1000
    expect(left).toBeGreaterThan(595)
    expect(left).toBeLessThan(605)
  })

  it("answers null to a second device pausing what is already paused", async () => {
    const { id: userId } = await insertUser(db)
    const session = await start(userId)
    expect(await pauseLiveSession(userId, session.id)).not.toBeNull()
    expect(await pauseLiveSession(userId, session.id)).toBeNull()
    expect(await resumeLiveSession(userId, session.id)).not.toBeNull()
    expect(await resumeLiveSession(userId, session.id)).toBeNull()
  })

  it("never pauses or reads somebody else's session", async () => {
    const [{ id: owner }, { id: stranger }] = [await insertUser(db), await insertUser(db)]
    const session = await start(owner)
    expect(await pauseLiveSession(stranger, session.id)).toBeNull()
    expect(await readLiveSession(stranger)).toBeNull()
    expect(await readSessionEnding(stranger, session.id)).toBeNull()
  })

  it("ends the other device's session when a new one starts: the last action wins", async () => {
    const { id: userId } = await insertUser(db)
    const desk = await start(userId)
    const phone = await start(userId)
    expect((await readLiveSession(userId))?.id).toBe(phone.id)
    expect(await readSessionEnding(userId, desk.id)).toMatchObject({ status: "cancelled" })
  })

  it("never ends a newer session when two devices start at the same moment", async () => {
    const { id: userId } = await insertUser(db)
    const desk = await start(userId)
    const phone = await start(userId)
    // The desk's start finishing last must not cancel the phone's, which was
    // created after it.
    await cancelOtherLiveSessions(userId, desk.id, db, desk.createdAt)
    expect((await readLiveSession(userId))?.id).toBe(phone.id)
  })

  it("a retried start keeps its own session", async () => {
    const { id: userId } = await insertUser(db)
    const first = await start(userId, "same-key-123")
    const again = await start(userId, "same-key-123")
    expect(again.id).toBe(first.id)
    expect((await readLiveSession(userId))?.id).toBe(first.id)
  })

  it("counts a session finished on two devices once", async () => {
    const { id: userId } = await insertUser(db)
    const session = await start(userId)
    const first = await completeProductivitySession(userId, session.id, 1500, TODAY)
    const second = await completeProductivitySession(userId, session.id, 1500, TODAY)
    expect(first).not.toBeNull()
    expect(second).toBeNull()
    const [day] = await db
      .select({ sessions: dailyFocusStats.focusSessions })
      .from(dailyFocusStats)
      .where(eq(dailyFocusStats.userId, userId))
    expect(day.sessions).toBe(1)
    expect(await readLiveSession(userId)).toBeNull()
    expect(await readSessionEnding(userId, session.id)).toMatchObject({ status: "completed" })
  })

  it("keeps the newest of several live rows and cancels the rest, so an old one never comes back", async () => {
    const { id: userId } = await insertUser(db)
    // Rows left paused before sessions followed you across devices.
    const leftovers = []
    for (let index = 0; index < 3; index += 1) {
      const session = await start(userId)
      leftovers.push(session.id)
    }
    await db
      .update(focusSessions)
      .set({ status: "paused", targetEndsAt: null })
      .where(eq(focusSessions.userId, userId))
    const newest = leftovers[2]
    await db
      .update(focusSessions)
      .set({ updatedAt: new Date(Date.now() + 1000) })
      .where(eq(focusSessions.id, newest))

    expect((await readLiveSession(userId))?.id).toBe(newest)
    await db
      .update(focusSessions)
      .set({ status: "cancelled" })
      .where(eq(focusSessions.id, newest))
    expect(await readLiveSession(userId)).toBeNull()
  })

  it("leaves a session that ran out long ago alone, so it never lands in today", async () => {
    const { id: userId } = await insertUser(db)
    const session = await start(userId)
    await leaveRemaining(session.id, -2 * 60 * 60)
    expect(await readLiveSession(userId)).toBeNull()
  })
})
