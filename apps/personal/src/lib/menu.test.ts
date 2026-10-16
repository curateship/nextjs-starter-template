import { describe, expect, it } from "vitest"

import {
  activeLinkId,
  addLink,
  addSection,
  appUrlFromPersonalPath,
  defaultMenu,
  frameSrc,
  menuSchema,
  moveLink,
  personalPath,
  removeLink,
  removeSection,
  renameSection,
  updateLink,
  type MenuLink,
} from "@/lib/menu"

const posts: MenuLink = {
  id: "link-posts",
  label: "Posts",
  url: "http://localhost:3015/admin/posts",
  icon: "newspaper",
}

describe("addresses", () => {
  it("shows a screen as Personal's own address and reads it back", () => {
    expect(personalPath("http://localhost:3015/admin/listings")).toBe(
      "/localhost:3015/admin/listings"
    )
    expect(appUrlFromPersonalPath("/localhost:3015/admin/listings")).toBe(
      "http://localhost:3015/admin/listings"
    )
    expect(appUrlFromPersonalPath("/localhost:3015/admin/listings?tab=draft")).toBe(
      "http://localhost:3015/admin/listings?tab=draft"
    )
    expect(appUrlFromPersonalPath("/cms.example.com/admin")).toBe(
      "https://cms.example.com/admin"
    )
    expect(appUrlFromPersonalPath("/")).toBeNull()
  })

  it("asks the framed app for its panel alone", () => {
    expect(frameSrc("http://localhost:3015/admin/listings")).toBe(
      "http://localhost:3015/admin/listings?panel=1"
    )
    expect(frameSrc("http://localhost:3015/admin/listings?tab=draft")).toBe(
      "http://localhost:3015/admin/listings?tab=draft&panel=1"
    )
    expect(frameSrc("javascript:alert(1)")).toBe("about:blank")
  })

  it("refuses an address that is not a web page", () => {
    const bad = { ...defaultMenu(), top: [{ ...posts, url: "javascript:alert(1)" }] }
    expect(menuSchema.safeParse(bad).success).toBe(false)
    const withLogin = { ...defaultMenu(), top: [{ ...posts, url: "http://me:pw@localhost:3015/" }] }
    expect(menuSchema.safeParse(withLogin).success).toBe(false)
    expect(menuSchema.safeParse(defaultMenu()).success).toBe(true)
  })
})

describe("the open screen's link", () => {
  it("is the exact address, or the link the screen sits under", () => {
    const menu = defaultMenu()
    expect(activeLinkId(menu, "http://localhost:3015/admin/listings")).toBe("link-cms-listings")
    expect(activeLinkId(menu, "http://localhost:3015/admin/listings/abc")).toBe(
      "link-cms-listings"
    )
    expect(activeLinkId(menu, "http://localhost:3015/admin/listingsx")).toBeNull()
    expect(activeLinkId(menu, "http://localhost:3014/admin/listings")).toBeNull()
    expect(activeLinkId(menu, null)).toBeNull()
  })
})

describe("editing the menu", () => {
  it("adds, edits in place, moves to another place and deletes a link", () => {
    let menu = addLink(defaultMenu(), { kind: "top" }, posts)
    expect(menu.top.map((l) => l.id)).toEqual(["link-posts"])

    menu = updateLink(menu, { ...posts, label: "All posts" }, { kind: "top" })
    expect(menu.top[0].label).toBe("All posts")

    menu = updateLink(menu, menu.top[0], { kind: "section", sectionId: "section-cms" })
    expect(menu.top).toEqual([])
    expect(menu.sections[1].links.map((l) => l.id)).toEqual([
      "link-cms-dashboard",
      "link-cms-listings",
      "link-posts",
    ])

    menu = removeLink(menu, "link-posts")
    expect(menu.sections[1].links.map((l) => l.id)).toEqual([
      "link-cms-dashboard",
      "link-cms-listings",
    ])
  })

  it("keeps an edited link where it was in its section", () => {
    const menu = defaultMenu()
    const first = menu.sections[1].links[0]
    const next = updateLink(menu, { ...first, label: "Home" }, {
      kind: "section",
      sectionId: "section-cms",
    })
    expect(next.sections[1].links.map((l) => l.label)).toEqual(["Home", "Listings"])
  })

  it("drags a link to a new position", () => {
    const menu = moveLink(
      defaultMenu(),
      { kind: "section", sectionId: "section-cms" },
      "link-cms-listings",
      "link-cms-dashboard"
    )
    expect(menu.sections[1].links.map((l) => l.id)).toEqual([
      "link-cms-listings",
      "link-cms-dashboard",
    ])
  })

  it("adds, renames and deletes a section", () => {
    let menu = addSection(defaultMenu(), { id: "section-x", title: "New section", links: [] })
    menu = renameSection(menu, "section-x", "  Trade  ")
    expect(menu.sections.at(-1)).toEqual({ id: "section-x", title: "Trade", links: [] })
    menu = removeSection(menu, "section-x")
    expect(menu.sections.map((s) => s.id)).toEqual(["section-project", "section-cms"])
  })

  it("leaves the menu alone when a place does not exist", () => {
    const menu = defaultMenu()
    expect(addLink(menu, { kind: "section", sectionId: "gone" }, posts)).toBe(menu)
  })
})
