import { describe, expect, it } from "vitest"

import { defaultMenu } from "@/lib/menu"
import {
  addRecentScreen,
  MAX_RECENT_SCREENS,
  recentMenuLinks,
  recentScreenLabel,
  type RecentScreen,
} from "@/lib/recent-screens"

const screen = (path: string, title = ""): RecentScreen => ({
  url: `http://localhost:3015${path}`,
  title,
})

describe("recent screens", () => {
  it("lists the newest first with no repeats", () => {
    let list: RecentScreen[] = []
    for (const path of ["/a", "/b", "/c", "/d"]) list = addRecentScreen(list, screen(path))
    list = addRecentScreen(list, screen("/b", "Bee"))
    expect(list.map((entry) => entry.url.slice(-2))).toEqual(["/b", "/d", "/c", "/a"])
    expect(list[0].title).toBe("Bee")
  })

  it("keeps the last ten", () => {
    let list: RecentScreen[] = []
    for (let i = 0; i < 14; i++) list = addRecentScreen(list, screen(`/${i}`))
    expect(list).toHaveLength(MAX_RECENT_SCREENS)
    expect(list[0].url).toBe("http://localhost:3015/13")
    expect(list.at(-1)?.url).toBe("http://localhost:3015/4")
  })

  it("names a screen by its page name, or its path when it sent none", () => {
    expect(recentScreenLabel(screen("/admin/listings", "Listings"))).toBe("Listings")
    expect(recentScreenLabel(screen("/admin/listings/abc?tab=2"))).toBe(
      "/admin/listings/abc?tab=2"
    )
  })

  it("lists the last three menu links opened, each once, skipping screens no link holds", () => {
    const menu = defaultMenu()
    const recent = [
      screen("/admin/listings/abc"),
      screen("/somewhere-else"),
      screen("/admin/dashboard"),
      screen("/admin/listings"),
      { url: "http://localhost:3020/dashboard", title: "" },
      { url: "http://localhost:3020/dashboard/other", title: "" },
    ]
    expect(recentMenuLinks(menu, recent).map((link) => link.id)).toEqual([
      "link-cms-listings",
      "link-cms-dashboard",
      "link-project-dashboard",
    ])
    expect(recentMenuLinks(menu, [])).toEqual([])
  })
})
