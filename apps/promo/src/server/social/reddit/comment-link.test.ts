import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const thread = vi.hoisted(() => ({ replies: [] as Array<{ author: string; text: string; score: number; permalink: string }> }))
vi.mock("@/server/browser/command", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/browser/command")>()),
  redditThread: vi.fn(async () => ({ source: "json", post: null, replies: thread.replies })),
}))

import { redditThread } from "@/server/browser/command"
import { uuid } from "@/server/auth/security"
import { TryAgainLater } from "@/server/social/jobs"
import { createProject } from "@/server/social/projects"
import { promoAccounts, promoComments, promoFinds, promoKeywords, promoSearches } from "@/server/social/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

import { findCommentLink, sameComment } from "./comment-link"

/** A comment a phone posted has no address until the reader finds it in the thread. */
describe("a phone comment's link", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let commentId: string

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    const projectId = await createProject(userId, "Promo", db)
    const [keyword] = await db
      .insert(promoKeywords)
      .values({ id: uuid(), userId, projectId, term: "client work", subreddits: [], sort: "new", timeWindow: "week" })
      .returning()
    const [search] = await db.insert(promoSearches).values({ id: uuid(), userId, keywordId: keyword.id, status: "done" }).returning()
    const [find] = await db
      .insert(promoFinds)
      .values({
        id: uuid(),
        userId,
        keywordId: keyword.id,
        firstSearchId: search.id,
        redditId: "t3_1abc234",
        permalink: "/r/productivity/comments/1abc234/a_post/",
        subreddit: "productivity",
        title: "A post",
        score: 1,
        commentCount: 1,
        rank: 1,
      })
      .returning()
    const accountId = uuid()
    await db.insert(promoAccounts).values({ id: accountId, userId, handle: "Promo_Tester" })
    commentId = uuid()
    await db.insert(promoComments).values({ id: commentId, userId, findId: find.id, accountId, text: "We keep it  in one board.\n" })
  })

  afterEach(async () => {
    await client.close()
  })

  it("takes the account's reply with the same words from the post's newest replies", async () => {
    thread.replies = [
      { author: "promo_tester", text: "Something else entirely.", score: 1, permalink: "https://www.reddit.com/r/productivity/comments/1abc234/a_post/old1/" },
      { author: "someone", text: "We keep it in one board.", score: 1, permalink: "https://www.reddit.com/r/productivity/comments/1abc234/a_post/copy1/" },
      { author: "promo_tester", text: "We keep it in one board.", score: 1, permalink: "https://www.reddit.com/r/productivity/comments/1abc234/a_post/new1/" },
    ]
    const target = { port: 1, token: "t" }
    expect(await findCommentLink(userId, { commentId }, target, db)).toBe(
      "https://www.reddit.com/r/productivity/comments/1abc234/a_post/new1/"
    )
    expect(redditThread).toHaveBeenCalledWith(target, { permalink: "/r/productivity/comments/1abc234/a_post/", replyLimit: 50, sort: "new" })
    const [saved] = await db.select().from(promoComments).where(eq(promoComments.id, commentId))
    expect(saved.commentUrl).toBe("https://www.reddit.com/r/productivity/comments/1abc234/a_post/new1/")
  })

  it("fails, to be tried again, when Reddit does not show it yet", async () => {
    thread.replies = []
    await expect(findCommentLink(userId, { commentId }, { port: 1, token: "t" }, db)).rejects.toThrow(
      "The reader did not find u/Promo_Tester's comment among the post's newest 50 replies yet."
    )
    await expect(findCommentLink(userId, { commentId }, { port: 1, token: "t" }, db)).rejects.toBeInstanceOf(TryAgainLater)
  })

  it("compares the words without spacing or case, and only their start", () => {
    expect(sameComment("We keep it  in one board.\n", "we keep it in one board.")).toBe(true)
    expect(sameComment("A", "B")).toBe(false)
    expect(sameComment("", "")).toBe(false)
  })
})
