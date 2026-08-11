import { describe, expect, it } from "vitest"

import {
  cleanPublicFooterCopyright,
  cleanPublicNavigationLinks,
  isInternalPublicNavigationHref,
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

  it("routes only same-site links inside the app", () => {
    expect(isInternalPublicNavigationHref("/about?from=nav#team")).toBe(true)
    expect(isInternalPublicNavigationHref("//example.com/page")).toBe(false)
    expect(isInternalPublicNavigationHref("https://example.com")).toBe(false)
    expect(isInternalPublicNavigationHref("mailto:hello@example.com")).toBe(false)
    expect(isInternalPublicNavigationHref("tel:+15555550123")).toBe(false)
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
