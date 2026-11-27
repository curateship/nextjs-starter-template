import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"
import { createProject } from "@/server/social/projects"
import { createProfile } from "@/server/browser/profiles"
import { readBehaviour, saveBehaviour } from "@/server/social/behaviour"
import { commentStateWords } from "@/lib/social/wording"

import { listSentComments, queueCommentChecks } from "./comments"
import { recordCommentCheck } from "./reddit/comment-check"
import { promoAccounts, promoComments, promoFinds, promoJobs, promoKeywords } from "./schema"

vi.mock("@/server/browser/command", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/browser/command")>()
  return { ...actual, redditCommentCheck: vi.fn() }
})

const { redditCommentCheck } = await import("@/server/browser/command")
const readComment = vi.mocked(redditCommentCheck)

const target = { port: 1, token: "t" } as Parameters<typeof recordCommentCheck>[2]
const URL = "https://www.reddit.com/r/SaaS/comments/abc/a_post/def/"

/**
 * What became of a sent comment. Three honest answers and never two: not read
 * yet, read and still there, read and gone.
 */
describe("the comments you sent", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let accountId: string
  let readerId: string
  let findId: string

  beforeEach(async () => {
    readComment.mockReset()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    // Comment checks are read in the reader browser, so one has to be picked.
    readerId = await createProfile(userId, { name: "Reader" }, db)
    await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), readerProfileId: readerId }, db)
    accountId = uuid()
    await db.insert(promoAccounts).values({ id: accountId, userId, handle: "me" })
    const keywordId = uuid()
    await db.insert(promoKeywords).values({ id: keywordId, userId, projectId: await createProject(userId, "A project", db), term: "a term" })
    findId = uuid()
    await db.insert(promoFinds).values({
      id: findId,
      userId,
      keywordId,
      redditId: "t3_abc",
      permalink: "/r/SaaS/comments/abc/a_post/",
      subreddit: "SaaS",
      title: "How do you find users?",
      status: "commented",
    })
  })

  afterEach(async () => {
    await client.close()
  })

  async function sent(overrides: Partial<typeof promoComments.$inferInsert> = {}) {
    const id = uuid()
    await db.insert(promoComments).values({
      id,
      userId,
      findId,
      accountId,
      text: "I talk to them.",
      commentUrl: URL,
      ...overrides,
    })
    return id
  }

  it("lists a comment nobody has checked as not read, never as 0 replies", async () => {
    const id = await sent()
    await sent({ status: "failed", commentUrl: "" })

    const rows = await listSentComments(userId, db)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id,
      postTitle: "How do you find users?",
      postUrl: "https://www.reddit.com/r/SaaS/comments/abc/a_post/",
      subreddit: "SaaS",
      upvotes: null,
      replyCount: null,
      stillVisible: null,
      checkedAt: null,
      checking: false,
      inNextDraft: true,
    })
    expect(commentStateWords(rows[0]).label).toBe("Not read yet")
  })

  it("queues one check per comment, reads it in the reader browser, and never twice", async () => {
    const id = await sent()
    const otherUser = (await insertUser(db, { role: "admin" })).id

    expect(await queueCommentChecks(userId, [id, "missing"], db)).toEqual({
      completed: [id],
      skipped: ["missing"],
    })
    expect(await queueCommentChecks(userId, [id], db)).toEqual({ completed: [], skipped: [id] })
    expect(await queueCommentChecks(otherUser, [id], db)).toEqual({ completed: [], skipped: [id] })

    const jobs = await db.select().from(promoJobs)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ kind: "comment_check", payload: { commentId: id, accountId }, lane: readerId })
    const [row] = await listSentComments(userId, db)
    expect(row.checking).toBe(true)
    expect(commentStateWords(row).label).toBe("Reading")
  })

  it("stores a comment nobody touched as 0 replies, there", async () => {
    const id = await sent()
    readComment.mockResolvedValue({ seenAs: "stranger", visible: true, removedText: "", upvotes: 1, replies: 0 })
    await recordCommentCheck(userId, id, target, db)

    expect(readComment).toHaveBeenCalledWith(target, { commentUrl: URL })
    const [row] = await listSentComments(userId, db)
    expect(row).toMatchObject({ upvotes: 1, replyCount: 0, stillVisible: true, checkedAs: "stranger" })
    expect(commentStateWords(row).label).toBe("There")
  })

  it("stores a comment a moderator removed as gone, not as missing", async () => {
    const id = await sent()
    readComment.mockResolvedValue({
      seenAs: "stranger",
      visible: false,
      removedText: "[removed]",
      upvotes: 3,
      replies: 2,
    })
    await recordCommentCheck(userId, id, target, db)
    const [row] = await listSentComments(userId, db)
    expect(row).toMatchObject({ stillVisible: false, replyCount: 2 })
    expect(commentStateWords(row)).toEqual({
      label: "Gone",
      detail: "A signed-out visitor sees it as removed or deleted.",
    })
  })

  it("says when 'there' is only what the account itself sees", async () => {
    const id = await sent()
    readComment.mockResolvedValue({ seenAs: "you", visible: true, removedText: "", upvotes: null, replies: 4 })
    await recordCommentCheck(userId, id, target, db)
    const [row] = await listSentComments(userId, db)
    expect(row.upvotes).toBeNull()
    expect(commentStateWords(row).label).toBe("There for you")
  })

  it("never hands the browser an address the app did not write", async () => {
    const id = await sent({ commentUrl: "javascript:alert(1)" })
    await expect(recordCommentCheck(userId, id, target, db)).rejects.toThrow("never landed")
    const otherUser = (await insertUser(db, { role: "admin" })).id
    await expect(recordCommentCheck(otherUser, id, target, db)).rejects.toThrow("no longer saved")
    expect(readComment).not.toHaveBeenCalled()
  })

  it("shows why the newest check failed until a reading replaces it", async () => {
    const id = await sent()
    await queueCommentChecks(userId, [id], db)
    await db
      .update(promoJobs)
      .set({ status: "failed", lastError: "Reddit would not answer.", finishedAt: new Date() })
      .where(eq(promoJobs.kind, "comment_check"))
    let [row] = await listSentComments(userId, db)
    expect(commentStateWords(row)).toEqual({ label: "Could not read", detail: "Reddit would not answer." })

    readComment.mockResolvedValue({ seenAs: "stranger", visible: true, removedText: "", upvotes: 2, replies: 0 })
    await recordCommentCheck(userId, id, target, db, new Date(Date.now() + 60_000))
    ;[row] = await listSentComments(userId, db)
    expect(row.checkError).toBeNull()
    expect(commentStateWords(row).label).toBe("There")
  })
})
