import { describe, expect, it } from "vitest"

import { iconLabel, lucideIconName } from "@/lib/link-icons"
import { defaultMenu, menuSchema } from "@/lib/menu"

describe("link icons", () => {
  it("reads a typed Lucide name however it is written", () => {
    expect(lucideIconName("octagon-x")).toBe("octagon-x")
    expect(lucideIconName("OctagonXIcon")).toBe("octagon-x")
    expect(lucideIconName("octagon x")).toBe("octagon-x")
    expect(lucideIconName("https://lucide.dev/icons/octagon-x")).toBe("octagon-x")
    expect(lucideIconName("not-an-icon-at-all")).toBeUndefined()
  })

  it("names an icon for people", () => {
    expect(iconLabel("chart-column")).toBe("Chart Column")
    expect(iconLabel(undefined)).toBe("No icon")
  })

  it("saves a link with any icon name, an old one, or none", () => {
    const link = { id: "a", label: "A", url: "http://localhost:3015/" }
    const withTop = (top: object[]) => menuSchema.safeParse({ ...defaultMenu(), top }).success
    expect(withTop([{ ...link, icon: "octagon-x" }])).toBe(true)
    expect(withTop([{ ...link, icon: "chart" }])).toBe(true)
    expect(withTop([link])).toBe(true)
    expect(withTop([{ ...link, icon: "<script>" }])).toBe(false)
  })
})
