import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { createListing, updateListing } from "@/server/directory/listings"
import type { DirectoryEmail } from "@/server/directory/mail"
import {
  cleanOwnerMessageInput,
  countOwnerMessageAttempt,
  forgetOldOwnerMessageText,
  sendOwnerMessage,
} from "@/server/directory/owner-messages"
import {
  getOwnerMessageErrorMessage,
  OWNER_MESSAGE_FAILED,
  OWNER_MESSAGES_CLOSED,
} from "@/lib/directory/owner-message-sentences"
import { readPublicListing } from "@/server/directory/public"
import {
  directoryClaims,
  directoryOwnerMessages,
} from "@/server/directory/schema"
import { saveDirectoryOwnerMessagesEnabled } from "@/server/directory/settings"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * "Message the owner", and the promises it makes: off until switched on, only
 * for a listing with an approved owner, the owner's address never leaves the
 * server, and every message leaves a row, sent or failed.
 */

const OWNER_EMAIL = "owner@joes-diner.test"

let client: PGlite
let database: TestDatabase
let alpha: { id: string; name: string; url: string }
let listingId: string
let sent: DirectoryEmail[]
const send = vi.fn(async (email: DirectoryEmail) => {
  sent.push(email)
  return { delivered: true }
})

const visitor = {
  name: "Priya",
  email: "Priya@Example.test",
  message: "Do you take a group of twelve?\nSaturday at 7.",
}

async function approveClaim(siteId: string, listing: string, status = "approved") {
  const user = await insertUser(database, { email: OWNER_EMAIL })
  const at = new Date()
  await database.insert(directoryClaims).values({
    id: uuid(),
    workspaceId: siteId,
    listingId: listing,
    userId: user.id,
    contactEmail: OWNER_EMAIL,
    claimantName: "Joe",
    status,
    createdAt: at,
    updatedAt: at,
  })
}

async function rows() {
  return database
    .select()
    .from(directoryOwnerMessages)
    .where(eq(directoryOwnerMessages.workspaceId, alpha.id))
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  const workspace = await insertWorkspace(database, { name: "Alpha" })
  alpha = { id: workspace.id, name: "Alpha", url: "https://alpha.test" }
  const listing = await createListing(alpha.id, { title: "Joe's Diner" }, database)
  listingId = listing.id
  await updateListing(alpha.id, listingId, { status: "published" }, database)
  sent = []
  send.mockClear()
})

afterEach(async () => {
  await client.close()
})

describe("who may be messaged", () => {
  it("is nobody while the site has the switch off", async () => {
    await approveClaim(alpha.id, listingId)
    await expect(
      sendOwnerMessage(alpha, listingId, visitor, { database, send })
    ).rejects.toThrow(OWNER_MESSAGES_CLOSED)
    expect(send).not.toHaveBeenCalled()
  })

  it("is nobody for a listing with no owner, or only a pending claim", async () => {
    await saveDirectoryOwnerMessagesEnabled(alpha.id, true, database)
    await expect(
      sendOwnerMessage(alpha, listingId, visitor, { database, send })
    ).rejects.toThrow(OWNER_MESSAGES_CLOSED)

    await approveClaim(alpha.id, listingId, "pending_review")
    await expect(
      sendOwnerMessage(alpha, listingId, visitor, { database, send })
    ).rejects.toThrow(OWNER_MESSAGES_CLOSED)
    expect(send).not.toHaveBeenCalled()
  })

  it("is nobody for a draft, or for another site's listing", async () => {
    await saveDirectoryOwnerMessagesEnabled(alpha.id, true, database)
    await approveClaim(alpha.id, listingId)
    const beta = await insertWorkspace(database, { name: "Beta" })
    await saveDirectoryOwnerMessagesEnabled(beta.id, true, database)

    await expect(
      sendOwnerMessage(
        { id: beta.id, name: "Beta", url: "https://beta.test" },
        listingId,
        visitor,
        { database, send }
      )
    ).rejects.toThrow(OWNER_MESSAGES_CLOSED)

    await updateListing(alpha.id, listingId, { status: "draft" }, database)
    await expect(
      sendOwnerMessage(alpha, listingId, visitor, { database, send })
    ).rejects.toThrow(OWNER_MESSAGES_CLOSED)
    expect(send).not.toHaveBeenCalled()
  })

  it("tells the page yes or no, and never the owner's address", async () => {
    await approveClaim(alpha.id, listingId)
    const before = await readPublicListing(
      { id: alpha.id, name: "Alpha", url: alpha.url, accentColor: "" },
      "joes-diner",
      {},
      database
    )
    expect(before?.ownerMessage.open).toBe(false)

    await saveDirectoryOwnerMessagesEnabled(alpha.id, true, database)
    const after = await readPublicListing(
      { id: alpha.id, name: "Alpha", url: alpha.url, accentColor: "" },
      "joes-diner",
      {},
      database
    )
    expect(after?.ownerMessage.open).toBe(true)
    expect(JSON.stringify(after)).not.toContain(OWNER_EMAIL)
  })
})

