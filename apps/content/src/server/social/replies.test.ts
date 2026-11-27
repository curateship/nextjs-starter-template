import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { and, eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { createProfile } from "@/server/browser/profiles"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"
import { createProject } from "@/server/social/projects"
import { localMinutes } from "@/lib/social/waking"

import { readBehaviour, saveBehaviour } from "./behaviour"
import { listSentComments } from "./comments"
import { buildDraftPrompt } from "./drafts"
import { exampleComments } from "./examples"
import { loadFindDetail } from "./keywords"
import { recordCommentCheck } from "./reddit/comment-check"
import { postReply } from "./reddit/post-reply"
import { cancelWaitingReply, loadCommentReplies, queueReply } from "./replies"
import {
  promoAccounts,
  promoComments,
  promoDrafts,
  promoFinds,
  promoJobs,
  promoKeywords,
} from "./schema"

vi.mock("@/server/browser/command", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/browser/command")>()
  return { ...actual, redditCommentCheck: vi.fn(), redditReply: vi.fn() }
})

const { redditCommentCheck, redditReply } = await import("@/server/browser/command")
const readComment = vi.mocked(redditCommentCheck)
const sendToReddit = vi.mocked(redditReply)

const target = { port: 1, token: "t" } as Parameters<typeof postReply>[1]
const DAY_MS = 86_400_000
const COMMENT_URL = "https://www.reddit.com/r/SaaS/comments/abc/a_post/def/"
const THEIR_REPLY = {
  id: "ghi",
  author: "a_stranger",
  text: "Which tool did you use for that?",
  score: 3,
  url: "https://www.reddit.com/r/SaaS/comments/abc/a_post/ghi/",
  postedAtSeconds: 1_791_500_000,
}
const ANOTHER_REPLY = { ...THEIR_REPLY, id: "jkl", author: "someone_else", text: "Same here.", url: "https://www.reddit.com/r/SaaS/comments/abc/a_post/jkl/" }

/** A check's answer for the comment, with these replies under it. */
function reading(incoming = [THEIR_REPLY, ANOTHER_REPLY]) {
  return {
    seenAs: "stranger" as const,
    visible: true,
    removedText: "",
    upvotes: 4,
    replies: incoming.length,
    incoming,
  }
}

/** Waking hours around now on a UTC clock, or ones that start in two hours. */
function hours(awake: boolean) {
  const minute = localMinutes(new Date(), "UTC")
  const shift = (by: number) => (((minute + by) % 1440) + 1440) % 1440
  return awake
    ? { wakeFromMinute: shift(-120), wakeUntilMinute: shift(120) }
    : { wakeFromMinute: shift(120), wakeUntilMinute: shift(240) }
}

/**
 * Answering the person who answered you: their reply is read with the
 * comment's check, answered from the account that sent the comment, stored
 * as a comment with a parent, and never sent twice or on its own.
 */
