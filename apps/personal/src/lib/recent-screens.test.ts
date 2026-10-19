import { describe, expect, it } from "vitest"

import {
  addRecentScreen,
  MAX_RECENT_SCREENS,
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

})
