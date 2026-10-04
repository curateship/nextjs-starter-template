import { describe, expect, it } from "vitest"

import { isInternalHref, toLinkProps } from "@/lib/nav/nav-href"

describe("saved navigation links", () => {
  it("routes only paths on this site through the client router", () => {
    expect(isInternalHref("/pricing")).toBe(true)
    expect(isInternalHref("/about?from=footer#team")).toBe(true)
    expect(isInternalHref("https://example.com/page")).toBe(false)
    expect(isInternalHref("mailto:hello@example.com")).toBe(false)
    expect(isInternalHref("tel:+15555550123")).toBe(false)
    expect(isInternalHref("//example.com/page")).toBe(false)
  })

  it("keeps an internal path, query, and heading separate for the router", () => {
    expect(toLinkProps("/about?from=footer#team")).toEqual({
      to: "/about",
      search: { from: "footer" },
      hash: "team",
    })
  })
})
