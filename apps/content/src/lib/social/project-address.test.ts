import { describe, expect, it } from "vitest"

import { commentingHref, projectTabOf, readProjectSearch, sideOf } from "./project-address"

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

describe("a network's Voices or Accounts tab in the address", () => {
  it("keeps the row it was opened on, whatever `open` holds", () => {
    // On a pane `open` is a voice or an account, never a post, so only `side` says the row.
    expect(side("x", { pane: "voices", open: "v1" })).toBe("posts")
    expect(side("x", { pane: "voices", side: "commenting", open: "v1" })).toBe("commenting")
    expect(side("reddit", { pane: "accounts", side: "commenting", open: "a1" })).toBe("commenting")
  })

  it("reads the pane and the Accounts Filter, and nothing it does not know", () => {
    expect(readProjectSearch({ pane: "accounts", show: "retired", status: "ok", importance: "throwaway" })).toMatchObject({
      pane: "accounts",
      show: "retired",
      importance: "throwaway",
    })
    const unknown = readProjectSearch({ pane: "messages", show: "board", status: "ok" })
    expect([unknown.pane, unknown.show, unknown.status]).toEqual([undefined, undefined, undefined])
  })
})

describe("which of the project's tabs an address opens", () => {
  // Tyler, 27 Nov 2026: "middle panel first load will be it's content archive".
  it("opens Content on the plain address, and on Content's own keys", () => {
    expect(projectTabOf(readProjectSearch({}), false)).toBe("content")
    expect(projectTabOf(readProjectSearch({ open: "item-1" }), false)).toBe("content")
    expect(projectTabOf(readProjectSearch({ archive: "1", kind: "video" }), false)).toBe("content")
    expect(projectTabOf(readProjectSearch({ content: "videos" }), false)).toBe("content")
  })

  it("opens Promote on anything a network has, so every notice and old link still lands there", () => {
    expect(projectTabOf(readProjectSearch({ network: "reddit" }), false)).toBe("promote")
    expect(projectTabOf(readProjectSearch({ side: "commenting" }), false)).toBe("promote")
    expect(projectTabOf(readProjectSearch({ view: "comments" }), false)).toBe("promote")
    expect(projectTabOf(readProjectSearch({ pane: "voices" }), false)).toBe("promote")
    expect(projectTabOf(readProjectSearch({ post: "p1" }), false)).toBe("promote")
    expect(projectTabOf(readProjectSearch({ promote: "1" }), false)).toBe("promote")
    // The router hands `?promote=1` over as a number.
    expect(projectTabOf(readProjectSearch({ promote: 1 }), false)).toBe("promote")
  })

  it("opens a guest's plain address on Promote, and a guest's Content beside ?archive=1", () => {
    expect(projectTabOf(readProjectSearch({}), true)).toBe("promote")
    expect(projectTabOf(readProjectSearch({ archive: "1" }), true)).toBe("content")
  })

  it("reads only the values it knows for Content's and Promote's own keys", () => {
    expect(readProjectSearch({ content: "carousels", promote: "yes" })).toMatchObject({ content: undefined, promote: undefined })
  })
})
