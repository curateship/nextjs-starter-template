import { PGlite } from "@electric-sql/pglite"
import { sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { buildCoinMatchList } from "@/lib/trade/social/coin-matcher"
import type { ParsedSocialPost } from "@/lib/trade/social/x-profile"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  addSocialCreator,
  findSocialCreator,
  SocialCreatorError,
} from "@/server/trade/social-creators"
import { fillPostCoinsForCreator } from "@/server/trade/social-post-coins"
import {
  loadSocialDashboard,
  loadSocialPostsPage,
  refreshSocialCreator,
  rereadCreatorCoins,
  storeSocialPosts,
  SocialPostsError,
} from "@/server/trade/social-posts"

/**
 * The coins Trade has markets for, in these tests. Mocked because the real list
 * is Hyperliquid's own market list, and a test must not ask an exchange
 * anything.
 */
vi.mock("@/server/trade/social-coin-list", () => ({
  loadCoinMatchList: async () =>
    buildCoinMatchList(["BONK", "WIF", "SOL", "ETH"]),
}))

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => client.close())

/**
 * Forty posts, one a day from 1 May 2026. Written in UTC so the test reads
 * the same in every timezone.
 */
const FIRST_POST = Date.UTC(2026, 4, 1, 9, 15)
const DAY_MS = 24 * 60 * 60 * 1000

function fortyPosts(): ParsedSocialPost[] {
  return Array.from({ length: 40 }, (_, index) => ({
    // Built as text, not arithmetic: an X post id is past what a JavaScript
    // number can hold exactly, so adding to one gives every post the same id.
    sourceId: `21000000000000000${String(index).padStart(2, "0")}`,
    postedAt: FIRST_POST + index * DAY_MS,
    // The coins are in the words, because that is where Trade reads them from.
    text:
      index % 2 === 0
        ? `post number ${index + 1}: buying $BONK`
        : `post number ${index + 1}: buying $BONK and $WIF`,
    url: null,
    seen: 1000 + index,
    likes: 10,
    replies: 1,
    reposts: 2,
    replyToId: null,
  }))
}

/**
 * Store posts the way a sync stores them, and read their coins the way a sync
 * reads them: the two steps `refreshSocialCreator` takes, in the same order.
 */
async function store(
  userId: string,
  handle: string,
  posts: ParsedSocialPost[]
) {
  const creator = await findSocialCreator(userId, handle)
  if (!creator) throw new Error(`no creator ${handle}`)
  await storeSocialPosts(userId, creator.id, posts)
  await fillPostCoinsForCreator(userId, creator.id)
}

async function member() {
  const user = await insertUser(database)
  return user.id
}

describe("tracking a creator", () => {
  it("takes a bare handle and stores it", async () => {
    const userId = await member()

    const creator = await addSocialCreator(userId, "@cryptosam")

    expect(creator.handle).toBe("cryptosam")
    expect(creator.platform).toBe("x")
  })

  it("refuses a second row for a handle already tracked, whatever the capitals", async () => {
    const userId = await member()
    await addSocialCreator(userId, "cryptosam")

    await expect(
      addSocialCreator(userId, "https://x.com/CryptoSam")
    ).rejects.toThrow(SocialCreatorError)
  })

  it("lets a second member track the same account", async () => {
    const first = await member()
    const second = await member()
    await addSocialCreator(first, "cryptosam")

    const creator = await addSocialCreator(second, "cryptosam")

    expect(creator.handle).toBe("cryptosam")
    expect(creator.id).not.toBe(
      (await findSocialCreator(first, "cryptosam"))?.id
    )
  })

  it("refuses an address pointing at this machine", async () => {
    const userId = await member()

    await expect(
      addSocialCreator(userId, "https://localhost:3000/cryptosam")
    ).rejects.toThrow(SocialCreatorError)
  })
})

