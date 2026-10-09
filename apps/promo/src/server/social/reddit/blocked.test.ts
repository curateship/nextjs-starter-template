import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"
import type { FindStatus } from "@/lib/social/options"
import { listFinds, listKeywords } from "@/server/social/keywords"
import { promoFinds, promoKeywords } from "@/server/social/schema"

import { blockSubreddit, listBlockedSubreddits, unblockSubreddit } from "./blocked"
import { runKeywordSearch } from "./search"

vi.mock("@/server/browser/command", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/browser/command")>()
  return { ...actual, redditSearch: vi.fn() }
})

const { redditSearch } = await import("@/server/browser/command")
const searchReddit = vi.mocked(redditSearch)

const target = { port: 1, token: "t" } as Parameters<typeof runKeywordSearch>[2]

function post(redditId: string, subreddit: string) {
  return {
    redditId,
    permalink: `/r/${subreddit}/comments/${redditId}/`,
    subreddit,
    title: `A post in ${subreddit}`,
    body: "",
    author: "someone",
    score: 1,
    commentCount: 1,
    postedAtSeconds: null,
    position: 0,
  }
}

/**
 * One off-topic subreddit poisons a keyword on every run. Blocking it has to
 * hide what is stored at once, stop the next search storing more, never hide
 * a post already commented on, and come undone without losing anything.
 */
describe("blocked subreddits", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let keywordId: string

  beforeEach(async () => {
    searchReddit.mockReset()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    keywordId = uuid()
    await db.insert(promoKeywords).values({ id: keywordId, userId, term: "reddit marketing tool" })
  })

  afterEach(async () => {
    await client.close()
  })

  async function insertFind(redditId: string, subreddit: string, status: FindStatus = "new") {
    await db.insert(promoFinds).values({
      id: uuid(),
      userId,
      keywordId,
      redditId,
      permalink: `/r/${subreddit}/comments/${redditId}/`,
      subreddit,
      status,
    })
  }

  it("hides the stored posts at once, says how many, and keeps a commented one", async () => {
    await insertFind("t3_a", "nosleep")
    await insertFind("t3_b", "NoSleep", "skipped")
    await insertFind("t3_c", "nosleep", "commented")
    await insertFind("t3_d", "SaaS")

    const answer = await blockSubreddit(userId, "r/nosleep", db)
    expect(answer).toEqual({ subreddit: "nosleep", hidden: 2 })

    const listed = await listFinds(userId, { status: "all" }, db)
    expect(listed.map((row) => row.subreddit).sort()).toEqual(["SaaS", "nosleep"])
    expect(listed.find((row) => row.subreddit === "nosleep")?.status).toBe("commented")

    // Hidden, not deleted.
    expect(await db.select().from(promoFinds)).toHaveLength(4)

    const [keyword] = await listKeywords(userId, db)
    expect(keyword.postCount).toBe(2)
    expect(keyword.newCount).toBe(1)
  })

  it("stores none of a blocked subreddit's posts on the next run", async () => {
    await blockSubreddit(userId, "nosleep", db)
    searchReddit.mockResolvedValueOnce({
      source: "json",
      url: "",
      posts: [post("t3_x", "NoSleep"), post("t3_y", "SaaS")],
    })

    const outcome = await runKeywordSearch(userId, keywordId, target, db)

    expect(outcome).toMatchObject({ seen: 1, new: 1 })
    const stored = await db.select().from(promoFinds)
    expect(stored.map((row) => row.redditId)).toEqual(["t3_y"])
  })

  it("does not search a listed subreddit that is blocked, nor fall back to all of Reddit", async () => {
    await db
      .update(promoKeywords)
      .set({ subreddits: ["nosleep"] })
      .where(eq(promoKeywords.id, keywordId))
    await blockSubreddit(userId, "NOSLEEP", db)

    const outcome = await runKeywordSearch(userId, keywordId, target, db)

    expect(searchReddit).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ seen: 0, new: 0 })
  })

  it("brings the posts back on unblocking", async () => {
    await insertFind("t3_a", "nosleep")
    await blockSubreddit(userId, "nosleep", db)
    expect(await listFinds(userId, { status: "all" }, db)).toHaveLength(0)

    expect(await unblockSubreddit(userId, "NoSleep", db)).toEqual({
      subreddit: "nosleep",
      restored: 1,
    })
    expect(await listFinds(userId, { status: "all" }, db)).toHaveLength(1)
    expect(await listBlockedSubreddits(userId, db)).toEqual([])
  })

  it("lists each block with what it is hiding, and blocking twice is harmless", async () => {
    await insertFind("t3_a", "nosleep")
    await blockSubreddit(userId, "nosleep", db)
    await blockSubreddit(userId, "https://www.reddit.com/r/NoSleep/", db)

    const list = await listBlockedSubreddits(userId, db)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ subreddit: "nosleep", hidden: 1 })
  })

  it("refuses an empty name and an unblock of something not blocked", async () => {
    await expect(blockSubreddit(userId, "r/", db)).rejects.toThrow("Type a subreddit name first.")
    await expect(unblockSubreddit(userId, "nosleep", db)).rejects.toThrow("is not blocked")
  })

  it("keeps one person's list from hiding another person's posts", async () => {
    const other = (await insertUser(db, { role: "admin" })).id
    await insertFind("t3_a", "nosleep")
    await blockSubreddit(other, "nosleep", db)

    expect(await listFinds(userId, { status: "all" }, db)).toHaveLength(1)
  })
})
