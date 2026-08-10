import { describe, expect, it } from "vitest"

import {
  cleanPublicFooterCopyright,
  cleanPublicNavigationLinks,
} from "@/lib/pages/public-navigation"

describe("public navigation settings", () => {
  it("keeps ordered internal and external links", () => {
    expect(
      cleanPublicNavigationLinks([
        { label: " About ", href: " /about " },
        { label: "Elsewhere", href: "https://example.com/page" },
      ])
    ).toEqual([
      { label: "About", href: "/about" },
      { label: "Elsewhere", href: "https://example.com/page" },
    ])
  })

  it("drops incomplete and dangerous links", () => {
    expect(
      cleanPublicNavigationLinks([
        { label: "Bad", href: "javascript:alert(1)" },
        { label: "", href: "/empty" },
        { label: "Missing address" },
        null,
      ])
    ).toEqual([])
  })

  it("falls back safely for broken rows and copyright lines", () => {
    expect(cleanPublicNavigationLinks({ label: "Not a list" })).toEqual([])
    expect(cleanPublicFooterCopyright({ text: "Not text" })).toBe("")
  })
})
