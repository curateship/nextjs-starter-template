import { describe, expect, it } from "vitest"

import { carriedEmail } from "@/lib/email/carried-email"

describe("carried email", () => {
  it("keeps a typed address and trims the spaces around it", () => {
    expect(carriedEmail("  Tyler.Test@Example.com  ")).toBe(
      "Tyler.Test@Example.com"
    )
  })

  it.each([
    undefined,
    null,
    42,
    { email: "tyler@example.com" },
    "",
    "   ",
    "tyler",
    "tyler@",
    "@example.com",
    "tyler@example",
    "tyler @example.com",
    "<img src=x onerror=alert(1)>",
    `${"a".repeat(250)}@example.com`,
  ])("drops %s", (value) => {
    expect(carriedEmail(value)).toBeUndefined()
  })
})
