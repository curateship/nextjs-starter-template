import { afterEach, describe, expect, it } from "vitest"

import {
  buildUnsubscribeUrl,
  canBuildUnsubscribeLinks,
  verifyUnsubscribeToken,
} from "@/server/unsubscribe"

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
