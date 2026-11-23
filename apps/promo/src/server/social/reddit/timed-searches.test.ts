import type { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { uuid } from "@/server/auth/security"
import { createProfile } from "@/server/browser/profiles"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"
import { localMinutes } from "@/lib/social/waking"

import { readBehaviour, saveBehaviour } from "../behaviour"
import { createProject } from "../projects"
import { promoJobs, promoKeywords } from "../schema"
import { queueDueSearches } from "./timed-searches"

const HOUR_MS = 3_600_000

/**
 * Keywords searching again by themselves: due after the set hours, never
 * while one is already waiting, never for a switched-off keyword, and never
 * with no reader or while the reader is asleep.
 */
describe("timed searches", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let readerId: string
  let projectId: string
  const now = new Date()

  /** Waking hours around now, or away from it, on the reader's UTC clock. */
  function hours(awake: boolean) {
    const minute = localMinutes(now, "UTC")
    const shift = (by: number) => (((minute + by) % 1440) + 1440) % 1440
    return awake
      ? { wakeFromMinute: shift(-120), wakeUntilMinute: shift(120) }
      : { wakeFromMinute: shift(120), wakeUntilMinute: shift(240) }
  }

  async function keyword(term: string, enabled = true) {
    const id = uuid()
    await db.insert(promoKeywords).values({ id, userId, projectId, term, enabled })
    return id
  }

  async function searchedHoursAgo(keywordId: string, hoursAgo: number, status: "done" | "failed" | "queued" = "done") {
    await db.insert(promoJobs).values({
      id: uuid(),
      userId,
      kind: "search",
      payload: { keywordId },
      status,
      createdAt: new Date(now.getTime() - hoursAgo * HOUR_MS),
    })
  }

  async function queuedFor(keywordId: string) {
    const rows = await db
      .select()
      .from(promoJobs)
      .where(and(eq(promoJobs.userId, userId), eq(promoJobs.kind, "search")))
    return rows.filter(
      (row) => row.payload.keywordId === keywordId && row.status === "queued" && row.createdAt >= now
    )
  }

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    readerId = await createProfile(userId, { name: "Reader" }, db)
    projectId = await createProject(userId, "A project", db)
    await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), readerProfileId: readerId, ...hours(true) }, db)
  })

  afterEach(async () => {
    await client.close()
  })

  it("searches a keyword whose last search is older than the gap, and not one searched lately", async () => {
    const old = await keyword("old one")
    const fresh = await keyword("fresh one")
    await searchedHoursAgo(old, 5)
    await searchedHoursAgo(fresh, 1)

    expect(await queueDueSearches(db, now, () => 0)).toBe(1)
    expect(await queuedFor(old)).toHaveLength(1)
    expect(await queuedFor(fresh)).toHaveLength(0)
  })

  it("counts a failed search too, so a keyword that keeps failing waits its gap", async () => {
    const failing = await keyword("failing")
    await searchedHoursAgo(failing, 1, "failed")
    expect(await queueDueSearches(db, now, () => 0)).toBe(0)
  })

  it("leaves a keyword alone while a search for it is already waiting", async () => {
    const waiting = await keyword("waiting")
    await searchedHoursAgo(waiting, 10, "queued")
    expect(await queueDueSearches(db, now, () => 0)).toBe(0)
  })

  it("never searches a switched-off keyword", async () => {
    await keyword("off", false)
    expect(await queueDueSearches(db, now, () => 0)).toBe(0)
  })

  it("does nothing with the setting at 0, with no reader, or while the reader is asleep", async () => {
    await keyword("never searched")
    const settings = await readBehaviour(userId, db)

    await saveBehaviour(userId, { ...settings, searchEveryHours: 0 }, db)
    expect(await queueDueSearches(db, now, () => 0)).toBe(0)

    await saveBehaviour(userId, { ...settings, readerProfileId: null }, db)
    expect(await queueDueSearches(db, now, () => 0)).toBe(0)

    await saveBehaviour(userId, { ...settings, ...hours(false) }, db)
    expect(await queueDueSearches(db, now, () => 0)).toBe(0)

    await saveBehaviour(userId, settings, db)
    expect(await queueDueSearches(db, now, () => 0)).toBe(1)
  })

  it("spreads one pass's searches a few minutes apart", async () => {
    await keyword("first")
    await keyword("second")
    expect(await queueDueSearches(db, now, () => 0.5)).toBe(2)
    const rows = await db.select().from(promoJobs).where(eq(promoJobs.userId, userId))
    const starts = rows.map((row) => row.runAfter?.getTime() ?? 0).sort((a, b) => a - b)
    expect(starts[1] - starts[0]).toBe(3 * 60_000)
    expect(starts[0]).toBe(now.getTime() + 1.5 * 60_000)
  })
})
