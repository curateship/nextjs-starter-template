import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { requireSaveKey, saveKeyFor } from "@/server/note/library/save-key"
import { LIBRARY_SAYS } from "@/lib/note/library/notes"

/**
 * The Save from x.com button only saves with the key made for the person
 * signed in, so another site cannot send them to the page and import a post.
 */

const before = process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
beforeEach(() => {
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-secret"
})
afterEach(() => {
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = before
})

describe("the Save from x.com key", () => {
  it("is the same every time for one person, and different for another", () => {
    expect(saveKeyFor("user-a")).toBe(saveKeyFor("user-a"))
    expect(saveKeyFor("user-a")).not.toBe(saveKeyFor("user-b"))
    expect(saveKeyFor("user-a")).toMatch(/^[0-9a-f]{32}$/)
  })

  it("lets the person's own key through and refuses anybody else's", () => {
    expect(() => requireSaveKey("user-a", saveKeyFor("user-a"))).not.toThrow()
    expect(() => requireSaveKey("user-a", saveKeyFor("user-b"))).toThrow(LIBRARY_SAYS.saveKeyWrong)
    expect(() => requireSaveKey("user-a", "0".repeat(32))).toThrow(LIBRARY_SAYS.saveKeyWrong)
  })

  it("says so when the server has no secret to make keys from", () => {
    delete process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
    expect(() => saveKeyFor("user-a")).toThrow(LIBRARY_SAYS.saveKeyUnavailable)
  })
})
