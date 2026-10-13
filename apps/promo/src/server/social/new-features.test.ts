import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { createProfile } from "@/server/browser/profiles"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"
import { localMinutes } from "@/lib/social/waking"

vi.mock("@/server/browser/command", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/browser/command")>()
  return {
    ...actual,
    redditSearch: vi.fn(),
    redditSubmit: vi.fn(),
    redditDeleteComment: vi.fn(),
    redditEditComment: vi.fn(),
  }
})

const command = await import("@/server/browser/command")
const search = vi.mocked(command.redditSearch)
const submit = vi.mocked(command.redditSubmit)
const deleteOnReddit = vi.mocked(command.redditDeleteComment)
const editOnReddit = vi.mocked(command.redditEditComment)

import { readBehaviour, recentComments, saveBehaviour } from "./behaviour"
import { listSentComments, queueCommentChange } from "./comments"
import { accountForFind, createProject } from "./projects"
import { deleteSentComment, editSentComment } from "./reddit/change-comment"
import { queueHelpRead, readHelpPage, readHelpPosts } from "./reddit/help-posts"
import { listOwnPosts, queueOwnPost, submitOwnPost } from "./reddit/own-posts"
import { pastAnswers, subredditRemovals } from "./reddit/past-answers"
import { listPromoThreads, readPromoThreads } from "./reddit/promo-threads"
import { promoAccounts, promoComments, promoFinds, promoJobs, promoKeywords, promoPosts } from "./schema"
import { readToday } from "./today"

const target = { port: 1, token: "t" } as Parameters<typeof submitOwnPost>[3]
const DAY_MS = 86_400_000
const COMMENT_URL = "https://www.reddit.com/r/SaaS/comments/abc/a_post/def/"

function post(id: string, title: string, subreddit = "SaaS", daysAgo = 0) {
  return {
    redditId: `t3_${id}`,
    permalink: `/r/${subreddit}/comments/${id}/a_post/`,
    subreddit,
    title,
    body: "",
    author: "someone",
    score: 1,
    commentCount: 1,
    postedAtSeconds: Math.floor((Date.now() - daysAgo * DAY_MS) / 1000),
    position: 0,
    linkUrl: "",
  }
}

