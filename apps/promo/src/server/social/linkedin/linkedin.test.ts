import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  linkedinGroupId,
  linkedinKeywordValue,
  linkedinSlug,
  matchedTitle,
  titleMatches,
} from "@/lib/social/linkedin/options"
import { uuid } from "@/server/auth/security"
import { createProfile } from "@/server/browser/profiles"
import { setDbForTests } from "@/server/db"
import { customShellAiUsageEvents, customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

import { promoAccounts, promoInbox, promoJobs } from "../schema"
import {
  promoLinkedinComments,
  promoLinkedinConnects,
  promoLinkedinFinds,
  promoLinkedinInvites,
  promoLinkedinPosts,
  promoLinkedinReadings,
  promoLinkedinSearchers,
  promoLinkedinViewers,
} from "./schema"

vi.mock("@/server/browser/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/browser/session")>()
  return { ...actual, ensureSession: vi.fn(), stopSession: vi.fn(), touchSession: vi.fn() }
})

// Workday hours read the real clock, so every test is inside one unless it says otherwise.
vi.mock("@/lib/social/linkedin/workday", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/social/linkedin/workday")>()
  return { ...actual, isWorkday: vi.fn(() => true), nextWorkdayAt: vi.fn(() => null) }
})

vi.mock("./calls", () => ({
  linkedinState: vi.fn(),
  linkedinQuickState: vi.fn(),
  linkedinEnterCode: vi.fn(),
  linkedinSearch: vi.fn(),
  linkedinReadPost: vi.fn(),
  linkedinCheck: vi.fn(),
  linkedinLookup: vi.fn(),
  linkedinGroup: vi.fn(),
  linkedinSeen: vi.fn(),
  linkedinFindOwn: vi.fn(),
  linkedinComment: vi.fn(),
  linkedinPublish: vi.fn(),
  linkedinNewsletter: vi.fn(),
  linkedinEdit: vi.fn(),
  linkedinDelete: vi.fn(),
  linkedinConnect: vi.fn(),
  linkedinInvites: vi.fn(),
  linkedinAccept: vi.fn(),
  linkedinViewers: vi.fn(),
  linkedinNumbers: vi.fn(),
  linkedinFeed: vi.fn(),
  linkedinWarmUp: vi.fn(),
  linkedinInbox: vi.fn(),
  linkedinMessage: vi.fn(),
}))

const session = await import("@/server/browser/session")
const workday = await import("@/lib/social/linkedin/workday")
const realWorkday = await vi.importActual<typeof import("@/lib/social/linkedin/workday")>("@/lib/social/linkedin/workday")
const calls = await import("./calls")
const { runOneJob } = await import("../runner")
const { readBehaviour, saveBehaviour } = await import("../behaviour")
const { createProject } = await import("../projects")
const { queueJob } = await import("../jobs")
const { cancelJobs } = await import("../job-list")
const { finishMoveFromPhone } = await import("../move-to-phone")
const { queueInboxRead, sendInboxReply } = await import("../phone-apps/inbox")
const { rankLinkedinFind, linkedinFitBand } = await import("./rank")
const { addLinkedinKeyword, saveBuyerTitles } = await import("./keywords")
const { runLinkedinSearch, runLinkedinFeed, feedPostFits } = await import("./search")
const { listLinkedinFinds, setLinkedinFindsStatus, hideLinkedinAuthor } = await import("./finds")
const { addLinkedinSearcher, listLinkedinSearchers, pickLinkedinSearcher, readLinkedinSettings } = await import("./searchers")
const { queueLinkedinComment, cancelLinkedinComment, refuseLinkedinOnPhone } = await import("./posting")
const { runLinkedinComment, recordLinkedinCheck, retryFailedLinkedinComment, queueLinkedinChange, pastLinkedinComments, listLinkedinComments } = await import("./comments")
const { saveLinkedinPost, queueLinkedinPublish, runLinkedinPublish, splitFirstLink, refuseGroupRules } = await import("./posts")
const { queueLinkedinConnect, acceptLinkedinInvites, readLinkedinPeople, runLinkedinViewers } = await import("./people")
const { recordLinkedinSeen, runLinkedinNumbers } = await import("./reach")
const { saveLinkedinSignIn, queueLinkedinCode } = await import("./run")
const { linkedinSpend } = await import("./cost")
const drafts = await import("./drafts")
const { readLinkedinCounts, readLinkedinToday } = await import("./module")
const { queueDueLinkedinSearches } = await import("./upkeep")

const accountTarget = { port: 7910, token: "account-key" }
const searchTarget = { port: 7912, token: "search-key" }
const DAY = 86_400_000
const HOUR = 3_600_000

/** A LinkedIn post as the routines answer it, with what a test cares about set. */
function post(overrides: Partial<Awaited<ReturnType<typeof calls.linkedinReadPost>>["post"] & object> & { postId: string }) {
  return {
    url: `https://www.linkedin.com/feed/update/urn:li:activity:${overrides.postId}/`,
    text: `How do you plan the week when your team is remote? Asking for post ${overrides.postId}.`,
    authorName: "Jo Writer",
    authorHeadline: "Product designer at Studio",
    authorSlug: "jo-writer",
    authorKind: "person" as const,
    authorFollowers: 1_000,
    postedSeconds: Math.floor(Date.now() / 1000) - 600,
    reactions: 3,
    comments: 1,
    reposts: 0,
    canComment: true,
    isRepost: false,
    link: "",
    ...overrides,
  }
}

/** Who a browser says it is, signed in and nothing in the way. */
function signedIn(slug: string | null) {
  return { checked: true, slug, name: "", blocked: false, reason: "", banScreen: null, codeAsked: false, pages: null, premium: null, followers: null }
}

/** Words long enough for the too-similar check to compare. */
const LONG_COMMENT =
  "We plan the whole week on Monday morning with one short list and three big things, then every day we pick one of them to finish before lunch, which keeps remote teams in step."