describe("storing what a sync read", () => {
  it("leaves the count unchanged when the same posts come back", async () => {
    // A profile page shows the same handful every time it is read. Syncing
    // twice in a row must not double the count.
    const userId = await member()
    await addSocialCreator(userId, "cryptosam")

    await store(userId, "cryptosam", fortyPosts())
    await store(userId, "cryptosam", fortyPosts())

    const dashboard = await loadSocialDashboard(userId, "cryptosam")
    expect(dashboard.postsHeld).toBe(40)
  })

  it("keeps only the new ones when the reads overlap", async () => {
    const userId = await member()
    await addSocialCreator(userId, "cryptosam")
    await store(userId, "cryptosam", fortyPosts().slice(0, 5))

    await store(userId, "cryptosam", fortyPosts().slice(3, 8))

    const dashboard = await loadSocialDashboard(userId, "cryptosam")
    expect(dashboard.postsHeld).toBe(8)
  })

  it("updates a post whose words have changed rather than adding it again", async () => {
    const userId = await member()
    await addSocialCreator(userId, "cryptosam")
    const [post] = fortyPosts()
    await store(userId, "cryptosam", [post])

    await store(userId, "cryptosam", [{ ...post, text: "edited", seen: 9999 }])

    const dashboard = await loadSocialDashboard(userId, "cryptosam")
    expect(dashboard.postsHeld).toBe(1)
    expect(dashboard.posts[0].text).toBe("edited")
    expect(dashboard.posts[0].seen).toBe(9999)
  })

  it("reads the coins again when a post's words have been edited", async () => {
    // A post can gain views, or be edited into naming a coin it did not name
    // before. Counting only the new ones left the markets panel showing the
    // version before the write, which is what Tyler saw on 29 Sep 2026.
    const userId = await member()
    await addSocialCreator(userId, "cryptosam")
    const [post] = fortyPosts()
    await store(userId, "cryptosam", [{ ...post, text: "nothing yet" }])
    const creator = await findSocialCreator(userId, "cryptosam")

    await storeSocialPosts(userId, creator!.id, [
      { ...post, text: "now naming $BONK" },
    ])
    await fillPostCoinsForCreator(userId, creator!.id)

    const { markets } = await loadSocialDashboard(userId, "cryptosam")
    expect(markets).toEqual([{ market: "BONK", posts: 1 }])
  })

  it("refuses to sync a handle this member does not track", async () => {
    const userId = await member()

    await expect(
      refreshSocialCreator(userId, "cryptosam", true)
    ).rejects.toThrow(SocialPostsError)
  })
})

describe("the markets panel", () => {
  it("counts every post naming a coin, over everything held", async () => {
    const userId = await member()
    await addSocialCreator(userId, "cryptosam")
    await store(userId, "cryptosam", fortyPosts())

    const { markets } = await loadSocialDashboard(userId, "cryptosam")

    // Every post names BONK in its words; every second one also names WIF.
    expect(markets).toEqual([
      { market: "BONK", posts: 40 },
      { market: "WIF", posts: 20 },
    ])
  })

  it("counts past the page on screen", async () => {
    // The dashboard sends the newest 50 posts. The count must be 40, not the
    // number of them that happen to be in that page.
    const userId = await member()
    await addSocialCreator(userId, "cryptosam")
    await store(userId, "cryptosam", fortyPosts())

    const { markets, posts } = await loadSocialDashboard(userId, "cryptosam")

    expect(posts.length).toBeLessThanOrEqual(40)
    expect(markets[0].posts).toBe(40)
  })

  it("narrows the posts to one coin in the database, not on screen", async () => {
    const userId = await member()
    await addSocialCreator(userId, "cryptosam")
    await store(userId, "cryptosam", fortyPosts())
    const creator = await findSocialCreator(userId, "cryptosam")

    const page = await loadSocialPostsPage(userId, creator!.id, null, "WIF")

    expect(page.posts).toHaveLength(20)
    for (const post of page.posts) expect(post.coins).toContain("WIF")
  })

  it("names no coin for a creator whose posts name none", async () => {
    const userId = await member()
    await addSocialCreator(userId, "cryptosam")
    await store(userId, "cryptosam", [
      { ...fortyPosts()[0], text: "no coin in this one" },
    ])

    const { markets } = await loadSocialDashboard(userId, "cryptosam")

    expect(markets).toEqual([])
  })

  it("keeps one member's coins out of another's count", async () => {
    const first = await member()
    const second = await member()
    await addSocialCreator(first, "cryptosam")
    await addSocialCreator(second, "cryptosam")
    await store(first, "cryptosam", fortyPosts())

    const { markets } = await loadSocialDashboard(second, "cryptosam")

    expect(markets).toEqual([])
  })
})

