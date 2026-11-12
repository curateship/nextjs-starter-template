import { describe, expect, it } from "vitest"

import {
  isTopRightLinkShown,
  normalizeTopRightNavigation,
  settingsCogLinks,
} from "@/lib/custom-shell"

const link = (id: string, href: string, label = "Help") => ({
  type: "link" as const,
  id,
  label,
  href,
  icon: "appWindow",
})

describe("links inside the Settings cog", () => {
  it("keeps the cog's links through a load, dropping broken and repeated ones", () => {
    const items = normalizeTopRightNavigation([
      {
        type: "builtIn",
        id: "settings",
        visible: true,
        links: [
          link("a", "/help"),
          { type: "link", id: "broken" },
          link("a", "/again"),
          link("b", "https://example.com"),
        ],
      },
    ])

    expect(settingsCogLinks(items).map((one) => one.id)).toEqual(["a", "b"])
  })

  it("carries links only on the cog, never on the bell or Feedback", () => {
    const items = normalizeTopRightNavigation([
      { type: "builtIn", id: "notifications", visible: true, links: [link("a", "/x")] },
    ])
    const bell = items.find((item) => item.id === "notifications")

    expect(bell).toEqual({ type: "builtIn", id: "notifications", visible: true })
    expect(settingsCogLinks(items)).toEqual([])
  })

  it("keeps the links on a cog saved under its old colour-mode name", () => {
    const items = normalizeTopRightNavigation([
      { id: "theme", visible: true, links: [link("a", "/help")] },
    ])

    expect(settingsCogLinks(items).map((one) => one.id)).toEqual(["a"])
  })

  it("never shows a member an admin page, nor anybody an unfinished link", () => {
    expect(isTopRightLinkShown(link("a", "/admin/crm"), "member")).toBe(false)
    expect(isTopRightLinkShown(link("a", "/admin/crm"), "admin")).toBe(true)
    expect(isTopRightLinkShown(link("a", " "), "admin")).toBe(false)
    expect(isTopRightLinkShown(link("a", "/help", ""), "admin")).toBe(false)
  })
})