describe("LinkedIn", () => {
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
    vi.mocked(workday.isWorkday).mockImplementation(() => true)
    vi.mocked(workday.nextWorkdayAt).mockImplementation(() => null)
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    setDbForTests(db)
    userId = (await insertUser(db, { role: "admin" })).id
    projectId = await createProject(userId, "Pomoder", db, ["linkedin"])
    readerId = await createProfile(userId, { name: "Reader" }, db)
    searcherProfileId = await createProfile(userId, { name: "Scout" }, db)
    profileId = await createProfile(userId, { name: "Main" }, db)
    await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), readerProfileId: readerId }, db)
    await addLinkedinSearcher(userId, searcherProfileId, db)
    accountId = uuid()
    await db.insert(promoAccounts).values({
      id: accountId,
      userId,
      platform: "linkedin",
      profileId,
      projectId,
      handle: "sam-lee",
      // First seen signed in a year ago: past the warm-up and the young days.
      signedInAt: new Date(Date.now() - 400 * DAY),
    })
    vi.mocked(session.ensureSession).mockImplementation(async (_user, id) => ({
      id: `session-${id}`,
      profileId: id,
      target: id === searcherProfileId ? searchTarget : accountTarget,
    }) as never)
    vi.mocked(calls.linkedinQuickState).mockImplementation(async (at) => signedIn(at === searchTarget ? "scout-reader" : "sam-lee"))
    // Every migration is run into a fresh database, which can take a minute on a busy machine.
  }, 180_000)

  afterEach(async () => {
    await client.close()
  })

  async function keyword(kind: "search" | "hashtag" | "person" | "company" = "search", value = "plan the week", mark?: "you" | "rival") {
    const { id } = await addLinkedinKeyword(userId, projectId, { kind, value, mark }, db)
    await db.delete(promoJobs)
    return id
  }

  async function searcherReader() {
    return { target: searchTarget, searcher: await pickLinkedinSearcher(userId, db) }
  }

  async function searchWith(keywordId: string, posts: ReturnType<typeof post>[], viewed = posts.length) {
    vi.mocked(calls.linkedinSearch).mockResolvedValueOnce({ posts: posts.map((item, position) => ({ ...item, position })), viewed, limited: false })
    await runLinkedinSearch(userId, keywordId, await searcherReader(), db)
  }

  async function oneFind(overrides: Partial<ReturnType<typeof post>> = {}) {
    const id = await keyword()
    await searchWith(id, [post({ postId: "7300000000000000001", ...overrides })])
    const [find] = await listLinkedinFinds(userId, { projectId, keywordId: id, tab: "new" }, db)
    if (!find) throw new Error("no find")
    return find
  }

  describe("words, ranking and the workday", () => {
    it("scores the worked example in rank.ts", () => {
      const now = new Date("2099-01-10T12:00:00Z")
      expect(
        rankLinkedinFind(
          { position: 1, comments: 5, postedAt: new Date("2099-01-10T09:00:00Z"), authorFollowers: 10_000, named: false, matchedTitle: "founder" },
          now
        )
      ).toBe(12.7637)
      expect(linkedinFitBand(6)).toBe("strong")
      expect(linkedinFitBand(2)).toBe("possible")
      expect(linkedinFitBand(1)).toBe("low")
    })

    it("reads slugs, hashtags and group ids the way LinkedIn writes them", () => {
      expect(linkedinSlug("https://www.linkedin.com/in/jane-doe-123/")).toBe("jane-doe-123")
      expect(linkedinSlug("linkedin.com/company/acme", "company")).toBe("acme")
      expect(linkedinSlug("linkedin.com/company/acme", "person")).toBe("")
      expect(linkedinKeywordValue("hashtag", " #RemoteWork ")).toBe("RemoteWork")
      expect(linkedinGroupId("https://www.linkedin.com/groups/12345/")).toBe("12345")
    })

    it("matches a job title by its words in any order", () => {
      expect(titleMatches("Co-founder & CEO at Acme", "founder")).toBe(true)
      expect(titleMatches("Head of Growth Marketing", "head of marketing")).toBe(true)
      expect(titleMatches("Student at Uni", "founder")).toBe(false)
      expect(matchedTitle("VP Sales, Acme", ["founder", "vp sales"])).toBe("vp sales")
    })

    it("works weekdays from 8:00 to 18:00 on the account's own clock", () => {
      // 22 Oct 2026 is a Thursday; 24 Oct a Saturday.
      expect(realWorkday.isWorkday(new Date("2026-10-22T12:00:00Z"), "UTC")).toBe(true)
      expect(realWorkday.isWorkday(new Date("2026-10-22T19:00:00Z"), "UTC")).toBe(false)
      expect(realWorkday.isWorkday(new Date("2026-10-24T12:00:00Z"), "UTC")).toBe(false)
      expect(realWorkday.nextWorkdayAt(new Date("2026-10-23T19:00:00Z"), "UTC")?.toISOString()).toBe("2026-10-26T08:00:00.000Z")
      expect(realWorkday.nextWorkdayAt(new Date("2026-10-22T06:30:00Z"), "UTC")?.toISOString()).toBe("2026-10-22T08:00:00.000Z")
      expect(realWorkday.nextWorkdayAt(new Date("2026-10-22T12:00:00Z"), "UTC")).toBeNull()
    })
  })

  describe("search accounts", () => {
    it("keeps a keyword whose first search is refused for want of a search account, and says why", async () => {
      await db.delete(promoLinkedinSearchers)
      const saved = await addLinkedinKeyword(userId, projectId, { kind: "search", value: "remote teams" }, db)
      expect(saved.searchRefused).toContain("There is no LinkedIn search account")
    })

    it("never lets a profile that posts, the reader, or an X search account search LinkedIn", async () => {
      await expect(addLinkedinSearcher(userId, profileId, db)).rejects.toThrow("holds an account that posts")
      await expect(addLinkedinSearcher(userId, readerId, db)).rejects.toThrow("is the reader")
      await expect(saveBehaviour(userId, { ...(await readBehaviour(userId, db)), readerProfileId: searcherProfileId }, db)).rejects.toThrow(
        "is a LinkedIn search account"
      )
    })

    it("files a LinkedIn search under the search account and runs it there, counting its views", async () => {
      const id = await keyword()
      await queueJob(userId, "linkedin_search", { keywordId: id }, db)
      const [job] = await db.select().from(promoJobs)
      expect(job.lane).toBe(searcherProfileId)
      vi.mocked(calls.linkedinSearch).mockResolvedValueOnce({ posts: [{ ...post({ postId: "7300000000000000002" }), position: 0 }], viewed: 20, limited: false })
      expect(await runOneJob("worker", db)).toMatchObject({ ok: true, kind: "linkedin_search" })
      expect(vi.mocked(calls.linkedinSearch).mock.calls[0][0]).toBe(searchTarget)
      expect((await listLinkedinSearchers(userId, db))[0].viewsToday).toBe(20)
    })

    it("starts at 300 views a day and refuses the read after them", async () => {
      expect((await readLinkedinSettings(userId, db)).viewsPerDay).toBe(300)
      await db.update(promoLinkedinSearchers).set({ views: 300, viewsOn: new Date().toISOString().slice(0, 10) })
      await expect(pickLinkedinSearcher(userId, db)).rejects.toThrow("can't read any more today")
    })

    it("carries on with a second search account when the first is stopped", async () => {
      const second = await createProfile(userId, { name: "Scout 2" }, db)
      await addLinkedinSearcher(userId, second, db)
      await db
        .update(promoLinkedinSearchers)
        .set({ stoppedOn: new Date().toISOString().slice(0, 10), stopReason: "LinkedIn restricted it." })
        .where(eq(promoLinkedinSearchers.profileId, searcherProfileId))
      expect((await pickLinkedinSearcher(userId, db)).profileId).toBe(second)
    })

    it("stops a search account for the day when LinkedIn shows its limit, keeping nothing it read", async () => {
      const id = await keyword()
      vi.mocked(calls.linkedinSearch).mockResolvedValueOnce({ posts: [{ ...post({ postId: "7300000000000000003" }), position: 0 }], viewed: 3, limited: true })
      await expect(runLinkedinSearch(userId, id, await searcherReader(), db)).rejects.toThrow("showed its limit")
      expect((await listLinkedinSearchers(userId, db))[0].stoppedReason).toContain("showed its limit")
      expect(await db.select().from(promoLinkedinFinds)).toHaveLength(0)
    })

    it("stops a search account signed in as an account that comments, and rings the bell", async () => {
      const id = await keyword()
      vi.mocked(calls.linkedinQuickState).mockResolvedValue(signedIn("sam-lee"))
      await queueJob(userId, "linkedin_search", { keywordId: id }, db)
      expect(await runOneJob("worker", db)).toMatchObject({ ok: false })
      expect(calls.linkedinSearch).not.toHaveBeenCalled()
      const notices = await db.select().from(customShellNotifications)
      expect(notices.some((notice) => notice.message?.startsWith("LinkedIn search account stopped:"))).toBe(true)
    })
  })

  describe("finding posts", () => {
    it("never undoes a skip, drops posts nobody can comment on, and leaves bare reposts out", async () => {
      const id = await keyword()
      await searchWith(id, [
        post({ postId: "7300000000000000010" }),
        post({ postId: "7300000000000000011", canComment: false }),
        post({ postId: "7300000000000000012", isRepost: true }),
      ])
      const first = await listLinkedinFinds(userId, { projectId, keywordId: id, tab: "new" }, db)
      expect(first.map((find) => find.postId)).toEqual(["7300000000000000010"])
      await setLinkedinFindsStatus(userId, [first[0].id], "skipped", db)
      await searchWith(id, [post({ postId: "7300000000000000010", reactions: 99 })])
      const skipped = await listLinkedinFinds(userId, { projectId, keywordId: id, tab: "skipped" }, db)
      expect(skipped[0].reactions).toBe(99)
    })

    it("takes a post older than 2 days off To look at, and brings it back when its words are searched", async () => {
      const id = await keyword()
      await searchWith(id, [post({ postId: "7300000000000000020", postedSeconds: Math.floor((Date.now() - 49 * HOUR) / 1000), text: "Remote rituals that stuck" })])
      expect(await listLinkedinFinds(userId, { projectId, keywordId: id, tab: "new" }, db)).toHaveLength(0)
      expect(await listLinkedinFinds(userId, { projectId, keywordId: id, tab: "new", search: "rituals" }, db)).toHaveLength(1)
    })

    it("lifts a writer the project sells to, and labels a post that names a rival", async () => {
      await saveBuyerTitles(userId, projectId, ["founder"], db)
      const id = await keyword("search", "acme planner", "rival")
      await searchWith(id, [
        post({ postId: "7300000000000000030", authorHeadline: "Student at Uni", authorSlug: "student" }),
        post({ postId: "7300000000000000031", authorHeadline: "Co-founder at Tiny", authorSlug: "founder-one" }),
      ])
      const finds = await listLinkedinFinds(userId, { projectId, keywordId: id, tab: "new" }, db)
      expect(finds[0]).toMatchObject({ postId: "7300000000000000031", matchedTitle: "founder", named: "rival" })
      expect(finds[0].reason).toContain("someone you sell to")
    })

    it("rings once for a watched person's new post, not for what their first read found, and lists it first", async () => {
      const searchId = await keyword()
      await searchWith(searchId, [post({ postId: "7300000000000000040", comments: 0 })])
      const watchId = await keyword("person", "https://www.linkedin.com/in/big-voice/")
      await searchWith(watchId, [post({ postId: "7300000000000000041", authorSlug: "big-voice", comments: 90 })])
      await searchWith(watchId, [post({ postId: "7300000000000000042", authorSlug: "big-voice", comments: 90 })])
      await searchWith(watchId, [post({ postId: "7300000000000000042", authorSlug: "big-voice", comments: 90 })])
      const notices = await db.select().from(customShellNotifications)
      expect(notices.filter((notice) => notice.message?.startsWith("New LinkedIn post from someone you watch:"))).toHaveLength(1)
      const all = await listLinkedinFinds(userId, { projectId, keywordId: null, tab: "new" }, db)
      expect(all[0].watched).toBe(true)
    })

    it("drops a hidden writer's posts before they are stored", async () => {
      const find = await oneFind()
      await hideLinkedinAuthor(userId, find.id, db)
      const id = await keyword("search", "remote teams")
      await searchWith(id, [post({ postId: "7300000000000000050" })])
      expect(await db.select().from(promoLinkedinFinds).where(eq(promoLinkedinFinds.postId, "7300000000000000050"))).toHaveLength(0)
    })

    it("keeps fitting posts from an account's own feed, offered only to that account", async () => {
      await keyword("search", "remote")
      vi.mocked(calls.linkedinFeed).mockResolvedValueOnce({
        posts: [
          { ...post({ postId: "7300000000000000060", text: "Our remote standup" }), position: 0 },
          { ...post({ postId: "7300000000000000061", text: "Lunch photos" }), position: 1 },
        ],
      })
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(await runLinkedinFeed(userId, account, accountTarget, db)).toBe(1)
      const [find] = await listLinkedinFinds(userId, { projectId, keywordId: null, tab: "new" }, db)
      expect(find.feedAccount?.id).toBe(accountId)
      const other = uuid()
      await db.insert(promoAccounts).values({ id: other, userId, platform: "linkedin", projectId, handle: "other", profileId: await createProfile(userId, { name: "Other" }, db), signedInAt: new Date(Date.now() - 400 * DAY) })
      await expect(queueLinkedinComment(userId, { findId: find.id, accountId: other, text: LONG_COMMENT }, db)).rejects.toThrow("another account's own feed")
      expect(feedPostFits({ text: "x", authorHeadline: "Founder", authorKind: "person" }, [], ["founder"])).toBe(true)
    })

    it("searches watched people every 30 minutes and search words every 3 hours, only in the workday", async () => {
      const words = await keyword()
      const person = await keyword("person", "big-voice")
      const { promoLinkedinKeywords } = await import("./schema")
      await db.update(promoLinkedinKeywords).set({ lastRunAt: new Date(Date.now() - 40 * 60_000) })
      expect(await queueDueLinkedinSearches(db, new Date(), () => 0)).toBe(1)
      const queued = await db.select().from(promoJobs)
      expect(queued.map((job) => job.payload.keywordId)).toEqual([person])
      await db.delete(promoJobs)
      await db.update(promoLinkedinKeywords).set({ lastRunAt: new Date(Date.now() - 4 * HOUR) })
      vi.mocked(workday.isWorkday).mockImplementation(() => false)
      expect(await queueDueLinkedinSearches(db, new Date(), () => 0)).toBe(0)
      vi.mocked(workday.isWorkday).mockImplementation(() => true)
      expect(await queueDueLinkedinSearches(db, new Date(), () => 0)).toBe(2)
      expect(words).toBeTruthy()
    })
  })

  describe("commenting", () => {
    it("refuses a comment with a link, or past 1,250 characters", async () => {
      const find = await oneFind()
      await expect(queueLinkedinComment(userId, { findId: find.id, accountId, text: "Try pomoder.app" }, db)).rejects.toThrow("never carries a link")
      await expect(queueLinkedinComment(userId, { findId: find.id, accountId, text: "a".repeat(1_251) }, db)).rejects.toThrow("LinkedIn takes 1250")
    })

    it("refuses an account in its first 7 days and one never seen signed in", async () => {
      const find = await oneFind()
      await db.update(promoAccounts).set({ signedInAt: new Date(Date.now() - 3 * DAY) })
      await expect(queueLinkedinComment(userId, { findId: find.id, accountId, text: LONG_COMMENT }, db)).rejects.toThrow("first 7 days on LinkedIn")
    })

    it("refuses a young account past 20 comments a day", async () => {
      const find = await oneFind()
      await db.update(promoAccounts).set({ signedInAt: new Date(Date.now() - 10 * DAY) })
      const now = new Date()
      for (let index = 0; index < 20; index += 1) {
        await db.insert(promoLinkedinComments).values({
          id: uuid(),
          userId,
          accountId,
          projectId,
          targetId: `71000000000000000${String(index).padStart(2, "0")}`,
          text: `Earlier comment ${index}`,
          status: "posted",
          postedAt: new Date(now.getTime() - (index + 1) * 60_000),
        })
      }
      await expect(queueLinkedinComment(userId, { findId: find.id, accountId, text: LONG_COMMENT }, db)).rejects.toThrow("may send 20 comments and posts a day")
    })

    it("holds a comment for the next workday instead of refusing it", async () => {
      const find = await oneFind()
      const monday = new Date(Date.now() + 2 * DAY)
      vi.mocked(workday.nextWorkdayAt).mockImplementation(() => monday)
      const queued = await queueLinkedinComment(userId, { findId: find.id, accountId, text: LONG_COMMENT }, db)
      expect(queued.runAfter?.getTime()).toBe(monday.getTime())
      expect(queued.undoUntil).toBeNull()
    })

    it("lets one of your accounts per post, and takes a comment back inside its ten seconds", async () => {
      const find = await oneFind()
      const other = uuid()
      await db.insert(promoAccounts).values({ id: other, userId, platform: "linkedin", projectId, handle: "other", profileId: await createProfile(userId, { name: "Other" }, db), signedInAt: new Date(Date.now() - 400 * DAY) })
      const queued = await queueLinkedinComment(userId, { findId: find.id, accountId, text: LONG_COMMENT }, db)
      await expect(queueLinkedinComment(userId, { findId: find.id, accountId: other, text: "Another angle on remote planning entirely." }, db)).rejects.toThrow(
        "already commented on this post"
      )
      await cancelLinkedinComment(userId, queued.commentRowId, db)
      expect(await db.select().from(promoLinkedinComments)).toHaveLength(0)
      expect(await db.select().from(promoJobs)).toHaveLength(0)
    })

    it("refuses a throwaway's comment on an important account's post, and a company page on a throwaway", async () => {
      await db.insert(promoAccounts).values({ id: uuid(), userId, platform: "linkedin", handle: "the-boss", importance: "important" })
      const id = await keyword()
      await searchWith(id, [post({ postId: "7300000000000000098", authorSlug: "the-boss" }), post({ postId: "7300000000000000099", authorSlug: "someone-else" })])
      const finds = await listLinkedinFinds(userId, { projectId, keywordId: id, tab: "new" }, db)
      const boss = finds.find((find) => find.postId === "7300000000000000098")
      const other = finds.find((find) => find.postId === "7300000000000000099")
      if (!boss || !other) throw new Error("no finds")
      await expect(queueLinkedinComment(userId, { findId: boss.id, accountId, text: LONG_COMMENT }, db)).rejects.toThrow("your important account in/the-boss")
      await expect(queueLinkedinComment(userId, { findId: other.id, accountId, text: LONG_COMMENT, asPageId: "123" }, db)).rejects.toThrow(
        "Only an important account speaks as a company page"
      )
    })

    it("sends from the account's browser, reacting first, and marks the post commented", async () => {
      const find = await oneFind()
      const queued = await queueLinkedinComment(userId, { findId: find.id, accountId, text: LONG_COMMENT }, db)
      vi.mocked(calls.linkedinComment).mockResolvedValueOnce({ commentId: "7300000000000000777", url: find.url })
      await runLinkedinComment(userId, queued.commentRowId, accountTarget, db)
      expect(vi.mocked(calls.linkedinComment).mock.calls[0][1]).toMatchObject({ postId: find.postId, parentCommentId: "", react: true })
      const [row] = await db.select().from(promoLinkedinComments)
      expect(row).toMatchObject({ status: "posted", commentId: "7300000000000000777" })
      expect(await listLinkedinFinds(userId, { projectId, keywordId: null, tab: "commented" }, db)).toHaveLength(1)
    })

    it("replies under a top comment without reacting again", async () => {
      const find = await oneFind()
      await db
        .update(promoLinkedinFinds)
        .set({ topComments: [{ id: "7300000000000000555", name: "Lee", headline: "PM", slug: "lee", text: "We use a shared doc.", reactions: 9 }] })
      const queued = await queueLinkedinComment(userId, { findId: find.id, accountId, text: LONG_COMMENT, underCommentId: "7300000000000000555" }, db)
      vi.mocked(calls.linkedinComment).mockResolvedValueOnce({ commentId: "7300000000000000556", url: find.url })
      await runLinkedinComment(userId, queued.commentRowId, accountTarget, db)
      expect(vi.mocked(calls.linkedinComment).mock.calls[0][1]).toMatchObject({ parentCommentId: "7300000000000000555", react: false })
    })

    it("marks a comment failed when the browser fails, and never sends a phone's possible landing again", async () => {
      const find = await oneFind()
      const queued = await queueLinkedinComment(userId, { findId: find.id, accountId, text: LONG_COMMENT }, db)
      vi.mocked(calls.linkedinComment).mockRejectedValueOnce(new Error("Post was pressed but no comment showed. It may already be on LinkedIn."))
      await expect(runLinkedinComment(userId, queued.commentRowId, accountTarget, db)).rejects.toThrow()
      const [failed] = await db.select().from(promoLinkedinComments)
      expect(failed.status).toBe("failed")
      const { promoPhones } = await import("@/server/phones/schema")
      const phoneId = uuid()
      await db.insert(promoPhones).values({ id: phoneId, userId, name: "Phone 1" } as typeof promoPhones.$inferInsert)
      await db.update(promoAccounts).set({ profileId: null, phoneId }).where(eq(promoAccounts.id, accountId))
      await expect(retryFailedLinkedinComment(userId, failed.id, db)).rejects.toThrow("may already be on LinkedIn")
    })

    it("takes a comment back when its job is cancelled on the Jobs dashboard", async () => {
      const find = await oneFind()
      const queued = await queueLinkedinComment(userId, { findId: find.id, accountId, text: LONG_COMMENT }, db)
      await cancelJobs(userId, [queued.jobId], db)
      expect(await db.select().from(promoLinkedinComments)).toHaveLength(0)
    })

    it("refuses on a phone what the LinkedIn app does not do", () => {
      expect(() => refuseLinkedinOnPhone({ phoneId: "p1", handle: "sam-lee" }, "A poll")).toThrow("the LinkedIn app there comments")
      expect(() => refuseLinkedinOnPhone({ phoneId: null, handle: "sam-lee" }, "A poll")).not.toThrow()
    })
  })

  describe("after sending", () => {
    async function postedComment(text = LONG_COMMENT) {
      const find = await oneFind()
      const id = uuid()
      await db.insert(promoLinkedinComments).values({
        id,
        userId,
        accountId,
        projectId,
        findId: find.id,
        targetId: find.postId,
        targetUrl: find.url,
        targetName: "Jo Writer",
        targetSlug: "jo-writer",
        targetText: find.text,
        text,
        status: "posted",
        commentId: "7300000000000000900",
        postedAt: new Date(),
      })
      return { id, find }
    }

    it("writes a comment's reading, rings once for a new reply under it, and once when it goes", async () => {
      const { id } = await postedComment()
      const reply = { id: "7300000000000000901", name: "Lee", headline: "PM", slug: "lee", text: "Nice idea", reactions: 1, postedSeconds: null }
      vi.mocked(calls.linkedinCheck).mockResolvedValue({ found: true, visible: true, reactions: 4, comments: 1, reposts: null, pollVotes: null, incoming: [reply], viewed: 3, limited: false })
      await recordLinkedinCheck(userId, { commentRowId: id }, await searcherReader(), db)
      await recordLinkedinCheck(userId, { commentRowId: id }, await searcherReader(), db)
      vi.mocked(calls.linkedinCheck).mockResolvedValue({ found: true, visible: false, reactions: null, comments: null, reposts: null, pollVotes: null, incoming: [reply], viewed: 3, limited: false })
      await recordLinkedinCheck(userId, { commentRowId: id }, await searcherReader(), db)
      const [row] = await db.select().from(promoLinkedinComments)
      expect(row).toMatchObject({ reactions: 4, stillVisible: false })
      const messages = (await db.select().from(customShellNotifications)).map((notice) => notice.message)
      expect(messages.filter((message) => message?.startsWith("New reply to you on LinkedIn"))).toHaveLength(1)
      expect(messages.filter((message) => message?.startsWith("Gone from LinkedIn:"))).toHaveLength(1)
    })

    it("edits a comment through the same checks, and deletes past the day's pace", async () => {
      const { id } = await postedComment()
      await expect(queueLinkedinChange(userId, { commentRowId: id, action: "edit", text: "See pomoder.app" }, db)).rejects.toThrow("never carries a link")
      await db.update(promoAccounts).set({ signedInAt: new Date(Date.now() - 2 * DAY) })
      await expect(queueLinkedinChange(userId, { commentRowId: id, action: "delete" }, db)).resolves.toMatchObject({ jobId: expect.any(String) })
    })

    it("shows what the account said before on posts with the same words", async () => {
      const { find } = await postedComment()
      const past = await pastLinkedinComments(userId, { postId: "7399999999999999999", keywordId: null, text: find.text }, accountId, db)
      expect(past).toHaveLength(1)
    })

    it("feeds the AI the best-liked comments, and never one switched off", async () => {
      const { id } = await postedComment("Our remote team plans on Mondays with one list.")
      await db.update(promoLinkedinComments).set({ reactions: 12 })
      expect(await drafts.exampleLinkedinComments(userId, accountId, db)).toEqual(["Our remote team plans on Mondays with one list."])
      await db.update(promoLinkedinComments).set({ notExample: true }).where(eq(promoLinkedinComments.id, id))
      expect(await drafts.exampleLinkedinComments(userId, accountId, db)).toEqual([])
    })

    it("marks an account Comments hidden? when none of its latest comments show, and rings once", async () => {
      await postedComment()
      vi.mocked(calls.linkedinSeen).mockResolvedValue({ results: [{ commentId: "7300000000000000900", shown: false }], viewed: 2, limited: false })
      await recordLinkedinSeen(userId, accountId, await searcherReader(), db)
      await recordLinkedinSeen(userId, accountId, await searcherReader(), db)
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(account.linkedinSeen).toBe("hidden")
      const messages = (await db.select().from(customShellNotifications)).map((notice) => notice.message)
      expect(messages).toEqual(["LinkedIn may be hiding in/sam-lee's comments"])
    })

    it("keeps a number only Premium shows as blank, never 0", async () => {
      vi.mocked(calls.linkedinNumbers).mockResolvedValueOnce({ followers: 210, connections: 340, profileViews: null, impressions: 1_500 })
      await runLinkedinNumbers({ id: accountId, followers: null }, accountTarget, db)
      const [reading] = await db.select().from(promoLinkedinReadings)
      expect(reading).toMatchObject({ followers: 210, profileViews: null, impressions: 1_500 })
    })

    it("lists Today's strong posts and the replies waiting, and counts them on the row", async () => {
      const { id } = await postedComment()
      await db
        .update(promoLinkedinComments)
        .set({ incoming: [{ id: "7300000000000000950", name: "Lee", headline: "PM", slug: "lee", text: "How?", reactions: 0, postedAt: null }] })
        .where(eq(promoLinkedinComments.id, id))
      const today = await readLinkedinToday(userId, projectId, db)
      expect(today.toAnswer).toHaveLength(1)
      expect((await readLinkedinCounts(userId, projectId, db)).toAnswer).toBe(1)
      expect((await listLinkedinComments(userId, projectId, "sent", db))[0].toAnswer).toBe(1)
    })
  })

  describe("posts of your own", () => {
    it("takes a link out of the words and posts it as the first comment", async () => {
      expect(splitFirstLink("Read our guide https://pomoder.app/guide today")).toEqual({ text: "Read our guide today", firstComment: "https://pomoder.app/guide" })
      const postRowId = await saveLinkedinPost(
        userId,
        projectId,
        null,
        { accountId, kind: "post", text: "Our guide to remote weeks https://pomoder.app/guide", title: "", pictureUrl: "", videoUrl: "", poll: null, tags: [], repostFindId: null, groupId: "", asPageId: "", source: "", scheduledFor: null },
        db
      )
      await queueLinkedinPublish(userId, postRowId, db)
      vi.mocked(calls.linkedinPublish).mockResolvedValueOnce({ postId: "7300000000000001000", url: "https://www.linkedin.com/feed/update/urn:li:activity:7300000000000001000/" })
      vi.mocked(calls.linkedinComment).mockRejectedValueOnce(new Error("Comment box gone"))
      await expect(runLinkedinPublish(userId, postRowId, accountTarget, db)).rejects.toThrow()
      const [failed] = await db.select().from(promoLinkedinPosts)
      expect(failed).toMatchObject({ status: "failed", postId: "7300000000000001000", text: "Our guide to remote weeks", firstComment: "https://pomoder.app/guide" })
      expect(vi.mocked(calls.linkedinPublish).mock.calls[0][1].text).not.toContain("https://")
      // Try again posts only the comment.
      await db.delete(promoJobs)
      await queueLinkedinPublish(userId, postRowId, db)
      vi.mocked(calls.linkedinComment).mockResolvedValueOnce({ commentId: "7300000000000001001", url: "" })
      await runLinkedinPublish(userId, postRowId, accountTarget, db)
      expect(calls.linkedinPublish).toHaveBeenCalledTimes(1)
      const [posted] = await db.select().from(promoLinkedinPosts)
      expect(posted).toMatchObject({ status: "posted", firstCommentId: "7300000000000001001" })
    })

    it("refuses a poll LinkedIn would not take, a tag missing from the words, and a set hour outside the workday", async () => {
      const base = { accountId, kind: "post" as const, text: "Which day do you plan?", title: "", pictureUrl: "", videoUrl: "", tags: [], repostFindId: null, groupId: "", asPageId: "", source: "", scheduledFor: null }
      await expect(saveLinkedinPost(userId, projectId, null, { ...base, poll: { question: "Day?", choices: ["Mon"], days: 3 } }, db)).rejects.toThrow("2 to 4 answers")
      await expect(saveLinkedinPost(userId, projectId, null, { ...base, poll: { question: "Day?", choices: ["Mon", "Fri"], days: 5 } }, db)).rejects.toThrow("1 day, 3 days")
      await expect(
        saveLinkedinPost(userId, projectId, null, { ...base, poll: null, tags: [{ name: "Jo Writer", slug: "jo-writer", kind: "person" }] }, db)
      ).rejects.toThrow("don't hold @Jo Writer")
      const later = await saveLinkedinPost(userId, projectId, null, { ...base, poll: null, scheduledFor: new Date(Date.now() + HOUR) }, db)
      vi.mocked(workday.isWorkday).mockImplementation(() => false)
      await expect(queueLinkedinPublish(userId, later, db)).rejects.toThrow("outside the account's workday")
    })

    it("refuses a group post the group's rules forbid, and checks nothing for a group with no rules", async () => {
      const check = vi.fn(async () => ({ ok: false, problems: ["No selling in this group."] }))
      await expect(refuseGroupRules(userId, projectId, "Buy Pomoder today", "No selling.", check)).rejects.toThrow("The group's rules don't allow this post: No selling in this group.")
      await expect(refuseGroupRules(userId, projectId, "Buy Pomoder today", "", check)).resolves.toBeUndefined()
      expect(check).toHaveBeenCalledTimes(1)
    })

    it("never lets a throwaway repost a post an important account commented on", async () => {
      const important = uuid()
      await db.insert(promoAccounts).values({ id: important, userId, platform: "linkedin", handle: "the-boss", importance: "important" })
      const find = await oneFind()
      await db.insert(promoLinkedinComments).values({ id: uuid(), userId, accountId: important, projectId, targetId: find.postId, text: "Good one.", status: "posted" })
      const postRowId = await saveLinkedinPost(
        userId,
        projectId,
        null,
        { accountId, kind: "repost", text: "Worth a read.", title: "", pictureUrl: "", videoUrl: "", poll: null, tags: [], repostFindId: find.id, groupId: "", asPageId: "", source: "", scheduledFor: null },
        db
      )
      await expect(queueLinkedinPublish(userId, postRowId, db)).rejects.toThrow("already commented on this post")
    })

    it("tells the AI a group's rules, and to write a repost's line on top of the shared post", () => {
      const prompt = drafts.buildLinkedinPostPrompt({
        about: "remote weeks",
        product: "",
        voice: "",
        commentRules: "",
        source: "",
        reposting: "Original post words",
        groupRules: "No selling in this group.",
        poll: false,
        asPage: "",
      })
      expect(prompt).toContain("No selling in this group.")
      expect(prompt).toContain("Original post words")
      expect(prompt).toContain("No link in the words")
    })
  })

  describe("people", () => {
    async function postedOn() {
      const find = await oneFind()
      const id = uuid()
      await db.insert(promoLinkedinComments).values({
        id,
        userId,
        accountId,
        projectId,
        findId: find.id,
        targetId: find.postId,
        targetName: "Jo Writer",
        targetSlug: "jo-writer",
        text: LONG_COMMENT,
        status: "posted",
        commentId: "7300000000000000970",
        postedAt: new Date(),
      })
      return id
    }

    it("sends a connection request with the edited note, and refuses the 21st in 7 days", async () => {
      const commentRowId = await postedOn()
      for (let index = 0; index < 20; index += 1) {
        await db.insert(promoLinkedinConnects).values({ id: uuid(), userId, accountId, slug: `person-${index}`, status: "sent" })
      }
      await expect(queueLinkedinConnect(userId, { accountId, note: "Enjoyed your post on remote weeks.", commentRowId }, db)).rejects.toThrow(
        "sent 20 connection requests in the last 7 days"
      )
      await db.delete(promoLinkedinConnects)
      await expect(queueLinkedinConnect(userId, { accountId, note: "See pomoder.app", commentRowId }, db)).rejects.toThrow("never carries a link")
      const queued = await queueLinkedinConnect(userId, { accountId, note: "Enjoyed your post on remote weeks.", commentRowId }, db)
      const [row] = await db.select().from(promoLinkedinConnects).where(eq(promoLinkedinConnects.id, queued.connectId))
      expect(row).toMatchObject({ slug: "jo-writer", note: "Enjoyed your post on remote weeks.", status: "waiting" })
    })

    it("never lets both groups ask the same person, and holds accepts in the warm-up", async () => {
      const important = uuid()
      await db.insert(promoAccounts).values({ id: important, userId, platform: "linkedin", handle: "the-boss", importance: "important" })
      await db.insert(promoLinkedinConnects).values({ id: uuid(), userId, accountId: important, slug: "jo-writer", status: "sent" })
      const commentRowId = await postedOn()
      await expect(queueLinkedinConnect(userId, { accountId, note: "", commentRowId }, db)).rejects.toThrow("already asked this person to connect")
      const invite = uuid()
      await db.insert(promoLinkedinInvites).values({ id: invite, userId, accountId, slug: "asker", name: "Asker" })
      await db.update(promoAccounts).set({ signedInAt: new Date(Date.now() - 2 * DAY) }).where(eq(promoAccounts.id, accountId))
      const answer = await acceptLinkedinInvites(userId, [invite], db)
      expect(answer.skipped[0]?.reason).toContain("first 7 days")
    })

    it("accepts nothing without a press, and spaces ticked requests a minute or more apart", async () => {
      const ids = [uuid(), uuid()]
      for (const [index, id] of ids.entries()) {
        await db.insert(promoLinkedinInvites).values({ id, userId, accountId, slug: `asker-${index}`, name: `Asker ${index}`, headline: "Founder" })
      }
      expect(await db.select().from(promoJobs)).toHaveLength(0)
      const now = new Date()
      const answer = await acceptLinkedinInvites(userId, ids, db, now, () => 0)
      expect(answer.completed).toEqual(ids)
      const jobs = (await db.select().from(promoJobs)).sort((a, b) => (a.runAfter?.getTime() ?? 0) - (b.runAfter?.getTime() ?? 0))
      expect(jobs).toHaveLength(2)
      expect((jobs[1].runAfter?.getTime() ?? 0) - (jobs[0].runAfter?.getTime() ?? now.getTime())).toBeGreaterThanOrEqual(60_000)
    })

    it("lists viewers the project sells to first, and refuses a connection between the two groups", async () => {
      await saveBuyerTitles(userId, projectId, ["founder"], db)
      vi.mocked(calls.linkedinViewers).mockResolvedValueOnce({
        viewers: [
          { slug: "student-a", name: "Student", headline: "Student at Uni", viewedSeconds: null },
          { slug: "founder-b", name: "Founder", headline: "Founder at Tiny", viewedSeconds: null },
          { slug: "the-boss", name: "Boss", headline: "CEO", viewedSeconds: null },
        ],
        total: 3,
        premiumNeeded: false,
      })
      await runLinkedinViewers(userId, { id: accountId, linkedinPremium: false }, accountTarget, db)
      const people = await readLinkedinPeople(userId, projectId, db)
      expect(people.viewers[0]).toMatchObject({ slug: "founder-b", fits: "founder" })
      await db.insert(promoAccounts).values({ id: uuid(), userId, platform: "linkedin", handle: "the-boss", importance: "important" })
      const [boss] = await db.select().from(promoLinkedinViewers).where(eq(promoLinkedinViewers.slug, "the-boss"))
      await expect(queueLinkedinConnect(userId, { accountId, note: "", viewerId: boss.id }, db)).rejects.toThrow("The two never connect")
    })
  })

  describe("accounts", () => {
    it("stops an account at once on a restriction screen, failing its waiting comment, and rings once", async () => {
      const find = await oneFind()
      await queueLinkedinComment(userId, { findId: find.id, accountId, text: LONG_COMMENT }, db, new Date())
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      const state = { ...signedIn("sam-lee"), blocked: true, reason: "restricted", banScreen: "Your account has been restricted" }
      await saveLinkedinSignIn(account, state, db)
      const [after] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      await saveLinkedinSignIn(after, state, db)
      expect(after).toMatchObject({ blockedReason: "Your account has been restricted" })
      expect(after.banScreenAt).not.toBeNull()
      const [comment] = await db.select().from(promoLinkedinComments)
      expect(comment.status).toBe("failed")
      // Its job is failed rather than deleted, so Dismiss and Try again still work on it.
      const [job] = await db.select().from(promoJobs).where(eq(promoJobs.kind, "linkedin_comment"))
      expect(job.status).toBe("failed")
      const messages = (await db.select().from(customShellNotifications)).map((notice) => notice.message)
      expect(messages.filter((message) => message?.includes("in/sam-lee"))).toHaveLength(1)
    })

    it("asks for the emailed code without stopping the account, types a pasted one and wipes it from its job", async () => {
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      await expect(queueLinkedinCode(userId, accountId, "123456", db)).rejects.toThrow("not asking this account for a code")
      await saveLinkedinSignIn(account, { ...signedIn(null), blocked: true, reason: "code", codeAsked: true }, db)
      const [asked] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(asked).toMatchObject({ blocked: false, banScreenAt: null })
      expect(asked.linkedinCodeAskedAt).not.toBeNull()
      const jobId = await queueLinkedinCode(userId, accountId, "123 456", db)
      vi.mocked(calls.linkedinEnterCode).mockResolvedValueOnce(signedIn("sam-lee"))
      expect(await runOneJob("worker", db)).toMatchObject({ ok: true, kind: "linkedin_code" })
      expect(vi.mocked(calls.linkedinEnterCode).mock.calls[0][1]).toEqual({ code: "123456" })
      const [job] = await db.select().from(promoJobs).where(eq(promoJobs.id, jobId))
      expect(job.payload.code).toBeUndefined()
      const [done] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(done.linkedinCodeAskedAt).toBeNull()
    })

    it("keeps the warm-up's start and the name through a look that sees nobody, and restarts it for another member", async () => {
      const [before] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      await saveLinkedinSignIn(before, { ...signedIn(null), blocked: true, reason: "code", codeAsked: true }, db)
      const [kept] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(kept.handle).toBe("sam-lee")
      expect(kept.signedInAt?.getTime()).toBe(before.signedInAt?.getTime())
      await saveLinkedinSignIn(kept, signedIn("someone-else"), db)
      const [other] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(other.handle).toBe("someone-else")
      expect((other.signedInAt?.getTime() ?? 0) > (before.signedInAt?.getTime() ?? 0)).toBe(true)
    })

    it("sends a request again when the first failed before it went out, never when it may have landed", async () => {
      const find = await oneFind()
      const commentRowId = uuid()
      await db.insert(promoLinkedinComments).values({ id: commentRowId, userId, accountId, projectId, findId: find.id, targetId: find.postId, targetName: "Jo Writer", targetSlug: "jo-writer", text: LONG_COMMENT, status: "posted", commentId: "7300000000000000971", postedAt: new Date() })
      await db.insert(promoLinkedinConnects).values({ id: uuid(), userId, accountId, slug: "jo-writer", status: "failed", lastError: "Not sent: LinkedIn stopped the account first." })
      await expect(queueLinkedinConnect(userId, { accountId, note: "", commentRowId }, db)).resolves.toMatchObject({ connectId: expect.any(String) })
      await db.update(promoLinkedinConnects).set({ status: "failed", lastError: "Connect was pressed. It may already be on LinkedIn." })
      await expect(queueLinkedinConnect(userId, { accountId, note: "", commentRowId }, db)).rejects.toThrow("may already be on LinkedIn")
    })

    it("reads the member's slug, never a handle, when a phone move finishes", async () => {
      const { promoPhones } = await import("@/server/phones/schema")
      const phoneId = uuid()
      await db.insert(promoPhones).values({ id: phoneId, userId, name: "Phone 1" } as typeof promoPhones.$inferInsert)
      await db.update(promoAccounts).set({ movingToPhoneId: phoneId }).where(eq(promoAccounts.id, accountId))
      expect(await finishMoveFromPhone(userId, phoneId, { handle: "sam-lee" }, db, new Date(), "linkedin")).toBeNull()
      const [still] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(still.movingToPhoneId).toBe(phoneId)
    })

    it("reads and answers a LinkedIn account's messages in its browser", async () => {
      await queueInboxRead(userId, accountId, "message", "inbox", db)
      vi.mocked(calls.linkedinInbox).mockResolvedValueOnce({
        messages: [{ id: "m1", conversationId: "2-abc", name: "Jo Writer", slug: "jo-writer", text: "Hi Sam, quick question", sentSeconds: 100 }],
      })
      expect(await runOneJob("worker", db)).toMatchObject({ ok: true, kind: "inbox_read" })
      const [item] = await db.select().from(promoInbox)
      expect(item.thread).toBe("li:2-abc:jo-writer")
      await sendInboxReply(userId, item.id, "Happy to help.", db)
      vi.mocked(calls.linkedinMessage).mockResolvedValueOnce({ done: true })
      expect(await runOneJob("worker", db)).toMatchObject({ ok: true, kind: "inbox_reply" })
      expect(vi.mocked(calls.linkedinMessage).mock.calls[0][1]).toEqual({ conversationId: "2-abc", slug: "jo-writer", text: "Happy to help." })
    })
  })

  describe("the AI's words and spend", () => {
    it("tells the AI the post, its top comments and Tyler's rules, and nothing about the product for help only", () => {
      const base = {
        post: { text: "How do remote teams plan?", author: "Jo", headline: "Founder" },
        under: null,
        topComments: [{ id: "1", name: "Lee", headline: "PM", slug: "lee", text: "Shared doc.", reactions: 4 }],
        voice: "Friendly and short.",
        commentRules: "",
        product: "Pomoder, a weekly planner.",
        examples: [],
        helpOnly: false,
        answering: null,
        asPage: "",
        count: 2,
      }
      const prompt = drafts.buildLinkedinCommentPrompt(base)
      expect(prompt).toContain("How do remote teams plan?")
      expect(prompt).toContain("Shared doc.")
      expect(prompt).toContain("Friendly and short.")
      expect(prompt).toContain("Name the product only when the post is about a problem the product solves")
      expect(prompt).toContain("Never put a link")
      const help = drafts.buildLinkedinCommentPrompt({ ...base, helpOnly: true })
      expect(help).not.toContain("Pomoder")
    })

    it("reads keyword ideas of four kinds", () => {
      const ideas = drafts.readLinkedinKeywordIdeas(
        ["SEARCH: plan remote week", "HASHTAG: #remotework", "PERSON: https://www.linkedin.com/in/jane-doe/", "COMPANY: linkedin.com/company/acme", "junk"].join("\n")
      )
      expect(ideas).toEqual([
        { kind: "search", value: "plan remote week" },
        { kind: "hashtag", value: "remotework" },
        { kind: "person", value: "jane-doe" },
        { kind: "company", value: "acme" },
      ])
    })

    it("counts this month's LinkedIn AI spend for one project", async () => {
      const month = new Date().toISOString().slice(0, 8) + "01"
      await db.insert(customShellAiUsageEvents).values([
        { id: uuid(), userId, provider: "anthropic", model: "m", feature: "linkedin-comment", inputTokens: 1, outputTokens: 1, costCents: 7, status: "success", monthStart: month, metadata: { projectId }, createdAt: new Date() },
        { id: uuid(), userId, provider: "anthropic", model: "m", feature: "linkedin-connect-note", inputTokens: 1, outputTokens: 1, costCents: 3, status: "success", monthStart: month, metadata: { projectId }, createdAt: new Date() },
        { id: uuid(), userId, provider: "anthropic", model: "m", feature: "x-reply", inputTokens: 1, outputTokens: 1, costCents: 50, status: "success", monthStart: month, metadata: { projectId }, createdAt: new Date() },
      ])
      const spend = await linkedinSpend(userId, projectId, db)
      expect(spend).toMatchObject({ totalCents: 10, parts: { comments: 7, posts: 0, ideas: 0, people: 3 } })
    })
  })
})
