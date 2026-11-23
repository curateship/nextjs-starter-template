import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  clearQuietContact,
  markQuietContacts,
} from "@/server/people/quiet-contacts"
import { type CustomShellDb } from "@/server/db"
import {
  customShellContacts,
  customShellEmailSettings,
  customShellWorkspaces,
  customShellDeliveries,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * Who gets marked as gone quiet, and who does not.
 *
 * The rule decides who stops being counted as an engaged reader, so the cases
 * worth writing down are the ones where it must NOT fire: too few sends, a
 * single open anywhere in the run, and a status that already says something
 * more specific.
 */

const WORKSPACE_ID = "ws-quiet"

let client: PGlite
let db: CustomShellDb

const TODAY = new Date("2026-10-04T12:00:00Z")

function daysAgo(days: number) {
  return new Date(TODAY.getTime() - days * 24 * 60 * 60 * 1000)
}

async function insertContact(
  id: string,
  overrides: Partial<typeof customShellContacts.$inferInsert> = {}
) {
  await db.insert(customShellContacts).values({
    id,
    workspaceId: WORKSPACE_ID,
    email: `${id}@example.test`,
    status: "subscribed",
    tags: [],
    createdAt: daysAgo(100),
    updatedAt: daysAgo(100),
    ...overrides,
  })
}

/** `count` newsletters to somebody, the newest first, none of them opened. */
async function sendNewsletters(
  contactId: string,
  count: number,
  options: { openedIndexes?: number[]; failedIndexes?: number[] } = {}
) {
  for (let index = 0; index < count; index += 1) {
    await db.insert(customShellDeliveries).values({
      id: `${contactId}-d${index}`,
      workspaceId: WORKSPACE_ID,
      broadcastId: null,
      contactId,
      toEmail: `${contactId}@example.test`,
      subject: `Issue ${index}`,
      providerMessageId: `msg-${contactId}-${index}`,
      status: options.failedIndexes?.includes(index) ? "failed" : "sent",
      openedAt: options.openedIndexes?.includes(index) ? daysAgo(index) : null,
      createdAt: daysAgo(index),
    })
  }
}

async function statusOf(contactId: string) {
  const [row] = await db
    .select({ status: customShellContacts.status })
    .from(customShellContacts)
    .where(eq(customShellContacts.id, contactId))
  return row?.status
}

async function setQuietAfter(emails: number) {
  await db
    .insert(customShellEmailSettings)
    .values({
      workspaceId: WORKSPACE_ID,
      quietAfterEmails: emails,
      createdAt: TODAY,
      updatedAt: TODAY,
    })
    .onConflictDoUpdate({
      target: customShellEmailSettings.workspaceId,
      set: { quietAfterEmails: emails },
    })
}

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  db = created.db

  const owner = await insertUser(db, { email: "owner@example.test" })
  await db.insert(customShellWorkspaces).values({
    id: WORKSPACE_ID,
    userId: owner.id,
    name: WORKSPACE_ID,
    settings: {},
    subdomain: "quiet",
    createdAt: daysAgo(400),
    updatedAt: daysAgo(400),
  })
})

afterEach(async () => {
  await client.close()
})

describe("marking somebody as gone quiet", () => {
  it("marks them once the whole run went unopened", async () => {
    await setQuietAfter(3)
    await insertContact("ada")
    await sendNewsletters("ada", 3)

    expect(await markQuietContacts(WORKSPACE_ID, ["ada"], db)).toBe(1)
    expect(await statusOf("ada")).toBe("cold")
  })

  it("leaves somebody alone with fewer sends than the run", async () => {
    await setQuietAfter(3)
    await insertContact("ada")
    await sendNewsletters("ada", 2)

    expect(await markQuietContacts(WORKSPACE_ID, ["ada"], db)).toBe(0)
    expect(await statusOf("ada")).toBe("subscribed")
  })

  it("one open anywhere in the run is enough to stay on the list", async () => {
    await setQuietAfter(3)
    await insertContact("ada")
    await sendNewsletters("ada", 3, { openedIndexes: [2] })

    expect(await markQuietContacts(WORKSPACE_ID, ["ada"], db)).toBe(0)
    expect(await statusOf("ada")).toBe("subscribed")
  })

  it("an open older than the run does not save them", async () => {
    await setQuietAfter(3)
    await insertContact("ada")
    // Four sends: the opened one is the oldest, so the last three are unopened.
    await sendNewsletters("ada", 4, { openedIndexes: [3] })

    expect(await markQuietContacts(WORKSPACE_ID, ["ada"], db)).toBe(1)
    expect(await statusOf("ada")).toBe("cold")
  })

  it("a send that failed never left, so it does not count towards the run", async () => {
    await setQuietAfter(3)
    await insertContact("ada")
    await sendNewsletters("ada", 3, { failedIndexes: [0] })

    expect(await markQuietContacts(WORKSPACE_ID, ["ada"], db)).toBe(0)
    expect(await statusOf("ada")).toBe("subscribed")
  })

  it("never overwrites a status that says more than 'has not opened'", async () => {
    await setQuietAfter(2)
    await insertContact("ada", { status: "unsubscribed" })
    await insertContact("bob", { status: "bounced" })
    await sendNewsletters("ada", 2)
    await sendNewsletters("bob", 2)

    expect(await markQuietContacts(WORKSPACE_ID, ["ada", "bob"], db)).toBe(0)
    expect(await statusOf("ada")).toBe("unsubscribed")
    expect(await statusOf("bob")).toBe("bounced")
  })

  it("uses seven when the workspace has never set a number", async () => {
    await insertContact("ada")
    await sendNewsletters("ada", 6)
    expect(await markQuietContacts(WORKSPACE_ID, ["ada"], db)).toBe(0)

    await insertContact("bob")
    await sendNewsletters("bob", 7)
    expect(await markQuietContacts(WORKSPACE_ID, ["bob"], db)).toBe(1)
    expect(await statusOf("bob")).toBe("cold")
  })

  it("does nothing when nobody was sent anything", async () => {
    expect(await markQuietContacts(WORKSPACE_ID, [], db)).toBe(0)
  })
})

describe("coming back on the list", () => {
  it("an open puts a quiet contact back", async () => {
    await insertContact("ada", { status: "cold" })

    expect(await clearQuietContact(WORKSPACE_ID, "ada", db)).toBe(1)
    expect(await statusOf("ada")).toBe("subscribed")
  })

  it("an open does not undo an opt-out or a bounce", async () => {
    await insertContact("ada", { status: "unsubscribed" })
    await insertContact("bob", { status: "bounced" })

    expect(await clearQuietContact(WORKSPACE_ID, "ada", db)).toBe(0)
    expect(await clearQuietContact(WORKSPACE_ID, "bob", db)).toBe(0)
    expect(await statusOf("ada")).toBe("unsubscribed")
    expect(await statusOf("bob")).toBe("bounced")
  })
})