describe("answering a reply to a comment you sent", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let accountId: string
  let findId: string
  let commentId: string

  beforeEach(async () => {
    readComment.mockReset()
    sendToReddit.mockReset()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    const readerId = await createProfile(userId, { name: "Reader" }, db)
    await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), readerProfileId: readerId, ...hours(true) }, db)
    const profileId = await createProfile(userId, { name: "Main" }, db)
    accountId = uuid()
    // A year-old account: past its warm-up and no longer young.
    await db.insert(promoAccounts).values({
      id: accountId,
      userId,
      profileId,
      handle: "a_persona",
      redditCreatedAt: new Date(Date.now() - 365 * DAY_MS),
    })
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
    commentId = uuid()
    await db.insert(promoComments).values({
      id: commentId,
      userId,
      findId,
      accountId,
      text: "I talk to them on Reddit.",
      status: "posted",
      commentUrl: COMMENT_URL,
    })
  })

  afterEach(async () => {
    await client.close()
  })

  async function replyJobs() {
    return db.select().from(promoJobs).where(eq(promoJobs.kind, "reply"))
  }

  async function checkNow(incoming = [THEIR_REPLY, ANOTHER_REPLY]) {
    readComment.mockResolvedValueOnce(reading(incoming))
    await recordCommentCheck(userId, commentId, target, db)
  }

  it("keeps a comment's replies unread until a check reads their words", async () => {
    expect((await loadCommentReplies(userId, commentId, db)).replies).toBeNull()
    expect((await listSentComments(userId, db))[0].toAnswer).toBeNull()

    await checkNow()

    const view = await loadCommentReplies(userId, commentId, db)
    expect(view.replies?.map((reply) => [reply.author, reply.text])).toEqual([
      ["a_stranger", "Which tool did you use for that?"],
      ["someone_else", "Same here."],
    ])
    expect(view.replies?.[0].postedAt).toBe(new Date(1_791_500_000_000).toISOString())
    expect((await listSentComments(userId, db))[0].toAnswer).toBe(2)
  })

  it("keeps the last replies read when an older browser sends none", async () => {
    await checkNow()
    const { incoming: _dropped, ...old } = reading()
    readComment.mockResolvedValueOnce(old)
    await recordCommentCheck(userId, commentId, target, db)
    expect((await loadCommentReplies(userId, commentId, db)).replies).toHaveLength(2)
  })

  it("queues an answer from the account that sent the comment, and only one", async () => {
    await checkNow()
    const queued = await queueReply(userId, { commentId, replyId: "ghi", text: "  Plain notes.  ", draftId: null }, db)

    expect(queued.runAfter).toBeNull()
    const [job] = await replyJobs()
    expect(job.payload).toEqual({ commentId, replyId: "ghi", accountId, text: "Plain notes.", draftId: null })
    // Filed under the account's own profile, never the reader's.
    const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
    expect(job.lane).toBe(account.profileId)

    await expect(
      queueReply(userId, { commentId, replyId: "ghi", text: "Again.", draftId: null }, db)
    ).rejects.toThrow("already on its way")
    expect((await loadCommentReplies(userId, commentId, db)).replies?.[0].pending).toEqual({
      runAfter: null,
      running: false,
    })

    await cancelWaitingReply(userId, commentId, "ghi", db)
    expect(await replyJobs()).toHaveLength(0)
  })

  it("waits for the account's morning outside its waking hours", async () => {
    await checkNow()
    await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), ...hours(false) }, db)
    const queued = await queueReply(userId, { commentId, replyId: "ghi", text: "Later.", draftId: null }, db)
    expect(queued.runAfter!.getTime()).toBeGreaterThan(Date.now())
  })

  it("refuses a reply it never read, a retired account, and an empty answer", async () => {
    await expect(
      queueReply(userId, { commentId, replyId: "ghi", text: "Hi.", draftId: null }, db)
    ).rejects.toThrow("not among the replies last read")

    await checkNow()
    await expect(
      queueReply(userId, { commentId, replyId: "ghi", text: "   ", draftId: null }, db)
    ).rejects.toThrow("nothing to post")

    await db.update(promoAccounts).set({ retiredAt: new Date() }).where(eq(promoAccounts.id, accountId))
    await expect(
      queueReply(userId, { commentId, replyId: "ghi", text: "Hi.", draftId: null }, db)
    ).rejects.toThrow("is retired")
    expect(await replyJobs()).toHaveLength(0)
  })

  it("refuses another person's comment", async () => {
    await checkNow()
    const stranger = (await insertUser(db, { role: "admin" })).id
    await expect(
      queueReply(stranger, { commentId, replyId: "ghi", text: "Hi.", draftId: null }, db)
    ).rejects.toThrow("no longer saved")
  })

  it("stores a sent answer against the reply it answers, and never offers it again", async () => {
    await checkNow()
    const draftId = uuid()
    await db.insert(promoDrafts).values({ id: draftId, userId, findId, text: "Plain notes.", replyToId: "ghi" })
    sendToReddit.mockResolvedValueOnce({
      replyUrl: "https://www.reddit.com/r/SaaS/comments/abc/comment/mno/",
      visit: null,
    })

    await postReply({ userId, commentId, replyId: "ghi", text: "Plain notes.", draftId }, target, db)

    expect(sendToReddit).toHaveBeenCalledWith(target, { replyUrl: THEIR_REPLY.url, text: "Plain notes." })
    const [answer] = await db.select().from(promoComments).where(eq(promoComments.parentId, commentId))
    expect(answer).toMatchObject({
      status: "posted",
      accountId,
      findId,
      commentUrl: "https://www.reddit.com/r/SaaS/comments/abc/comment/mno/",
      replyTo: { id: "ghi", author: "a_stranger", text: "Which tool did you use for that?" },
    })
    const [draft] = await db.select().from(promoDrafts).where(eq(promoDrafts.id, draftId))
    expect(draft.status).toBe("sent")

    // Not a row of its own on the Comments screen; the comment has one left to answer.
    const rows = await listSentComments(userId, db)
    expect(rows.map((row) => row.id)).toEqual([commentId])
    expect(rows[0].toAnswer).toBe(1)

    // Not a voice example either, since it has no switch of its own.
    expect(await exampleComments(userId, accountId, db)).toEqual(["I talk to them on Reddit."])

    const view = await loadCommentReplies(userId, commentId, db)
    expect(view.replies?.[0].answer?.text).toBe("Plain notes.")
    await expect(
      queueReply(userId, { commentId, replyId: "ghi", text: "Twice.", draftId: null }, db)
    ).rejects.toThrow("already answered")

    // Deleted from Reddit later: still listed, from what it said when answered.
    await checkNow([ANOTHER_REPLY])
    const after = await loadCommentReplies(userId, commentId, db)
    expect(after.replies?.map((reply) => [reply.id, reply.gone])).toEqual([
      ["jkl", false],
      ["ghi", true],
    ])
  })

  it("records a failed answer with the words that were tried", async () => {
    await checkNow()
    sendToReddit.mockRejectedValueOnce(new Error("reply: no Reply button under that reply"))

    await expect(
      postReply({ userId, commentId, replyId: "ghi", text: "Plain notes.", draftId: null }, target, db)
    ).rejects.toThrow("no Reply button")

    const [failed] = await db
      .select()
      .from(promoComments)
      .where(and(eq(promoComments.parentId, commentId), eq(promoComments.status, "failed")))
    expect(failed).toMatchObject({ text: "Plain notes.", lastError: "reply: no Reply button under that reply", commentUrl: "" })
    // A failure is not an answer: the reply is still there to answer.
    expect((await listSentComments(userId, db))[0].toAnswer).toBe(2)
  })

  it("shows a failed job's reason and words in the window", async () => {
    await checkNow()
    await queueReply(userId, { commentId, replyId: "ghi", text: "Plain notes.", draftId: null }, db)
    await db
      .update(promoJobs)
      .set({ status: "failed", lastError: "reply: the browser is not signed in to Reddit", finishedAt: new Date() })
      .where(eq(promoJobs.kind, "reply"))

    const view = await loadCommentReplies(userId, commentId, db)
    expect(view.replies?.[0]).toMatchObject({
      pending: null,
      failed: { text: "Plain notes.", error: "reply: the browser is not signed in to Reddit" },
    })
  })

  it("keeps a reply's drafts out of the post's own drafts", async () => {
    await db.insert(promoDrafts).values([
      { id: uuid(), userId, findId, text: "For the post." },
      { id: uuid(), userId, findId, text: "For the reply.", replyToId: "ghi" },
    ])
    await checkNow()

    const detail = await loadFindDetail(userId, findId, db)
    expect(detail?.drafts.map((draft) => draft.text)).toEqual(["For the post."])
    const view = await loadCommentReplies(userId, commentId, db)
    expect(view.replies?.[0].drafts.map((draft) => draft.text)).toEqual(["For the reply."])
  })
})

