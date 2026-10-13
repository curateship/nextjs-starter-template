import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { createProfile } from "@/server/browser/profiles"
import { promoProxies } from "@/server/browser/schema"
import { customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

vi.mock("@/server/browser/command", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/browser/command")>()
  return { ...actual, redditCommentCheck: vi.fn() }
})

const { redditCommentCheck } = await import("@/server/browser/command")
const readComment = vi.mocked(redditCommentCheck)

import { dismissFailures, failedWords, listFailures, ringForFailure } from "./failures"
import { noticeId, noticeLinks, writePromoNotice } from "./notices"
import { createProject } from "./projects"
import { recordCommentCheck } from "./reddit/comment-check"
import { promoAccounts, promoComments, promoFinds, promoJobs, promoKeywords, promoNotices } from "./schema"
import { ringProxyRenewals } from "./upkeep"

const target = { port: 1, token: "t" } as Parameters<typeof recordCommentCheck>[2]
const COMMENT_URL = "https://www.reddit.com/r/SaaS/comments/abc/a_post/def/"

function reply(id: string, text = "Which tool was that?") {
  return { id, author: "a_stranger", text, score: 1, url: `${COMMENT_URL}${id}/`, postedAtSeconds: 1_791_500_000 }
}

/**
 * The bell: one notice per thing, brought back to the top when it happens
 * again; a new reply and a removal each ring once; a proxy renewal rings once
 * per date; and a failed comment rings and lands on the Failed tab.
 */
