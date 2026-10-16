import { describe, expect, it } from "vitest"

import {
  activeLinkId,
  addLink,
  addSection,
  appUrlFromPersonalPath,
  clampSidebarWidth,
  defaultMenu,
  frameSrc,
  menuSchema,
  moveLink,
  personalPath,
  removeLink,
  removeSection,
  renameSection,
  subLinksOf,
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

describe("the left menu's width", () => {
  it("is kept between the shell's limits", () => {
    expect(clampSidebarWidth(50)).toBe(144)
    expect(clampSidebarWidth(300.4)).toBe(300)
    expect(clampSidebarWidth(9000)).toBe(420)
    expect(menuSchema.safeParse({ ...defaultMenu(), sidebarWidth: 300 }).success).toBe(true)
    expect(menuSchema.safeParse({ ...defaultMenu(), sidebarWidth: 600 }).success).toBe(false)
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

describe("sub-links", () => {
  const under = { kind: "under", linkId: "link-cms-dashboard" } as const
  const withPosts = () => addLink(defaultMenu(), under, posts)

  it("adds a sub-link under a left-menu link, and the file rules accept it", () => {
    const menu = withPosts()
    expect(menu.sections[1].links[0].children).toEqual([posts])
    expect(menuSchema.safeParse(menu).success).toBe(true)
  })

  it("opens the sub-link's own screen and shows the family in the top bar", () => {
    const menu = withPosts()
    const active = activeLinkId(menu, "http://localhost:3015/admin/posts")
    expect(active).toBe("link-posts")
    expect(subLinksOf(menu, active)?.map((l) => l.id)).toEqual(["link-cms-dashboard", "link-posts"])
    expect(subLinksOf(menu, "link-cms-dashboard")?.map((l) => l.id)).toEqual([
      "link-cms-dashboard",
      "link-posts",
    ])
    // A link with no sub-links leaves the top bar's left end empty.
    expect(subLinksOf(menu, "link-cms-listings")).toBeNull()
  })

  it("goes one level deep only", () => {
    const menu = withPosts()
    const parent = menu.sections[1].links[0]
    // Under one of its own sub-links, under another link, or in the top bar:
    // a link that holds sub-links is refused all three.
    expect(updateLink(menu, parent, { kind: "under", linkId: "link-posts" })).toBe(menu)
    expect(updateLink(menu, parent, { kind: "under", linkId: "link-cms-listings" })).toBe(menu)
    expect(updateLink(menu, parent, { kind: "top" })).toBe(menu)
    // Nothing can be added under a sub-link.
    expect(addLink(menu, { kind: "under", linkId: "link-posts" }, { ...posts, id: "x" })).toBe(menu)
  })

  it("moves a sub-link out to a section, which leaves its link plain", () => {
    const menu = updateLink(withPosts(), posts, { kind: "section", sectionId: "section-project" })
    expect(menu.sections[1].links[0]).not.toHaveProperty("children")
    expect(menu.sections[0].links.map((l) => l.id)).toEqual(["link-project-dashboard", "link-posts"])
  })

  it("deletes a link with its sub-links, and a sub-link on its own", () => {
    expect(removeLink(withPosts(), "link-cms-dashboard").sections[1].links.map((l) => l.id)).toEqual([
      "link-cms-listings",
    ])
    const menu = removeLink(withPosts(), "link-posts")
    expect(menu.sections[1].links[0]).not.toHaveProperty("children")
  })
})
