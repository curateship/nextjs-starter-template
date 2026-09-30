import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { readXProfilePage } from "@/lib/trade/social/x-profile"

/**
 * Read against real pages, saved on 29 Sep 2026.
 *
 * Fixtures rather than live requests: the test has to fail when X changes its
 * markup and this stops finding things, not when the network is down or the
 * account has posted since.
 */
const fixture = (name: string) =>
  readFileSync(
    join(process.cwd(), "src/lib/trade/social/__fixtures__", name),
    "utf8"
  )

const elon = readXProfilePage(fixture("x-profile-elonmusk.html"), "elonmusk")
const cz = readXProfilePage(fixture("x-profile-cz_binance.html"), "cz_binance")
const uni = readXProfilePage(fixture("x-profile-theunipcs.html"), "theunipcs")

describe("the account", () => {
  it("reads the exact follower count, not the rounded one on screen", () => {
    // The page prints "241.7M". The number behind it is this. It is read from
    // the profile's own block, which is why it is one ahead of the copies
    // carried on each post: the page was built across a moment.
    expect(elon.followers).toBe(241717104)
    expect(cz.followers).toBe(12944469)
  })

  it("reads the display name and the picture", () => {
    expect(elon.displayName).toBe("Elon Musk")
    expect(elon.picture).toContain("/profile_images/")
    expect(cz.displayName).toContain("CZ")
  })

  it("says so when the account does not exist", () => {
    const missing = readXProfilePage(
      fixture("x-profile-missing.html"),
      "nobody"
    )

    expect(missing.found).toBe(false)
    expect(missing.followers).toBeNull()
    expect(missing.picture).toBeNull()
    expect(missing.posts).toEqual([])
  })
})

describe("the creator's links", () => {
  it("takes the website field and the links in the bio", () => {
    expect(cz.links).toEqual([
      { label: "binance.com", url: "http://www.binance.com/" },
      { label: "a.co/d/08NMxBOH", url: "https://a.co/d/08NMxBOH" },
      { label: "a.co/d/01f7iQTn", url: "https://a.co/d/01f7iQTn" },
    ])
  })

  it("takes a bio that is only a link", () => {
    expect(elon.links).toEqual([
      { label: "Terafab.AI", url: "http://terafab.ai/" },
    ])
  })

  it("leaves out the links belonging to the posts", () => {
    // Every photo and video on the page carries a link of its own. Those
    // belong to a post, not to the person.
    for (const link of [...elon.links, ...cz.links]) {
      expect(link.url).not.toContain("/status/")
    }
  })
})

describe("the posts on the page", () => {
  it("reads them with their words, time and figures", () => {
    expect(elon.posts.length).toBeGreaterThan(0)
    const [first] = elon.posts

    expect(first.sourceId).toMatch(/^\d+$/)
    expect(first.text.length).toBeGreaterThan(0)
    expect(first.postedAt).toBeGreaterThan(Date.UTC(2020, 0, 1))
    expect(first.url).toContain("/elonmusk/status/")
    expect(first.seen).toBeGreaterThan(0)
  })

  it("leaves out other people's posts this creator reposted", () => {
    // The page carries JohnLeFevre, SpaceX and XFreeze posts too.
    for (const post of elon.posts) {
      expect(post.url).toContain("/elonmusk/status/")
    }
  })

  it("keeps a pinned post once, not twice", () => {
    const ids = elon.posts.map((post) => post.sourceId)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it("reads a third account, followers, link and all", () => {
    expect(uni.followers).toBe(328607)
    expect(uni.links).toEqual([
      { label: "t.me/unipcsjournal", url: "https://t.me/unipcsjournal" },
    ])
    expect(uni.posts.length).toBeGreaterThan(5)
  })

  it("reads the same shape for a second account", () => {
    expect(cz.posts.length).toBeGreaterThan(0)
    for (const post of cz.posts) {
      expect(post.url).toContain("/cz_binance/status/")
    }
  })
})
