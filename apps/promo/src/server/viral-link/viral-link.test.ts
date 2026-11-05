import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { createProfile } from "@/server/browser/profiles"
import { promoArchiveItems } from "@/server/archive/schema"
import type { QueuedJob } from "@/server/social/jobs"
import { readBehaviour, saveBehaviour } from "@/server/social/behaviour"
import { createProject } from "@/server/social/projects"
import { promoAccounts, promoAppPosts, promoJobs } from "@/server/social/schema"
import { promoXPosts } from "@/server/social/x/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

import { viralHello } from "./connect"
import { answerViral, findViralCaller, makeViralKey, readViralKey } from "./link"
import { acceptPost, viralRedditDraft } from "./posts"
import { acceptRead, cleanReadValue, readStatus, runViralRedditRead, sweepViralReads } from "./reads"
import { reportViralPosts } from "./reports"
import { promoViralDrafts, promoViralLinks, promoViralReads, type PromoViralLinkRow } from "./schema"

/**
 * Promo's side of the link with Viral (Viral's features task, parts 11 to
 * 14, 20 and 21), with Viral and the browser stubbed.
 */

const browser = vi.hoisted(() => ({
  search: vi.fn(),
  thread: vi.fn(),
}))
vi.mock("@/server/browser/command", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/browser/command")>()),
  redditSearch: browser.search,
  redditThread: browser.thread,
}))

const VIRAL = "http://localhost:3027"

/** Viral, answering every call back with ok and recording it. */
function fakeViral(status = 200) {
  const calls: { url: string; body: Record<string, unknown>; auth: string | null }[] = []
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? "{}")), auth: new Headers(init?.headers).get("authorization") })
    return Response.json(status === 200 ? { ok: true } : { error: "Viral is down" }, { status })
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

const redditPost = (redditId: string) => ({
  redditId,
  permalink: `/r/mealprep/comments/${redditId}/dinner/`,
  subreddit: "mealprep",
  title: "Dinner in 10",
  body: "How I cook for the week",
  linkUrl: "",
  author: "dadcooks",
  score: 812,
  commentCount: 64,
  postedAtSeconds: 1_790_000_000,
  position: 0,
})

