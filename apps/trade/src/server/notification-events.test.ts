import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  publishNotificationCreated,
  publishNotificationCreatedMany,
} from "@/server/notification-events"
import { createTestDatabase, type TestDatabase } from "@/server/test-support"

/**
 * The nudge that lights the bell up. Two things about it have to hold, and
 * neither is visible from the browser when it breaks:
 *
 * 1. A nudge sent inside a transaction waits for the commit — otherwise the
 *    browser is told to look before the row is there and finds nothing.
 * 2. The connection that listens is its own, never one out of the pool.
 */

const CHANNEL = "custom_shell_notification"

let client: PGlite
let db: TestDatabase

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

/** Collects every nudge this database sends until the returned stop is called. */
async function recordNudges(): Promise<{
  payloads: string[]
  stop: () => Promise<void>
}> {
  const payloads: string[] = []
  const stop = await client.listen(CHANNEL, (payload) => {
    payloads.push(payload)
  })
  return { payloads, stop }
}

describe("publishNotificationCreated", () => {
  it("holds the nudge until the transaction commits", async () => {
    const { payloads, stop } = await recordNudges()

    await db.transaction(async (tx) => {
      await publishNotificationCreated("person-1", tx)
      // Still inside the transaction: nothing has been announced yet.
      expect(payloads).toEqual([])
    })

    expect(payloads).toEqual(["person-1"])
    await stop()
  })

  it("sends nothing at all when the transaction rolls back", async () => {
    const { payloads, stop } = await recordNudges()

    await expect(
      db.transaction(async (tx) => {
        await publishNotificationCreated("person-1", tx)
        throw new Error("the write failed")
      })
    ).rejects.toThrow("the write failed")

    // The row was never written, so telling a browser to go and look for it
    // would send it after nothing.
    expect(payloads).toEqual([])
    await stop()
  })

  it("nudges a whole list of people in one statement", async () => {
    const { payloads, stop } = await recordNudges()

    await publishNotificationCreatedMany(
      ["person-1", "person-2", "person-1"],
      db
    )

    // Publishing an update writes a row per account; the same person twice is
    // still one nudge.
    expect([...payloads].sort()).toEqual(["person-1", "person-2"])
    await stop()
  })

  it("does nothing when nobody is being notified", async () => {
    const { payloads, stop } = await recordNudges()
    await publishNotificationCreatedMany([], db)
    expect(payloads).toEqual([])
    await stop()
  })
})

describe("the listening connection", () => {
  /**
   * The pool is ten wide and the audit-log page has already run it dry once.
   * A listener holding a pooled connection would take a permanent tenth of the
   * app's database capacity for as long as the server is up; on its own client
   * the whole feature costs one connection per server process however many
   * browsers are open. This cannot be proved against the in-memory database
   * used by the rest of these tests, so it is checked where it is decided.
   */
  const source = readFileSync(
    join(process.cwd(), "src/server/notification-events.ts"),
    "utf8"
  )

  it("is opened with its own client, not taken from the pool", () => {
    expect(source).toContain('import { Client } from "pg"')
    expect(source).toContain("new Client({")
  })

  it("never reaches for the pool behind the shared db handle", () => {
    // `db.$client` is the pool. Reading it here would be the exact drift this
    // whole test exists to catch.
    expect(source).not.toContain("$client")
    expect(source).not.toContain("Pool")
  })
})
