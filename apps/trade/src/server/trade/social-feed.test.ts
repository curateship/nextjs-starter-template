import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { buildCoinMatchList } from "@/lib/trade/social/coin-matcher"
import { SOCIAL_POSTS_PAGE } from "@/lib/trade/social/dashboard"
import type { ParsedSocialPost } from "@/lib/trade/social/x-profile"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { addSocialCreator } from "@/server/trade/social-creators"
import {
  loadSocialFeed,
  loadSocialFeedPage,
  loadSocialFeedView,
} from "@/server/trade/social-feed"
import { createSocialFolder } from "@/server/trade/social-folders"
import { fillPostCoinsForCreator } from "@/server/trade/social-post-coins"
import { storeSocialPosts } from "@/server/trade/social-posts"

/**
 * The coins Trade has markets for, in these tests. Mocked because the real
 * list is Hyperliquid's own market list, and a test must not ask an exchange
 * anything.
 */
vi.mock("@/server/trade/social-coin-list", () => ({
  loadMarketMatchList: async () =>
    buildCoinMatchList(
      ["BONK", "WIF", "SOL"].map((symbol) => ({
        symbol,
        key: `hyperliquid:mainnet:${symbol}`,
        kind: "coin" as const,
      }))
    ),
}))

/** A markets panel's rows as the ticker and the count, which is what most of
 * these tests are about. The kind and the market key have their own test. */
function counts(rows: readonly { market: string; posts: number }[]) {
  return rows.map(({ market, posts }) => ({ market, posts }))
}

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => client.close())

const FIRST_POST = Date.UTC(2026, 4, 1, 9, 15)
const DAY_MS = 24 * 60 * 60 * 1000

/** `howMany` posts, one a day, each `text(index)`. */
function posts(
  prefix: string,
  howMany: number,
  text: (index: number) => string,
  firstAt = FIRST_POST
): ParsedSocialPost[] {
  return Array.from({ length: howMany }, (_, index) => ({
    sourceId: `${prefix}${String(index).padStart(4, "0")}`,
    postedAt: firstAt + index * DAY_MS,
    text: text(index),
    url: null,
    seen: null,
    likes: null,
    replies: null,
    reposts: null,
    replyToId: null,
  }))
}

/** A creator with posts stored and their coins read, the way a sync does it. */
async function creatorWithPosts(
  userId: string,
  handle: string,
  held: ParsedSocialPost[]
) {
  const creator = await addSocialCreator(userId, handle)
  await storeSocialPosts(userId, creator.id, held)
  await fillPostCoinsForCreator(userId, creator.id)
  return creator
}

const EVERYONE = { folderId: null, creatorId: null, coin: null }

