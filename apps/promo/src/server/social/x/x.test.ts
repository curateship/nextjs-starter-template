import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { localMinutes } from "@/lib/social/waking"
import { holdsLink, xHandle, xKeywordValue, xLength, xPostId } from "@/lib/social/x/options"
import { uuid } from "@/server/auth/security"
import { encryptSecret } from "@/server/auth/encryption"
import { createProfile } from "@/server/browser/profiles"
import { setDbForTests } from "@/server/db"
import { customShellAiUsageEvents, customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

import { promoAccounts, promoInbox, promoJobs } from "../schema"
import { promoXFinds, promoXFollows, promoXKeywords, promoXPosts, promoXReplies, promoXSearchers } from "./schema"

vi.mock("@/server/browser/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/browser/session")>()
  return { ...actual, ensureSession: vi.fn(), stopSession: vi.fn(), touchSession: vi.fn() }
})

vi.mock("./calls", () => ({
  xState: vi.fn(),
  xQuickState: vi.fn(),
  xEnterCode: vi.fn(),
  xSearch: vi.fn(),
  xReadPost: vi.fn(),
  xCheck: vi.fn(),
  xMentions: vi.fn(),
  xTrends: vi.fn(),
  xLookup: vi.fn(),
  xCommunity: vi.fn(),
  xReach: vi.fn(),
  xReply: vi.fn(),
  xQuote: vi.fn(),
  xPublish: vi.fn(),
  xEdit: vi.fn(),
  xDelete: vi.fn(),
  xFollow: vi.fn(),
  xWarmUp: vi.fn(),
  xListAdd: vi.fn(),
  xInbox: vi.fn(),
  xMessage: vi.fn(),
}))

const session = await import("@/server/browser/session")
const calls = await import("./calls")
const { runOneJob } = await import("../runner")
const { readBehaviour, saveBehaviour } = await import("../behaviour")
const { createProject } = await import("../projects")
const { queueJob } = await import("../jobs")
const { totpCode } = await import("../two-factor")
const { rankXFind, xFitBand } = await import("./rank")
const { addXKeyword, setXKeyword } = await import("./keywords")
const { runXSearch } = await import("./search")
const { listXFinds, setXFindsStatus, hideXAuthor } = await import("./finds")
const { addSearcher, saveXSettings, readXSettings, pickSearcher, listSearchers } = await import("./searchers")
const { queueXReply, cancelXReply, refuseXOnPhone, readXPostingState } = await import("./posting")
const { runXReply, recordXCheck, retryFailedXReply, queueXChange } = await import("./replies")
const { saveXPost, queueXPublish, runXPublish } = await import("./posts")
const { saveXSignIn } = await import("./run")
const { recordXReach } = await import("./reach")
const { xSpend } = await import("./cost")
const { followsToday } = await import("./follows")
const drafts = await import("./drafts")
const { queueDueXSearches } = await import("./upkeep")
const { readXToday, readXCounts } = await import("./module")
const { pastXAnswers, queueXChecks } = await import("./replies")
const { recordXLookup } = await import("./reach")
const { sendInboxReply } = await import("../phone-apps/inbox")
const { cancelJobs } = await import("../job-list")

const accountTarget = { port: 7900, token: "account-key" }
const searchTarget = { port: 7902, token: "search-key" }
const DAY = 86_400_000
const HOUR = 3_600_000

/** Waking hours around now, UTC, so a test is awake whenever it runs. */
function awakeNow(now: Date) {
  const minute = localMinutes(now, "UTC")
  const shift = (by: number) => (((minute + by) % 1440) + 1440) % 1440
  return { wakeFromMinute: shift(-120), wakeUntilMinute: shift(120) }
}

/** An X post as the routines answer it, with what a test cares about set. */
function post(overrides: Partial<Awaited<ReturnType<typeof calls.xReadPost>>["post"] & object> & { postId: string }) {
  return {
    url: `https://x.com/poster/status/${overrides.postId}`,
    text: `Which tool do you use to plan the week? Asking for post ${overrides.postId}.`,
    authorId: `a-${overrides.postId}`,
    authorHandle: "poster",
    authorName: "Poster",
    authorFollowers: 1_000,
    postedSeconds: Math.floor(Date.now() / 1000) - 600,
    views: 500,
    likes: 3,
    replies: 1,
    reposts: 0,
    repliesOpen: true,
    isReply: false,
    link: "",
    ...overrides,
  }
}

/** Words long enough for the too-similar check to compare. */
const LONG_REPLY =
  "We plan the whole week on Sunday evening with one short list and three big things, then every morning we pick only one of them to finish before lunch."

