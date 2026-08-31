import { readFile } from "node:fs/promises"

import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  loadAdminUsage,
  loadMemberUsage,
  reconcilePendingUsageForCustomer,
  recordUsage,
  stripeMeterEventForUsage,
  usageMonthStart,
  type UsageReporter,
} from "@/server/billing/usage"
import { invoiceCustomerId } from "@/server/billing/stripe"
import {
  customShellPlans,
  customShellSubscriptions,
  customShellUsageEvents,
} from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"

let client: PGlite
let database: TestDatabase

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  await client.close()
  vi.restoreAllMocks()
})

async function insertPlanAndSubscription(
  userId: string,
  usageMeter: string | null
) {
  const timestamp = new Date()
  await database.insert(customShellPlans).values({
    id: "metered-plan",
    slug: "metered",
    name: "Metered",
    priceMonthlyCents: 2,
    priceYearlyCents: 0,
    currency: "usd",
    stripePriceIdMonthly: "price_metered",
    usageMeter,
    features: {},
    isDefault: false,
    isPublic: true,
    sortOrder: 1,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await database.insert(customShellSubscriptions).values({
    id: "subscription-1",
    userId,
    planId: "metered-plan",
    stripeCustomerId: "cus_metered",
    stripeSubscriptionId: "sub_metered",
    status: "active",
    interval: "monthly",
    source: "stripe",
    currentPeriodEnd: new Date(timestamp.getTime() + 30 * 24 * 60 * 60 * 1_000),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

describe("recordUsage", () => {
  it("builds the Stripe meter event with a stable retry id", () => {
    expect(
      stripeMeterEventForUsage({
        id: "usage-1",
        customerId: "cus_123",
        meter: "api_requests",
        quantity: 17,
        occurredAt: new Date("2026-08-12T14:30:00Z"),
      })
    ).toEqual({
      event_name: "api_requests",
      identifier: "usage-1",
      payload: { stripe_customer_id: "cus_123", value: "17" },
      timestamp: 1_786_545_000,
    })
  })

  it("stores a metered event before reporting the same quantity to Stripe", async () => {
    const user = await insertUser(database)
    await insertPlanAndSubscription(user.id, "api_requests")
    const reported: Parameters<UsageReporter>[0][] = []

    const result = await recordUsage(user.id, "api_requests", 17, {
      database,
      occurredAt: new Date("2026-08-12T14:30:00Z"),
      reporter: async (event) => {
        const rows = await database.select().from(customShellUsageEvents)
        expect(rows).toHaveLength(1)
        reported.push(event)
      },
    })

    expect(result.stripeReportStatus).toBe("reported")
    expect(reported).toEqual([
      expect.objectContaining({
        id: result.id,
        customerId: "cus_metered",
        meter: "api_requests",
        quantity: 17,
      }),
    ])
    const [row] = await database.select().from(customShellUsageEvents)
    expect(row).toMatchObject({
      userId: user.id,
      meter: "api_requests",
      quantity: 17,
      stripeCustomerId: "cus_metered",
      stripeReportStatus: "reported",
      stripeReportError: null,
    })
    expect(row.stripeReportedAt).toBeInstanceOf(Date)
  })

  it("keeps a failed Stripe call pending and reconciles it later", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const user = await insertUser(database)
    await insertPlanAndSubscription(user.id, "render_seconds")

    const first = await recordUsage(user.id, "render_seconds", 45, {
      database,
      reporter: async () => {
        throw Object.assign(new Error("Stripe unavailable"), {
          code: "api_connection_error",
        })
      },
    })
    expect(first.stripeReportStatus).toBe("pending")

    const calls: Parameters<UsageReporter>[0][] = []
    await expect(
      reconcilePendingUsageForCustomer(
        "cus_metered",
        database,
        async (event) => {
          calls.push(event)
        }
      )
    ).resolves.toEqual({ reported: 1, failed: 0 })

    expect(calls).toHaveLength(1)
    const [row] = await database
      .select()
      .from(customShellUsageEvents)
      .where(eq(customShellUsageEvents.id, first.id))
    expect(row.stripeReportStatus).toBe("reported")
    expect(row.stripeReportError).toBeNull()
  })

  it("treats Stripe's duplicate response as a completed retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const user = await insertUser(database)
    await insertPlanAndSubscription(user.id, "api_requests")

    const result = await recordUsage(user.id, "api_requests", 3, {
      database,
      reporter: async () => {
        throw Object.assign(new Error("Already recorded"), {
          code: "duplicate_meter_event",
        })
      },
    })

    expect(result.stripeReportStatus).toBe("reported")
    const [row] = await database
      .select()
      .from(customShellUsageEvents)
      .where(eq(customShellUsageEvents.id, result.id))
    expect(row.stripeReportStatus).toBe("reported")
    expect(row.stripeReportError).toBeNull()
  })

  it("stops retrying events outside Stripe's reporting window", async () => {
    const user = await insertUser(database)
    await database.insert(customShellUsageEvents).values({
      ...usageRow("too-old", user.id, "requests", 2, "2020-01-01T00:00:00Z"),
      stripeCustomerId: "cus_old",
      stripeReportStatus: "pending",
    })
    const reporter = vi.fn<UsageReporter>()

    await expect(
      reconcilePendingUsageForCustomer("cus_old", database, reporter)
    ).resolves.toEqual({ reported: 0, failed: 1 })

    expect(reporter).not.toHaveBeenCalled()
    const [row] = await database
      .select()
      .from(customShellUsageEvents)
      .where(eq(customShellUsageEvents.id, "too-old"))
    expect(row).toMatchObject({
      stripeReportStatus: "failed",
      stripeReportError: "EVENT_TOO_OLD",
    })
  })

  it("keeps local totals without calling Stripe for a different plan meter", async () => {
    const user = await insertUser(database)
    await insertPlanAndSubscription(user.id, "images")
    const reporter = vi.fn<UsageReporter>()

    const result = await recordUsage(user.id, "video_seconds", 12, {
      database,
      reporter,
    })

    expect(result.stripeReportStatus).toBe("not_applicable")
    expect(reporter).not.toHaveBeenCalled()
    const [row] = await database.select().from(customShellUsageEvents)
    expect(row.stripeReportStatus).toBe("not_applicable")
  })

  it("rejects invalid meters and quantities without writing a row", async () => {
    const user = await insertUser(database)

    await expect(
      recordUsage(user.id, "meter with spaces", 1, { database })
    ).rejects.toThrow("USAGE_METER_INVALID")
    await expect(
      recordUsage(user.id, "requests", 0, { database })
    ).rejects.toThrow("USAGE_QUANTITY_INVALID")
    expect(await database.select().from(customShellUsageEvents)).toHaveLength(0)
  })
})

describe("usage summaries", () => {
  it("aggregates the current UTC month and keeps member totals private", async () => {
    const first = await insertUser(database, { name: "First" })
    const second = await insertUser(database, { name: "Second" })
    const timestamp = new Date("2026-08-20T10:00:00Z")

    await database
      .insert(customShellUsageEvents)
      .values([
        usageRow("one", first.id, "requests", 4, "2026-08-01T00:00:00Z"),
        usageRow("two", first.id, "requests", 6, "2026-08-19T08:00:00Z"),
        usageRow("three", first.id, "images", 2, "2026-08-18T08:00:00Z"),
        usageRow("four", second.id, "requests", 9, "2026-08-10T08:00:00Z"),
        usageRow("old", first.id, "requests", 100, "2026-07-31T23:59:59Z"),
        usageRow("future", first.id, "requests", 200, "2026-09-01T00:00:00Z"),
        {
          ...usageRow(
            "older-pending",
            first.id,
            "archived_meter",
            5,
            "2026-07-12T08:00:00Z"
          ),
          stripeCustomerId: "cus_metered",
          stripeReportStatus: "pending",
        },
        {
          ...usageRow(
            "older-failed",
            first.id,
            "archived_meter",
            7,
            "2026-07-13T08:00:00Z"
          ),
          stripeCustomerId: "cus_metered",
          stripeReportStatus: "failed",
        },
      ])

    const member = await loadMemberUsage(first.id, timestamp, database)
    expect(member.monthStart).toBe("2026-08-01T00:00:00.000Z")
    expect(member.totalQuantity).toBe(12)
    expect(member.totalEvents).toBe(3)
    expect(member.byMeter).toEqual([
      { meter: "requests", quantity: 10, events: 2 },
      { meter: "images", quantity: 2, events: 1 },
    ])
    expect(member.recent.map((event) => event.id)).toContain("old")

    const admin = await loadAdminUsage(timestamp, database)
    expect(admin.totalQuantity).toBe(21)
    expect(admin.totalEvents).toBe(4)
    expect(admin.activeMeters).toBe(2)
    expect(admin.pendingStripeReports).toBe(1)
    expect(admin.failedStripeReports).toBe(1)
    expect(admin.byMeter).toContainEqual({
      meter: "archived_meter",
      quantity: 0,
      events: 0,
      pending: 1,
      failed: 1,
    })
    expect(admin.byPerson).toEqual([
      expect.objectContaining({ userId: first.id, quantity: 12, events: 3 }),
      expect.objectContaining({ userId: second.id, quantity: 9, events: 1 }),
    ])
  })
})

describe("usageMonthStart", () => {
  it("uses the first instant of the UTC month", () => {
    expect(
      usageMonthStart(new Date("2026-08-31T23:59:59Z")).toISOString()
    ).toBe("2026-08-01T00:00:00.000Z")
  })
})

describe("invoiceCustomerId", () => {
  const event = (type: string) =>
    ({ type, data: { object: { customer: "cus_metered" } } }) as never

  it("retries usage only while Stripe's invoice is still a draft", () => {
    expect(invoiceCustomerId(event("invoice.created"))).toBe("cus_metered")
    expect(invoiceCustomerId(event("invoice.finalized"))).toBeNull()
    expect(invoiceCustomerId(event("invoice.payment_failed"))).toBeNull()
  })
})

describe("metered usage migration", () => {
  it("can run again after the table and indexes already exist", async () => {
    const migration = await readFile(
      new URL(
        "../../../drizzle/0073_custom_shell_metered_usage.sql",
        import.meta.url
      ),
      "utf8"
    )

    await client.exec(migration)
  })
})

function usageRow(
  id: string,
  userId: string,
  meter: string,
  quantity: number,
  occurredAt: string
) {
  return {
    id,
    userId,
    meter,
    quantity,
    occurredAt: new Date(occurredAt),
    stripeReportStatus: "not_applicable",
    createdAt: new Date(occurredAt),
  }
}
