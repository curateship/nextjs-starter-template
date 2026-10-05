import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"
import {
  promoAccounts,
  promoComments,
  promoFinds,
  promoKeywords,
} from "@/server/social/schema"

import { postComment } from "./post-comment"

vi.mock("@/server/browser/command", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/browser/command")>()
  return {
    ...actual,
    redditComment: vi.fn(),
  }
})

const { redditComment } = await import("@/server/browser/command")
const sendToReddit = vi.mocked(redditComment)

/**
 * Sending a comment is the only thing in the app that writes to Reddit, and the
 * two ways it can go wrong both lose money or trust: posting twice on one post,
 * or losing the record of an attempt that failed.
 */
describe("sending a comment", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let accountId: string
  let findId: string

  beforeEach(async () => {
    sendToReddit.mockReset()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id

    accountId = uuid()
    await db.insert(promoAccounts).values({ id: accountId, userId, handle: "me" })

    const keywordId = uuid()
    await db.insert(promoKeywords).values({ id: keywordId, userId, term: "a term" })

    findId = uuid()
    await db.insert(promoFinds).values({
      id: findId,
      userId,
      keywordId,
      redditId: "t3_one",
      permalink: "/r/x/comments/one/",
    })
  })

  afterEach(async () => {
    await client.close()
  })

  const target = { port: 1, token: "t" }

  it("records the comment and marks the post replied to", async () => {
    sendToReddit.mockResolvedValue({ commentUrl: "https://reddit.com/x/comment/1" })

    const result = await postComment(
      { userId, findId, accountId, text: "Some words." },
      target,
      db
    )

    expect(result.commentUrl).toBe("https://reddit.com/x/comment/1")
    const [find] = await db.select().from(promoFinds)
    expect(find.status).toBe("commented")
    const [comment] = await db.select().from(promoComments)
    expect(comment.status).toBe("posted")
    expect(comment.text).toBe("Some words.")
  })

  it("refuses a second comment on the same post", async () => {
    sendToReddit.mockResolvedValue({ commentUrl: "https://reddit.com/x/comment/1" })
    await postComment({ userId, findId, accountId, text: "First." }, target, db)

    await expect(
      postComment({ userId, findId, accountId, text: "Second." }, target, db)
    ).rejects.toThrow("already commented")

    // And it never reached Reddit a second time.
    expect(sendToReddit).toHaveBeenCalledTimes(1)
  })

  it("keeps a record of an attempt that failed, with the words that were tried", async () => {
    sendToReddit.mockRejectedValue(new Error("Reddit showed a captcha"))

    await expect(
      postComment({ userId, findId, accountId, text: "Some words." }, target, db)
    ).rejects.toThrow("captcha")

    const [comment] = await db.select().from(promoComments)
    expect(comment.status).toBe("failed")
    expect(comment.text).toBe("Some words.")
    expect(comment.lastError).toContain("captcha")

    // The post keeps its old status, so it still shows as needing an answer
    // rather than being hidden as done.
    const [find] = await db.select().from(promoFinds)
    expect(find.status).toBe("new")
  })

  it("refuses a comment longer than Reddit's cap before calling out", async () => {
    await expect(
      postComment(
        { userId, findId, accountId, text: "x".repeat(1_000) },
        target,
        db
      )
    ).rejects.toThrow("capped at")
    expect(sendToReddit).not.toHaveBeenCalled()
  })

  it("refuses to post for somebody else's post", async () => {
    const other = (await insertUser(db)).id
    await expect(
      postComment({ userId: other, findId, accountId, text: "Hello." }, target, db)
    ).rejects.toThrow("no longer saved")
    expect(sendToReddit).not.toHaveBeenCalled()
  })

  it("notes when the account last posted", async () => {
    sendToReddit.mockResolvedValue({ commentUrl: "https://reddit.com/x/comment/1" })
    await postComment({ userId, findId, accountId, text: "Some words." }, target, db)

    const [account] = await db
      .select()
      .from(promoAccounts)
      .where(eq(promoAccounts.id, accountId))
    expect(account.lastPostedAt).not.toBeNull()
  })
})