describe("Promo's bell notices", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let accountId: string
  let findId: string
  let commentId: string

  async function notices() {
    return db
      .select()
      .from(customShellNotifications)
      .where(eq(customShellNotifications.recipientUserId, userId))
  }

  beforeEach(async () => {
    readComment.mockReset()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    const projectId = await createProject(userId, "A project", db)
    accountId = uuid()
    await db.insert(promoAccounts).values({
      id: accountId,
      userId,
      profileId: await createProfile(userId, { name: "Main" }, db),
      handle: "a_persona",
      projectId,
    })
    const keywordId = uuid()
    await db.insert(promoKeywords).values({ id: keywordId, userId, projectId, term: "a term" })
    findId = uuid()
    await db.insert(promoFinds).values({
      id: findId,
      userId,
      keywordId,
      redditId: "t3_abc",
      permalink: "/r/SaaS/comments/abc/a_post/",
      subreddit: "SaaS",
      title: "Which tool do you use?",
    })
    commentId = uuid()
    await db.insert(promoComments).values({
      id: commentId,
      userId,
      findId,
      accountId,
      text: "I use a spreadsheet.",
      commentUrl: COMMENT_URL,
    })
  })

  afterEach(async () => {
    await client.close()
  })

  it("keeps one notice per thing, back on top and unread when it happens again", async () => {
    const notice = { kind: "failed" as const, targetId: "job-1", message: "Did not go out: a comment", detail: "First.", href: "/admin/comments?tab=failed" }
    await writePromoNotice(userId, notice, db, new Date("2026-10-12T10:00:00Z"))
    await db.update(customShellNotifications).set({ readAt: new Date() })
    await writePromoNotice(userId, { ...notice, detail: "Second." }, db, new Date("2026-10-12T11:00:00Z"))

    const rows = await notices()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: noticeId("failed", "job-1"), detail: "Second.", readAt: null })
    expect(await noticeLinks(userId, [rows[0].id], db)).toEqual([
      { id: rows[0].id, kind: "failed", href: "/admin/comments?tab=failed" },
    ])
    // Another person never reads where somebody else's notice opens.
    expect(await noticeLinks((await insertUser(db)).id, [rows[0].id], db)).toEqual([])
  })

  it("rings for a reply the last reading did not have, and not again for the same one", async () => {
    readComment.mockResolvedValue({ upvotes: 2, replies: 1, visible: true, seenAs: "stranger", removedText: "", incoming: [reply("r1")] })
    await recordCommentCheck(userId, commentId, target, db)
    let rows = await notices()
    expect(rows).toHaveLength(1)
    expect(rows[0].message).toBe('New reply to your comment on "Which tool do you use?"')
    expect(rows[0].detail).toBe("u/a_stranger wrote: Which tool was that?")
    const [link] = await db.select().from(promoNotices)
    expect(link.href).toBe(`/admin/comments?replies=${commentId}`)

    await db.update(customShellNotifications).set({ readAt: new Date() })
    await recordCommentCheck(userId, commentId, target, db)
    rows = await notices()
    expect(rows[0].readAt).not.toBeNull()

    readComment.mockResolvedValue({
      upvotes: 2,
      replies: 2,
      visible: true,
      seenAs: "stranger",
      removedText: "",
      incoming: [reply("r1"), reply("r2", "Thanks!")],
    })
    await recordCommentCheck(userId, commentId, target, db)
    rows = await notices()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ readAt: null, detail: "u/a_stranger wrote: Thanks!" })
  })

  it("rings once when a comment goes from there to gone", async () => {
    readComment.mockResolvedValue({ upvotes: 1, replies: 0, visible: true, seenAs: "stranger", removedText: "", incoming: [] })
    await recordCommentCheck(userId, commentId, target, db)
    expect(await notices()).toHaveLength(0)

    readComment.mockResolvedValue({ upvotes: 1, replies: 0, visible: false, seenAs: "stranger", removedText: "", incoming: [] })
    await recordCommentCheck(userId, commentId, target, db)
    await recordCommentCheck(userId, commentId, target, db)
    const rows = await notices()
    expect(rows).toHaveLength(1)
    expect(rows[0].message).toBe('Your comment was removed on "Which tool do you use?"')
  })

  it("never reads a comment the app deleted, so it is never reported as removed", async () => {
    await db.update(promoComments).set({ deletedAt: new Date() }).where(eq(promoComments.id, commentId))
    await expect(recordCommentCheck(userId, commentId, target, db)).rejects.toThrow("You deleted that comment")
    expect(readComment).not.toHaveBeenCalled()
  })

  it("rings once per renewal date for a proxy renewing in the next three days", async () => {
    const now = new Date("2026-10-12T09:00:00Z")
    const proxyId = uuid()
    await db.insert(promoProxies).values({
      id: proxyId,
      userId,
      label: "US residential 3",
      host: "gate.example.com",
      port: 8080,
      monthlyCost: 12,
      renewsOn: "2026-10-14",
    })
    expect(await ringProxyRenewals(db, now)).toBe(1)
    const [row] = await notices()
    expect(row.message).toBe("Renews soon: US residential 3")
    expect(row.detail).toContain("$12.00 a month")

    // An hour later the same date has rung already.
    expect(await ringProxyRenewals(db, new Date(now.getTime() + 2 * 3_600_000))).toBe(0)
    // A new date is a new notice.
    await db.update(promoProxies).set({ renewsOn: "2026-10-15" })
    expect(await ringProxyRenewals(db, new Date(now.getTime() + 4 * 3_600_000))).toBe(1)
    expect(await notices()).toHaveLength(2)
  })

  it("lists a failed comment with its words, rings for it, and lets it be dismissed", async () => {
    const jobId = uuid()
    await db.insert(promoJobs).values({
      id: jobId,
      userId,
      kind: "comment",
      status: "failed",
      payload: { findId, accountId, text: "Try a kanban board.", draftId: null },
      lastError:
        "The browser stopped part-way through posting. It is not tried again, because the comment may already be on Reddit. Check the post before posting again.",
      finishedAt: new Date(),
    })
    await ringForFailure({ id: jobId, userId, kind: "comment" }, "The browser stopped.", db)

    const [failure] = await listFailures(userId, db)
    expect(failure).toMatchObject({
      id: jobId,
      kind: "comment",
      text: "Try a kanban board.",
      mayHaveLanded: true,
      account: { id: accountId, handle: "a_persona" },
      post: { findId, title: "Which tool do you use?", subreddit: "SaaS" },
    })
    expect(failure.projectId).not.toBeNull()
    expect(await failedWords(userId, jobId, db)).toEqual({ findId, text: "Try a kanban board.", accountId })
    expect((await notices())[0].message).toBe("Did not go out: a comment")

    expect(await dismissFailures(userId, [jobId], db)).toEqual({ completed: [jobId], skipped: [] })
    expect(await listFailures(userId, db)).toEqual([])
  })
})
