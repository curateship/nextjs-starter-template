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
import { customShellUsers } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

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
