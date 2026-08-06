import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { DEFAULT_DRIP_CONFIG, type DripConfig } from "@/lib/broadcasts/drip"
import { processDueBroadcasts } from "@/server/email/broadcast-send"
import { type CustomShellDb } from "@/server/db"
import { setEmailProviderFactoryForTests } from "@/server/email/provider"
import {
  customShellBroadcasts,
  customShellContacts,
  customShellDeliveries,
  customShellEmailSettings,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * How a newsletter is paced.
 *
 * Every test here drives `processDueBroadcasts` by hand with a clock it
 * controls, because the whole feature is about what time it is, and a test that
 * reads the real clock would pass in the morning and fail at night.
 *
 * The first block is the one that matters most: with pacing off, sending has to
 * behave exactly as it did before this feature existed.
 */

const WORKSPACE_ID = "ws-drip"

/**
 * Every account is pulled onto the contact list before each batch, so the
 * workspace owner is on it too. One extra person than the test inserted, in
 * every count below.
 */
const OWNER = 1

let client: PGlite
let db: CustomShellDb
let sentTo: string[]
let failFor: Set<string>

/** Eight in the morning, Eastern, on Tuesday 4 August 2026. */
const MORNING = new Date("2026-08-04T12:00:00Z")

function drip(overrides: Partial<DripConfig> = {}): DripConfig {
  return { ...DEFAULT_DRIP_CONFIG, enabled: true, ...overrides }
}

async function insertContacts(count: number) {
  const timestamp = new Date("2026-08-01T00:00:00Z")
  for (let index = 0; index < count; index += 1) {
    await db.insert(customShellContacts).values({
      id: `contact-${String(index).padStart(4, "0")}`,
      workspaceId: WORKSPACE_ID,
      email: `person${index}@example.test`,
      status: "subscribed",
      tags: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }
}

async function insertBroadcast(
  overrides: Partial<typeof customShellBroadcasts.$inferInsert> = {}
) {
  const timestamp = new Date("2026-08-01T00:00:00Z")
  await db.insert(customShellBroadcasts).values({
    id: "bc-1",
    workspaceId: WORKSPACE_ID,
    name: "Test newsletter",
    subject: "Hello",
    blocks: [],
    renderedHtml: "<p>Hello</p>",
    status: "sending",
    audienceFilter: { kind: "all" },
    totalRecipients: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  })
}

async function readBroadcast() {
  const [row] = await db
    .select()
    .from(customShellBroadcasts)
    .where(eq(customShellBroadcasts.id, "bc-1"))
  return row
}

/** Runs one pass of the ticker at a chosen moment. */
async function tick(at: Date) {
  return processDueBroadcasts(db, () => at)
}

beforeEach(async () => {
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-encryption-key"
  sentTo = []
  failFor = new Set()

  const created = await createTestDatabase()
  client = created.client
  db = created.db as unknown as CustomShellDb

  const user = await insertUser(db, { email: "owner@example.test" })
  const timestamp = new Date("2026-08-01T00:00:00Z")
  await db.insert(customShellWorkspaces).values({
    id: WORKSPACE_ID,
    userId: user.id,
    name: "Test",
    settings: {},
    isDefault: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db.insert(customShellEmailSettings).values({
    workspaceId: WORKSPACE_ID,
    fromEmail: "news@example.test",
    fromName: "Test",
    createdAt: timestamp,
    updatedAt: timestamp,
  })

  setEmailProviderFactoryForTests(() => ({
    async send({ to }) {
      sentTo.push(to)
      return failFor.has(to)
        ? { success: false, error: "Refused" }
        : { success: true, messageId: `msg-${to}` }
    },
  }))
})

afterEach(async () => {
  setEmailProviderFactoryForTests(null)
  await client.close()
})

describe("with pacing off, nothing about sending has changed", () => {
  it("sends fifty at a time and comes straight back for more", async () => {
    await insertContacts(120)
    await insertBroadcast()

    await tick(MORNING)
    expect(sentTo).toHaveLength(50)

    const afterFirst = await readBroadcast()
    expect(afterFirst.status).toBe("sending")
    // Null is what the claim query reads as "as soon as you can".
    expect(afterFirst.nextBatchAt).toBeNull()
    expect(afterFirst.batchesSent).toBe(1)

    await tick(MORNING)
    await tick(MORNING)
    expect(sentTo).toHaveLength(120 + OWNER)

    const finished = await readBroadcast()
    expect(finished.status).toBe("sent")
    expect(finished.totalSent).toBe(120 + OWNER)
  })

  it("sends at three in the morning, because nobody said not to", async () => {
    await insertContacts(10)
    await insertBroadcast()

    await tick(new Date("2026-08-04T07:00:00Z"))
    expect(sentTo).toHaveLength(10 + OWNER)
  })

  it("never mails the same person twice across two passes", async () => {
    await insertContacts(60)
    await insertBroadcast()

    await tick(MORNING)
    await tick(MORNING)

    expect(new Set(sentTo).size).toBe(60 + OWNER)
  })
})

describe("batch size", () => {
  it("takes its size from the drip range instead of the fixed fifty", async () => {
    await insertContacts(40)
    await insertBroadcast({
      dripConfig: drip({ batchSizeMin: 10, batchSizeMax: 10 }),
    })

    await tick(MORNING)

    expect(sentTo).toHaveLength(10)
    const row = await readBroadcast()
    expect(row.status).toBe("sending")
  })

  it("picks a size inside the range when the range is wide", async () => {
    await insertContacts(200)
    await insertBroadcast({
      dripConfig: drip({ batchSizeMin: 5, batchSizeMax: 25 }),
    })

    await tick(MORNING)

    expect(sentTo.length).toBeGreaterThanOrEqual(5)
    expect(sentTo.length).toBeLessThanOrEqual(25)
  })

  it("finishes rather than waiting when the last chunk empties the list", async () => {
    await insertContacts(8)
    await insertBroadcast({
      dripConfig: drip({ batchSizeMin: 10, batchSizeMax: 10 }),
    })

    await tick(MORNING)

    const row = await readBroadcast()
    expect(row.status).toBe("sent")
    expect(row.nextBatchAt).toBeNull()
    expect(row.sentAt).not.toBeNull()
  })
})

describe("the wait between batches", () => {
  it("sets a next batch time inside the chosen range", async () => {
    await insertContacts(100)
    await insertBroadcast({
      dripConfig: drip({
        batchSizeMin: 10,
        batchSizeMax: 10,
        waitMinMinutes: 30,
        waitMaxMinutes: 60,
      }),
    })

    await tick(MORNING)

    const row = await readBroadcast()
    const waitedMinutes =
      (row.nextBatchAt!.getTime() - MORNING.getTime()) / 60_000
    expect(waitedMinutes).toBeGreaterThanOrEqual(30)
    expect(waitedMinutes).toBeLessThanOrEqual(60)
  })

  it("sends nothing at all until that time arrives", async () => {
    await insertContacts(100)
    await insertBroadcast({
      dripConfig: drip({
        batchSizeMin: 10,
        batchSizeMax: 10,
        waitMinMinutes: 30,
        waitMaxMinutes: 30,
      }),
    })

    await tick(MORNING)
    expect(sentTo).toHaveLength(10)

    // A minute later, and twenty-nine minutes later: still nothing.
    await tick(new Date(MORNING.getTime() + 60_000))
    await tick(new Date(MORNING.getTime() + 29 * 60_000))
    expect(sentTo).toHaveLength(10)

    await tick(new Date(MORNING.getTime() + 30 * 60_000))
    expect(sentTo).toHaveLength(20)
  })
})

describe("sending hours", () => {
  const officeHours = drip({
    batchSizeMin: 10,
    batchSizeMax: 10,
    windows: [{ start: "08:00", end: "13:00" }],
    timezone: "America/New_York",
  })

  it("sends nothing outside them", async () => {
    await insertContacts(100)
    await insertBroadcast({ dripConfig: officeHours })

    // 3am Eastern.
    await tick(new Date("2026-08-04T07:00:00Z"))

    expect(sentTo).toHaveLength(0)
  })

  it("sleeps until the exact opening rather than waking every tick", async () => {
    await insertContacts(100)
    await insertBroadcast({ dripConfig: officeHours })

    await tick(new Date("2026-08-04T07:00:00Z"))

    const row = await readBroadcast()
    expect(row.status).toBe("sending")
    // 8am Eastern the same morning.
    expect(row.nextBatchAt?.toISOString()).toBe("2026-08-04T12:00:00.000Z")
    // Nothing was attempted, so nothing counts as a batch.
    expect(row.batchesSent).toBe(0)
  })

  it("starts sending once the window opens", async () => {
    await insertContacts(100)
    await insertBroadcast({ dripConfig: officeHours })

    await tick(new Date("2026-08-04T07:00:00Z"))
    await tick(new Date("2026-08-04T12:00:00Z"))

    expect(sentTo).toHaveLength(10)
  })

  it("stops again when the window closes mid-send", async () => {
    await insertContacts(100)
    await insertBroadcast({
      dripConfig: { ...officeHours, waitMinMinutes: 1, waitMaxMinutes: 1 },
    })

    // Ten to one, Eastern: one batch goes.
    await tick(new Date("2026-08-04T16:50:00Z"))
    expect(sentTo).toHaveLength(10)

    // Ten past one: shut.
    await tick(new Date("2026-08-04T17:10:00Z"))
    expect(sentTo).toHaveLength(10)

    const row = await readBroadcast()
    expect(row.nextBatchAt?.toISOString()).toBe("2026-08-05T12:00:00.000Z")
  })

  it("keeps to the same wall-clock hours after the clocks change", async () => {
    await insertContacts(100)
    await insertBroadcast({ dripConfig: officeHours })

    // 12:30 UTC in January is 7:30am Eastern — before the window opens.
    await tick(new Date("2026-01-06T12:30:00Z"))
    expect(sentTo).toHaveLength(0)

    await tick(new Date("2026-01-06T13:30:00Z"))
    expect(sentTo).toHaveLength(10)
  })
})

describe("weekends", () => {
  it("waits for Monday when asked to skip them", async () => {
    await insertContacts(100)
    await insertBroadcast({
      dripConfig: drip({
        batchSizeMin: 10,
        batchSizeMax: 10,
        skipWeekends: true,
        windows: [{ start: "08:00", end: "13:00" }],
        timezone: "America/New_York",
      }),
    })

    // Saturday 1 August 2026, mid-morning Eastern.
    await tick(new Date("2026-08-01T14:00:00Z"))

    expect(sentTo).toHaveLength(0)
    const row = await readBroadcast()
    expect(row.nextBatchAt?.toISOString()).toBe("2026-08-03T12:00:00.000Z")
  })

  it("sends at the weekend when not asked to skip them", async () => {
    await insertContacts(100)
    await insertBroadcast({
      dripConfig: drip({ batchSizeMin: 10, batchSizeMax: 10 }),
    })

    await tick(new Date("2026-08-01T14:00:00Z"))

    expect(sentTo).toHaveLength(10)
  })
})

describe("stopping itself when too much bounces", () => {
  /** Marks the first `count` deliveries as having bounced. */
  async function markBounced(count: number) {
    const rows = await db
      .select({ id: customShellDeliveries.id })
      .from(customShellDeliveries)
      .where(eq(customShellDeliveries.broadcastId, "bc-1"))
      .limit(count)
    for (const row of rows) {
      await db
        .update(customShellDeliveries)
        .set({ bouncedAt: new Date("2026-08-04T12:30:00Z") })
        .where(eq(customShellDeliveries.id, row.id))
    }
  }

  it("pauses and says which numbers made it stop", async () => {
    await insertContacts(200)
    await insertBroadcast({
      dripConfig: drip({
        batchSizeMin: 40,
        batchSizeMax: 40,
        bounceThresholdPercent: 10,
        waitMinMinutes: 1,
        waitMaxMinutes: 1,
      }),
    })

    await tick(MORNING)
    expect(sentTo).toHaveLength(40)

    // Resend reports eight of the forty bounced — 20 in 100, over the limit.
    await markBounced(8)
    await tick(new Date(MORNING.getTime() + 60_000))

    const row = await readBroadcast()
    expect(row.status).toBe("paused")
    expect(row.pausedReason).toContain("bounced")
    expect(row.pausedReason).toContain("10 in 100")
  })

  it("keeps going when the bounce rate is under the limit", async () => {
    await insertContacts(200)
    await insertBroadcast({
      dripConfig: drip({
        batchSizeMin: 40,
        batchSizeMax: 40,
        bounceThresholdPercent: 25,
        waitMinMinutes: 1,
        waitMaxMinutes: 1,
      }),
    })

    await tick(MORNING)
    await markBounced(8)
    await tick(new Date(MORNING.getTime() + 60_000))

    const row = await readBroadcast()
    expect(row.status).toBe("sending")
    expect(sentTo).toHaveLength(80)
  })

  it("does not judge a small list on a couple of bounces", async () => {
    await insertContacts(60)
    await insertBroadcast({
      dripConfig: drip({
        batchSizeMin: 5,
        batchSizeMax: 5,
        bounceThresholdPercent: 5,
        waitMinMinutes: 1,
        waitMaxMinutes: 1,
      }),
    })

    await tick(MORNING)
    // Three of the ten sent by the end of the second pass is 30 in 100, way
    // over the limit — but ten sends is not enough to judge a list on, so it
    // carries on.
    await markBounced(3)
    await tick(new Date(MORNING.getTime() + 60_000))

    const row = await readBroadcast()
    expect(row.status).toBe("sending")
    expect(sentTo).toHaveLength(10)
  })

  it("leaves bounces alone when pacing is off", async () => {
    await insertContacts(200)
    await insertBroadcast()

    await tick(MORNING)
    await markBounced(40)
    await tick(MORNING)

    const row = await readBroadcast()
    expect(row.status).toBe("sending")
  })
})

describe("what pacing does not change", () => {
  it("still stops when most sends are failing outright", async () => {
    await insertContacts(100)
    for (let index = 0; index < 100; index += 1) {
      failFor.add(`person${index}@example.test`)
    }
    await insertBroadcast({
      dripConfig: drip({ batchSizeMin: 30, batchSizeMax: 30 }),
    })

    await tick(MORNING)

    const row = await readBroadcast()
    expect(row.status).toBe("paused")
    expect(row.pausedReason).toContain("failed")
  })

  it("still refuses to send when the workspace has no from address", async () => {
    await insertContacts(20)
    await db
      .update(customShellEmailSettings)
      .set({ fromEmail: null })
      .where(eq(customShellEmailSettings.workspaceId, WORKSPACE_ID))
    await insertBroadcast({ dripConfig: drip() })

    await tick(MORNING)

    const row = await readBroadcast()
    expect(row.status).toBe("paused")
    expect(sentTo).toHaveLength(0)
  })

  it("still promotes a scheduled newsletter when its time comes", async () => {
    await insertContacts(20)
    await insertBroadcast({
      status: "scheduled",
      scheduledAt: new Date("2026-08-04T11:00:00Z"),
      dripConfig: drip({ batchSizeMin: 5, batchSizeMax: 5 }),
    })

    await tick(MORNING)

    expect(sentTo).toHaveLength(5)
  })

  it("a paced send that is paused stays paused", async () => {
    await insertContacts(100)
    await insertBroadcast({
      status: "paused",
      dripConfig: drip({ batchSizeMin: 10, batchSizeMax: 10 }),
    })

    await tick(MORNING)

    expect(sentTo).toHaveLength(0)
  })
})
