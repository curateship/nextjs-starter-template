import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import {
  buildAccountUnsubscribeUrl,
  buildUnsubscribeUrl,
  canBuildUnsubscribeLinks,
  handleUnsubscribeRequest,
  verifyUnsubscribeToken,
} from "@/server/email/unsubscribe"
import {
  customShellAutomationDeliveries,
  customShellAutomationRuns,
  customShellAutomations,
  customShellContacts,
  customShellUsers,
} from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"

/**
 * The signing key is what makes an unsubscribe link ours rather than anybody's,
 * so these cover both halves: a forged link is refused, and a server that
 * cannot sign says so up front instead of part-way through a send.
 */
describe("unsubscribe links", () => {
  const original = process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
    } else {
      process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = original
    }
  })

  it("accepts the token it just built and refuses anything else", () => {
    process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-signing-key"

    const url = new URL(buildUnsubscribeUrl("contact-1"))
    const token = url.searchParams.get("t") ?? ""

    expect(url.pathname).toBe("/unsubscribe")
    expect(url.searchParams.get("c")).toBe("contact-1")
    expect(verifyUnsubscribeToken("contact-1", token)).toBe(true)

    // The same token must not unsubscribe somebody else, which is the whole
    // reason the address is signed rather than just guessable.
    expect(verifyUnsubscribeToken("contact-2", token)).toBe(false)
    expect(verifyUnsubscribeToken("contact-1", "nope")).toBe(false)
    expect(verifyUnsubscribeToken("contact-1", "")).toBe(false)
  })

  it("signs differently once the key changes", () => {
    process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "first-key"
    const token = new URL(buildUnsubscribeUrl("contact-1")).searchParams.get("t")

    process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "second-key"
    expect(verifyUnsubscribeToken("contact-1", token ?? "")).toBe(false)
  })

  /**
   * The regression this exists for: `buildUnsubscribeUrl` throws with no key,
   * and it used to be called per recipient inside the delivery loop — so a
   * server without the key retried the same batch every fifteen seconds for
   * ever, sent nothing, and said nothing about why. The send now asks this
   * first and refuses.
   */
  it("says up front when it cannot sign at all", () => {
    process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "a-key"
    expect(canBuildUnsubscribeLinks()).toBe(true)

    delete process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
    expect(canBuildUnsubscribeLinks()).toBe(false)
    expect(() => buildUnsubscribeUrl("contact-1")).toThrow()
  })
})

/**
 * An account's own link out of automated mail (9 Nov 2026): accounts are not
 * subscribers, so the link turns mail off on the account. It writes from a
 * link anybody can open, so a forged or swapped link must change nothing.
 */
describe("an account's unsubscribe link", () => {
  const original = process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY

  afterEach(() => {
    if (original === undefined) delete process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
    else process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = original
  })

  const mailOff = async (db: CustomShellDb, userId: string) =>
    (await db.select({ off: customShellUsers.automatedMailOffAt }).from(customShellUsers).where(eq(customShellUsers.id, userId)))[0]?.off ?? null

  it("turns that account's automated mail off, and only theirs", async () => {
    process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-signing-key"
    const db = (await createTestDatabase()).db as unknown as CustomShellDb
    const ada = await insertUser(db, { email: "ada@example.test" })
    const bob = await insertUser(db, { email: "bob@example.test" })

    const response = await handleUnsubscribeRequest(new Request(buildAccountUnsubscribeUrl(ada.id)), db)
    expect(response.status).toBe(200)
    expect(await mailOff(db, ada.id)).not.toBeNull()
    expect(await mailOff(db, bob.id)).toBeNull()
  })

  it("refuses a forged token, another account's token, and a subscriber's token", async () => {
    process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-signing-key"
    const db = (await createTestDatabase()).db as unknown as CustomShellDb
    const ada = await insertUser(db, { email: "ada@example.test" })
    const bob = await insertUser(db, { email: "bob@example.test" })
    const open = (a: string, t: string) =>
      handleUnsubscribeRequest(new Request(`https://example.test/unsubscribe?a=${a}&t=${t}`), db)

    const bobsToken = new URL(buildAccountUnsubscribeUrl(bob.id)).searchParams.get("t") ?? ""
    // A subscriber link signed for the same id is not an account link.
    const subscriberToken = new URL(buildUnsubscribeUrl(ada.id)).searchParams.get("t") ?? ""

    expect((await open(ada.id, "nope")).status).toBe(400)
    expect((await open(ada.id, bobsToken)).status).toBe(400)
    expect((await open(ada.id, subscriberToken)).status).toBe(400)
    expect(await mailOff(db, ada.id)).toBeNull()
  })
})

describe("an unsubscribe link from one automation email", () => {
  const original = process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY

  afterEach(() => {
    if (original === undefined) delete process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
    else process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = original
  })

  /** A subscriber with one automation email sent to them. */
  async function setUp() {
    process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-signing-key"
    const db = (await createTestDatabase()).db as unknown as CustomShellDb
    const workspaceId = (await insertWorkspace(db)).id
    const owner = await insertUser(db, { role: "admin" })
    const at = new Date()
    await db.insert(customShellContacts).values({
      id: "contact-1", workspaceId, email: "reader@example.test", status: "subscribed", createdAt: at, updatedAt: at,
    })
    await db.insert(customShellAutomations).values({
      id: "sequence-1", workspaceId, userId: owner.id, name: "Welcome", kind: "sequence",
      graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      compiledConfig: { v: 1, kind: "automation", nodes: {}, edges: [] }, createdAt: at, updatedAt: at,
    })
    await db.insert(customShellAutomationRuns).values({
      id: "run-1", automationId: "sequence-1", userId: owner.id, workspaceId, status: "active", currentNodeId: "email-one",
      configSnapshot: { v: 1, kind: "automation", nodes: {}, edges: [] }, wakeAt: at, startedAt: at, createdAt: at, updatedAt: at,
    })
    await db.insert(customShellAutomationDeliveries).values({
      id: "delivery-1", runId: "run-1", nodeId: "email-one", contactId: "contact-1",
      toEmail: "reader@example.test", subject: "Welcome", status: "sent", createdAt: at,
    })
    const stamped = async () =>
      (await db.select({ at: customShellAutomationDeliveries.unsubscribedAt }).from(customShellAutomationDeliveries))[0]?.at ?? null
    const status = async () =>
      (await db.select({ status: customShellContacts.status }).from(customShellContacts))[0]?.status
    return { db, stamped, status }
  }

  it("counts the unsubscribe on the email it came from", async () => {
    const { db, stamped, status } = await setUp()
    const response = await handleUnsubscribeRequest(new Request(buildUnsubscribeUrl("contact-1", "delivery-1")), db)
    expect(response.status).toBe(200)
    expect(await status()).toBe("unsubscribed")
    expect(await stamped()).not.toBeNull()
  })

  it("still unsubscribes from a link sent before emails were named, counting it on no email", async () => {
    const { db, stamped, status } = await setUp()
    const response = await handleUnsubscribeRequest(new Request(buildUnsubscribeUrl("contact-1")), db)
    expect(response.status).toBe(200)
    expect(await status()).toBe("unsubscribed")
    expect(await stamped()).toBeNull()
  })

  it("refuses a link whose email was changed by hand", async () => {
    const { db, stamped, status } = await setUp()
    const url = new URL(buildUnsubscribeUrl("contact-1", "delivery-1"))
    url.searchParams.set("d", "delivery-2")
    const response = await handleUnsubscribeRequest(new Request(url), db)
    expect(response.status).toBe(400)
    expect(await status()).toBe("subscribed")
    expect(await stamped()).toBeNull()
  })
})
