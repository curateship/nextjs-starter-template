import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { createProfile } from "@/server/browser/profiles"
import { customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"
import { localMinutes } from "@/lib/social/waking"

import { readBehaviour, recentComments, saveBehaviour } from "../behaviour"
import { createProject } from "../projects"
import { readResults } from "../results"
import { promoAccounts, promoJobs, promoPostAnswers, promoPosts } from "../schema"
import { listOwnPosts } from "./own-posts"
import { queuePostAnswer, queuePostChecks, recordPostCheck, sendPostAnswer } from "./post-numbers"

vi.mock("@/server/browser/command", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/browser/command")>()
  return { ...actual, redditThread: vi.fn(), redditReply: vi.fn() }
})

const { redditThread, redditReply } = await import("@/server/browser/command")
const readThread = vi.mocked(redditThread)
const sendToReddit = vi.mocked(redditReply)

const target = { port: 1, token: "t" } as Parameters<typeof recordPostCheck>[2]
const DAY_MS = 86_400_000
const POST_URL = "https://www.reddit.com/r/SaaS/comments/abc/i_built_a_board/"
const STRANGER = { author: "a_stranger", text: "Does it work for two people?", score: 4, permalink: `${POST_URL}c1/` }
const SECOND = { author: "someone_else", text: "Nice.", score: 1, permalink: `${POST_URL}c2/` }

/** The thread read's answer for the post, with these comments under it. */
function thread(replies: Array<typeof STRANGER>, source: "json" | "page" = "json") {
  return {
    source,
    post: {
      redditId: "t3_abc",
      permalink: "/r/SaaS/comments/abc/i_built_a_board/",
      subreddit: "SaaS",
      title: "I built a board",
      body: "",
      linkUrl: "",
      author: "a_persona",
      score: 12,
      commentCount: replies.length,
      postedAtSeconds: null,
      position: 0,
    },
    replies,
  }
}

/** Waking hours around now on a UTC clock. */
function awake() {
  const minute = localMinutes(new Date(), "UTC")
  const shift = (by: number) => (((minute + by) % 1440) + 1440) % 1440
  return { wakeFromMinute: shift(-120), wakeUntilMinute: shift(120) }
}

/**
 * Your own Reddit posts read again on Check, and the comments under them
 * answered (part 6 of workspace/tasks/New features/new-features-18-nov.md).
 * The browser's answers are written here, so nothing reaches Reddit.
 */
