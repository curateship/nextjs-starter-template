import { describe, expect, it } from "vitest"

import { commentingHref, readProjectSearch, sideOf } from "./project-address"

/** The row an address opens, read the way the project page reads it. */
const side = (network: Parameters<typeof sideOf>[0], raw: Record<string, unknown>) => sideOf(network, readProjectSearch(raw))

describe("which row of a network's card an address opens", () => {
  it("opens Posts when nothing says otherwise, and Commenting when the address says so", () => {
    expect(side("reddit", {})).toBe("posts")
    expect(side("x", { tab: "posts" })).toBe("posts")
    expect(side("x", { side: "commenting" })).toBe("commenting")
  })

  it("sends addresses written before 5 Nov 2026 to Commenting", () => {
    // Reddit's old tabs and links.
    expect(side("reddit", { view: "today" })).toBe("commenting")
    expect(side("reddit", { view: "comments", list: "failed" })).toBe("commenting")
    expect(side("reddit", { post: "abc", retry: "def" })).toBe("commenting")
    expect(side("reddit", { replies: "abc" })).toBe("commenting")
    // A commenting tab on the other networks.
    expect(side("x", { tab: "replies" })).toBe("commenting")
    expect(side("medium", { tab: "responses" })).toBe("commenting")
    expect(side("linkedin", { tab: "commented" })).toBe("commenting")
    // A found post opened with no tab: your own posts always name theirs.
    expect(side("linkedin", { open: "abc" })).toBe("commenting")
    expect(side("x", { tab: "posts", open: "abc" })).toBe("posts")
  })

  it("keeps Reddit's old Posts list, X's mentions and Medium's articles on Posts", () => {
    expect(side("reddit", { view: "comments", list: "posts" })).toBe("posts")
    expect(side("x", { tab: "mentions", open: "abc" })).toBe("posts")
    expect(side("medium", { tab: "articles", open: "abc" })).toBe("posts")
  })

  it("never opens Commenting on Instagram or TikTok, whose Comments tab is their own", () => {
    expect(side("instagram", { view: "comments", comment: "abc" })).toBe("posts")
    expect(side("tiktok", { side: "commenting" })).toBe("posts")
  })
})

describe("the address a notice opens on Commenting", () => {
  it("names the project, the network, the row and the tab", () => {
    expect(commentingHref("p1", { network: "reddit", view: "comments", list: "failed" })).toBe(
      "/admin/projects/p1?network=reddit&side=commenting&view=comments&list=failed"
    )
    expect(commentingHref("p1", { network: "x", open: "f1" })).toBe("/admin/projects/p1?network=x&side=commenting&open=f1")
  })

  it("opens the Projects table for an account in no project", () => {
    expect(commentingHref(null, { network: "medium", tab: "responses" })).toBe("/admin/projects")
  })
})
