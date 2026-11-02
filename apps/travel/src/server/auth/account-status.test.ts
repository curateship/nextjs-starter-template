import { describe, expect, it } from "vitest"

import { isActiveAccount } from "@/server/auth/security"

describe("account status", () => {
  it.each([
    ["active", true],
    ["suspended", false],
    ["pending_deletion", false],
  ])("allows account links only for an active account (%s)", (status, expected) => {
    expect(isActiveAccount({ status })).toBe(expected)
  })

  it("treats a missing account like one that cannot receive an account link", () => {
    expect(isActiveAccount(null)).toBe(false)
  })
})
