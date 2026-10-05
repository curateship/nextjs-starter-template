import { describe, expect, it } from "vitest"

import {
  publicDeviceSidebarClassName,
  savedMenuLinks,
} from "@/lib/pomodoro/saved-menu"

// The product's own screens, as the sidebar passes them.
const PRODUCT = ["/timer", "/rooms", "/plans", "/tasks", "/settings", "/"]

describe("saved menu links", () => {
  it("keeps a page an admin added", () => {
    expect(
      savedMenuLinks([{ label: "About", href: "/about" }], PRODUCT)
    ).toEqual([{ label: "About", href: "/about" }])
  })

  it("drops a link to a screen the sidebar already lists", () => {
    const items = [
      { label: "Pricing", href: "/plans" },
      { label: "Home", href: "/" },
      { label: "Timer", href: "/timer/" },
      { label: "Tasks", href: "/tasks?filter=today" },
    ]
    expect(savedMenuLinks(items, PRODUCT)).toEqual([])
  })

  it("keeps a deeper address under a screen the sidebar lists", () => {
    // `/rooms/weekly` is its own page, not the Rooms screen.
    expect(
      savedMenuLinks([{ label: "Weekly", href: "/rooms/weekly" }], PRODUCT)
    ).toEqual([{ label: "Weekly", href: "/rooms/weekly" }])
  })

  it("flattens a group to its links, because a sidebar row is one address", () => {
    const items = [
      { label: "About", href: "/about" },
      {
        type: "group" as const,
        label: "Help",
        links: [
          { label: "Guides", href: "/guides" },
          { label: "Contact", href: "/contact" },
        ],
      },
    ]
    expect(savedMenuLinks(items, PRODUCT).map((link) => link.href)).toEqual([
      "/about",
      "/guides",
      "/contact",
    ])
  })

  it("lists one address once, however many menu rows point at it", () => {
    const items = [
      { label: "About", href: "/about" },
      { label: "About us", href: "/about" },
    ]
    expect(savedMenuLinks(items, PRODUCT)).toEqual([
      { label: "About", href: "/about" },
    ])
  })

  it("keeps an outside address, which is never one of this app's screens", () => {
    expect(
      savedMenuLinks([{ label: "Blog", href: "https://example.com/timer" }], PRODUCT)
    ).toEqual([{ label: "Blog", href: "https://example.com/timer" }])
  })

  it("carries the device choice through to a class at the sidebar's own width", () => {
    expect(publicDeviceSidebarClassName("desktop")).toBe("max-lg:hidden")
    expect(publicDeviceSidebarClassName("phone")).toBe("lg:hidden")
    expect(publicDeviceSidebarClassName("all")).toBe("")
    expect(publicDeviceSidebarClassName(undefined)).toBe("")
  })
})