describe("the social feed", () => {
  it("reads across creators newest first, and only this member's", async () => {
    const user = await insertUser(database)
    const stranger = await insertUser(database)
    // Interleaved by day: sam posts on even days, jen on odd ones.
    const sam = await creatorWithPosts(
      user.id,
      "cryptosam",
      posts("sam", 3, (index) => `sam ${index}`, FIRST_POST)
    )
    const jen = await creatorWithPosts(
      user.id,
      "altcoinjen",
      posts("jen", 3, (index) => `jen ${index}`, FIRST_POST + DAY_MS / 2)
    )
    await creatorWithPosts(
      stranger.id,
      "cryptosam",
      posts("other", 5, () => "not yours")
    )

    const feed = await loadSocialFeed(user.id)
    expect(feed.posts.map((post) => post.text)).toEqual([
      "jen 2",
      "sam 2",
      "jen 1",
      "sam 1",
      "jen 0",
      "sam 0",
    ])
    expect(feed.posts.map((post) => post.creator.handle)).toEqual([
      "altcoinjen",
      "cryptosam",
      "altcoinjen",
      "cryptosam",
      "altcoinjen",
      "cryptosam",
    ])
    expect(feed.held).toBe(6)
    expect(feed.more).toBe(false)
    expect(feed.creators.map((creator) => creator.handle)).toEqual([
      "altcoinjen",
      "cryptosam",
    ])
    expect([sam.id, jen.id]).toContain(feed.posts[0].creator.id)
  })

  it("pages across the boundary between two creators' posts", async () => {
    const user = await insertUser(database)
    await creatorWithPosts(
      user.id,
      "cryptosam",
      posts("sam", 30, (index) => `sam ${index}`, FIRST_POST)
    )
    await creatorWithPosts(
      user.id,
      "altcoinjen",
      posts("jen", 30, (index) => `jen ${index}`, FIRST_POST + DAY_MS / 2)
    )

    const first = await loadSocialFeedPage(user.id, EVERYONE, null)
    expect(first.posts).toHaveLength(SOCIAL_POSTS_PAGE)
    expect(first.more).toBe(true)

    const oldest = first.posts[first.posts.length - 1]
    const second = await loadSocialFeedPage(user.id, EVERYONE, oldest.postedAt)
    expect(second.posts).toHaveLength(10)
    expect(second.more).toBe(false)
    const seen = new Set([
      ...first.posts.map((post) => post.id),
      ...second.posts.map((post) => post.id),
    ])
    expect(seen.size).toBe(60)
  })

  it("narrows to one folder's creators, and an empty folder reads nothing", async () => {
    const user = await insertUser(database)
    const sam = await creatorWithPosts(
      user.id,
      "cryptosam",
      posts("sam", 2, (index) => `sam ${index}`)
    )
    await creatorWithPosts(
      user.id,
      "altcoinjen",
      posts("jen", 2, (index) => `jen ${index}`)
    )
    const folders = await createSocialFolder(user.id, {
      name: "Trusted",
      creatorId: sam.id,
    })

    const view = await loadSocialFeedView(user.id, {
      ...EVERYONE,
      folderId: folders[0].id,
    })
    expect(view.posts.map((post) => post.text)).toEqual(["sam 1", "sam 0"])
    expect(view.held).toBe(2)

    const empty = await createSocialFolder(user.id, { name: "Empty" })
    const nothing = await loadSocialFeedView(user.id, {
      ...EVERYONE,
      folderId: empty.find((folder) => folder.name === "Empty")!.id,
    })
    expect(nothing.posts).toEqual([])
    expect(nothing.held).toBe(0)
    expect(nothing.coins).toEqual([])
  })

  it("narrows to one creator and to one coin, counted by the database", async () => {
    const user = await insertUser(database)
    const sam = await creatorWithPosts(user.id, "cryptosam", [
      ...posts("bonk", 2, (index) => `buying $BONK, post ${index}`),
      ...posts(
        "wif",
        1,
        (index) => `all in $WIF, post ${index}`,
        FIRST_POST + 10 * DAY_MS
      ),
    ])
    await creatorWithPosts(user.id, "altcoinjen", [
      ...posts(
        "jenbonk",
        1,
        (index) => `jen likes $BONK too ${index}`,
        FIRST_POST + 20 * DAY_MS
      ),
    ])

    // One creator: their three posts, their coins counted over them.
    const samView = await loadSocialFeedView(user.id, {
      ...EVERYONE,
      creatorId: sam.id,
    })
    expect(samView.held).toBe(3)
    expect(counts(samView.coins)).toEqual([
      { market: "BONK", posts: 2 },
      { market: "WIF", posts: 1 },
    ])

    // One coin across everyone: both creators' BONK posts, newest first.
    const bonk = await loadSocialFeedView(user.id, {
      ...EVERYONE,
      coin: "BONK",
    })
    expect(bonk.posts.map((post) => post.creator.handle)).toEqual([
      "altcoinjen",
      "cryptosam",
      "cryptosam",
    ])
    // The count and the coins stay the scope's own, not the coin's: the
    // panel keeps listing every coin there is to pick from.
    expect(bonk.held).toBe(4)
    expect(counts(bonk.coins)).toEqual([{ market: "BONK", posts: 3 }, { market: "WIF", posts: 1 }])

    // Both at once: the coin inside one creator.
    const samBonk = await loadSocialFeedView(user.id, {
      folderId: null,
      creatorId: sam.id,
      coin: "BONK",
    })
    expect(samBonk.posts).toHaveLength(2)
  })

  it("reads nothing through another member's folder id", async () => {
    const owner = await insertUser(database)
    const stranger = await insertUser(database)
    const sam = await creatorWithPosts(
      owner.id,
      "cryptosam",
      posts("sam", 2, (index) => `sam ${index}`)
    )
    const folders = await createSocialFolder(owner.id, {
      name: "Trusted",
      creatorId: sam.id,
    })
    await creatorWithPosts(
      stranger.id,
      "strangerself",
      posts("their", 2, (index) => `their ${index}`)
    )

    const view = await loadSocialFeedView(stranger.id, {
      ...EVERYONE,
      folderId: folders[0].id,
    })
    expect(view.posts).toEqual([])
    expect(view.held).toBe(0)
  })
})