describe("the prompt for answering a reply", () => {
  const base = {
    subreddit: "SaaS",
    title: "How do you find users?",
    body: "Struggling to find my first ten.",
    replies: [{ author: "top_reply", text: "Cold email works.", score: 40 }],
    voice: "Short and plain.",
    product: "",
    commentRules: "",
    count: 2,
  }

  it("carries the post, my comment and their reply, and not the post's other replies", () => {
    const prompt = buildDraftPrompt({
      ...base,
      answering: {
        myComment: "I talk to them on Reddit.",
        reply: { author: "a_stranger", text: "Which tool did you use for that?" },
      },
    })
    expect(prompt).toContain("POST TITLE: How do you find users?")
    expect(prompt).toContain("Struggling to find my first ten.")
    expect(prompt).toContain("MY COMMENT ON THE POST:\nI talk to them on Reddit.")
    expect(prompt).toContain("from a_stranger")
    expect(prompt).toContain("Which tool did you use for that?")
    expect(prompt).toContain("Write 2 different replies I could post.")
    expect(prompt).not.toContain("Cold email works.")
    expect(prompt).not.toContain("REPLIES ALREADY THERE")
  })

  it("is the comment prompt exactly when nothing is being answered", () => {
    expect(buildDraftPrompt({ ...base, answering: null })).toBe(buildDraftPrompt(base))
    expect(buildDraftPrompt(base)).toContain("REPLIES ALREADY THERE:\n1. top_reply (40 upvotes): Cold email works.")
  })
})
