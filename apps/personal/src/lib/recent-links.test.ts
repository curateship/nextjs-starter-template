import { describe, expect, it } from "vitest"

import { allLinks, defaultMenu } from "@/lib/menu"
import { addRecentLink, recentLinksIn } from "@/lib/recent-links"

const inMenu = new Set(["a", "b", "c", "d"])

describe("recent links", () => {
  it("adds a new link at the front and keeps three", () => {
    let ids: string[] = []
    for (const id of ["a", "b", "c", "d"]) ids = addRecentLink(ids, id, inMenu)
    expect(ids).toEqual(["d", "c", "b"])
  })

  it("leaves a link where it is when it is opened again", () => {
    const ids = ["c", "b", "a"]
    expect(addRecentLink(ids, "a", inMenu)).toBe(ids)
    expect(addRecentLink(ids, "b", inMenu)).toBe(ids)
  })

  it("drops links no longer in the menu", () => {
    expect(addRecentLink(["c", "gone", "a"], "a", inMenu)).toEqual(["c", "a"])
    expect(addRecentLink(["c", "gone", "a"], "d", inMenu)).toEqual(["d", "c", "a"])
  })

  it("turns saved ids into the menu's links, in order, skipping deleted ones", () => {
    const links = allLinks(defaultMenu())
    expect(
      recentLinksIn(links, ["link-cms-listings", "gone", "link-project-dashboard"]).map(
        (link) => link.label
      )
    ).toEqual(["Listings", "My dashboard"])
  })
})