describe("checking and answering under your own Reddit posts", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let accountId: string
  let postId: string
  let projectId: string

  beforeEach(async () => {
    readThread.mockReset()
    sendToReddit.mockReset()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    const readerId = await createProfile(userId, { name: "Reader" }, db)
    await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), readerProfileId: readerId, ...awake() }, db)
    const profileId = await createProfile(userId, { name: "Main" }, db)
    projectId = await createProject(userId, "Taskly", db, ["reddit"])
    accountId = uuid()
    // A year-old account: past its warm-up and no longer young.
    await db.insert(promoAccounts).values({
      id: accountId,
      userId,
      profileId,
      projectId,
      handle: "a_persona",
      redditCreatedAt: new Date(Date.now() - 365 * DAY_MS),
    })
    postId = uuid()
    await db.insert(promoPosts).values({
      id: postId,
      userId,
      accountId,
      projectId,
      subreddit: "SaaS",
      title: "I built a board",
      status: "posted",
      postUrl: POST_URL,
    })
  })

  afterEach(async () => {
    await client.close()
  })

  it("queues one check per press for a post that landed, and skips one already on its way", async () => {
    expect(await queuePostChecks(userId, [postId], db)).toEqual({ queued: 1, skipped: 0 })
    expect(await queuePostChecks(userId, [postId], db)).toEqual({ queued: 0, skipped: 1 })
    expect((await listOwnPosts(userId, db))[0]).toMatchObject({ checking: true, upvotes: null, comments: null })
  })

  it("keeps the numbers and comments, rings nothing on the first check, and rings once for a new comment after", async () => {
    readThread.mockResolvedValueOnce(thread([STRANGER]))
    await recordPostCheck(userId, postId, target, db)
    expect(readThread.mock.calls[0][1]).toEqual({ permalink: "/r/SaaS/comments/abc/i_built_a_board/", replyLimit: 20 })
    const [row] = await listOwnPosts(userId, db)
    expect(row).toMatchObject({ upvotes: 12, commentCount: 1, checkError: "" })
    expect(row.comments).toEqual([{ author: "a_stranger", text: STRANGER.text, score: 4, url: STRANGER.permalink, answer: null, own: false }])
    expect(await db.select().from(customShellNotifications)).toHaveLength(0)

    readThread.mockResolvedValueOnce(thread([STRANGER, SECOND]))
    await recordPostCheck(userId, postId, target, db)
    const notices = await db.select().from(customShellNotifications)
    expect(notices).toHaveLength(1)
    expect(notices[0].message).toBe("New comment on your Reddit post: I built a board")

    // Counted in Results with its upvotes and comments.
    expect((await readResults(userId, 7, db)).find((one) => one.network === "reddit")).toMatchObject({ sent: 1, likes: 12, replies: 2 })
  })

  it("writes only why when Reddit shows the drawn page instead of its data", async () => {
    readThread.mockResolvedValueOnce(thread([STRANGER], "page"))
    await recordPostCheck(userId, postId, target, db)
    const [row] = await listOwnPosts(userId, db)
    expect(row).toMatchObject({ upvotes: null, comments: null })
    expect(row.checkError).toContain("only showed the page")
  })

  it("answers a comment once, from the account that posted, and counts it toward the pace", async () => {
    readThread.mockResolvedValueOnce(thread([STRANGER]))
    await recordPostCheck(userId, postId, target, db)

    await expect(queuePostAnswer(userId, { postId, commentUrl: `${POST_URL}nope/`, text: "Yes" }, db)).rejects.toThrow(
      "not among the comments last read"
    )
    const { jobId } = await queuePostAnswer(userId, { postId, commentUrl: STRANGER.permalink, text: "Yes, two is fine." }, db)
    await expect(queuePostAnswer(userId, { postId, commentUrl: STRANGER.permalink, text: "Again" }, db)).rejects.toThrow(
      "already on its way"
    )
    expect((await listOwnPosts(userId, db))[0].comments?.[0].answer).toMatchObject({ waiting: true, text: "Yes, two is fine." })

    const [job] = await db.select().from(promoJobs).where(eq(promoJobs.id, jobId))
    sendToReddit.mockResolvedValueOnce({ replyUrl: `${STRANGER.permalink}a1/`, visit: null })
    await sendPostAnswer(userId, accountId, job.payload, target, db)
    expect(sendToReddit.mock.calls[0][1]).toEqual({ replyUrl: STRANGER.permalink, text: "Yes, two is fine." })
    await db.update(promoJobs).set({ status: "done" }).where(eq(promoJobs.id, jobId))

    const answers = await db.select().from(promoPostAnswers)
    expect(answers).toHaveLength(1)
    expect((await listOwnPosts(userId, db))[0].comments?.[0].answer).toMatchObject({ text: "Yes, two is fine.", url: `${STRANGER.permalink}a1/` })
    expect((await recentComments(userId, accountId, db)).posted).toHaveLength(2)
    await expect(queuePostAnswer(userId, { postId, commentUrl: STRANGER.permalink, text: "Third" }, db)).rejects.toThrow(
      "already answered"
    )
  })

  it("refuses to answer the account's own comment and another person's post", async () => {
    readThread.mockResolvedValueOnce(thread([{ ...STRANGER, author: "a_persona" }]))
    await recordPostCheck(userId, postId, target, db)
    await expect(queuePostAnswer(userId, { postId, commentUrl: STRANGER.permalink, text: "Hi" }, db)).rejects.toThrow("your own")
    const stranger = (await insertUser(db, { role: "admin" })).id
    await expect(queuePostChecks(stranger, [postId], db)).resolves.toEqual({ queued: 0, skipped: 1 })
    await expect(queuePostAnswer(stranger, { postId, commentUrl: STRANGER.permalink, text: "Hi" }, db)).rejects.toThrow("no longer saved")
  })
})
