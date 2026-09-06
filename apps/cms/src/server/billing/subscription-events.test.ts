import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { uuid } from "@/server/auth/security"
import {
  listMemberSubscriptionEvents,
  listSubscriptionEvents,
} from "@/server/billing/subscription-events"
import { customShellSubscriptionEvents } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  await client.close()
})

describe("member subscription events", () => {
  it("reads only one member's approved event kinds", async () => {
    const member = await insertUser(database)
    const otherMember = await insertUser(database)
    const ownEventId = uuid()

    await database.insert(customShellSubscriptionEvents).values([
      {
        id: ownEventId,
        userId: member.id,
        kind: "subscribed",
        planName: "Pro",
        detail: null,
        source: "stripe",
        stripeEventId: null,
        createdAt: new Date("2026-08-10T12:00:00.000Z"),
      },
      {
        id: uuid(),
        userId: otherMember.id,
        kind: "payment_failed",
        planName: "Team",
        detail: "past_due",
        source: "stripe",
        stripeEventId: null,
        createdAt: new Date("2026-08-11T12:00:00.000Z"),
      },
      {
        id: uuid(),
        userId: member.id,
        kind: "internal_note",
        planName: "Pro",
        detail: "Support-only detail",
        source: "admin",
        stripeEventId: null,
        createdAt: new Date("2026-08-12T12:00:00.000Z"),
      },
    ])

    const history = await listMemberSubscriptionEvents(member.id, database)

    expect(history).toEqual([
      {
        id: ownEventId,
        kind: "subscribed",
        planName: "Pro",
        previousPlanName: null,
        endsAt: null,
        createdAt: "2026-08-10T12:00:00.000Z",
      },
    ])
    expect(history[0]).not.toHaveProperty("source")
    expect(history[0]).not.toHaveProperty("detail")
  })

  it("keeps internal events available to the admin history", async () => {
    const member = await insertUser(database)

    await database.insert(customShellSubscriptionEvents).values({
      id: uuid(),
      userId: member.id,
      kind: "internal_note",
      planName: null,
      detail: "Support-only detail",
      source: "admin",
      stripeEventId: null,
      createdAt: new Date("2026-08-12T12:00:00.000Z"),
    })

    expect(await listMemberSubscriptionEvents(member.id, database)).toEqual([])
    expect((await listSubscriptionEvents(member.id, database))[0]).toMatchObject({
      kind: "internal_note",
      detail: "Support-only detail",
      source: "admin",
    })
  })
})
