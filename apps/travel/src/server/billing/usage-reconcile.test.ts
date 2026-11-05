import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { reconcilePendingUsageForCustomer } from "@/server/billing/usage"
import { customShellUsageEvents } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"

/**
 * The invoice webhook's retry run, with the real Stripe reporter in place and
 * only the Stripe client itself faked. Kept apart from usage.test.ts because
 * the fake is hoisted over the whole file.
 */

const meterEventsCreate = vi.fn(async () => ({}))
const stripeFactory = vi.fn(async () => ({
  billing: { meterEvents: { create: meterEventsCreate } },
}))

vi.mock("@/server/billing/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/billing/stripe")>()),
  stripe: () => stripeFactory(),
}))

const DAY_MS = 24 * 60 * 60 * 1_000

let client: PGlite
let database: TestDatabase
let billingWas: string | undefined

beforeEach(async () => {
  billingWas = process.env.CUSTOM_SHELL_BILLING_ENABLED
  process.env.CUSTOM_SHELL_BILLING_ENABLED = "true"
  meterEventsCreate.mockClear()
  stripeFactory.mockClear()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  if (billingWas === undefined) delete process.env.CUSTOM_SHELL_BILLING_ENABLED
  else process.env.CUSTOM_SHELL_BILLING_ENABLED = billingWas
  vi.restoreAllMocks()
  await client.close()
})

async function insertPending(userId: string, id: string, daysAgo: number) {
  const occurredAt = new Date(Date.now() - daysAgo * DAY_MS)
  await database.insert(customShellUsageEvents).values({
    id,
    userId,
    meter: "api_calls",
    quantity: 1,
    occurredAt,
    stripeCustomerId: "cus_reconcile",
    stripeReportStatus: "pending",
    createdAt: occurredAt,
  })
}

describe("reconcilePendingUsageForCustomer", () => {
  it("builds the Stripe client once for the run and marks old rows in one update", async () => {
    const user = await insertUser(database)
    await insertPending(user.id, "old-1", 60)
    await insertPending(user.id, "old-2", 50)
    await insertPending(user.id, "new-1", 3)
    await insertPending(user.id, "new-2", 2)
    await insertPending(user.id, "new-3", 1)
    const updates = vi.spyOn(database, "update")

    const result = await reconcilePendingUsageForCustomer(
      "cus_reconcile",
      database
    )

    expect(result).toEqual({ reported: 3, failed: 2 })
    expect(stripeFactory).toHaveBeenCalledTimes(1)
    expect(meterEventsCreate).toHaveBeenCalledTimes(3)
    // Still oldest first, one at a time.
    expect(
      meterEventsCreate.mock.calls.map(
        (call) => (call as unknown as [{ identifier: string }])[0].identifier
      )
    ).toEqual(["new-1", "new-2", "new-3"])
    // One update for both old rows, then one per row Stripe took.
    expect(updates).toHaveBeenCalledTimes(1 + 3)

    const rows = await database
      .select({
        id: customShellUsageEvents.id,
        status: customShellUsageEvents.stripeReportStatus,
        error: customShellUsageEvents.stripeReportError,
      })
      .from(customShellUsageEvents)
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]))
    expect(byId["old-1"]).toMatchObject({ status: "failed", error: "EVENT_TOO_OLD" })
    expect(byId["old-2"]).toMatchObject({ status: "failed", error: "EVENT_TOO_OLD" })
    expect(byId["new-1"]?.status).toBe("reported")
    expect(byId["new-3"]?.status).toBe("reported")
  })

  it("still throws when a row is left pending for the next webhook", async () => {
    const user = await insertUser(database)
    await insertPending(user.id, "new-1", 1)
    meterEventsCreate.mockRejectedValueOnce(
      Object.assign(new Error("down"), { code: "api_error" })
    )
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(
      reconcilePendingUsageForCustomer("cus_reconcile", database)
    ).rejects.toThrow("USAGE_RECONCILIATION_INCOMPLETE")
  })
})
