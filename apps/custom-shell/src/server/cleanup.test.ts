import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  CLEANUP_BATCH_LIMIT,
  describeCleanupResult,
  type CleanupCounts,
} from "@/lib/data-cleanup"
import {
  cleanUpOldData,
  maybeCleanUpOldData,
  resetCleanupSweepForTests,
} from "@/server/cleanup"
import { type CustomShellDb } from "@/server/db"
import {
  customShellAuthTokens,
  customShellNotifications,
  customShellRateLimits,
  customShellSessions,
  customShellSystemEmailSends,
} from "@/server/schema"
import { setSessionPolicy } from "@/server/session-policy"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { uuid } from "@/server/security"

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db as unknown as CustomShellDb
  resetCleanupSweepForTests()
})

afterEach(async () => {
  await client.close()
})

const NOW = new Date("2026-08-02T12:00:00Z")
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function ago(ms: number) {
  return new Date(NOW.getTime() - ms)
}

function ahead(ms: number) {
  return new Date(NOW.getTime() + ms)
}

async function addSession(
  userId: string,
  overrides: Partial<typeof customShellSessions.$inferInsert> = {}
) {
  const id = uuid()
  await database.insert(customShellSessions).values({
    id,
    userId,
    tokenHash: uuid(),
    expiresAt: ahead(30 * DAY),
    createdAt: ago(HOUR),
    lastSeenAt: ago(HOUR),
    ...overrides,
  })
  return id
}

async function addLink(
  userId: string,
  overrides: Partial<typeof customShellAuthTokens.$inferInsert> = {}
) {
  const id = uuid()
  await database.insert(customShellAuthTokens).values({
    id,
    userId,
    tokenHash: uuid(),
    purpose: "login",
    expiresAt: ahead(HOUR),
    createdAt: ago(HOUR),
    ...overrides,
  })
  return id
}

async function addThrottle(
  key: string,
  overrides: Partial<typeof customShellRateLimits.$inferInsert> = {}
) {
  await database.insert(customShellRateLimits).values({
    key,
    attempts: 3,
    windowStartedAt: ago(2 * DAY),
    updatedAt: ago(2 * DAY),
    ...overrides,
  })
  return key
}

async function addEmailSend(
  overrides: Partial<typeof customShellSystemEmailSends.$inferInsert> = {}
) {
  const id = uuid()
  await database.insert(customShellSystemEmailSends).values({
    id,
    kind: "password-reset",
    toEmail: "ada@example.test",
    subject: "Reset your password",
    status: "sent",
    createdAt: ago(200 * DAY),
    ...overrides,
  })
  return id
}

async function addNotice(
  userId: string,
  overrides: Partial<typeof customShellNotifications.$inferInsert> = {}
) {
  const id = uuid()
  await database.insert(customShellNotifications).values({
    id,
    recipientUserId: userId,
    type: "changelog",
    createdAt: ago(200 * DAY),
    ...overrides,
  })
  return id
}

/** The ids still in a table after a run, so a test can name what survived. */
async function remaining<T extends { id: unknown }>(
  rows: Promise<T[]>
): Promise<unknown[]> {
  return (await rows).map((row) => row.id)
}

