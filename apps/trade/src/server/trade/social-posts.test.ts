import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import type { ParsedSocialPost } from "@/lib/trade/social/x-profile"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  addSocialCreator,
  findSocialCreator,
  SocialCreatorError,
} from "@/server/trade/social-creators"
import {
  loadSocialDashboard,
  loadSocialPostsPage,
  refreshSocialCreator,
  storeSocialPosts,
  SocialPostsError,
} from "@/server/trade/social-posts"

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
    text: `post number ${index + 1}`,
    url: null,
    seen: 1000 + index,
    likes: 10,
    replies: 1,
    reposts: 2,
    replyToId: null,
    markets: index % 2 === 0 ? ["BONK"] : ["BONK", "WIF"],
  }))
}

/** Store posts the way a sync stores them. */
async function store(
  userId: string,
  handle: string,
  posts: ParsedSocialPost[]
) {
  const creator = await findSocialCreator(userId, handle)
  if (!creator) throw new Error(`no creator ${handle}`)
  await storeSocialPosts(userId, creator.id, posts)
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

  it("says the screen should redraw when a post it already held was written over", async () => {
    // A post can gain views, or coins Trade did not used to read. Counting
    // only the new ones left the markets panel showing the version before the
    // write, which is what Tyler saw on 29 Sep 2026.
    const userId = await member()
    await addSocialCreator(userId, "cryptosam")
    const [post] = fortyPosts()
    await store(userId, "cryptosam", [{ ...post, markets: [] }])
    const creator = await findSocialCreator(userId, "cryptosam")

    await storeSocialPosts(userId, creator!.id, [
      { ...post, markets: ["BONK"] },
    ])

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

    // Every post names BONK; every second one also names WIF.
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
    for (const post of page.posts) expect(post.markets).toContain("WIF")
  })

  it("names no coin for a creator whose posts name none", async () => {
    const userId = await member()
    await addSocialCreator(userId, "cryptosam")
    await store(userId, "cryptosam", [{ ...fortyPosts()[0], markets: [] }])

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
