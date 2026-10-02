import { describe, expect, it } from "vitest"

import {
  cleanPublicFooterCopyright,
  cleanPublicNavigationItems,
  cleanPublicNavigationLinks,
  createDefaultPublicNavigation,
  flattenPublicNavigationLinks,
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

describe("public navigation items", () => {
  it("starts empty and keeps the links it is given", () => {
    expect(createDefaultPublicNavigation()).toEqual([])
    expect(
      cleanPublicNavigationItems([{ label: "About", href: "/about" }])
    ).toEqual([{ label: "About", href: "/about" }])
  })

  it("drops a saved search entry and keeps the safe links around it", () => {
    // Search is a header action item now, so a menu saved when it was a menu
    // entry loses that entry rather than drawing something nothing reads.
    expect(
      cleanPublicNavigationItems([
        { label: "About", href: "/about" },
        { type: "search" },
        { label: "Unsafe", href: "javascript:alert(1)" },
        { type: "search", visible: false },
        { label: "Contact", href: "/contact" },
      ])
    ).toEqual([
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ])
  })

  it("keeps old flat menus unchanged and accepts more than twenty links", () => {
    const links = Array.from({ length: 25 }, (_, index) => ({
      label: `Page ${index + 1}`,
      href: `/page-${index + 1}`,
    }))

    expect(cleanPublicNavigationItems(links)).toEqual(links)
  })

  it("keeps one level of named groups and refuses unsafe nested links", () => {
    const menu = cleanPublicNavigationItems([
      { label: "About", href: "/about" },
      {
        type: "group",
        label: " Resources ",
        links: [
          { label: "Guides", href: "/guides" },
          { label: "Unsafe", href: "javascript:alert(1)" },
          {
            type: "group",
            label: "Nested",
            links: [{ label: "Hidden", href: "/hidden" }],
          },
          { label: "Support", href: "https://example.com/support" },
        ],
      },
      { type: "group", label: "Empty", links: [] },
    ])

    expect(menu).toEqual([
      { label: "About", href: "/about" },
      {
        type: "group",
        label: "Resources",
        links: [
          { label: "Guides", href: "/guides" },
          { label: "Support", href: "https://example.com/support" },
        ],
      },
    ])
    expect(flattenPublicNavigationLinks(menu)).toEqual([
      { label: "About", href: "/about" },
      { label: "Guides", href: "/guides" },
      { label: "Support", href: "https://example.com/support" },
    ])
  })
})
