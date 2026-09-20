import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { listContactDeliveries } from "@/server/email/deliveries"
import { type CustomShellDb } from "@/server/db"
import {
  customShellBroadcasts,
  customShellContacts,
  customShellDeliveries,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * What one person has been sent, which is the answer to "did you email me?".
 *
 * The case worth spelling out is a send whose newsletter was deleted afterwards.
 * `broadcast_id` is `set null` rather than cascading precisely so that record
 * survives, and this is where that promise is checked.
 */

const WORKSPACE_ID = "ws-deliveries"
const OTHER_WORKSPACE_ID = "ws-elsewhere"

let client: PGlite
let db: CustomShellDb

const TODAY = new Date("2026-08-13T12:00:00Z")

function minutesAgo(minutes: number) {
  return new Date(TODAY.getTime() - minutes * 60 * 1000)
}

async function insertContact(id: string, workspaceId = WORKSPACE_ID) {
  await db.insert(customShellContacts).values({
    id,
    workspaceId,
    email: `${id}@example.test`,
    status: "subscribed",
    tags: [],
    createdAt: minutesAgo(1000),
    updatedAt: minutesAgo(1000),
  })
}

async function insertBroadcast(id: string) {
  await db.insert(customShellBroadcasts).values({
    id,
    workspaceId: WORKSPACE_ID,
    name: id,
    subject: `Subject for ${id}`,
    createdAt: minutesAgo(1000),
    updatedAt: minutesAgo(1000),
  })
}

async function insertDelivery(
  id: string,
  overrides: Partial<typeof customShellDeliveries.$inferInsert> = {}
) {
  await db.insert(customShellDeliveries).values({
    id,
    workspaceId: WORKSPACE_ID,
    broadcastId: null,
    contactId: "ada",
    toEmail: "ada@example.test",
    subject: `Subject ${id}`,
    status: "sent",
    createdAt: minutesAgo(10),
    ...overrides,
  })
}

/** The subjects one contact's history shows, in the order it shows them. */
async function historyFor(
  contactId: string,
  options: { limit?: number; offset?: number } = {},
  workspaceId = WORKSPACE_ID
) {
  const { deliveries, hasMore } = await listContactDeliveries(
    workspaceId,
    contactId,
    options,
    db
  )
  return { subjects: deliveries.map((row) => row.subject), hasMore }
}

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  db = created.db

  const owner = await insertUser(db, { email: "owner@example.test" })
  for (const id of [WORKSPACE_ID, OTHER_WORKSPACE_ID]) {
    await db.insert(customShellWorkspaces).values({
      id,
      userId: owner.id,
      name: id,
      settings: {},
      subdomain: `w-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: minutesAgo(5000),
      updatedAt: minutesAgo(5000),
    })
  }
  await insertContact("ada")
})

afterEach(async () => {
  await client.close()
})

describe("everything one person has been sent", () => {
  it("gives nothing back for somebody who has never been emailed", async () => {
    expect(await historyFor("ada")).toEqual({ subjects: [], hasMore: false })
  })

  it("puts the newest send first", async () => {
    await insertDelivery("old", {
      subject: "Older",
      createdAt: minutesAgo(500),
    })
    await insertDelivery("new", { subject: "Newer", createdAt: minutesAgo(5) })
    await insertDelivery("middle", {
      subject: "Middle",
      createdAt: minutesAgo(100),
    })

    expect((await historyFor("ada")).subjects).toEqual([
      "Newer",
      "Middle",
      "Older",
    ])
  })

  it("shows a send whose newsletter has since been deleted", async () => {
    await insertBroadcast("gone")
    await insertDelivery("kept", {
      broadcastId: "gone",
      subject: "The one that was deleted",
    })

    await db
      .delete(customShellBroadcasts)
      .where(eq(customShellBroadcasts.id, "gone"))

    const { deliveries } = await listContactDeliveries(
      WORKSPACE_ID,
      "ada",
      {},
      db
    )
    // Still one row, still with its subject, and now pointing at no newsletter
    // — which is what the window reads to decide there is nothing to link to.
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0].subject).toBe("The one that was deleted")
    expect(deliveries[0].broadcastId).toBeNull()
  })

  it("keeps a failure's reason, so the window can say why", async () => {
    await insertDelivery("bad", {
      subject: "Never arrived",
      status: "failed",
      error: "Mailbox does not exist",
    })

    const { deliveries } = await listContactDeliveries(
      WORKSPACE_ID,
      "ada",
      {},
      db
    )
    expect(deliveries[0].status).toBe("failed")
    expect(deliveries[0].error).toBe("Mailbox does not exist")
  })

  it("keeps a bounce separate from how the send itself went", async () => {
    const bouncedAt = minutesAgo(2)
    await insertDelivery("bounced", { status: "sent", bouncedAt })

    const { deliveries } = await listContactDeliveries(
      WORKSPACE_ID,
      "ada",
      {},
      db
    )
    // Handed over fine, came back later. Both facts survive the read.
    expect(deliveries[0].status).toBe("sent")
    expect(deliveries[0].bouncedAt).toEqual(bouncedAt)
  })

  it("pages, and says when there is another page below", async () => {
    for (let at = 0; at < 5; at += 1) {
      await insertDelivery(`d${at}`, {
        subject: `Send ${at}`,
        createdAt: minutesAgo(at + 1),
      })
    }

    expect(await historyFor("ada", { limit: 2 })).toEqual({
      subjects: ["Send 0", "Send 1"],
      hasMore: true,
    })
    expect(await historyFor("ada", { limit: 2, offset: 2 })).toEqual({
      subjects: ["Send 2", "Send 3"],
      hasMore: true,
    })
    // The last page has to say there is nothing below it, or the window offers
    // an "Older" button that lands on an empty list.
    expect(await historyFor("ada", { limit: 2, offset: 4 })).toEqual({
      subjects: ["Send 4"],
      hasMore: false,
    })
  })

  it("never shows sends made to somebody else", async () => {
    await insertContact("bob")
    await insertDelivery("hers", { contactId: "ada", subject: "For Ada" })
    await insertDelivery("his", { contactId: "bob", subject: "For Bob" })

    expect((await historyFor("ada")).subjects).toEqual(["For Ada"])
    expect((await historyFor("bob")).subjects).toEqual(["For Bob"])
  })

  it("never reaches another workspace's record of a send", async () => {
    await insertContact("stranger", OTHER_WORKSPACE_ID)
    await insertDelivery("theirs", {
      workspaceId: OTHER_WORKSPACE_ID,
      contactId: "stranger",
      subject: "Somebody else's",
    })

    expect((await historyFor("stranger")).subjects).toEqual([])
    expect(
      (await historyFor("stranger", {}, OTHER_WORKSPACE_ID)).subjects
    ).toEqual(["Somebody else's"])
  })
})
