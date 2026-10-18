import { describe, expect, it } from "vitest"

import {
  activeLinkId,
  addLink,
  addSection,
  appMenuWidth,
  appUrlFromPersonalPath,
  clampSidebarWidth,
  defaultMenu,
  hasLinkTo,
  menuSchema,
  moveLink,
  moveLinkTo,
  moveSection,
  personalPath,
  removeLink,
  removeSection,
  renameSection,
  screenName,
  setAppMenuWidth,
  setStartLink,
  startLink,
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

  it("opens the sub-link's own screen", () => {
    const menu = withPosts()
    expect(activeLinkId(menu, "http://localhost:3015/admin/posts")).toBe("link-posts")
  })

  it("goes one level deep only", () => {
    const menu = withPosts()
    const parent = menu.sections[1].links[0]
    // Under one of its own sub-links, under another link, or in the bottom list:
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

describe("links that open in their own tab", () => {
  const ign: MenuLink = { id: "link-ign", label: "IGN", url: "https://ign.com/", icon: "link", opens: "tab" }

  it("are accepted by the file rules, and a link without the field opens in the panel", () => {
    expect(menuSchema.safeParse(addLink(defaultMenu(), { kind: "top" }, ign)).success).toBe(true)
    const bad = addLink(defaultMenu(), { kind: "top" }, { ...ign, opens: "window" } as never)
    expect(menuSchema.safeParse(bad).success).toBe(false)
  })

  it("never show as the open link, and don't count as a pinned copy", () => {
    const menu = addLink(defaultMenu(), { kind: "top" }, ign)
    expect(activeLinkId(menu, "https://ign.com/")).toBeNull()
    expect(hasLinkTo(menu, "https://ign.com/")).toBe(false)
  })
})

describe("pinning the open screen", () => {
  it("knows when a panel link already goes to exactly that screen", () => {
    const menu = defaultMenu()
    expect(hasLinkTo(menu, "http://localhost:3015/admin/listings")).toBe(true)
    expect(hasLinkTo(menu, "http://localhost:3015/admin/listings/abc")).toBe(false)
  })
})

describe("the open screen's name", () => {
  it("is the label of the link the screen belongs to", () => {
    const menu = addLink(defaultMenu(), { kind: "top" }, posts)
    const listings = "http://localhost:3015/admin/listings"
    expect(screenName(menu, listings)).toBe("Listings")
    expect(screenName(menu, `${listings}/abc`)).toBe("Listings")
    expect(screenName(menu, posts.url)).toBe("Posts")
    expect(screenName(menu, "http://localhost:3099/x")).toBe("")
  })

  it("names a sub-link's screen by the sub-link", () => {
    const menu = addLink(defaultMenu(), { kind: "under", linkId: "link-cms-dashboard" }, posts)
    expect(screenName(menu, posts.url)).toBe("Posts")
  })
})

describe("the start screen", () => {
  it("is one link at a time, and turning it off clears it", () => {
    let menu = setStartLink(defaultMenu(), "link-cms-dashboard", true)
    expect(startLink(menu)?.id).toBe("link-cms-dashboard")
    menu = setStartLink(menu, "link-cms-listings", true)
    expect(startLink(menu)?.id).toBe("link-cms-listings")
    expect(setStartLink(menu, "link-cms-dashboard", false)).toBe(menu)
    menu = setStartLink(menu, "link-cms-listings", false)
    expect(menu).not.toHaveProperty("startLinkId")
    expect(menuSchema.safeParse(setStartLink(menu, "link-cms-listings", true)).success).toBe(true)
  })

  it("is cleared when its link, its link's parent or its section is deleted", () => {
    const start = setStartLink(defaultMenu(), "link-cms-listings", true)
    expect(removeLink(start, "link-cms-listings")).not.toHaveProperty("startLinkId")
    expect(removeSection(start, "section-cms")).not.toHaveProperty("startLinkId")
    expect(removeLink(start, "link-cms-dashboard").startLinkId).toBe("link-cms-listings")

    const sub = setStartLink(
      addLink(defaultMenu(), { kind: "under", linkId: "link-cms-dashboard" }, posts),
      "link-posts",
      true
    )
    expect(removeLink(sub, "link-cms-dashboard")).not.toHaveProperty("startLinkId")
  })

  it("is skipped when the link opens in its own tab", () => {
    const menu = updateLink(
      setStartLink(defaultMenu(), "link-cms-listings", true),
      { ...defaultMenu().sections[1].links[1], opens: "tab" },
      { kind: "section", sectionId: "section-cms" }
    )
    expect(startLink(menu)).toBeNull()
  })
})

describe("dragging sections", () => {
  it("moves a section to where another was dropped", () => {
    const menu = addSection(defaultMenu(), { id: "section-dating", title: "Dating", links: [] })
    expect(moveSection(menu, "section-dating", "section-project").sections.map((s) => s.id)).toEqual([
      "section-dating",
      "section-project",
      "section-cms",
    ])
    expect(moveSection(menu, "section-project", "section-dating").sections.map((s) => s.id)).toEqual([
      "section-cms",
      "section-dating",
      "section-project",
    ])
    expect(moveSection(menu, "section-project", "gone")).toBe(menu)
  })
})

describe("dragging a link to another list", () => {
  const project = { kind: "section", sectionId: "section-project" } as const

  it("drops it into another section before a link, or at the end", () => {
    const withTwo = addLink(defaultMenu(), project, posts)
    const before = moveLinkTo(withTwo, "link-cms-listings", project, "link-posts")
    expect(before.sections[0].links.map((l) => l.id)).toEqual([
      "link-project-dashboard",
      "link-cms-listings",
      "link-posts",
    ])
    expect(before.sections[1].links.map((l) => l.id)).toEqual(["link-cms-dashboard"])
    const end = moveLinkTo(withTwo, "link-cms-listings", project, null)
    expect(end.sections[0].links.at(-1)?.id).toBe("link-cms-listings")
  })

  it("drops it into the bottom list, and back into a section", () => {
    let menu = moveLinkTo(defaultMenu(), "link-cms-listings", { kind: "top" }, null)
    expect(menu.top.map((l) => l.id)).toEqual(["link-cms-listings"])
    menu = moveLinkTo(menu, "link-cms-listings", project, "link-project-dashboard")
    expect(menu.top).toEqual([])
    expect(menu.sections[0].links[0].id).toBe("link-cms-listings")
  })

  it("makes a sub-link, and the last sub-link dragged out leaves a plain link", () => {
    const under = { kind: "under", linkId: "link-project-dashboard" } as const
    let menu = moveLinkTo(defaultMenu(), "link-cms-listings", under, null)
    expect(menu.sections[0].links[0].children?.map((l) => l.id)).toEqual(["link-cms-listings"])
    menu = moveLinkTo(menu, "link-cms-listings", { kind: "section", sectionId: "section-cms" }, null)
    expect(menu.sections[0].links[0]).not.toHaveProperty("children")
  })

  it("refuses a link that holds sub-links in the bottom list or under another link", () => {
    const menu = addLink(defaultMenu(), { kind: "under", linkId: "link-cms-dashboard" }, posts)
    expect(moveLinkTo(menu, "link-cms-dashboard", { kind: "top" }, null)).toBe(menu)
    expect(
      moveLinkTo(menu, "link-cms-dashboard", { kind: "under", linkId: "link-cms-listings" }, null)
    ).toBe(menu)
    expect(moveLinkTo(menu, "gone", { kind: "top" }, null)).toBe(menu)
  })
})

describe("the logo row", () => {
  const withBrand = (brand: unknown) => menuSchema.safeParse({ ...defaultMenu(), brand }).success
  const png = "data:image/png;base64,iVBORw0KGgo="

  it("keeps a name, a picture and a screen, each but the name optional", () => {
    expect(withBrand({ name: "Tyler" })).toBe(true)
    expect(withBrand({ name: "Tyler", logo: png, url: "http://localhost:3020/dashboard" })).toBe(true)
    expect(menuSchema.safeParse(defaultMenu()).success).toBe(true)
  })

  it("refuses an empty name, a non-picture, a picture too big, or a bad address", () => {
    expect(withBrand({ name: "  " })).toBe(false)
    expect(withBrand({ name: "T", logo: "data:text/html;base64,PGI+" })).toBe(false)
    expect(withBrand({ name: "T", logo: "javascript:alert(1)" })).toBe(false)
    expect(withBrand({ name: "T", logo: png + "A".repeat(300 * 1024) })).toBe(false)
    expect(withBrand({ name: "T", url: "javascript:alert(1)" })).toBe(false)
  })
})

describe("hiding an app's own left menu", () => {
  const trade = "https://trade.barelycompany.com/protocols/aster"

  it("hides nothing until a width is dragged in", () => {
    expect(appMenuWidth(defaultMenu(), trade)).toBe(0)
  })

  it("keeps one width per app, for every screen of it", () => {
    const menu = setAppMenuWidth(defaultMenu(), "trade.barelycompany.com", 180.4)
    expect(appMenuWidth(menu, trade)).toBe(180)
    expect(appMenuWidth(menu, "https://trade.barelycompany.com/admin")).toBe(180)
    expect(appMenuWidth(menu, "http://localhost:3015/admin")).toBe(0)
    expect(menuSchema.safeParse(menu).success).toBe(true)
  })

  it("drops the app, and the field once empty, at 0", () => {
    const menu = setAppMenuWidth(defaultMenu(), "trade.barelycompany.com", 180)
    const cleared = setAppMenuWidth(menu, "trade.barelycompany.com", -20)
    expect(cleared.appMenuWidths).toBeUndefined()
    expect(appMenuWidth(cleared, trade)).toBe(0)
  })

  it("caps the width and leaves the menu alone when nothing changes", () => {
    const menu = setAppMenuWidth(defaultMenu(), "trade.barelycompany.com", 5000)
    expect(menu.appMenuWidths?.["trade.barelycompany.com"]).toBe(600)
    expect(setAppMenuWidth(menu, "trade.barelycompany.com", 600)).toBe(menu)
  })

  it("loads a menu file saved before the field existed", () => {
    expect(menuSchema.safeParse({ version: 1, top: [], sections: [] }).success).toBe(true)
  })
})