describe("Promo's link with Viral", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let projectId: string
  let key: string
  let link: PromoViralLinkRow

  beforeEach(async () => {
    process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-key-for-the-viral-link"
    ;({ client, db } = await createTestDatabase())
    userId = (await insertUser(db, { role: "admin", name: "Tyler" })).id
    projectId = await createProject(userId, "Launch week", db, ["x", "linkedin", "reddit"])
    key = await makeViralKey(userId, db)
    link = (await findViralCaller(new Request("http://promo/x", { headers: { authorization: `Bearer ${key}` } }), db))!
    await viralHello(link, { viralUrl: `${VIRAL}/` }, db)
    ;[link] = await db.select().from(promoViralLinks).where(eq(promoViralLinks.userId, userId))
    browser.search.mockReset()
    browser.thread.mockReset()
  })

  afterEach(async () => {
    await client.close()
  })

  describe("the key", () => {
    it("finds its person, keeps the Viral address that pressed Test, and refuses a wrong key", async () => {
      expect(link.viralUrl).toBe(VIRAL)
      expect((await readViralKey(userId, db)).key).toBe(key)
      const answer = await answerViral(
        new Request("http://promo/api/connect/viral/projects", { headers: { authorization: "Bearer pvr_wrong" } }),
        null,
        async () => ({}),
        db
      )
      expect(answer.status).toBe(401)
    })

    it("ends the old key when a new one is made", async () => {
      await makeViralKey(userId, db)
      expect(await findViralCaller(new Request("http://promo/x", { headers: { authorization: `Bearer ${key}` } }), db)).toBeNull()
    })
  })

  describe("reads", () => {
    it("cleans what each network reads", () => {
      expect(cleanReadValue("x", "account", "https://x.com/levelsio/status/1")).toBe("levelsio")
      expect(cleanReadValue("x", "post", "https://x.com/dad/status/1790000000000000000")).toBe("1790000000000000000")
      expect(cleanReadValue("reddit", "subreddit", "https://www.reddit.com/r/MealPrep/")).toBe("MealPrep")
      expect(cleanReadValue("reddit", "post", "https://www.reddit.com/r/mealprep/comments/abc123/dinner/")).toBe("/r/mealprep/comments/abc123/dinner/")
      expect(cleanReadValue("linkedin", "post", "https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000000/")).toBe("7390000000000000000")
    })

    it("refuses a read Promo has nothing to run, and keeps no row", async () => {
      // No X search account is set up, so the queue refuses it.
      await expect(acceptRead(link, { readId: "read-0001", network: "x", kind: "search", value: "meal prep" }, db)).rejects.toMatchObject({ status: 409 })
      expect(await db.select().from(promoViralReads)).toHaveLength(0)
      await expect(acceptRead(link, { readId: "read-0002", network: "reddit", kind: "account", value: "dad" }, db)).rejects.toMatchObject({ status: 400 })
    })

    it("never queues a second copy of a read still waiting, and caps how many wait at once", async () => {
      const readerId = await createProfile(userId, { name: "Reader" }, db)
      await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), readerProfileId: readerId }, db)
      await acceptRead(link, { readId: "read-0010", network: "reddit", kind: "subreddit", value: "r/mealprep" }, db)
      // Viral asking again for the same thing under a new id, as its watch does after two hours.
      await expect(acceptRead(link, { readId: "read-0011", network: "reddit", kind: "subreddit", value: "mealprep" }, db)).rejects.toMatchObject({ status: 409 })
      expect(await db.select().from(promoViralReads)).toHaveLength(1)
      expect(await db.select().from(promoJobs)).toHaveLength(1)

      for (let index = 0; index < 99; index += 1) {
        await db.insert(promoViralReads).values({ id: uuid(), userId, readId: `old-read-${index}`, network: "reddit", kind: "search", value: `words ${index}` })
      }
      await expect(acceptRead(link, { readId: "read-0012", network: "reddit", kind: "search", value: "dinner" }, db)).rejects.toMatchObject({ status: 429 })
      expect(await db.select().from(promoJobs)).toHaveLength(1)
    })

    it("queues a Reddit read in the reader, answers it once, and tells Viral when it's done", async () => {
      const readerId = await createProfile(userId, { name: "Reader" }, db)
      await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), readerProfileId: readerId }, db)
      const first = await acceptRead(link, { readId: "read-0003", network: "reddit", kind: "subreddit", value: "r/mealprep" }, db)
      expect(first).toMatchObject({ readId: "read-0003", status: "waiting", posts: [] })
      // The same read twice is the same read.
      await acceptRead(link, { readId: "read-0003", network: "reddit", kind: "subreddit", value: "r/mealprep" }, db)
      const [row] = await db.select().from(promoViralReads)
      const [job] = await db.select().from(promoJobs).where(eq(promoJobs.id, row!.jobId!))
      expect(job).toMatchObject({ kind: "viral_read", lane: readerId, payload: { viralReadId: row!.id } })
      expect(row!.value).toBe("mealprep")

      browser.search.mockResolvedValue({ source: "json", url: "", posts: [redditPost("abc"), redditPost("def")] })
      const viral = fakeViral()
      await runViralRedditRead({ id: job!.id, userId, kind: "viral_read", payload: job!.payload, attempts: 1, lane: readerId } as QueuedJob, {} as never, db, viral.fetchImpl)
      expect(browser.search).toHaveBeenCalledWith({}, { query: "", subreddit: "mealprep", sort: "top", window: "week" })

      const done = await readStatus(link, "read-0003", db)
      expect(done.status).toBe("done")
      expect(done.posts[0]).toMatchObject({ postId: "abc", url: "https://www.reddit.com/r/mealprep/comments/abc/dinner/", likes: 812, replies: 64, community: "mealprep" })
      expect(viral.calls).toHaveLength(1)
      expect(viral.calls[0]).toMatchObject({ url: `${VIRAL}/api/connect/promo/reads`, auth: `Bearer ${key}`, body: { readId: "read-0003", status: "done" } })
      const [delivered] = await db.select().from(promoViralReads)
      expect(delivered!.deliveredAt).not.toBeNull()
    })

    it("cuts a post read's replies to what Viral takes, so one long name never gets the whole read refused", async () => {
      const readerId = await createProfile(userId, { name: "Reader" }, db)
      await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), readerProfileId: readerId }, db)
      await acceptRead(link, { readId: "read-0005", network: "reddit", kind: "post", value: "/r/mealprep/comments/abc/dinner/" }, db)
      const [row] = await db.select().from(promoViralReads)
      browser.thread.mockResolvedValue({ post: redditPost("abc"), replies: [{ author: "n".repeat(500), text: "t".repeat(5_000), score: 3.6 }] })
      await runViralRedditRead({ id: row!.jobId!, userId, kind: "viral_read", payload: { viralReadId: row!.id }, attempts: 1, lane: readerId } as QueuedJob, {} as never, db, fakeViral().fetchImpl)
      const [reply] = (await readStatus(link, "read-0005", db)).posts[0]!.topReplies
      expect(reply).toEqual({ author: "n".repeat(200), text: "t".repeat(2_000), likes: 4 })
    })

    it("fails a read whose job failed, tells Viral, and tries a missed call back again", async () => {
      const jobId = uuid()
      await db.insert(promoJobs).values({ id: jobId, userId, kind: "viral_read", payload: {}, status: "failed", lastError: "The reader is signed in." })
      await db.insert(promoViralReads).values({ id: uuid(), userId, readId: "read-0004", network: "reddit", kind: "search", value: "dinner", jobId })

      const down = fakeViral(503)
      await sweepViralReads(db, down.fetchImpl)
      const [failed] = await db.select().from(promoViralReads)
      expect(failed).toMatchObject({ status: "failed", error: "The reader is signed in.", deliveredAt: null, deliveryTries: 1 })

      const up = fakeViral()
      await sweepViralReads(db, up.fetchImpl)
      expect(up.calls[0]!.body).toMatchObject({ readId: "read-0004", status: "failed", error: "The reader is signed in." })
      const [told] = await db.select().from(promoViralReads)
      expect(told!.deliveredAt).not.toBeNull()
    })
  })

  describe("posts", () => {
    it("leaves an X thread as a draft on the X Posts tab, once per send", async () => {
      const note = { sendId: "send-00001", projectId, network: "x" as const, ideaId: "idea-1", pieces: ["One", "Two"], title: "" }
      const answer = await acceptPost(link, note, db)
      expect(answer.draftUrl).toContain(`/admin/projects/${projectId}?network=x&tab=posts&open=`)
      expect(await acceptPost(link, note, db)).toEqual(answer)
      const drafts = await db.select().from(promoXPosts)
      expect(drafts).toHaveLength(1)
      expect(drafts[0]).toMatchObject({ status: "draft", source: "viral:idea-1", accountId: null })
      expect(drafts[0]!.pieces.map((piece) => piece.text)).toEqual(["One", "Two"])
    })

    it("keeps a Reddit post for New post to open with", async () => {
      const answer = await acceptPost(link, { sendId: "send-00002", projectId, network: "reddit", ideaId: "idea-2", pieces: ["Body"], title: "Dinner in 10" }, db)
      const [draft] = await db.select().from(promoViralDrafts)
      expect(answer.draftUrl).toContain(`network=reddit&newPost=${draft!.id}`)
      expect(await viralRedditDraft(userId, draft!.id, db)).toEqual({ accountId: null, projectId, subreddit: "", title: "Dinner in 10", body: "Body" })
      expect(await viralRedditDraft(userId, "not-a-draft", db)).toBeNull()
    })

    it("refuses another person's project, a thread off X, and a Reddit post without a title", async () => {
      const otherUser = (await insertUser(db, { role: "admin" })).id
      const theirs = await createProject(otherUser, "Theirs", db, ["x"])
      await expect(acceptPost(link, { sendId: "send-00003", projectId: theirs, network: "x", ideaId: "i", pieces: ["Hi"], title: "" }, db)).rejects.toMatchObject({ status: 404 })
      await expect(acceptPost(link, { sendId: "send-00004", projectId, network: "linkedin", ideaId: "i", pieces: ["a", "b"], title: "" }, db)).rejects.toMatchObject({ status: 400 })
      await expect(acceptPost(link, { sendId: "send-00005", projectId, network: "reddit", ideaId: "i", pieces: ["a"], title: " " }, db)).rejects.toMatchObject({ status: 400 })
    })
  })

  describe("reports", () => {
    async function postedXPost(source: string, views: number | null, archiveItemId: string | null = null) {
      const accountId = uuid()
      await db.insert(promoAccounts).values({ id: accountId, userId, platform: "x", handle: "me", projectId })
      const id = uuid()
      await db.insert(promoXPosts).values({
        id,
        userId,
        projectId,
        accountId,
        pieces: [{ text: "Dinner", pictureUrl: "", postId: "999" }],
        source,
        status: "posted",
        views,
        likes: 5,
        replyCount: 1,
        postedAt: new Date("2026-11-04T10:00:00Z"),
        archiveItemId,
      })
      return id
    }

    it("tells Viral once when a post from an idea is up, then fresh views at most daily", async () => {
      const id = await postedXPost("viral:idea-9", 100)
      await postedXPost("", 50)
      const viral = fakeViral()
      const start = new Date("2026-11-04T12:00:00Z")
      expect(await reportViralPosts(userId, db, { fetchImpl: viral.fetchImpl, now: start })).toBe(1)
      expect(viral.calls[0]).toMatchObject({
        url: `${VIRAL}/api/connect/promo/events`,
        body: { type: "posted", ideaId: "idea-9", postKey: `x:${id}`, network: "x", url: "https://x.com/me/status/999", views: 100 },
      })
      // Nothing new: nothing is sent.
      expect(await reportViralPosts(userId, db, { fetchImpl: viral.fetchImpl, now: start })).toBe(0)
      await db.update(promoXPosts).set({ views: 900 }).where(eq(promoXPosts.id, id))
      // The views moved, but a day hasn't passed.
      expect(await reportViralPosts(userId, db, { fetchImpl: viral.fetchImpl, now: new Date("2026-11-04T20:00:00Z") })).toBe(0)
      expect(await reportViralPosts(userId, db, { fetchImpl: viral.fetchImpl, now: new Date("2026-11-05T13:00:00Z") })).toBe(1)
      expect(viral.calls.at(-1)!.body).toMatchObject({ views: 900 })
    })

    it("reports a TikTok post made from an Archive item Video sent with an idea", async () => {
      const itemId = uuid()
      await db.insert(promoArchiveItems).values({ id: itemId, userId, projectId, kind: "video", status: "ready", source: "video", viralIdeaId: "idea-7" })
      const accountId = uuid()
      await db.insert(promoAccounts).values({ id: accountId, userId, platform: "tiktok", handle: "me", projectId })
      await db.insert(promoAppPosts).values({
        id: uuid(),
        userId,
        accountId,
        projectId,
        platform: "tiktok",
        mediaUrl: "https://media.test/v.mp4",
        mediaKind: "video",
        status: "posted",
        postUrl: "https://www.tiktok.com/@me/video/1",
        views: 3_000,
        archiveItemId: itemId,
      })
      const viral = fakeViral()
      expect(await reportViralPosts(userId, db, { fetchImpl: viral.fetchImpl })).toBe(1)
      expect(viral.calls[0]!.body).toMatchObject({ ideaId: "idea-7", network: "tiktok", url: "https://www.tiktok.com/@me/video/1", views: 3_000 })
    })

    it("never lets one post Viral refuses hold up the posts after it", async () => {
      await postedXPost("viral:idea-1", 100)
      await postedXPost("viral:idea-2", 200)
      const refusing = fakeViral(400)
      // Both are tried in one pass, and neither is asked about again.
      expect(await reportViralPosts(userId, db, { fetchImpl: refusing.fetchImpl })).toBe(0)
      expect(refusing.calls).toHaveLength(2)
      expect(await reportViralPosts(userId, db, { fetchImpl: refusing.fetchImpl })).toBe(0)
      expect(refusing.calls).toHaveLength(2)
    })

    it("tries again next pass when Viral is down", async () => {
      await postedXPost("viral:idea-9", 100)
      expect(await reportViralPosts(userId, db, { fetchImpl: fakeViral(503).fetchImpl })).toBe(0)
      expect(await reportViralPosts(userId, db, { fetchImpl: fakeViral().fetchImpl })).toBe(1)
    })
  })
})