describe("passing a message on", () => {
  beforeEach(async () => {
    await saveDirectoryOwnerMessagesEnabled(alpha.id, true, database)
    await approveClaim(alpha.id, listingId)
  })

  it("emails the owner with the visitor to reply to, then the visitor", async () => {
    await sendOwnerMessage(alpha, listingId, visitor, { database, send })

    const [toOwner, toVisitor] = sent
    expect(toOwner.to).toBe(OWNER_EMAIL)
    expect(toOwner.replyTo).toBe("priya@example.test")
    expect(toOwner.subject).toBe("Priya sent a message about Joe's Diner")
    expect(toOwner.lines).toContain("Do you take a group of twelve?")
    expect(toOwner.lines.join(" ")).toContain("Alpha")
    expect(toOwner.action?.url).toBe("https://alpha.test/directory/joes-diner")

    expect(toVisitor.to).toBe("priya@example.test")
    expect(JSON.stringify(toVisitor)).not.toContain(OWNER_EMAIL)
    // Never their words: anybody can type somebody else's address in.
    expect(JSON.stringify(toVisitor)).not.toContain("group of twelve")

    const [row] = await rows()
    expect(row).toMatchObject({
      listingId,
      status: "sent",
      senderEmail: "priya@example.test",
      message: visitor.message,
      error: "",
    })
  })

  it("leaves a failed row and a plain sentence when the owner's email fails", async () => {
    const failing = vi.fn(async () => {
      throw new Error(`The email could not be sent: ${OWNER_EMAIL} bounced`)
    })
    const attempt = sendOwnerMessage(alpha, listingId, visitor, {
      database,
      send: failing,
    })
    await expect(attempt).rejects.toThrow(OWNER_MESSAGE_FAILED)
    await attempt.catch((error: Error) =>
      expect(error.message).not.toContain(OWNER_EMAIL)
    )

    const [row] = await rows()
    expect(row.status).toBe("failed")
    expect(row.error).toContain("bounced")
    // No copy to the visitor for a message that never went.
    expect(failing).toHaveBeenCalledTimes(1)
  })

  it("still counts as sent when only the visitor's copy fails", async () => {
    let calls = 0
    const copyFails = vi.fn(async () => {
      calls += 1
      if (calls === 2) throw new Error("copy failed")
      return { delivered: true }
    })
    await sendOwnerMessage(alpha, listingId, visitor, {
      database,
      send: copyFails,
    })
    const [row] = await rows()
    expect(row.status).toBe("sent")
  })
})

describe("the form's checks", () => {
  it("wants a name, an address and a message, and keeps the name on one line", () => {
    expect(() =>
      cleanOwnerMessageInput({ ...visitor, name: "  " })
    ).toThrow("Give your name")
    expect(() =>
      cleanOwnerMessageInput({ ...visitor, email: "not an address" })
    ).toThrow("does not look like an email")
    expect(() =>
      cleanOwnerMessageInput({ ...visitor, email: "a,victim@example.test" })
    ).toThrow("does not look like an email")
    expect(() =>
      cleanOwnerMessageInput({ ...visitor, message: "\n " })
    ).toThrow("Write your message.")
    expect(
      cleanOwnerMessageInput({ ...visitor, name: "Priya\r\nBcc: x@y.test" }).name
    ).toBe("Priya Bcc: x@y.test")
  })

  it("refuses the tenth message in an hour from one visitor", async () => {
    for (let index = 0; index < 9; index += 1) {
      await countOwnerMessageAttempt(
        alpha.id,
        "203.0.113.9",
        `person${index}@example.test`,
        `listing-${index}`,
        database
      )
    }
    await expect(
      countOwnerMessageAttempt(
        alpha.id,
        "203.0.113.9",
        "someone-else@example.test",
        "another-listing",
        database
      )
    ).rejects.toThrow("You have sent a lot of messages")
  })

  it("refuses the tenth from one email, whatever address it comes from", async () => {
    for (let index = 0; index < 9; index += 1) {
      await countOwnerMessageAttempt(
        alpha.id,
        `203.0.113.${index}`,
        "priya@example.test",
        `listing-${index}`,
        database
      )
    }
    await expect(
      countOwnerMessageAttempt(
        alpha.id,
        "198.51.100.1",
        "priya@example.test",
        "another-listing",
        database
      )
    ).rejects.toThrow("You have sent a lot of messages")
  })
})

describe("what the visitor is told", () => {
  it("passes the form's own sentences through and hides anything else", () => {
    expect(getOwnerMessageErrorMessage(new Error(OWNER_MESSAGES_CLOSED))).toBe(
      OWNER_MESSAGES_CLOSED
    )
    expect(getOwnerMessageErrorMessage(new Error("HUMAN_CHECK_FAILED"))).toBe(
      "We could not confirm you are a person. Please try again."
    )
    expect(
      getOwnerMessageErrorMessage(
        new Error(`relation "directory_claims" mentions ${OWNER_EMAIL}`)
      )
    ).toBe(OWNER_MESSAGE_FAILED)
  })
})

describe("after 30 days", () => {
  it("empties the name, address and words, and keeps the row", async () => {
    await saveDirectoryOwnerMessagesEnabled(alpha.id, true, database)
    await approveClaim(alpha.id, listingId)
    const sentAt = new Date("2026-09-01T12:00:00Z")
    await sendOwnerMessage(alpha, listingId, visitor, {
      database,
      send,
      timestamp: sentAt,
    })

    // Day 29: still there.
    expect(
      await forgetOldOwnerMessageText(
        database,
        new Date("2026-09-30T12:00:00Z")
      )
    ).toBe(0)

    // Day 31: gone, once.
    const day31 = new Date("2026-10-02T12:00:00Z")
    expect(await forgetOldOwnerMessageText(database, day31)).toBe(1)
    expect(await forgetOldOwnerMessageText(database, day31)).toBe(0)

    const [row] = await rows()
    expect(row).toMatchObject({
      senderName: "",
      senderEmail: "",
      message: "",
      status: "sent",
      listingId,
    })
    expect(row.textClearedAt).toEqual(day31)
  })
})