describe("X", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let projectId: string
  let readerId: string
  let searcherProfileId: string
  let profileId: string
  let accountId: string

  beforeEach(async () => {
    vi.clearAllMocks()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    setDbForTests(db)
    userId = (await insertUser(db, { role: "admin" })).id
    projectId = await createProject(userId, "Pomoder", db, ["x"])
    readerId = await createProfile(userId, { name: "Reader" }, db)
    searcherProfileId = await createProfile(userId, { name: "Scout" }, db)
    profileId = await createProfile(userId, { name: "Main" }, db)
    await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), readerProfileId: readerId, ...awakeNow(new Date()) }, db)
    await addSearcher(userId, searcherProfileId, db)
    accountId = uuid()
    await db.insert(promoAccounts).values({
      id: accountId,
      userId,
      platform: "x",
      profileId,
      projectId,
      handle: "sam",
      // Joined a year ago: past the warm-up and the young days.
      xJoinedAt: new Date(Date.now() - 400 * DAY),
    })
    vi.mocked(session.ensureSession).mockImplementation(async (_user, id) => ({
      id: `session-${id}`,
      profileId: id,
      target: id === searcherProfileId ? searchTarget : accountTarget,
    }) as never)
    vi.mocked(calls.xQuickState).mockImplementation(async (at) => ({
      checked: true,
      handle: at === searchTarget ? "scout" : "sam",
      blocked: false,
      reason: "",
      banScreen: null,
      joinedSeconds: null,
      followers: null,
    }))
    // Every migration is run into a fresh database, which can take a minute on a busy machine.
  }, 180_000)

  afterEach(async () => {
    vi.unstubAllEnvs()
    await client.close()
  })

  async function keyword(kind: "search" | "hashtag" | "account" = "search", value = "plan the week") {
    const { id } = await addXKeyword(userId, projectId, { kind, value }, db)
    await db.delete(promoJobs)
    return id
  }

  async function searcherReader() {
    const picked = await pickSearcher(userId, db)
    return { target: searchTarget, searcher: picked }
  }

  async function searchWith(keywordId: string, posts: ReturnType<typeof post>[], viewed = posts.length) {
    vi.mocked(calls.xSearch).mockResolvedValueOnce({
      posts: posts.map((item, position) => ({ ...item, position })),
      viewed,
      limited: false,
    })
    await runXSearch(userId, keywordId, await searcherReader(), db)
  }

  async function oneFind(overrides: Partial<ReturnType<typeof post>> = {}) {
    const id = await keyword()
    await searchWith(id, [post({ postId: "1800000000000000001", ...overrides })])
    const [find] = await listXFinds(userId, { projectId, keywordId: id, tab: "new" }, db)
    if (!find) throw new Error("no find")
    return find
  }

  describe("words and ranking", () => {
    it("scores the worked example in rank.ts", () => {
      const now = new Date("2099-01-10T12:00:00Z")
      expect(rankXFind({ position: 1, replies: 5, postedAt: new Date("2099-01-10T10:00:00Z"), authorFollowers: 10_000, named: false }, now)).toBe(6.2046)
      expect(xFitBand(6)).toBe("strong")
      expect(xFitBand(2)).toBe("possible")
      expect(xFitBand(1)).toBe("low")
    })

    it("reads handles, hashtags and post ids the way X writes them", () => {
      expect(xHandle("https://twitter.com/sam_k/status/1")).toBe("sam_k")
      expect(xHandle("@Sam")).toBe("Sam")
      expect(xHandle("not a handle!")).toBe("")
      expect(xKeywordValue("hashtag", " #BuildInPublic ")).toBe("BuildInPublic")
      expect(xKeywordValue("account", "x.com/levelsio")).toBe("levelsio")
      expect(xPostId("https://x.com/levelsio/status/1849123456789012345?s=20")).toBe("1849123456789012345")
    })

    it("counts a link as 23 characters and spots a link in a reply", () => {
      expect(xLength("see https://example.com/a/very/long/path/that/goes/on")).toBe(4 + 23)
      expect(holdsLink("try pomoder.app today")).toBe(true)
      expect(holdsLink("we plan on Sunday evenings")).toBe(false)
    })
  })

  describe("search accounts", () => {
    it("keeps a keyword whose first search is refused for want of a search account, and says why", async () => {
      await db.delete(promoXSearchers)
      const saved = await addXKeyword(userId, projectId, { kind: "search", value: "weekly planning" }, db)
      expect(saved.searchRefused).toContain("There is no X search account")
    })

    it("never lets a profile that posts, or the reader, search X", async () => {
      await expect(addSearcher(userId, profileId, db)).rejects.toThrow("holds an account that posts")
      await expect(addSearcher(userId, readerId, db)).rejects.toThrow("is the reader")
      await expect(saveBehaviour(userId, { ...(await readBehaviour(userId, db)), readerProfileId: searcherProfileId }, db)).rejects.toThrow(
        "is an X search account"
      )
    })

    it("files an X search under the search account and runs it there, counting its views", async () => {
      const id = await keyword()
      await queueJob(userId, "x_search", { keywordId: id }, db)
      const [job] = await db.select().from(promoJobs)
      expect(job.lane).toBe(searcherProfileId)
      vi.mocked(calls.xSearch).mockResolvedValueOnce({ posts: [{ ...post({ postId: "1800000000000000002" }), position: 0 }], viewed: 20, limited: false })
      expect(await runOneJob("worker", db)).toMatchObject({ ok: true, kind: "x_search" })
      expect(vi.mocked(calls.xSearch).mock.calls[0][0]).toBe(searchTarget)
      const [searcher] = await listSearchers(userId, db)
      expect(searcher.viewsToday).toBe(20)
    })

    it("refuses a read once a search account has used its views for the day", async () => {
      await saveXSettings(userId, { ...(await readXSettings(userId, db)), viewsPerDay: 50 }, db)
      await db.update(promoXSearchers).set({ views: 50, viewsOn: new Date().toISOString().slice(0, 10) })
      await expect(pickSearcher(userId, db)).rejects.toThrow("can't read any more today")
      const saved = await addXKeyword(userId, projectId, { kind: "search", value: "habit tracker" }, db)
      expect(saved.searchRefused).toContain("can't read any more today")
    })

    it("spreads reads over two search accounts and carries on with one when the other is locked", async () => {
      const second = await createProfile(userId, { name: "Scout 2" }, db)
      await addSearcher(userId, second, db)
      await db.update(promoXSearchers).set({ views: 30, viewsOn: new Date().toISOString().slice(0, 10) }).where(eq(promoXSearchers.profileId, searcherProfileId))
      expect((await pickSearcher(userId, db)).profileId).toBe(second)
      await db
        .update(promoXSearchers)
        .set({ stoppedOn: new Date().toISOString().slice(0, 10), stopReason: "X locked it." })
        .where(eq(promoXSearchers.profileId, second))
      expect((await pickSearcher(userId, db)).profileId).toBe(searcherProfileId)
    })

    it("stops a search account for the day when X shows its rate limit, keeping nothing it read", async () => {
      const id = await keyword()
      vi.mocked(calls.xSearch).mockResolvedValueOnce({ posts: [], viewed: 3, limited: true })
      await expect(runXSearch(userId, id, await searcherReader(), db)).rejects.toThrow("rate limit")
      const [searcher] = await listSearchers(userId, db)
      expect(searcher.stoppedReason).toContain("rate limit")
    })

    it("moves a read to another search account when the first is found signed out", async () => {
      const second = await createProfile(userId, { name: "Scout 2" }, db)
      await addSearcher(userId, second, db)
      const secondTarget = { port: 7903, token: "second-key" }
      vi.mocked(session.ensureSession).mockImplementation(async (_user, id) => ({
        id: `session-${id}`,
        profileId: id,
        target: id === searcherProfileId ? searchTarget : id === second ? secondTarget : accountTarget,
      }) as never)
      vi.mocked(calls.xQuickState).mockImplementation(async (at) => ({
        checked: true,
        handle: at === searchTarget ? null : at === secondTarget ? "scout2" : "sam",
        blocked: false,
        reason: "",
        banScreen: null,
        joinedSeconds: null,
        followers: null,
      }))
      const id = await keyword()
      await queueJob(userId, "x_search", { keywordId: id }, db)
      await db.update(promoJobs).set({ lane: searcherProfileId })
      expect(await runOneJob("worker", db)).toMatchObject({ did: "put back" })
      vi.mocked(calls.xSearch).mockResolvedValueOnce({ posts: [], viewed: 0, limited: false })
      expect(await runOneJob("worker", db)).toMatchObject({ ok: true, kind: "x_search" })
      expect(vi.mocked(calls.xSearch).mock.calls[0][0]).toBe(secondTarget)
      const first = (await listSearchers(userId, db)).find((searcher) => searcher.profileId === searcherProfileId)
      expect(first?.stoppedReason).toContain("signed out of X")
    })

    it("stops a search account signed in as an account that posts, and rings the bell", async () => {
      const id = await keyword()
      vi.mocked(calls.xQuickState).mockResolvedValue({ checked: true, handle: "sam", blocked: false, reason: "", banScreen: null, joinedSeconds: null, followers: null })
      await queueJob(userId, "x_search", { keywordId: id }, db)
      expect(await runOneJob("worker", db)).toMatchObject({ ok: false })
      expect(calls.xSearch).not.toHaveBeenCalled()
      const notices = await db.select().from(customShellNotifications)
      expect(notices.some((notice) => notice.message?.startsWith("X search account stopped:"))).toBe(true)
    })
  })

  describe("finding posts", () => {
    it("stores what a search finds and never undoes a skip when it runs again", async () => {
      const id = await keyword()
      await searchWith(id, [post({ postId: "1800000000000000010" }), post({ postId: "1800000000000000011", replies: 80 })])
      const first = await listXFinds(userId, { projectId, keywordId: id, tab: "new" }, db)
      expect(first.map((find) => find.postId)).toEqual(["1800000000000000010", "1800000000000000011"])
      await setXFindsStatus(userId, [first[0].id], "skipped", db)
      await searchWith(id, [post({ postId: "1800000000000000010", likes: 99 })])
      const skipped = await listXFinds(userId, { projectId, keywordId: id, tab: "skipped" }, db)
      expect(skipped[0].likes).toBe(99)
    })

    it("never lists a post whose replies are closed", async () => {
      const id = await keyword()
      await searchWith(id, [post({ postId: "1800000000000000020", repliesOpen: false }), post({ postId: "1800000000000000021" })])
      expect((await listXFinds(userId, { projectId, keywordId: id, tab: "new" }, db)).map((find) => find.postId)).toEqual(["1800000000000000021"])
    })

    it("takes a post older than 12 hours off To look at, and brings it back when its words are searched", async () => {
      const id = await keyword()
      await searchWith(id, [post({ postId: "1800000000000000030", text: "Old one about planners", postedSeconds: Math.floor((Date.now() - 13 * HOUR) / 1000) })])
      expect(await listXFinds(userId, { projectId, keywordId: id, tab: "new" }, db)).toHaveLength(0)
      expect(await listXFinds(userId, { projectId, keywordId: null, tab: "new", search: "planners" }, db)).toHaveLength(1)
    })

    it("drops a hidden account's posts before they are stored", async () => {
      const id = await keyword()
      await searchWith(id, [post({ postId: "1800000000000000040", authorHandle: "spammer" })])
      const [find] = await listXFinds(userId, { projectId, keywordId: id, tab: "new" }, db)
      await hideXAuthor(userId, find.id, db)
      expect(await listXFinds(userId, { projectId, keywordId: id, tab: "new" }, db)).toHaveLength(0)
      await searchWith(id, [post({ postId: "1800000000000000041", authorHandle: "Spammer" })])
      expect(await db.select().from(promoXFinds).where(eq(promoXFinds.postId, "1800000000000000041"))).toHaveLength(0)
    })

    it("rings the bell once for a watched account's new post, but not for the posts its first read found", async () => {
      const id = await keyword("account", "@levelsio")
      await searchWith(id, [post({ postId: "1800000000000000050", authorHandle: "levelsio" })])
      expect(await db.select().from(customShellNotifications)).toHaveLength(0)
      await searchWith(id, [post({ postId: "1800000000000000051", authorHandle: "levelsio" }), post({ postId: "1800000000000000050", authorHandle: "levelsio" })])
      await searchWith(id, [post({ postId: "1800000000000000051", authorHandle: "levelsio" })])
      const notices = await db.select().from(customShellNotifications)
      expect(notices).toHaveLength(1)
      expect(notices[0].message).toBe("New post from a watched account: @levelsio")
      await setXKeyword(userId, id, { notify: false }, db)
      await searchWith(id, [post({ postId: "1800000000000000052", authorHandle: "levelsio" })])
      expect(await db.select().from(customShellNotifications)).toHaveLength(1)
    })

    it("puts a post that names you above the same post found otherwise", async () => {
      const plain = await keyword("search", "planning")
      const named = await keyword("search", "pomoder")
      await setXKeyword(userId, named, { mark: "you" }, db)
      await searchWith(plain, [post({ postId: "1800000000000000060" })])
      await searchWith(named, [post({ postId: "1800000000000000061" })])
      const list = await listXFinds(userId, { projectId, keywordId: null, tab: "new" }, db)
      expect(list[0].postId).toBe("1800000000000000061")
      expect(list[0].named).toBe("you")
    })
  })

  describe("replies", () => {
    it("refuses a reply with a link, or past 280 characters on a free account, and takes 400 on a paid one", async () => {
      const find = await oneFind()
      await expect(queueXReply(userId, { findId: find.id, accountId, text: "Try https://pomoder.app" }, db)).rejects.toThrow("never carries a link")
      const long = "We plan on Sunday. ".repeat(21).trim()
      expect(xLength(long)).toBeGreaterThan(280)
      await expect(queueXReply(userId, { findId: find.id, accountId, text: long }, db)).rejects.toThrow("X lets a free account post 280")
      await db.update(promoAccounts).set({ xPaid: true }).where(eq(promoAccounts.id, accountId))
      await expect(queueXReply(userId, { findId: find.id, accountId, text: long }, db)).resolves.toMatchObject({ runAfter: null })
    })

    it("refuses a 3-day-old account and lets an 8-day-old one reply", async () => {
      const find = await oneFind()
      await db.update(promoAccounts).set({ xJoinedAt: new Date(Date.now() - 3 * DAY) }).where(eq(promoAccounts.id, accountId))
      await expect(queueXReply(userId, { findId: find.id, accountId, text: "We plan on Sundays." }, db)).rejects.toThrow("first 7 days")
      await db.update(promoAccounts).set({ xJoinedAt: new Date(Date.now() - 8 * DAY) }).where(eq(promoAccounts.id, accountId))
      await expect(queueXReply(userId, { findId: find.id, accountId, text: "We plan on Sundays." }, db)).resolves.toBeTruthy()
    })

    it("refuses a young account's reply past the day's number in Settings → Behaviour", async () => {
      await saveXSettings(userId, { ...(await readXSettings(userId, db)), repliesPerDay: 2, repliesPerHour: 2 }, db)
      await db.update(promoAccounts).set({ xJoinedAt: new Date(Date.now() - 30 * DAY) }).where(eq(promoAccounts.id, accountId))
      const posted = new Date(Date.now() - 2 * HOUR)
      for (const at of [posted, new Date(posted.getTime() + 60_000)]) {
        await db.insert(promoXReplies).values({ id: uuid(), userId, accountId, projectId, targetId: `17${at.getTime()}`, text: "x", status: "posted", postedAt: at })
      }
      const find = await oneFind()
      await expect(queueXReply(userId, { findId: find.id, accountId, text: "One more." }, db)).rejects.toThrow("A young X account may send 2 posts a day")
    })

    it("warns about words too close to another account's, and still posts", async () => {
      const find = await oneFind()
      const other = uuid()
      await db.insert(promoAccounts).values({ id: other, userId, platform: "x", handle: "rob" })
      await db.insert(promoXReplies).values({ id: uuid(), userId, accountId: other, targetId: "1700000000000000000", text: LONG_REPLY, status: "posted", postedAt: new Date() })
      const queued = await queueXReply(userId, { findId: find.id, accountId, text: LONG_REPLY.replace("Sunday", "Saturday") }, db)
      expect(queued.similarTo).toContain("@rob")
      const [row] = await db.select().from(promoXReplies).where(eq(promoXReplies.id, queued.replyId))
      expect(row.status).toBe("waiting")
    })

    it("lets one of your accounts per post, and refuses a second press while the first is waiting", async () => {
      const find = await oneFind()
      await queueXReply(userId, { findId: find.id, accountId, text: "We plan on Sundays." }, db)
      await expect(queueXReply(userId, { findId: find.id, accountId, text: "Another." }, db)).rejects.toThrow("already on its way")
      const other = uuid()
      const otherProfile = await createProfile(userId, { name: "Other" }, db)
      await db.insert(promoAccounts).values({ id: other, userId, platform: "x", profileId: otherProfile, projectId, handle: "rob", xJoinedAt: new Date(Date.now() - 400 * DAY) })
      await expect(queueXReply(userId, { findId: find.id, accountId: other, text: "Me too." }, db)).rejects.toThrow("already replied to this post")
    })

    it("refuses a reply to a post with closed replies, but lets it be quoted", async () => {
      const find = await oneFind()
      await db.update(promoXFinds).set({ repliesOpen: false })
      await expect(queueXReply(userId, { findId: find.id, accountId, text: "We plan on Sundays." }, db)).rejects.toThrow("limited who can reply")
      await expect(queueXReply(userId, { findId: find.id, accountId, text: "Good question.", kind: "quote" }, db)).resolves.toBeTruthy()
    })

    it("takes a reply back inside its ten seconds", async () => {
      const find = await oneFind()
      const queued = await queueXReply(userId, { findId: find.id, accountId, text: "Changed my mind." }, db)
      await cancelXReply(userId, queued.replyId, db)
      expect(await db.select().from(promoXReplies)).toHaveLength(0)
    })

    it("sends from the account's own browser, marks the post replied, and follows the person when switched on", async () => {
      await db.update(promoAccounts).set({ xFollowBack: true }).where(eq(promoAccounts.id, accountId))
      const find = await oneFind()
      const queued = await queueXReply(userId, { findId: find.id, accountId, text: "We plan on Sundays." }, db)
      await db.update(promoJobs).set({ runAfter: null }).where(eq(promoJobs.id, queued.jobId))
      vi.mocked(calls.xReply).mockResolvedValueOnce({ postId: "1800000000000009999", url: "https://x.com/sam/status/1800000000000009999" })
      expect(await runOneJob("worker", db)).toMatchObject({ ok: true, kind: "x_reply" })
      expect(session.ensureSession).toHaveBeenCalledWith(userId, profileId, db)
      const [row] = await db.select().from(promoXReplies)
      expect(row).toMatchObject({ status: "posted", postId: "1800000000000009999" })
      expect((await listXFinds(userId, { projectId, keywordId: null, tab: "replied" }, db)).map((f) => f.postId)).toEqual([find.postId])
      const follows = await db.select().from(promoXFollows)
      expect(follows.map((follow) => follow.handle)).toEqual(["poster"])
      expect(await db.select().from(promoJobs).where(eq(promoJobs.kind, "x_follow"))).toHaveLength(1)
    })

    it("refuses the sixth follow in a day at the number in Settings → Behaviour", async () => {
      await db.update(promoAccounts).set({ xFollowBack: true }).where(eq(promoAccounts.id, accountId))
      const { queueFollowBack } = await import("./follows")
      for (const handle of ["a1", "a2", "a3", "a4", "a5"]) expect(await queueFollowBack(userId, accountId, handle, db)).toBeNull()
      expect(await followsToday(userId, accountId, db)).toBe(5)
      expect(await queueFollowBack(userId, accountId, "a6", db)).toContain("already followed 5 today")
    })

    it("marks a reply failed when the browser fails, rings the bell, and Try again goes through every check once", async () => {
      const find = await oneFind()
      const queued = await queueXReply(userId, { findId: find.id, accountId, text: "We plan on Sundays." }, db)
      await db.update(promoJobs).set({ runAfter: null }).where(eq(promoJobs.id, queued.jobId))
      vi.mocked(calls.xReply).mockRejectedValueOnce(new Error("reply: there is no Reply button under the post"))
      expect(await runOneJob("worker", db)).toMatchObject({ ok: false })
      const notices = await db.select().from(customShellNotifications)
      expect(notices.map((n) => n.message)).toContain("Did not go out: an X reply")
      await retryFailedXReply(userId, queued.replyId, db)
      await expect(retryFailedXReply(userId, queued.replyId, db)).rejects.toThrow("already tried again or dismissed")
      expect(await db.select().from(promoXReplies).where(eq(promoXReplies.status, "waiting"))).toHaveLength(1)
    })

    it("lets only a paid account edit, and only within the hour", async () => {
      const id = uuid()
      await db.insert(promoXReplies).values({ id, userId, accountId, projectId, targetId: "1700000000000000001", postId: "1700000000000000002", text: "First words.", status: "posted", postedAt: new Date() })
      await expect(queueXChange(userId, { replyId: id, action: "edit", text: "Better words." }, db)).rejects.toThrow("only a paid account")
      await db.update(promoAccounts).set({ xPaid: true }).where(eq(promoAccounts.id, accountId))
      await expect(queueXChange(userId, { replyId: id, action: "edit", text: "Better words." }, db)).resolves.toBeTruthy()
      await db.update(promoXReplies).set({ postedAt: new Date(Date.now() - 2 * HOUR) })
      await db.delete(promoJobs)
      await expect(queueXChange(userId, { replyId: id, action: "edit", text: "Better still." }, db)).rejects.toThrow("that hour is over")
      await expect(queueXChange(userId, { replyId: id, action: "delete" }, db)).resolves.toBeTruthy()
    })

    it("writes a reply's reading and rings the bell once for a new reply under it", async () => {
      const id = uuid()
      await db.insert(promoXReplies).values({ id, userId, accountId, projectId, targetId: "1700000000000000003", postId: "1700000000000000004", text: "Ours.", status: "posted", postedAt: new Date() })
      const read = {
        found: true,
        visible: true,
        views: 1_200,
        likes: 9,
        replies: 1,
        reposts: 0,
        pollVotes: null,
        incoming: [{ id: "1700000000000000005", handle: "lee", name: "Lee", text: "Which app?", likes: 0, postedSeconds: null }],
        viewed: 3,
        limited: false,
      }
      vi.mocked(calls.xCheck).mockResolvedValue(read)
      await recordXCheck(userId, { replyId: id }, await searcherReader(), db)
      await recordXCheck(userId, { replyId: id }, await searcherReader(), db)
      const [row] = await db.select().from(promoXReplies).where(eq(promoXReplies.id, id))
      expect(row).toMatchObject({ views: 1_200, likes: 9, stillVisible: true })
      const notices = await db.select().from(customShellNotifications)
      expect(notices.map((n) => n.message)).toEqual(["New reply to you on X from @lee"])
    })

    it("never reads a rate-limited check as a reply gone", async () => {
      const id = uuid()
      await db.insert(promoXReplies).values({ id, userId, accountId, projectId, targetId: "1700000000000000006", postId: "1700000000000000007", text: "Ours.", status: "posted", postedAt: new Date(), stillVisible: true })
      vi.mocked(calls.xCheck).mockResolvedValueOnce({ found: false, visible: false, views: null, likes: null, replies: null, reposts: null, pollVotes: null, incoming: [], viewed: 0, limited: true })
      await expect(recordXCheck(userId, { replyId: id }, await searcherReader(), db)).rejects.toThrow("rate limit")
      const [row] = await db.select().from(promoXReplies).where(eq(promoXReplies.id, id))
      expect(row.stillVisible).toBe(true)
    })

    it("keeps a phone's reply posted and asks a search account where it landed", async () => {
      const id = uuid()
      await db.insert(promoXReplies).values({ id, userId, accountId, projectId, targetId: "1700000000000000008", text: "From the phone, we plan on Sundays.", status: "waiting" })
      vi.mocked(calls.xReply).mockResolvedValueOnce({ postId: "", url: "" })
      await runXReply(userId, id, accountTarget, db)
      const [row] = await db.select().from(promoXReplies).where(eq(promoXReplies.id, id))
      expect(row.status).toBe("posted")
      const jobs = await db.select().from(promoJobs).where(eq(promoJobs.kind, "x_check"))
      expect(jobs[0].lane).toBe(searcherProfileId)
    })
  })

  describe("posts of your own", () => {
    it("posts a thread piece by piece and carries on from where it stopped", async () => {
      const postRowId = await saveXPost(
        userId,
        projectId,
        null,
        { accountId, pieces: ["One.", "Two.", "Three."].map((text) => ({ text, pictureUrl: "" })), poll: null, communityId: "", source: "", scheduledFor: null },
        db
      )
      await queueXPublish(userId, postRowId, db)
      vi.mocked(calls.xPublish)
        .mockResolvedValueOnce({ postId: "1800000000000000101", url: "" })
        .mockResolvedValueOnce({ postId: "1800000000000000102", url: "" })
        .mockRejectedValueOnce(new Error("publish: the Post button never lit"))
      await expect(runXPublish(userId, postRowId, accountTarget, db)).rejects.toThrow("Post button")
      let [row] = await db.select().from(promoXPosts)
      expect(row.status).toBe("failed")
      expect(row.lastError).toContain("Stopped at post 3 of 3")

      await db.delete(promoJobs)
      await queueXPublish(userId, postRowId, db)
      vi.mocked(calls.xPublish).mockResolvedValueOnce({ postId: "1800000000000000103", url: "" })
      await runXPublish(userId, postRowId, accountTarget, db)
      ;[row] = await db.select().from(promoXPosts)
      expect(row.status).toBe("posted")
      expect(row.pieces.map((piece) => piece.postId)).toEqual(["1800000000000000101", "1800000000000000102", "1800000000000000103"])
      const sent = vi.mocked(calls.xPublish).mock.calls.map((call) => call[1])
      expect(sent[3]).toMatchObject({ text: "Three.", replyToId: "1800000000000000102" })
    })

    it("waits for a picked hour inside waking hours and refuses one outside them", async () => {
      const behaviour = await readBehaviour(userId, db)
      const inside = new Date(Date.now() + 60 * 60_000)
      const postRowId = await saveXPost(
        userId,
        projectId,
        null,
        { accountId, pieces: [{ text: "Later.", pictureUrl: "" }], poll: null, communityId: "", source: "", scheduledFor: inside },
        db
      )
      const queued = await queueXPublish(userId, postRowId, db)
      expect(queued.runAfter?.getTime()).toBe(inside.getTime())
      await db.delete(promoJobs)
      await db.update(promoXPosts).set({ status: "draft", scheduledFor: new Date(Date.now() + 6 * HOUR) })
      await saveBehaviour(userId, { ...behaviour }, db)
      await expect(queueXPublish(userId, postRowId, db)).rejects.toThrow("outside the account's waking hours")
    })

    it("refuses a thread, a poll and a community for an account on a phone", () => {
      expect(() => refuseXOnPhone({ phoneId: "p1", handle: "sam" }, "A thread")).toThrow("the X app there replies, quotes, posts and follows only")
      expect(() => refuseXOnPhone({ phoneId: null, handle: "sam" }, "A thread")).not.toThrow()
    })
  })

  describe("accounts", () => {
    it("stops an account at once when its browser shows X's lock screen, dropping its waiting jobs", async () => {
      await queueJob(userId, "x_warm_up", { accountId }, db, new Date(Date.now() + HOUR))
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      await saveXSignIn(account, { checked: true, handle: "sam", blocked: true, reason: "locked", banScreen: "Your account has been locked.", joinedSeconds: null, followers: null }, db)
      const [after] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(after.banScreenAt).not.toBeNull()
      expect(after.blockedReason).toBe("Your account has been locked.")
      expect(await db.select().from(promoJobs).where(eq(promoJobs.kind, "x_warm_up"))).toHaveLength(0)
    })

    it("types the authenticator code worked out at that moment", async () => {
      vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
      const secret = "JBSWY3DPEHPK3PXP"
      await db.update(promoAccounts).set({ totpSecretEncrypted: encryptSecret(secret) }).where(eq(promoAccounts.id, accountId))
      vi.mocked(calls.xEnterCode).mockResolvedValueOnce({ checked: true, handle: "sam", blocked: false, reason: "", banScreen: null, joinedSeconds: null, followers: null })
      await queueJob(userId, "x_code", { accountId }, db)
      expect(await runOneJob("worker", db)).toMatchObject({ ok: true, kind: "x_code" })
      const typed = vi.mocked(calls.xEnterCode).mock.calls[0][1].code
      expect(typed).toMatch(/^\d{6}$/)
      expect([totpCode(secret), totpCode(secret, new Date(Date.now() - 30_000))]).toContain(typed)
    })

    it("refuses a throwaway's reply that names an important account", async () => {
      const important = uuid()
      await db.insert(promoAccounts).values({ id: important, userId, platform: "x", handle: "boss", importance: "important" })
      const find = await oneFind()
      await expect(queueXReply(userId, { findId: find.id, accountId, text: "Ask @boss about it." }, db)).rejects.toThrow("the words name your important account @boss")
    })

    it("writes Hidden from search when a stranger can't find the latest reply, and rings once", async () => {
      await db.insert(promoXReplies).values({ id: uuid(), userId, accountId, projectId, targetId: "1700000000000000010", postId: "1700000000000000011", text: "We plan the whole week every Sunday evening.", status: "posted", postedAt: new Date() })
      vi.mocked(calls.xLookup).mockResolvedValue({ accounts: [{ handle: "sam", exists: true, name: "Sam", followers: 120, joinedSeconds: null }], viewed: 20, limited: false })
      vi.mocked(calls.xReach).mockResolvedValue({ inSearch: false, underPost: "shown", viewed: 4, limited: false })
      await recordXReach(userId, accountId, await searcherReader(), db)
      await recordXReach(userId, accountId, await searcherReader(), db)
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(account).toMatchObject({ xReach: "hidden", followers: 120 })
      const notices = await db.select().from(customShellNotifications)
      expect(notices.map((n) => n.message)).toEqual(["X may be hiding @sam"])
    })
  })

  describe("the AI's words", () => {
    it("tells the AI Tyler's rules for naming the product and links, and nothing about the product for help only", () => {
      const base = {
        kind: "reply" as const,
        post: { text: "How do you plan your week?", author: "poster" },
        under: null,
        topReplies: [{ id: "1", handle: "lee", name: "Lee", text: "Paper diary.", likes: 4 }],
        voice: "",
        commentRules: "",
        product: "Pomoder, a weekly planner.",
        examples: [],
        helpOnly: false,
        answering: null,
        limit: 280,
        count: 2,
      }
      const prompt = drafts.buildXReplyPrompt(base)
      expect(prompt).toContain("Name the product only when the post is about a problem the product solves")
      expect(prompt).toContain("Never put a link")
      expect(prompt).toContain("@lee: Paper diary.")
      const help = drafts.buildXReplyPrompt({ ...base, helpOnly: true })
      expect(help).not.toContain("Pomoder")
      expect(drafts.splitXDrafts("One reply.\n---\nTwo reply.\n---\nThree.", 2, 280)).toEqual(["One reply.", "Two reply."])
    })

    it("reads keyword ideas, trend picks and a thread", () => {
      expect(drafts.readXKeywordIdeas("SEARCH: weekly planner\nHASHTAG: #productivity\nACCOUNT: @levelsio\nACCOUNT: not valid!")).toEqual([
        { kind: "search", value: "weekly planner" },
        { kind: "hashtag", value: "productivity" },
        { kind: "account", value: "levelsio" },
      ])
      expect(drafts.readXTrendPicks("TREND: #Productivity\nTREND: Made up", ["#Productivity", "Football"])).toEqual(["#Productivity"])
      expect(drafts.readXPost("First.\n---\nSecond.\nCHOICE: Paper\nCHOICE: App", 3, 280)).toEqual({ pieces: ["First.", "Second."], choices: ["Paper", "App"] })
    })
  })

  describe("after the audit", () => {
    it("reads and answers an X account's direct messages in its browser", async () => {
      vi.mocked(calls.xInbox).mockResolvedValueOnce({
        messages: [{ id: "m1", conversationId: "c1", handle: "lee", name: "Lee", text: "Is there a free plan?", sentSeconds: null }],
      })
      await queueJob(userId, "inbox_read", { accountId, inboxKind: "message", via: "inbox" }, db)
      expect(await runOneJob("worker", db)).toMatchObject({ ok: true, kind: "inbox_read" })
      const [row] = await db.select().from(promoInbox)
      expect(row).toMatchObject({ thread: "@lee", platform: "x" })

      vi.mocked(calls.xMessage).mockResolvedValueOnce({ done: true })
      await sendInboxReply(userId, row.id, "Yes, there is.", db)
      expect(await runOneJob("worker", db)).toMatchObject({ ok: true, kind: "inbox_reply" })
      expect(vi.mocked(calls.xMessage).mock.calls[0][1]).toEqual({ handle: "lee", text: "Yes, there is." })
    })

    it("keeps each thread post's id but never marks it posted once the queue gave up on its job", async () => {
      const postRowId = await saveXPost(
        userId,
        projectId,
        null,
        { accountId, pieces: ["One.", "Two."].map((text) => ({ text, pictureUrl: "" })), poll: null, communityId: "", source: "", scheduledFor: null },
        db
      )
      const { jobId } = await queueXPublish(userId, postRowId, db)
      const claimedAt = new Date(Date.now() - 20 * 60_000)
      await db.update(promoJobs).set({ status: "running", claimedAt }).where(eq(promoJobs.id, jobId))
      vi.mocked(calls.xPublish)
        .mockResolvedValueOnce({ postId: "1800000000000000201", url: "" })
        .mockImplementationOnce(async () => {
          // The queue gives up on the job while the second post is typed.
          await db.update(promoXPosts).set({ status: "failed", lastError: "It may already be on X." })
          return { postId: "1800000000000000202", url: "" }
        })
      await expect(runXPublish(userId, postRowId, accountTarget, db, new Date(), jobId)).rejects.toThrow("stopped waiting")
      const [row] = await db.select().from(promoXPosts)
      expect(row.status).toBe("failed")
      expect(row.pieces.map((piece) => piece.postId)).toEqual(["1800000000000000201", "1800000000000000202"])
      const [job] = await db.select().from(promoJobs).where(eq(promoJobs.id, jobId))
      expect(job.claimedAt!.getTime()).toBeGreaterThan(claimedAt.getTime())
    })

    it("takes a reply back when its job is cancelled on the Jobs dashboard", async () => {
      const find = await oneFind()
      const queued = await queueXReply(userId, { findId: find.id, accountId, text: "We plan on Sundays." }, db)
      expect(await cancelJobs(userId, [queued.jobId], db)).toMatchObject({ completed: [queued.jobId] })
      expect(await db.select().from(promoXReplies)).toHaveLength(0)
      await expect(queueXReply(userId, { findId: find.id, accountId, text: "We plan on Sundays." }, db)).resolves.toBeTruthy()
    })

    it("never tries a phone's reply again after the phone went quiet part-way", async () => {
      const { promoPhones } = await import("@/server/phones/schema")
      const phoneId = uuid()
      await db.insert(promoPhones).values({ id: phoneId, userId, name: "Pixel" })
      await db.update(promoAccounts).set({ phoneId, profileId: null }).where(eq(promoAccounts.id, accountId))
      const id = uuid()
      await db.insert(promoXReplies).values({ id, userId, accountId, projectId, targetId: "1700000000000000030", text: "Hi.", status: "failed", lastError: "Pixel did not answer x/reply within 990 seconds of starting it." })
      await expect(retryFailedXReply(userId, id, db)).rejects.toThrow("may already be on X")
    })

    it("keeps the last numbers when a check cannot find the reply", async () => {
      const id = uuid()
      await db.insert(promoXReplies).values({ id, userId, accountId, projectId, targetId: "1700000000000000031", postId: "1700000000000000032", text: "Ours.", status: "posted", postedAt: new Date(), views: 500, likes: 4, replyCount: 2, stillVisible: true })
      vi.mocked(calls.xCheck).mockResolvedValueOnce({ found: false, visible: null, views: null, likes: null, replies: null, reposts: null, pollVotes: null, incoming: [], viewed: 1, limited: false })
      await recordXCheck(userId, { replyId: id }, await searcherReader(), db)
      const [row] = await db.select().from(promoXReplies).where(eq(promoXReplies.id, id))
      expect(row).toMatchObject({ views: 500, likes: 4, replyCount: 2, stillVisible: false })
    })

    it("counts each post of a thread against a young account's pace", async () => {
      await db.update(promoAccounts).set({ xJoinedAt: new Date(Date.now() - 30 * DAY) }).where(eq(promoAccounts.id, accountId))
      const pieces = ["1800000000000000301", "1800000000000000302", "1800000000000000303"].map((postId) => ({ text: "A post.", pictureUrl: "", postId }))
      await db.insert(promoXPosts).values({ id: uuid(), userId, projectId, accountId, pieces, status: "posted", postedAt: new Date() })
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(await readXPostingState(userId, account, db)).toMatchObject({ lastDay: 3, lastHour: 3 })
    })

    it("refuses an edit while the account sleeps past X's hour to edit", async () => {
      const minute = localMinutes(new Date(), "UTC")
      await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), wakeFromMinute: (minute + 180) % 1440, wakeUntilMinute: (minute + 600) % 1440 }, db)
      await db.update(promoAccounts).set({ xPaid: true }).where(eq(promoAccounts.id, accountId))
      const id = uuid()
      await db.insert(promoXReplies).values({ id, userId, accountId, projectId, targetId: "1700000000000000033", postId: "1700000000000000034", text: "First.", status: "posted", postedAt: new Date() })
      await expect(queueXChange(userId, { replyId: id, action: "edit", text: "Better words." }, db)).rejects.toThrow("hour to edit is over")
      await expect(queueXChange(userId, { replyId: id, action: "delete" }, db)).resolves.toBeTruthy()
    })

    it("keeps the new id X gives an edited reply", async () => {
      const { runXChange } = await import("./replies")
      const id = uuid()
      await db.insert(promoXReplies).values({ id, userId, accountId, projectId, targetId: "1700000000000000035", postId: "1700000000000000036", postUrl: "https://x.com/sam/status/1700000000000000036", text: "First.", status: "posted", postedAt: new Date() })
      vi.mocked(calls.xEdit).mockResolvedValueOnce({ done: true, postId: "1700000000000000037" })
      await runXChange(userId, "x_edit", { replyId: id, text: "Better." }, accountTarget, db)
      const [row] = await db.select().from(promoXReplies).where(eq(promoXReplies.id, id))
      expect(row).toMatchObject({ text: "Better.", postId: "1700000000000000037", postUrl: "https://x.com/sam/status/1700000000000000037" })
    })

    it("never sends a conversation a phone read from the browser, where its name may be someone else's handle", async () => {
      vi.mocked(calls.xInbox).mockResolvedValueOnce({
        messages: [{ id: "m1", conversationId: "c1", handle: "lee", name: "Lee", text: "Is there a free plan?", sentSeconds: null }],
      })
      await queueJob(userId, "inbox_read", { accountId, inboxKind: "message", via: "inbox" }, db)
      await runOneJob("worker", db)
      const [row] = await db.select().from(promoInbox)
      await db.update(promoInbox).set({ thread: "Sam" }).where(eq(promoInbox.id, row.id))
      await sendInboxReply(userId, row.id, "Yes, there is.", db)
      expect(await runOneJob("worker", db)).toMatchObject({ ok: false, kind: "inbox_reply" })
      expect(calls.xMessage).not.toHaveBeenCalled()
      const [after] = await db.select().from(promoInbox).where(eq(promoInbox.id, row.id))
      expect(after).toMatchObject({ status: "open" })
      expect(after.lastError).toContain("read on a phone")
    })

    it("marks a waiting reply failed when a lock screen drops its job", async () => {
      const find = await oneFind()
      const queued = await queueXReply(userId, { findId: find.id, accountId, text: "We plan on Sundays." }, db)
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      await db.update(promoJobs).set({ lane: profileId }).where(eq(promoJobs.id, queued.jobId))
      await saveXSignIn(account, { checked: true, handle: "sam", blocked: true, reason: "", banScreen: "Your account has been locked.", joinedSeconds: null, followers: null }, db)
      const [row] = await db.select().from(promoXReplies).where(eq(promoXReplies.id, queued.replyId))
      expect(row.status).toBe("failed")
      expect(row.lastError).toContain("lock screen")
    })

    it("never writes a Check that could not see X as signed out", async () => {
      vi.mocked(calls.xState).mockResolvedValueOnce({ checked: false, handle: null, blocked: false, reason: "X did not load.", banScreen: null, joinedSeconds: null, followers: null })
      await queueJob(userId, "check", { profileId }, db)
      expect(await runOneJob("worker", db)).toMatchObject({ ok: false })
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(account.handle).toBe("sam")
    })

    it("refuses a picture that is not in the media library", async () => {
      await expect(
        saveXPost(userId, projectId, null, { accountId, pieces: [{ text: "Look.", pictureUrl: "https://elsewhere.example/a.png" }], poll: null, communityId: "", source: "", scheduledFor: null }, db)
      ).rejects.toThrow("Pick the picture from your media library")
    })

    it("never changes a post's words once Post was pressed", async () => {
      const input = { accountId, pieces: [{ text: "First words.", pictureUrl: "" }], poll: null, communityId: "", source: "", scheduledFor: null }
      const postRowId = await saveXPost(userId, projectId, null, input, db)
      await queueXPublish(userId, postRowId, db)
      await expect(saveXPost(userId, projectId, postRowId, { ...input, pieces: [{ text: "Other words.", pictureUrl: "" }] }, db)).rejects.toThrow("on its way")
    })

    it("tries a failed scheduled post again now, whatever hour it was set for", async () => {
      const postRowId = await saveXPost(userId, projectId, null, { accountId, pieces: [{ text: "Later.", pictureUrl: "" }], poll: null, communityId: "", source: "", scheduledFor: new Date(Date.now() + HOUR) }, db)
      await db.update(promoXPosts).set({ status: "failed", scheduledFor: new Date(Date.now() - HOUR), lastError: "publish: the Post button never lit" })
      await expect(queueXPublish(userId, postRowId, db)).resolves.toMatchObject({ runAfter: null })
    })

    it("never sends a phone's failure that may have landed again", async () => {
      const phoneReply = uuid()
      const { promoPhones } = await import("@/server/phones/schema")
      const phoneId = uuid()
      await db.insert(promoPhones).values({ id: phoneId, userId, name: "Pixel" })
      await db.update(promoAccounts).set({ phoneId, profileId: null }).where(eq(promoAccounts.id, accountId))
      await db.insert(promoXReplies).values({ id: phoneReply, userId, accountId, projectId, targetId: "1700000000000000020", text: "Hi.", status: "failed", lastError: "reply: X said nothing. It may already be on X." })
      await expect(retryFailedXReply(userId, phoneReply, db)).rejects.toThrow("may already be on X")
    })

    it("refuses an edit that names an important account from a throwaway", async () => {
      await db.insert(promoAccounts).values({ id: uuid(), userId, platform: "x", handle: "boss", importance: "important" })
      await db.update(promoAccounts).set({ xPaid: true }).where(eq(promoAccounts.id, accountId))
      const id = uuid()
      await db.insert(promoXReplies).values({ id, userId, accountId, projectId, targetId: "1700000000000000021", postId: "1700000000000000022", text: "First.", status: "posted", postedAt: new Date() })
      await expect(queueXChange(userId, { replyId: id, action: "edit", text: "Ask @boss." }, db)).rejects.toThrow("important account @boss")
    })

    it("lets a reply be deleted past the day's pace", async () => {
      await saveXSettings(userId, { ...(await readXSettings(userId, db)), repliesPerDay: 1, repliesPerHour: 1 }, db)
      await db.update(promoAccounts).set({ xJoinedAt: new Date(Date.now() - 30 * DAY) }).where(eq(promoAccounts.id, accountId))
      const id = uuid()
      await db.insert(promoXReplies).values({ id, userId, accountId, projectId, targetId: "1700000000000000023", postId: "1700000000000000024", text: "Oops.", status: "posted", postedAt: new Date() })
      await expect(queueXChange(userId, { replyId: id, action: "delete" }, db)).resolves.toBeTruthy()
    })

    it("spots any domain as a link, and leaves e.g. and Node.js alone", () => {
      for (const text of ["see bit.ly/abc", "try tool.gg", "site.shop has it", "go to name.tv."]) expect(holdsLink(text)).toBe(true)
      for (const text of ["e.g. on Sundays", "we use Node.js", "Plan. Then cook."]) expect(holdsLink(text)).toBe(false)
    })

    it("ends a thread from a Medium article with the whole address, counted as X counts", () => {
      const link = `https://medium.com/@sam/${"a-long-title-".repeat(8)}1234567890ab`
      const pieces = drafts.endWithLink(["One.", `${"word ".repeat(60)}https://broken.example`], link, 280)
      const last = pieces[1] ?? ""
      expect(last.endsWith(link)).toBe(true)
      expect(last).not.toContain("broken.example")
      expect(xLength(last)).toBeLessThanOrEqual(280)
    })

    it("rings each person's own bell for the same watched post", async () => {
      const other = (await insertUser(db, { role: "admin" })).id
      const otherProject = await createProject(other, "Theirs", db, ["x"])
      const otherScout = await createProfile(other, { name: "Their scout" }, db)
      await addSearcher(other, otherScout, db)
      const mine = await keyword("account", "@levelsio")
      const theirs = (await addXKeyword(other, otherProject, { kind: "account", value: "@levelsio" }, db)).id
      await db.delete(promoJobs)
      await searchWith(mine, [post({ postId: "1800000000000000070", authorHandle: "levelsio" })])
      vi.mocked(calls.xSearch).mockResolvedValueOnce({ posts: [{ ...post({ postId: "1800000000000000070", authorHandle: "levelsio" }), position: 0 }], viewed: 1, limited: false })
      await runXSearch(other, theirs, { target: searchTarget, searcher: await pickSearcher(other, db) }, db)
      await searchWith(mine, [post({ postId: "1800000000000000071", authorHandle: "levelsio" })])
      vi.mocked(calls.xSearch).mockResolvedValueOnce({ posts: [{ ...post({ postId: "1800000000000000071", authorHandle: "levelsio" }), position: 0 }], viewed: 1, limited: false })
      await runXSearch(other, theirs, { target: searchTarget, searcher: await pickSearcher(other, db) }, db)
      const notices = await db.select().from(customShellNotifications)
      expect(new Set(notices.map((notice) => notice.recipientUserId))).toEqual(new Set([userId, other]))
    })

    it("puts a watched account's new post at the top of To look at", async () => {
      const words = await keyword("search", "planning")
      const watched = await keyword("account", "@levelsio")
      await searchWith(watched, [post({ postId: "1800000000000000080", authorHandle: "levelsio", authorFollowers: 10, replies: 50 })])
      await searchWith(words, [post({ postId: "1800000000000000081", authorFollowers: 100_000, replies: 0 })])
      const [first] = await listXFinds(userId, { projectId, keywordId: null, tab: "new" }, db)
      expect(first).toMatchObject({ postId: "1800000000000000080", watched: true })
    })

    it("reads a watched account every 15 minutes and search words every 2 hours", async () => {
      const words = await keyword("search", "planning")
      const watched = await keyword("account", "@levelsio")
      await db.update(promoXKeywords).set({ lastRunAt: new Date(Date.now() - 20 * 60_000) })
      expect(await queueDueXSearches(db)).toBe(1)
      const jobs = await db.select().from(promoJobs)
      expect(jobs.map((job) => job.payload.keywordId)).toEqual([watched])
      await db.delete(promoJobs)
      await db.update(promoXKeywords).set({ lastRunAt: new Date(Date.now() - 3 * HOUR) }).where(eq(promoXKeywords.id, words))
      expect(await queueDueXSearches(db)).toBe(2)
    })

    it("spreads a batch of reads over two search accounts", async () => {
      const second = await createProfile(userId, { name: "Scout 2" }, db)
      await addSearcher(userId, second, db)
      for (const value of ["a one", "b two", "c three", "d four"]) await addXKeyword(userId, projectId, { kind: "search", value }, db)
      const lanes = (await db.select({ lane: promoJobs.lane }).from(promoJobs)).map((row) => row.lane)
      expect(new Set(lanes)).toEqual(new Set([searcherProfileId, second]))
    })

    it("keeps only the accounts X says exist from the AI's ideas", async () => {
      const jobId = await queueJob(userId, "x_lookup", { handles: ["levelsio", "gone_account"] }, db)
      vi.mocked(calls.xLookup).mockResolvedValueOnce({
        accounts: [
          { handle: "levelsio", exists: true, name: "Pieter", followers: 600_000, joinedSeconds: null },
          { handle: "gone_account", exists: false, name: "", followers: null, joinedSeconds: null },
        ],
        viewed: 40,
        limited: false,
      })
      await recordXLookup(userId, jobId, ["levelsio", "gone_account"], await searcherReader(), db)
      const [job] = await db.select().from(promoJobs).where(eq(promoJobs.id, jobId))
      expect(job.payload.found).toEqual([{ handle: "levelsio", name: "Pieter", followers: 600_000 }])
    })

    it("lists Today's strong posts and the replies waiting, and counts them on the X row", async () => {
      const find = await oneFind({ authorFollowers: 100_000, replies: 0 })
      expect(find.band).toBe("strong")
      await db.insert(promoXReplies).values({
        id: uuid(), userId, accountId, projectId, targetId: "1700000000000000030", postId: "1700000000000000031", text: "Ours.", status: "posted", postedAt: new Date(),
        incoming: [{ id: "1700000000000000032", handle: "lee", name: "Lee", text: "Which one?", likes: 0, postedAt: null }],
      })
      const today = await readXToday(userId, projectId, db)
      expect(today.strong.map((row) => row.id)).toEqual([find.id])
      expect(today.toAnswer.map((row) => row.incoming.id)).toEqual(["1700000000000000032"])
      expect(await readXCounts(userId, projectId, db)).toMatchObject({ strong: 1, toAnswer: 1 })
    })

    it("shows what you said before on a post with the same words, and copies your own replies first", async () => {
      const id = await keyword()
      await db.insert(promoXReplies).values([
        { id: uuid(), userId, accountId, projectId, targetId: "1700000000000000040", targetText: "How do you plan dinners for the week?", text: "Typed by hand.", status: "posted", postedAt: new Date(Date.now() - HOUR) },
      ])
      await searchWith(id, [post({ postId: "1800000000000000090", text: "Plan dinners for the week, how?" })])
      const [find] = await listXFinds(userId, { projectId, keywordId: id, tab: "new" }, db)
      const past = await pastXAnswers(userId, { id: find.id, postId: find.postId, keywordId: id, text: find.text }, db)
      expect(past.map((row) => row.text)).toEqual(["Typed by hand."])
      expect(await drafts.exampleXReplies(userId, accountId, db)).toEqual(["Typed by hand."])
    })

    it("stops looking up a phone reply for the day once X's search can't find it", async () => {
      const id = uuid()
      await db.insert(promoXReplies).values({ id, userId, accountId, projectId, targetId: "1700000000000000050", text: "From the phone,\nwe plan on Sundays.", status: "posted", postedAt: new Date() })
      vi.mocked(calls.xSearch).mockResolvedValueOnce({ posts: [], viewed: 0, limited: false })
      await expect(recordXCheck(userId, { replyId: id }, await searcherReader(), db)).rejects.toThrow("does not show")
      expect(await queueXChecks(userId, null, db)).toBe(0)
      vi.mocked(calls.xSearch).mockResolvedValueOnce({
        posts: [{ ...post({ postId: "1700000000000000051", authorHandle: "SAM", text: "From the phone, we plan on Sundays." }), position: 0 }],
        viewed: 1,
        limited: false,
      })
      await recordXCheck(userId, { replyId: id }, await searcherReader(), db)
      const [row] = await db.select().from(promoXReplies).where(eq(promoXReplies.id, id))
      expect(row.postId).toBe("1700000000000000051")
    })
  })

  it("counts this month's X AI spend for one project, and day by day", async () => {
    const month = new Date().toISOString().slice(0, 8) + "01"
    await db.insert(customShellAiUsageEvents).values([
      { id: uuid(), userId, provider: "anthropic", model: "m", feature: "x-reply", inputTokens: 1, outputTokens: 1, costCents: 40, status: "success", monthStart: month, metadata: { projectId }, createdAt: new Date() },
      { id: uuid(), userId, provider: "anthropic", model: "m", feature: "x-post", inputTokens: 1, outputTokens: 1, costCents: 60, status: "success", monthStart: month, metadata: { projectId }, createdAt: new Date() },
      { id: uuid(), userId, provider: "anthropic", model: "m", feature: "medium-response", inputTokens: 1, outputTokens: 1, costCents: 50, status: "success", monthStart: month, metadata: { projectId }, createdAt: new Date() },
    ])
    const spend = await xSpend(userId, projectId, db)
    expect(spend).toMatchObject({ totalCents: 100, parts: { replies: 40, posts: 60, ideas: 0 } })
    expect(spend.days).toEqual([{ day: new Date().toISOString().slice(0, 10), cents: 100 }])
  })

  it("keeps the replies sent from a keyword's posts when the keyword goes", async () => {
    const find = await oneFind()
    await db.insert(promoXReplies).values({ id: uuid(), userId, accountId, projectId, findId: find.id, targetId: find.postId, targetText: find.text, text: "x", status: "posted" })
    const { deleteXKeyword } = await import("./keywords")
    const [keywordRow] = await db.select().from(promoXKeywords)
    await deleteXKeyword(userId, keywordRow.id, db)
    const [row] = await db.select().from(promoXReplies)
    expect(row.findId).toBeNull()
    expect(row.targetText).toBe(find.text)
  })
})