describe("what one member can see of another", () => {
  it("keeps each member's posts to themselves", async () => {
    const first = await member()
    const second = await member()
    await addSocialCreator(first, "cryptosam")
    await addSocialCreator(second, "cryptosam")
    await store(first, "cryptosam", fortyPosts())

    const theirs = await loadSocialDashboard(second, "cryptosam")

    expect(theirs.postsHeld).toBe(0)
    expect(theirs.posts).toHaveLength(0)
  })

  it("does not answer at all for a creator this member never added", async () => {
    const first = await member()
    const second = await member()
    await addSocialCreator(first, "cryptosam")

    await expect(loadSocialDashboard(second, "cryptosam")).rejects.toThrow(
      SocialPostsError
    )
  })
})

describe("reading the coins out of the words", () => {
  it("leaves one row per coin however many times a post names it", async () => {
    const userId = await member()
    await addSocialCreator(userId, "cryptosam")
    const [post] = fortyPosts()
    const text = "$BONK, BONK, bonk, $BONK again"

    await store(userId, "cryptosam", [{ ...post, text }])
    // The same post arriving a second time, which is every sync.
    await store(userId, "cryptosam", [{ ...post, text }])
    await rereadCreatorCoins(userId, "cryptosam")

    const { markets, posts } = await loadSocialDashboard(userId, "cryptosam")
    expect(markets).toEqual([{ market: "BONK", posts: 1 }])
    expect(posts[0].coins).toEqual(["BONK"])
  })

  it("never names a coin Trade has no market for", async () => {
    const userId = await member()
    await addSocialCreator(userId, "cryptosam")
    const [post] = fortyPosts()

    await store(userId, "cryptosam", [
      { ...post, text: "$LTC and litecoin and LTC, plus $WIF" },
    ])

    const { markets } = await loadSocialDashboard(userId, "cryptosam")
    expect(markets).toEqual([{ market: "WIF", posts: 1 }])
  })

  it("carries on where a part-read pass stopped instead of starting over", async () => {
    // One pass reads 500 posts, so a creator with more than that is left with
    // some waiting. Pressing the button again must finish those rather than
    // forgetting every answer and re-reading the same newest 500 for ever.
    const userId = await member()
    await addSocialCreator(userId, "cryptosam")
    await store(userId, "cryptosam", fortyPosts().slice(0, 3))
    await database.execute(
      sql`update trade_social_posts set coins_read_at = null
          where id = (select id from trade_social_posts
                      order by posted_at asc limit 1)`
    )

    const answer = await rereadCreatorCoins(userId, "cryptosam")

    expect(answer).toEqual({ read: 1, waiting: 0 })
  })

  it("starts over once nothing is waiting", async () => {
    const userId = await member()
    await addSocialCreator(userId, "cryptosam")
    await store(userId, "cryptosam", fortyPosts().slice(0, 3))

    const answer = await rereadCreatorCoins(userId, "cryptosam")

    expect(answer).toEqual({ read: 3, waiting: 0 })
  })

  it("says how many posts it read and how many are left", async () => {
    const userId = await member()
    await addSocialCreator(userId, "cryptosam")
    await store(userId, "cryptosam", fortyPosts())

    const answer = await rereadCreatorCoins(userId, "cryptosam")

    expect(answer).toEqual({ read: 40, waiting: 0 })
  })

  it("keeps one member's coins out of another member's posts", async () => {
    const first = await member()
    const second = await member()
    await addSocialCreator(first, "cryptosam")
    await addSocialCreator(second, "cryptosam")
    await store(first, "cryptosam", fortyPosts())

    const answer = await rereadCreatorCoins(second, "cryptosam")

    expect(answer).toEqual({ read: 0, waiting: 0 })
    const page = await loadSocialDashboard(second, "cryptosam")
    expect(page.posts).toEqual([])
  })
})