describe("the 12 Oct 2026 features against the database", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let projectId: string
  let accountId: string
  let keywordId: string
  const now = new Date()

  async function find(title: string, extra: Partial<typeof promoFinds.$inferInsert> = {}) {
    const id = uuid()
    await db.insert(promoFinds).values({
      id,
      userId,
      keywordId,
      redditId: `t3_${id.slice(0, 8)}`,
      permalink: `/r/SaaS/comments/${id.slice(0, 6)}/x/`,
      subreddit: "SaaS",
      title,
      ...extra,
    })
    return id
  }

  async function sent(findId: string, extra: Partial<typeof promoComments.$inferInsert> = {}) {
    const id = uuid()
    await db.insert(promoComments).values({
      id,
      userId,
      findId,
      accountId,
      text: "I used a spreadsheet for years.",
      commentUrl: COMMENT_URL,
      ...extra,
    })
    return id
  }

  beforeEach(async () => {
    vi.resetAllMocks()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    projectId = await createProject(userId, "A project", db)
    accountId = uuid()
    await db.insert(promoAccounts).values({
      id: accountId,
      userId,
      profileId: await createProfile(userId, { name: "Main" }, db),
      handle: "a_persona",
      projectId,
      redditCreatedAt: new Date(now.getTime() - 365 * DAY_MS),
      joinedSubreddits: ["cooking", "running"],
    })
    keywordId = uuid()
    await db.insert(promoKeywords).values({ id: keywordId, userId, projectId, term: "project tool" })
    const minute = localMinutes(now, "UTC")
    const shift = (by: number) => (((minute + by) % 1440) + 1440) % 1440
    await saveBehaviour(
      userId,
      {
        ...(await readBehaviour(userId, db)),
        readerProfileId: await createProfile(userId, { name: "Reader" }, db),
        wakeFromMinute: shift(-120),
        wakeUntilMinute: shift(120),
      },
      db
    )
  })

  afterEach(async () => {
    await client.close()
  })

  describe("a post of your own", () => {
    it("queues from a project's account, sends, and lists it under Posts", async () => {
      const { runAfter } = await queueOwnPost(
        userId,
        projectId,
        { accountId, subreddit: "r/SaaS", title: "What I learned", body: "Some words." },
        db,
        now
      )
      expect(runAfter).toBeNull()
      const [job] = await db.select().from(promoJobs).where(eq(promoJobs.kind, "submit"))
      expect(job.payload).toMatchObject({ subreddit: "SaaS", title: "What I learned", projectId })

      submit.mockResolvedValue({ postUrl: "https://www.reddit.com/r/SaaS/comments/new/what/", visit: null })
      await submitOwnPost(userId, accountId, job.payload, target, db)
      const posts = await listOwnPosts(userId, db)
      expect(posts).toHaveLength(1)
      expect(posts[0]).toMatchObject({ title: "What I learned", subreddit: "SaaS", project: { id: projectId } })
    })

    it("refuses an account from another project, a blocked subreddit's rules aside, and a second one on its way", async () => {
      const other = await createProject(userId, "Other", db)
      await expect(
        queueOwnPost(userId, other, { accountId, subreddit: "SaaS", title: "Hi", body: "" }, db, now)
      ).rejects.toThrow("not in this project")
      await queueOwnPost(userId, projectId, { accountId, subreddit: "SaaS", title: "Hi", body: "" }, db, now)
      await expect(
        queueOwnPost(userId, projectId, { accountId, subreddit: "SaaS", title: "Again", body: "" }, db, now)
      ).rejects.toThrow("already on its way")
    })

    it("keeps a failed attempt and counts a sent post against the pace", async () => {
      submit.mockRejectedValue(new Error("submit: no title box"))
      await expect(
        submitOwnPost(userId, accountId, { subreddit: "SaaS", title: "Hi", body: "" }, target, db)
      ).rejects.toThrow("no title box")
      const [failed] = await db.select().from(promoPosts)
      expect(failed).toMatchObject({ status: "failed", lastError: "submit: no title box" })

      await db.insert(promoPosts).values({
        id: uuid(),
        userId,
        accountId,
        subreddit: "SaaS",
        title: "Sent",
        postUrl: "https://www.reddit.com/r/SaaS/comments/x/",
      })
      expect((await recentComments(userId, accountId, db)).posted).toHaveLength(1)
    })
  })

  describe("deleting and editing a sent comment", () => {
    it("queues from the account that sent it, and refuses a deleted one", async () => {
      const commentId = await sent(await find("Which tool?"))
      await queueCommentChange(userId, commentId, { kind: "edit", text: "A better answer." }, db)
      await expect(queueCommentChange(userId, commentId, { kind: "delete" }, db)).rejects.toThrow("already on its way")

      await db.update(promoJobs).set({ status: "done" })
      await db.update(promoComments).set({ deletedAt: now })
      await expect(queueCommentChange(userId, commentId, { kind: "delete" }, db)).rejects.toThrow("already deleted")
    })

    it("marks a delete only when Reddit shows it gone, and keeps the first words of an edit", async () => {
      const commentId = await sent(await find("Which tool?"))

      deleteOnReddit.mockResolvedValue({ done: false })
      await expect(deleteSentComment(userId, commentId, target, db)).rejects.toThrow("may still be there")

      editOnReddit.mockResolvedValue({ done: true })
      await editSentComment(userId, commentId, "Changed words.", target, db)
      await editSentComment(userId, commentId, "Changed again.", target, db)
      const [row] = await db.select().from(promoComments)
      expect(row).toMatchObject({ text: "Changed again.", originalText: "I used a spreadsheet for years." })

      deleteOnReddit.mockResolvedValue({ done: true })
      await deleteSentComment(userId, commentId, target, db)
      const [listed] = await listSentComments(userId, db)
      expect(listed.deletedAt).not.toBeNull()
    })
  })

  describe("help-only posts", () => {
    it("reads the account's joined subreddits and only that account may answer", async () => {
      await queueHelpRead(userId, accountId, db)
      search.mockImplementation(async (_target, args) => ({
        source: "json",
        url: "",
        posts: [post(`${args.subreddit}1`, `A question in ${args.subreddit}`, args.subreddit ?? "")],
      }))
      expect(await readHelpPosts(userId, { accountId }, target, db)).toBe(2)
      const page = await readHelpPage(userId, accountId, db)
      expect(page.posts.map((row) => row.subreddit).sort()).toEqual(["cooking", "running"])

      const helpFind = page.posts[0].id
      await expect(accountForFind(userId, accountId, helpFind, db)).resolves.toMatchObject({ id: accountId })
      const someoneElse = uuid()
      await db.insert(promoAccounts).values({ id: someoneElse, userId, handle: "other", projectId })
      await expect(accountForFind(userId, someoneElse, helpFind, db)).rejects.toThrow("another account's everyday")
    })

    it("says so when the account has joined nothing", async () => {
      await db.update(promoAccounts).set({ joinedSubreddits: [] })
      await expect(queueHelpRead(userId, accountId, db)).rejects.toThrow("not joined any subreddits")
    })
  })

  describe("self-promotion threads", () => {
    it("keeps only the threads, and works out how often they come", async () => {
      search.mockResolvedValue({
        source: "json",
        url: "",
        posts: [
          post("w3", "Weekly self-promotion thread", "SaaS", 2),
          post("w2", "Weekly self-promotion thread", "SaaS", 9),
          post("w1", "Weekly self-promotion thread", "SaaS", 16),
          post("x", "How do you promote your product?", "SaaS", 1),
        ],
      })
      expect(await readPromoThreads(userId, { projectId, subreddit: "SaaS" }, target, db)).toBe(3)
      const { threads } = await listPromoThreads(userId, projectId, db)
      expect(threads).toHaveLength(1)
      expect(threads[0]).toMatchObject({ subreddit: "SaaS", found: 3, everyDays: 7 })
      // A thread is answered by the project's own accounts.
      await expect(accountForFind(userId, accountId, threads[0].newest.findId, db)).resolves.toMatchObject({
        id: accountId,
      })
    })
  })

  describe("what you said before", () => {
    it("offers comments under the same keyword first, and counts removals per subreddit", async () => {
      const here = await find("Best project management tool for a small team?")
      await sent(await find("Which tool do you use?"), { stillVisible: false, checkedAt: now })
      await sent(await find("Anything else"), { stillVisible: true, checkedAt: now })
      const past = await pastAnswers(userId, { id: here, keywordId, title: "Best project management tool" }, db)
      expect(past).toHaveLength(2)
      expect(await subredditRemovals(userId, "saas", db)).toEqual({ removed: 1, checked: 2 })
    })
  })

  describe("Today", () => {
    it("lists Strong fit posts from every project, once each", async () => {
      await find("A fresh quiet post", { rank: 2, postedAt: now })
      await find("A weak post", { rank: 0.1, postedAt: now })
      const { posts } = await readToday(userId, db, now)
      expect(posts.map((row) => row.title)).toEqual(["A fresh quiet post"])
      expect(posts[0].project.id).toBe(projectId)
    })
  })
})
