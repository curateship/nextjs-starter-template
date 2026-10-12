import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"
import { addKeyword, listFinds, listKeywords } from "@/server/social/keywords"
import { promoFinds, promoKeywords } from "@/server/social/schema"

import { blockSubreddit } from "./blocked"
import { runKeywordSearch } from "./search"

vi.mock("@/server/browser/command", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/browser/command")>()
  return { ...actual, redditSearch: vi.fn() }
})

const { redditSearch } = await import("@/server/browser/command")
const searchReddit = vi.mocked(redditSearch)

const target = { port: 1, token: "t" } as Parameters<typeof runKeywordSearch>[2]
const NOW = new Date("2099-01-01T12:00:00.000Z")

function post(redditId: string, position: number) {
  return {
    redditId,
    permalink: `/r/SaaS/comments/${redditId}/`,
    subreddit: "SaaS",
    title: `Post ${redditId}`,
    body: "",
    linkUrl: "",
    author: "someone",
    score: 1,
    commentCount: 0,
    postedAtSeconds: Math.floor(NOW.getTime() / 1000) - 3600,
    position,
  }
}

const search = { sort: "relevance", timeWindow: "week" } as const

/**
 * A saved search that names one subreddit and no words, listing its new
 * posts. Everything else about a keyword stays exactly as it was.
 */
describe("watching a subreddit", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string

  beforeEach(async () => {
    searchReddit.mockReset()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
  })

  afterEach(async () => {
    await client.close()
  })

  it("saves a watch with no words and one subreddit, read newest first", async () => {
    const id = await addKeyword(userId, { term: "", subreddits: ["r/SaaS"], ...search }, db)
    const [row] = await db.select().from(promoKeywords)
    expect(row).toMatchObject({ id, term: "", subreddits: ["SaaS"], sort: "new" })
  })

  it("still refuses a saved search with neither words nor a subreddit", async () => {
    await expect(addKeyword(userId, { term: "  ", subreddits: [], ...search }, db)).rejects.toThrow(
      "Type a keyword first, or name one subreddit to watch."
    )
    await expect(
      addKeyword(userId, { term: "", subreddits: ["SaaS", "startups"], ...search }, db)
    ).rejects.toThrow("A watch takes one subreddit.")
  })

  it("keeps one watch per subreddit, without case, and leaves keywords alone", async () => {
    await addKeyword(userId, { term: "", subreddits: ["SaaS"], ...search }, db)
    await expect(
      addKeyword(userId, { term: "", subreddits: ["saas"], ...search }, db)
    ).rejects.toThrow("r/saas is already watched.")
    await addKeyword(userId, { term: "", subreddits: ["startups"], ...search }, db)

    // Keywords with words behave exactly as before, beside the watches.
    await addKeyword(userId, { term: "crm tool", subreddits: ["SaaS"], ...search }, db)
    await expect(
      addKeyword(userId, { term: "CRM tool", subreddits: [], ...search }, db)
    ).rejects.toThrow('"CRM tool" is already saved.')
    const rows = await db.select().from(promoKeywords)
    expect(rows.find((row) => row.term === "crm tool")?.sort).toBe("relevance")
    expect(rows).toHaveLength(3)
  })

  it("reads the subreddit's new posts and says each one's place by newest", async () => {
    const id = await addKeyword(userId, { term: "", subreddits: ["SaaS"], ...search }, db)
    searchReddit.mockResolvedValue({
      source: "json",
      url: "https://www.reddit.com/r/SaaS/new/",
      posts: [post("t3_new", 0), post("t3_older", 1)],
    })

    await runKeywordSearch(userId, id, target, db, NOW)

    expect(searchReddit).toHaveBeenCalledWith(target, {
      query: "",
      subreddit: "SaaS",
      sort: "new",
      window: "week",
    })
    const finds = await listFinds(userId, { keywordId: id, status: "all" }, db, NOW)
    expect(finds.map((find) => find.rankReason)).toEqual([
      "The subreddit's newest post, posted in the last few hours, no replies yet",
      "The subreddit's post 2 by newest, posted in the last few hours, no replies yet",
    ])
    const [card] = await listKeywords(userId, db)
    expect(card).toMatchObject({ term: "", subreddits: ["SaaS"], postCount: 2 })
  })

  it("reads nothing for a watch on a blocked subreddit", async () => {
    const id = await addKeyword(userId, { term: "", subreddits: ["SaaS"], ...search }, db)
    await blockSubreddit(userId, "SaaS", db)
    await runKeywordSearch(userId, id, target, db, NOW)
    expect(searchReddit).not.toHaveBeenCalled()
  })
})

/**
 * Two things a search now carries beyond the posts themselves: where a link
 * post points, and the Everything list, every keyword's posts in one order.
 */
describe("link posts and the Everything list", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string

  beforeEach(async () => {
    searchReddit.mockReset()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
  })

  afterEach(async () => {
    await client.close()
  })

  function answer(posts: ReturnType<typeof post>[]) {
    return { source: "json" as const, url: "https://www.reddit.com/r/SaaS/new/", posts }
  }

  it("keeps a link post's address, drops a picture's, and never loses it to a scraped re-run", async () => {
    const id = await addKeyword(userId, { term: "", subreddits: ["SaaS"], ...search }, db)
    searchReddit.mockResolvedValue(
      answer([
        { ...post("t3_link", 0), linkUrl: "https://example.com/churn" },
        { ...post("t3_pic", 1), linkUrl: "https://i.redd.it/pic.png" },
      ])
    )
    await runKeywordSearch(userId, id, target, db, NOW)

    const stored = async () =>
      Object.fromEntries((await db.select().from(promoFinds)).map((row) => [row.redditId, row.linkUrl]))
    expect(await stored()).toEqual({ t3_link: "https://example.com/churn", t3_pic: "" })

    // The rendered page could not see the link this time.
    searchReddit.mockResolvedValue(answer([post("t3_link", 0)]))
    await runKeywordSearch(userId, id, target, db, NOW)
    expect((await stored()).t3_link).toBe("https://example.com/churn")
  })

  it("lists every keyword's posts in one ranked order when no keyword is named", async () => {
    const saas = await addKeyword(userId, { term: "", subreddits: ["SaaS"], ...search }, db)
    const tools = await addKeyword(userId, { term: "crm tool", subreddits: [], ...search }, db)
    searchReddit.mockResolvedValueOnce(answer([post("t3_a", 0), post("t3_b", 5)]))
    await runKeywordSearch(userId, saas, target, db, NOW)
    searchReddit.mockResolvedValueOnce(answer([post("t3_c", 1)]))
    await runKeywordSearch(userId, tools, target, db, NOW)

    const everything = await listFinds(userId, { status: "all" }, db, NOW)
    expect(everything.map((find) => [find.permalink, find.keywordId])).toEqual([
      ["/r/SaaS/comments/t3_a/", saas],
      ["/r/SaaS/comments/t3_c/", tools],
      ["/r/SaaS/comments/t3_b/", saas],
    ])
  })
})