describe("cleanUpOldData", () => {
  it("deletes sessions nobody could sign in with and keeps the live ones", async () => {
    const user = await insertUser(database)
    const expired = await addSession(user.id, { expiresAt: ago(DAY) })
    const live = await addSession(user.id)

    const counts = await cleanUpOldData(database, NOW)

    expect(counts.sessions).toBe(1)
    expect(
      await remaining(database.select().from(customShellSessions))
    ).toEqual([live])
    expect(expired).not.toBe(live)
  })

  it("applies the idle limit from Settings → Security, not just the expiry", async () => {
    const user = await insertUser(database)
    await setSessionPolicy({ maxAgeDays: 0, idleMinutes: 60 }, database)
    const away = await addSession(user.id, { lastSeenAt: ago(3 * HOUR) })
    const busy = await addSession(user.id, { lastSeenAt: ago(5 * 60 * 1000) })

    const counts = await cleanUpOldData(database, NOW)

    expect(counts.sessions).toBe(1)
    expect(
      await remaining(database.select().from(customShellSessions))
    ).toEqual([busy])
    expect(away).not.toBe(busy)
  })

  it("deletes spent links a week on and keeps the ones still worth following", async () => {
    const user = await insertUser(database)
    await addLink(user.id, { usedAt: ago(8 * DAY), expiresAt: ago(8 * DAY) })
    await addLink(user.id, { expiresAt: ago(9 * DAY) })
    const unused = await addLink(user.id)
    const justExpired = await addLink(user.id, { expiresAt: ago(2 * DAY) })
    const justUsed = await addLink(user.id, { usedAt: ago(HOUR) })

    const counts = await cleanUpOldData(database, NOW)

    expect(counts.authTokens).toBe(2)
    expect(
      (await remaining(database.select().from(customShellAuthTokens))).sort()
    ).toEqual([unused, justExpired, justUsed].sort())
  })

  it("deletes finished attempt counters and never lifts a live block", async () => {
    await addThrottle("register:1.2.3.4")
    await addThrottle("login:1.2.3.4:someone@example.test", {
      blockedUntil: ago(DAY),
    })
    await addThrottle("blocked:1.2.3.4", {
      blockedUntil: ahead(10 * 60 * 1000),
    })
    await addThrottle("counting:1.2.3.4", { updatedAt: ago(HOUR) })

    const counts = await cleanUpOldData(database, NOW)

    expect(counts.throttles).toBe(2)
    expect(
      (await database.select().from(customShellRateLimits))
        .map((row) => row.key)
        .sort()
    ).toEqual(["blocked:1.2.3.4", "counting:1.2.3.4"])
  })

  it("deletes notices read months ago and leaves unread ones alone", async () => {
    const user = await insertUser(database)
    await addNotice(user.id, { readAt: ago(100 * DAY) })
    const unread = await addNotice(user.id)
    const justRead = await addNotice(user.id, { readAt: ago(2 * DAY) })

    const counts = await cleanUpOldData(database, NOW)

    expect(counts.notifications).toBe(1)
    expect(
      (await remaining(database.select().from(customShellNotifications))).sort()
    ).toEqual([unread, justRead].sort())
  })

  it("deletes old email records and keeps the recent ones", async () => {
    await addEmailSend()
    const lastWeek = await addEmailSend({ createdAt: ago(7 * DAY) })
    // Right on the edge of the ninety days, so the boundary is not off by one.
    const justInside = await addEmailSend({ createdAt: ago(89 * DAY) })

    const counts = await cleanUpOldData(database, NOW)

    expect(counts.emailSends).toBe(1)
    expect(
      (
        await remaining(database.select().from(customShellSystemEmailSends))
      ).sort()
    ).toEqual([lastWeek, justInside].sort())
  })

  it("finds nothing to do on a database with nothing old in it", async () => {
    const user = await insertUser(database)
    await addSession(user.id)
    await addLink(user.id)
    await addThrottle("counting:1.2.3.4", { updatedAt: ago(HOUR) })
    await addNotice(user.id)
    await addEmailSend({ createdAt: ago(7 * DAY) })

    expect(await cleanUpOldData(database, NOW)).toEqual({
      sessions: 0,
      authTokens: 0,
      throttles: 0,
      notifications: 0,
      emailSends: 0,
    })
  })

  it("stops at the batch cap and leaves the rest for the next run", async () => {
    const overflow = 3
    await database.insert(customShellRateLimits).values(
      Array.from({ length: CLEANUP_BATCH_LIMIT + overflow }, (_, index) => ({
        key: `register:10.0.0.${index}`,
        attempts: 1,
        windowStartedAt: ago(2 * DAY),
        updatedAt: ago(2 * DAY),
      }))
    )

    const first = await cleanUpOldData(database, NOW)
    expect(first.throttles).toBe(CLEANUP_BATCH_LIMIT)

    const second = await cleanUpOldData(database, NOW)
    expect(second.throttles).toBe(overflow)
    expect(await database.select().from(customShellRateLimits)).toEqual([])
  })
})

describe("maybeCleanUpOldData", () => {
  it("sweeps once a day and not on every request after that", async () => {
    const user = await insertUser(database)
    await addSession(user.id, { expiresAt: ago(DAY) })

    await maybeCleanUpOldData(database, NOW)
    expect(await database.select().from(customShellSessions)).toEqual([])

    // A second expired session on the same day is left for tomorrow's sweep —
    // that is the whole point of the once-a-day latch.
    await addSession(user.id, { expiresAt: ago(DAY) })
    await maybeCleanUpOldData(database, NOW)
    expect(await database.select().from(customShellSessions)).toHaveLength(1)

    await maybeCleanUpOldData(database, new Date(NOW.getTime() + DAY))
    expect(await database.select().from(customShellSessions)).toEqual([])
  })

  it("swallows a failure instead of breaking the page it rode in on", async () => {
    await client.close()

    await expect(maybeCleanUpOldData(database, NOW)).resolves.toBeUndefined()

    // Reopened so the shared afterEach has something to close.
    client = new PGlite()
  })
})

describe("describeCleanupResult", () => {
  const nothing: CleanupCounts = {
    sessions: 0,
    authTokens: 0,
    throttles: 0,
    notifications: 0,
    emailSends: 0,
  }

  it("says so plainly when there was nothing to delete", () => {
    expect(describeCleanupResult(nothing)).toBe(
      "Nothing to clean up — there was no old data."
    )
  })

  it("names only what actually went, and counts one as one", () => {
    expect(describeCleanupResult({ ...nothing, sessions: 1 })).toBe(
      "Deleted 1 expired sign-in."
    )
    expect(
      describeCleanupResult({ ...nothing, sessions: 2, notifications: 5 })
    ).toBe("Deleted 2 expired sign-ins and 5 notices read over 90 days ago.")
    expect(describeCleanupResult({ ...nothing, emailSends: 3 })).toBe(
      "Deleted 3 email records over 90 days old."
    )
  })

  it("admits there is more waiting when a table hit the cap", () => {
    expect(
      describeCleanupResult({ ...nothing, throttles: CLEANUP_BATCH_LIMIT })
    ).toContain("press it again")
    expect(describeCleanupResult({ ...nothing, throttles: 1 })).not.toContain(
      "press it again"
    )
  })
})
