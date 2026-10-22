import type { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { localMinutes } from "@/lib/social/waking"
import { isMediumSignInLink, mediumKeywordValue, mediumStoryId } from "@/lib/social/medium/options"
import { uuid } from "@/server/auth/security"
import { createProfile } from "@/server/browser/profiles"
import { setDbForTests } from "@/server/db"
import { customShellAiUsageEvents, customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

import { promoAccounts, promoComments, promoFinds, promoJobs, promoKeywords, promoProjects } from "../schema"
import {
  promoMediumArticleReadings,
  promoMediumArticles,
  promoMediumFinds,
  promoMediumKeywords,
  promoMediumPublications,
  promoMediumResponses,
} from "./schema"

vi.mock("@/server/browser/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/browser/session")>()
  return { ...actual, ensureSession: vi.fn(), stopSession: vi.fn(), touchSession: vi.fn() }
})

vi.mock("./calls", () => ({
  mediumState: vi.fn(),
  mediumQuickState: vi.fn(),
  mediumSignIn: vi.fn(),
  mediumSearch: vi.fn(),
  mediumStory: vi.fn(),
  mediumCheck: vi.fn(),
  mediumRespond: vi.fn(),
  mediumPublish: vi.fn(),
  mediumEdit: vi.fn(),
  mediumDelete: vi.fn(),
  mediumStats: vi.fn(),
  mediumWarmUp: vi.fn(),
  mediumAddToList: vi.fn(),
  mediumPublication: vi.fn(),
  mediumProfile: vi.fn(),
  mediumFindResponse: vi.fn(),
}))

const session = await import("@/server/browser/session")
const calls = await import("./calls")
const { runOneJob } = await import("../runner")
const { readBehaviour, saveBehaviour } = await import("../behaviour")
const { createProject, addProjectNetwork, removeProjectNetwork } = await import("../projects")
const { pausedBy, setProjectNetworkPaused } = await import("../pause")
const { rankMediumFind, mediumFitBand } = await import("./rank")
const { addMediumKeyword, deleteMediumKeyword, setMediumKeywordMark } = await import("./keywords")
const { runMediumSearch } = await import("./search")
const { listMediumFinds, setMediumFindsStatus, hideFromFind, tidyOldMediumFinds } = await import("./finds")
const { queueMediumResponse, queueMediumAnswer, readMediumPostingState, cancelMediumResponse } = await import("./posting")
const { similarity, TOO_SIMILAR_FROM } = await import("./similar")
const { recordResponseCheck, retryFailedResponse, listMediumResponses, runMediumRespond, findPhoneResponse, queueMediumChange } = await import("./responses")
const { queueAddToList } = await import("./lists")
const { refuseOnPhone } = await import("./posting")
const { phoneStepRefusal } = await import("@/lib/phones/options")
const { createMediumArticle, saveMediumArticle, queueMediumPublish, recordArticleStats } = await import("./articles")
const { addMediumPublication, recordPublicationCheck } = await import("./publications")
const { mediumSpend } = await import("./cost")
const { queueMediumSignIn } = await import("./sign-in")
const drafts = await import("./drafts")

const target = { port: 7900, token: "key" }
const readerTarget = { port: 7901, token: "reader-key" }
const DAY = 86_400_000

/** Waking hours around now, UTC, so a test is awake whenever it runs. */
function awakeNow(now: Date) {
  const minute = localMinutes(now, "UTC")
  const shift = (by: number) => (((minute + by) % 1440) + 1440) % 1440
  return { wakeFromMinute: shift(-120), wakeUntilMinute: shift(120) }
}

/** A story as Medium's data answers it, with what a test cares about set. */
function story(overrides: Partial<Awaited<ReturnType<typeof calls.mediumStory>>> & { storyId: string }) {
  return {
    url: `https://medium.com/p/${overrides.storyId}`,
    title: `Story ${overrides.storyId}`,
    subtitle: "",
    writerId: `w-${overrides.storyId}`,
    writerHandle: `writer${overrides.storyId}`,
    writerName: `Writer ${overrides.storyId}`,
    writerFollowers: 100,
    publicationSlug: "",
    publicationName: "",
    tags: ["productivity"],
    postedSeconds: Math.floor(Date.now() / 1000) - 3600,
    claps: 5,
    responseCount: 1,
    membersOnly: false,
    allowResponses: true,
    deleted: false,
    text: "The first sentence of the story. A second sentence follows it.",
    responses: [],
    ...overrides,
  }
}

describe("Medium", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let projectId: string
  let otherProjectId: string
  let readerId: string
  let profileId: string
  let accountId: string

  beforeEach(async () => {
    vi.clearAllMocks()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    setDbForTests(db)
    userId = (await insertUser(db, { role: "admin" })).id
    projectId = await createProject(userId, "Pomoder", db, ["medium"])
    otherProjectId = await createProject(userId, "Other", db, ["medium"])
    readerId = await createProfile(userId, { name: "Reader" }, db)
    profileId = await createProfile(userId, { name: "Main" }, db)
    await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), readerProfileId: readerId, ...awakeNow(new Date()) }, db)
    accountId = uuid()
    await db.insert(promoAccounts).values({
      id: accountId,
      userId,
      platform: "medium",
      profileId,
      projectId,
      handle: "sam",
      // Joined a year ago: past the warm-up and the young days.
      mediumJoinedAt: new Date(Date.now() - 400 * DAY),
    })
    vi.mocked(session.ensureSession).mockImplementation(async (_user, id) => ({
      id: `session-${id}`,
      profileId: id,
      target: id === readerId ? readerTarget : target,
    }) as never)
    vi.mocked(calls.mediumQuickState).mockImplementation(async (at) =>
      at === readerTarget
        ? { checked: true, handle: null, blocked: false, reason: "", joinedSeconds: null, followers: null }
        : { checked: true, handle: "sam", blocked: false, reason: "", joinedSeconds: (Date.now() - 400 * DAY) / 1000, followers: 12 }
    )
  })

  afterEach(async () => {
    await client.close()
  })

  async function keyword(kind: "tag" | "search" = "tag", value = "productivity", project = projectId) {
    const { id } = await addMediumKeyword(userId, project, { kind, value }, db)
    await db.delete(promoJobs)
    return id
  }

  async function searchWith(keywordId: string, stories: ReturnType<typeof story>[]) {
    vi.mocked(calls.mediumSearch).mockResolvedValueOnce({
      stories: stories.map((item, position) => ({ ...item, position })),
      unread: 0,
    })
    await runMediumSearch(userId, keywordId, readerTarget, db)
  }

  describe("ranking", () => {
    it("scores the worked example in rank.ts", () => {
      const now = new Date("2099-01-10T00:00:00Z")
      expect(
        rankMediumFind({ position: 2, responseCount: 4, postedAt: new Date("2099-01-08T00:00:00Z"), writerFollowers: 10_000, named: false }, now)
      ).toBe(7.7381)
      expect(mediumFitBand(7.7)).toBe("strong")
      expect(mediumFitBand(4)).toBe("possible")
      expect(mediumFitBand(1)).toBe("low")
    })

    it("counts a writer nobody follows at half, and one Medium said nothing about as neither", async () => {
      const { reachWeight } = await import("./rank")
      expect(reachWeight(0)).toBe(0.5)
      expect(reachWeight(null)).toBe(1)
      expect(reachWeight(999)).toBeCloseTo(1.1, 5)
    })

    it("puts a story that names the product ahead of the same story found otherwise", () => {
      const input = { position: 0, responseCount: 0, postedAt: new Date(), writerFollowers: 50, named: false }
      expect(rankMediumFind({ ...input, named: true })).toBeGreaterThan(rankMediumFind(input))
    })
  })

  describe("keywords and finding stories", () => {
    it("stores each kind the way Medium writes it", () => {
      expect(mediumKeywordValue("tag", " #Project Management ")).toBe("project-management")
      expect(mediumKeywordValue("publication", "https://medium.com/better-programming/latest")).toBe("better-programming")
      expect(mediumKeywordValue("writer", "medium.com/@sam")).toBe("sam")
      expect(mediumStoryId("https://medium.com/@peterson_55654/my-antidote-part-2-4bad19bc09ae?source=rss")).toBe("4bad19bc09ae")
      expect(mediumStoryId("https://thedigitalshipwright.com/your-roadmap-6e3083f0cc4e")).toBe("6e3083f0cc4e")
    })

    it("refuses the same keyword twice and a mark on anything but search words", async () => {
      await keyword("tag", "productivity")
      await expect(addMediumKeyword(userId, projectId, { kind: "tag", value: "#Productivity" }, db)).rejects.toThrow("already has #productivity")
      await expect(addMediumKeyword(userId, projectId, { kind: "tag", value: "ai", mark: "you" }, db)).rejects.toThrow("Only search words")
      const id = await keyword("search", "pomoder app")
      await setMediumKeywordMark(userId, id, "you", db)
      const [row] = await db.select().from(promoMediumKeywords).where(eq(promoMediumKeywords.id, id))
      expect(row.mark).toBe("you")
    })

    it("keeps a keyword whose first search is refused for want of a reader, and says why", async () => {
      await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), readerProfileId: null }, db)
      const saved = await addMediumKeyword(userId, projectId, { kind: "tag", value: "writing" }, db)
      expect(saved.searchRefused).toContain("There is no reader browser")
      expect(await db.select().from(promoMediumKeywords).where(eq(promoMediumKeywords.id, saved.id))).toHaveLength(1)
    })

    it("stores what a search finds, ranked, and never undoes a skip when it runs again", async () => {
      const id = await keyword()
      await searchWith(id, [story({ storyId: "aaaaaaaaaaaa" }), story({ storyId: "bbbbbbbbbbbb", responseCount: 40 })])
      const first = await listMediumFinds(userId, { projectId, keywordId: id, tab: "new" }, db)
      expect(first.map((find) => find.storyId)).toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb"])

      await setMediumFindsStatus(userId, [first[0].id], "skipped", db)
      await searchWith(id, [story({ storyId: "aaaaaaaaaaaa", claps: 99 })])
      const skipped = await listMediumFinds(userId, { projectId, keywordId: id, tab: "skipped" }, db)
      expect(skipped).toHaveLength(1)
      expect(skipped[0].claps).toBe(99)
    })

    it("writes a failed search's reason on its keyword", async () => {
      const id = await keyword()
      vi.mocked(calls.mediumSearch).mockRejectedValueOnce(new Error("search: Medium's feed answered 403"))
      await expect(runMediumSearch(userId, id, readerTarget, db)).rejects.toThrow("403")
      const [row] = await db.select().from(promoMediumKeywords).where(eq(promoMediumKeywords.id, id))
      expect(row.lastError).toContain("403")
    })

    it("lists a story found by two keywords once, and skipping it skips it under both", async () => {
      const tag = await keyword("tag", "productivity")
      const words = await keyword("search", "task tools")
      await searchWith(tag, [story({ storyId: "cccccccccccc" })])
      await searchWith(words, [story({ storyId: "cccccccccccc" })])
      const everything = await listMediumFinds(userId, { projectId, keywordId: null, tab: "new" }, db)
      expect(everything).toHaveLength(1)
      expect(everything[0].keywords).toEqual(["#productivity", '"task tools"'].sort((a, b) => a.localeCompare(b)))
      await setMediumFindsStatus(userId, [everything[0].id], "skipped", db)
      expect(await listMediumFinds(userId, { projectId, keywordId: words, tab: "new" }, db)).toHaveLength(0)
    })

    it("finds a story by part of its title or its writer", async () => {
      const id = await keyword()
      await searchWith(id, [story({ storyId: "dddddddddddd", title: "Why small teams drop Jira" }), story({ storyId: "eeeeeeeeeeee", writerName: "Lee Park" })])
      expect((await listMediumFinds(userId, { projectId, keywordId: null, tab: "new", search: "jira" }, db)).map((f) => f.storyId)).toEqual(["dddddddddddd"])
      expect((await listMediumFinds(userId, { projectId, keywordId: null, tab: "new", search: "lee park" }, db)).map((f) => f.storyId)).toEqual(["eeeeeeeeeeee"])
    })

    it("hides a writer's stories from every list until shown again", async () => {
      const id = await keyword()
      await searchWith(id, [story({ storyId: "ffffffffffff", writerHandle: "spammer" }), story({ storyId: "abababababab" })])
      const [find] = (await listMediumFinds(userId, { projectId, keywordId: null, tab: "new" }, db)).filter((f) => f.storyId === "ffffffffffff")
      const hidden = await hideFromFind(userId, find.id, "writer", db)
      expect(hidden.hiddenStories).toBe(1)
      expect((await listMediumFinds(userId, { projectId, keywordId: null, tab: "new" }, db)).map((f) => f.storyId)).toEqual(["abababababab"])
    })

    it("tidies away old stories nobody answered and keeps one with a response", async () => {
      const id = await keyword()
      await searchWith(id, [story({ storyId: "a1a1a1a1a1a1" }), story({ storyId: "b2b2b2b2b2b2" })])
      const finds = await listMediumFinds(userId, { projectId, keywordId: id, tab: "new" }, db)
      await db.update(promoMediumFinds).set({ lastSeenAt: new Date(Date.now() - 40 * DAY) })
      const answered = finds.find((f) => f.storyId === "b2b2b2b2b2b2")!
      await db.insert(promoMediumResponses).values({ id: uuid(), userId, accountId, findId: answered.id, storyId: "b2b2b2b2b2b2", text: "hi", status: "posted" })
      expect(await tidyOldMediumFinds(db)).toBe(1)
      expect((await db.select().from(promoMediumFinds)).map((f) => f.storyId)).toEqual(["b2b2b2b2b2b2"])
    })

    it("refuses to take Medium off a project while it holds Medium keywords", async () => {
      await keyword()
      await db.update(promoAccounts).set({ projectId: null }).where(eq(promoAccounts.id, accountId))
      await expect(removeProjectNetwork(userId, projectId, "medium", db)).rejects.toThrow("1 keyword")
    })
  })

  describe("sending a response", () => {
    async function oneFind(storyId = "a0a0a0a0a0a0") {
      const id = await keyword()
      await searchWith(id, [story({ storyId })])
      return (await listMediumFinds(userId, { projectId, keywordId: id, tab: "new" }, db))[0]
    }

    it("refuses a Medium account in its first 7 days, and lets one from day 8 through", async () => {
      const find = await oneFind()
      await db.update(promoAccounts).set({ mediumJoinedAt: new Date(Date.now() - 3 * DAY) }).where(eq(promoAccounts.id, accountId))
      await expect(queueMediumResponse(userId, { findId: find.id, accountId, text: "A helpful answer." }, db)).rejects.toThrow("first 7 days")
      await db.update(promoAccounts).set({ mediumJoinedAt: new Date(Date.now() - 8 * DAY) }).where(eq(promoAccounts.id, accountId))
      const queued = await queueMediumResponse(userId, { findId: find.id, accountId, text: "A helpful answer." }, db)
      expect(queued.undoUntil).not.toBeNull()
    })

    it("refuses an account whose joined date was never read", async () => {
      const find = await oneFind()
      await db.update(promoAccounts).set({ mediumJoinedAt: null }).where(eq(promoAccounts.id, accountId))
      await expect(queueMediumResponse(userId, { findId: find.id, accountId, text: "Hello there." }, db)).rejects.toThrow("has not read when this account joined")
    })

    it("holds a young account to Reddit's numbers: the third response in an hour is refused", async () => {
      await db.update(promoAccounts).set({ mediumJoinedAt: new Date(Date.now() - 20 * DAY) }).where(eq(promoAccounts.id, accountId))
      const id = await keyword()
      await searchWith(id, ["c1c1c1c1c1c1", "c2c2c2c2c2c2", "c3c3c3c3c3c3"].map((storyId) => story({ storyId })))
      const finds = await listMediumFinds(userId, { projectId, keywordId: id, tab: "new" }, db)
      for (const find of finds.slice(0, 2)) {
        await db.insert(promoMediumResponses).values({ id: uuid(), userId, accountId, storyId: find.storyId, text: "x", status: "posted", postedAt: new Date(Date.now() - 10 * 60_000) })
      }
      await expect(queueMediumResponse(userId, { findId: finds[2].id, accountId, text: "A third one." }, db)).rejects.toThrow("young account may send 2")
    })

    it("refuses a response over 600 characters", async () => {
      const find = await oneFind()
      await expect(queueMediumResponse(userId, { findId: find.id, accountId, text: "a".repeat(601) }, db)).rejects.toThrow("stop at 600")
    })

    it("refuses a second account of yours on a story one already answered, even from another project", async () => {
      const find = await oneFind("d0d0d0d0d0d0")
      await queueMediumResponse(userId, { findId: find.id, accountId, text: "First account's answer here." }, db)
      const other = uuid()
      const otherProfile = await createProfile(userId, { name: "Other" }, db)
      await db.insert(promoAccounts).values({ id: other, userId, platform: "medium", profileId: otherProfile, projectId: otherProjectId, handle: "lee", mediumJoinedAt: new Date(Date.now() - 400 * DAY) })
      const otherKeyword = await keyword("tag", "productivity", otherProjectId)
      await searchWith(otherKeyword, [story({ storyId: "d0d0d0d0d0d0" })])
      const [otherFind] = await listMediumFinds(userId, { projectId: otherProjectId, keywordId: otherKeyword, tab: "new" }, db)
      await expect(queueMediumResponse(userId, { findId: otherFind.id, accountId: other, text: "Second account's answer." }, db)).rejects.toThrow("@sam already responded on this story")
    })

    it("refuses a line that is not in the story", async () => {
      const find = await oneFind()
      await expect(queueMediumResponse(userId, { findId: find.id, accountId, text: "Answer.", line: "Words nobody wrote." }, db)).rejects.toThrow("not in the story")
      await expect(queueMediumResponse(userId, { findId: find.id, accountId, text: "Answer.", line: "A second sentence follows it." }, db)).resolves.toMatchObject({ runAfter: null })
    })

    it("takes a response back inside its ten seconds", async () => {
      const find = await oneFind()
      const queued = await queueMediumResponse(userId, { findId: find.id, accountId, text: "Changed my mind." }, db)
      await cancelMediumResponse(userId, queued.responseId, db)
      expect(await db.select().from(promoMediumResponses)).toHaveLength(0)
      expect(await db.select().from(promoJobs).where(eq(promoJobs.kind, "medium_respond"))).toHaveLength(0)
    })

    it("sends it from the account's own browser and marks the story replied", async () => {
      const find = await oneFind()
      const queued = await queueMediumResponse(userId, { findId: find.id, accountId, text: "Here is what worked for us." }, db)
      await db.update(promoJobs).set({ runAfter: null }).where(eq(promoJobs.id, queued.jobId))
      vi.mocked(calls.mediumRespond).mockResolvedValueOnce({ responseId: "f00f00f00f00", responseUrl: "https://medium.com/p/f00f00f00f00" })

      expect(await runOneJob("worker", db)).toMatchObject({ did: "job", ok: true, kind: "medium_respond" })
      expect(session.ensureSession).toHaveBeenCalledWith(userId, profileId, db)
      const [row] = await db.select().from(promoMediumResponses)
      expect(row).toMatchObject({ status: "posted", responseId: "f00f00f00f00" })
      expect((await listMediumFinds(userId, { projectId, keywordId: null, tab: "replied" }, db)).map((f) => f.storyId)).toEqual([find.storyId])
    })

    it("marks the response failed when the browser fails, and Try again sends the same words through every check", async () => {
      const find = await oneFind()
      const queued = await queueMediumResponse(userId, { findId: find.id, accountId, text: "Here is what worked for us." }, db)
      await db.update(promoJobs).set({ runAfter: null }).where(eq(promoJobs.id, queued.jobId))
      vi.mocked(calls.mediumRespond).mockRejectedValueOnce(new Error("respond: there is no Respond button under the box"))
      expect(await runOneJob("worker", db)).toMatchObject({ ok: false })
      const failed = await listMediumResponses(userId, projectId, "failed", db)
      expect(failed).toHaveLength(1)
      expect(failed[0].lastError).toContain("no Respond button")
      const notices = await db.select().from(customShellNotifications)
      expect(notices.map((n) => n.message)).toContain("Did not go out: a Medium response")

      await retryFailedResponse(userId, queued.responseId, db)
      expect(await listMediumResponses(userId, projectId, "failed", db)).toHaveLength(0)
      expect((await db.select().from(promoMediumResponses).where(eq(promoMediumResponses.status, "waiting")))).toHaveLength(1)
      // A second press, or a stale tab, never sends the same words again.
      await expect(retryFailedResponse(userId, queued.responseId, db)).rejects.toThrow("already tried again or dismissed")
      expect((await db.select().from(promoMediumResponses).where(eq(promoMediumResponses.status, "waiting")))).toHaveLength(1)
    })

    it("puts an edit through the same checks as a new response", async () => {
      const id = uuid()
      await db.insert(promoMediumResponses).values({ id, userId, accountId, projectId, storyId: "e0e0e0e0e0e0", responseId: "e1e1e1e1e1e1", text: "The first words.", status: "posted", postedAt: new Date() })
      await db.update(promoAccounts).set({ pausedAt: new Date() }).where(eq(promoAccounts.id, accountId))
      await expect(queueMediumChange(userId, { responseId: id, action: "edit", text: "Better words." }, db)).rejects.toThrow(/paused/i)
      await db.update(promoAccounts).set({ pausedAt: null }).where(eq(promoAccounts.id, accountId))
      await expect(queueMediumChange(userId, { responseId: id, action: "edit", text: "Better words." }, db)).resolves.toBeTruthy()
    })

    it("keeps a new account's stories off its public list during the warm-up", async () => {
      const find = await oneFind()
      await db.update(promoAccounts).set({ mediumJoinedAt: new Date(Date.now() - 3 * DAY) }).where(eq(promoAccounts.id, accountId))
      await expect(queueAddToList(userId, { accountId, findId: find.id }, db)).rejects.toThrow("first 7 days")
    })

    it("refuses a Medium job on a Reddit account before anything opens", async () => {
      const reddit = uuid()
      const redditProfile = await createProfile(userId, { name: "R" }, db)
      await db.insert(promoAccounts).values({ id: reddit, userId, platform: "reddit", profileId: redditProfile, handle: "r" })
      const { queueJob } = await import("../jobs")
      const jobId = await queueJob(userId, "medium_respond", { accountId: reddit, responseId: "x" }, db)
      expect(await runOneJob("worker", db)).toMatchObject({ ok: false })
      const [job] = await db.select().from(promoJobs).where(eq(promoJobs.id, jobId))
      expect(job.lastError).toContain("That is Medium's")
    })

    it("refuses a reader that is signed in to Medium, before it searches", async () => {
      const id = await keyword()
      vi.mocked(calls.mediumQuickState).mockResolvedValue({ checked: true, handle: "someone", blocked: false, reason: "", joinedSeconds: null, followers: null })
      const { queueJob } = await import("../jobs")
      await queueJob(userId, "medium_search", { keywordId: id }, db)
      expect(await runOneJob("worker", db)).toMatchObject({ ok: false })
      expect(calls.mediumSearch).not.toHaveBeenCalled()
    })

    it("refuses words too close to what another account already sent", async () => {
      const find = await oneFind()
      const other = uuid()
      await db.insert(promoAccounts).values({ id: other, userId, platform: "reddit", handle: "rob" })
      const words =
        "We tried four task tools last year and the one that stuck was the one the whole team could learn in an afternoon, because nobody reads a manual."
      const redditKeyword = uuid()
      await db.insert(promoKeywords).values({ id: redditKeyword, userId, projectId, term: "tools" })
      const redditFind = uuid()
      await db.insert(promoFinds).values({ id: redditFind, userId, keywordId: redditKeyword, redditId: "t3_x", permalink: "/r/x" })
      await db.insert(promoComments).values({ id: uuid(), userId, findId: redditFind, accountId: other, text: words, status: "posted" })
      await expect(
        queueMediumResponse(userId, { findId: find.id, accountId, text: words.replace("four", "five").replace("afternoon", "evening") }, db)
      ).rejects.toThrow("too close to a Reddit comment u/rob sent")
    })

    it("answers somebody who responded under one of ours, from the same account", async () => {
      const parent = uuid()
      await db.insert(promoMediumResponses).values({
        id: parent,
        userId,
        accountId,
        projectId,
        storyId: "a9a9a9a9a9a9",
        text: "Our response.",
        status: "posted",
        responseId: "b9b9b9b9b9b9",
        incoming: [{ id: "c9c9c9c9c9c9", writerId: "w", writer: "kim", text: "Which tool?", claps: 0, postedAt: null }],
      })
      const queued = await queueMediumAnswer(userId, { under: { responseId: parent }, incomingId: "c9c9c9c9c9c9", text: "The one with the shortest manual." }, db)
      const [row] = await db.select().from(promoMediumResponses).where(eq(promoMediumResponses.id, queued.responseId))
      expect(row).toMatchObject({ parentId: parent, storyId: "c9c9c9c9c9c9", accountId })
      await expect(queueMediumAnswer(userId, { under: { responseId: parent }, incomingId: "c9c9c9c9c9c9", text: "Again." }, db)).rejects.toThrow("has an answer already")
    })
  })

  describe("the too-similar check", () => {
    const base =
      "We tried four task tools last year and the one that stuck was the one the whole team could learn in an afternoon, because nobody on a small team reads a manual or sits through a training call."

    it("scores a near-copy over the line and a different piece on the same topic under it", () => {
      const copy = base.replace("four", "five").replace("afternoon", "evening").replace("small", "tiny")
      const different =
        "Picking a task tool is mostly about who has to use it every day. Ask the person who complains most to choose, and the tool gets used instead of ignored."
      expect(similarity(base, copy)).toBeGreaterThanOrEqual(TOO_SIMILAR_FROM)
      expect(similarity(base, different)).toBeLessThan(0.1)
      expect(similarity("too short", base)).toBe(0)
    })
  })

  describe("reading what happened", () => {
    it("writes a response's reading and rings the bell once for a new response under it", async () => {
      const id = uuid()
      await db.insert(promoMediumResponses).values({ id, userId, accountId, projectId, storyId: "a8a8a8a8a8a8", storyTitle: "A story", text: "Ours.", status: "posted", responseId: "b8b8b8b8b8b8" })
      const read = {
        found: true,
        visible: true,
        claps: 3,
        incoming: [{ id: "c8c8c8c8c8c8", writerId: "w", writer: "kim", text: "Thanks!", claps: 0, replies: 0, hidden: false, deleted: false, postedSeconds: 1_800_000_000 }],
        publicationSlug: "",
        responseCount: null,
      }
      vi.mocked(calls.mediumCheck).mockResolvedValue(read)
      await recordResponseCheck(userId, id, readerTarget, db)
      await recordResponseCheck(userId, id, readerTarget, db)
      const [row] = await db.select().from(promoMediumResponses).where(eq(promoMediumResponses.id, id))
      expect(row).toMatchObject({ claps: 3, replyCount: 1, stillVisible: true })
      const notices = await db.select().from(customShellNotifications)
      expect(notices.filter((n) => (n.message ?? "").startsWith("New response to you on Medium"))).toHaveLength(1)

      vi.mocked(calls.mediumCheck).mockResolvedValue({ ...read, visible: false })
      await recordResponseCheck(userId, id, readerTarget, db)
      expect((await db.select().from(customShellNotifications)).map((n) => n.message)).toContain('Gone from Medium: your response on "A story"')
    })

    it("keeps one reading a day of an article's views and reads", async () => {
      const articleId = uuid()
      await db.insert(promoMediumArticles).values({ id: articleId, userId, accountId, projectId, title: "T", body: "B", status: "published", storyId: "a7a7a7a7a7a7" })
      vi.mocked(calls.mediumStats).mockResolvedValueOnce({ views: 10, reads: 4 }).mockResolvedValueOnce({ views: 12, reads: 5 })
      await recordArticleStats(userId, articleId, target, db)
      await recordArticleStats(userId, articleId, target, db)
      const readings = await db.select().from(promoMediumArticleReadings)
      expect(readings).toHaveLength(1)
      expect(readings[0]).toMatchObject({ views: 12, reads: 5 })
    })
  })

  describe("articles and publications", () => {
    it("refuses Publish until the account is picked, and into a publication Medium never said it writes for", async () => {
      const articleId = await createMediumArticle(userId, projectId, { accountId: null, about: "Picking a task tool" }, db)
      await saveMediumArticle(userId, articleId, { title: "Picking a task tool", body: "Some words here." }, db)
      await expect(queueMediumPublish(userId, articleId, db)).rejects.toThrow("Pick the account")
      await saveMediumArticle(userId, articleId, { accountId }, db)
      await db.insert(promoMediumPublications).values({ id: uuid(), userId, projectId, slug: "better-teams", name: "Better Teams", writersReadAt: new Date() })
      await saveMediumArticle(userId, articleId, { publicationSlug: "better-teams" }, db)
      await expect(queueMediumPublish(userId, articleId, db)).rejects.toThrow("does not write for Better Teams")
      await saveMediumArticle(userId, articleId, { publicationSlug: "" }, db)
      await expect(queueMediumPublish(userId, articleId, db)).resolves.toMatchObject({ runAfter: null })
      const [row] = await db.select().from(promoMediumArticles).where(eq(promoMediumArticles.id, articleId))
      expect(row.status).toBe("waiting")
    })

    it("lets any Medium account publish, throwaway or not", async () => {
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(account.importance).toBe("throwaway")
      const articleId = await createMediumArticle(userId, projectId, { accountId, about: "x" }, db)
      await saveMediumArticle(userId, articleId, { title: "A title", body: "Words." }, db)
      await expect(queueMediumPublish(userId, articleId, db)).resolves.toBeTruthy()
    })

    it("records which accounts Medium says write for a publication, one account's answer at a time", async () => {
      const second = uuid()
      const secondProfile = await createProfile(userId, { name: "Second" }, db)
      await db.insert(promoAccounts).values({ id: second, userId, platform: "medium", profileId: secondProfile, projectId, handle: "lee" })
      const { id } = await addMediumPublication(userId, projectId, { slug: "medium.com/better-teams" }, db)
      const jobs = await db.select().from(promoJobs).where(eq(promoJobs.kind, "medium_publication"))
      expect(jobs).toHaveLength(2)
      vi.mocked(calls.mediumPublication)
        .mockResolvedValueOnce({ slug: "better-teams", name: "Better Teams", description: "", rules: "No lists.", signedIn: true, writes: true })
        .mockResolvedValueOnce({ slug: "better-teams", name: "Better Teams", description: "", rules: "", signedIn: true, writes: false })
      await recordPublicationCheck(userId, { publicationId: id, accountId }, target, db)
      await recordPublicationCheck(userId, { publicationId: id, accountId: second }, target, db)
      const [row] = await db.select().from(promoMediumPublications).where(eq(promoMediumPublications.id, id))
      expect(row).toMatchObject({ name: "Better Teams", writers: [accountId], rules: "No lists." })
    })
  })

  describe("pausing and the sign-in link", () => {
    it("pauses Medium alone while the project's other networks run", async () => {
      await addProjectNetwork(userId, projectId, "reddit", db)
      await setProjectNetworkPaused(userId, projectId, "medium", true, db)
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(await pausedBy(userId, account, db)).toBe("network")
      expect(await pausedBy(userId, { ...account, platform: "reddit" }, db)).toBeNull()
      const state = await readMediumPostingState(userId, account, db)
      expect(state.paused).toBe("network")
      const [project] = await db.select().from(promoProjects).where(eq(promoProjects.id, projectId))
      expect(project.pausedNetworks).toEqual(["medium"])
    })

    it("only takes an https link on medium.com, and opens it in the account's own profile", async () => {
      expect(isMediumSignInLink("https://medium.com/m/callback/email?token=abc")).toBe(true)
      expect(isMediumSignInLink("http://medium.com/m/callback")).toBe(false)
      expect(isMediumSignInLink("https://medium.com.evil.test/x")).toBe(false)
      await expect(queueMediumSignIn(userId, accountId, "https://evil.test/", db)).rejects.toThrow("not a Medium sign-in link")
      const jobId = await queueMediumSignIn(userId, accountId, "https://medium.com/m/callback/email?token=abc", db)
      const [job] = await db.select().from(promoJobs).where(eq(promoJobs.id, jobId))
      expect(job.lane).toBe(profileId)
    })

    it("writes who signed in, when they joined and their followers, from the link's answer", async () => {
      await db.update(promoAccounts).set({ handle: "", mediumJoinedAt: null }).where(eq(promoAccounts.id, accountId))
      const signedIn = { checked: true, handle: "sam", blocked: false, reason: "", joinedSeconds: 1_700_000_000, followers: 3 }
      vi.mocked(calls.mediumSignIn).mockResolvedValueOnce(signedIn)
      vi.mocked(calls.mediumQuickState).mockResolvedValue(signedIn)
      await queueMediumSignIn(userId, accountId, "https://medium.com/m/callback/email?token=abc", db)
      expect(await runOneJob("worker", db)).toMatchObject({ ok: true, kind: "medium_sign_in" })
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(account.handle).toBe("sam")
      expect(account.mediumJoinedAt?.toISOString()).toBe(new Date(1_700_000_000_000).toISOString())
    })
  })

  describe("what the AI is asked and what comes back", () => {
    it("tells the AI Tyler's rule for naming the product, and nothing about it for a help-only response", () => {
      const input = {
        title: "T",
        writer: "w",
        publication: "",
        text: "Story words.",
        membersOnly: false,
        responses: [{ id: "r", writer: "kim", text: "Already said this.", claps: 2 }],
        voice: "",
        commentRules: "",
        product: "Pomoder, a timer",
        examples: [],
        helpOnly: false,
        answering: null,
        count: 2,
      }
      const prompt = drafts.buildMediumResponsePrompt(input)
      expect(prompt).toContain("Name the product only when the story is about a problem the product solves")
      expect(prompt).toContain("Already said this.")
      expect(prompt).toContain("under 600 characters")
      const helpOnly = drafts.buildMediumResponsePrompt({ ...input, helpOnly: true })
      expect(helpOnly).not.toContain("Pomoder")
      expect(helpOnly).toContain("Do not mention any product")
    })

    it("keeps a draft's line only when it really is in the story", () => {
      const story = "The first sentence. A second sentence here."
      const split = drafts.splitMediumDrafts("LINE: A second sentence here.\nGood point.\n---\nLINE: Made up line.\nAnother.", 2, story)
      expect(split).toEqual([
        { text: "Good point.", line: "A second sentence here." },
        { text: "Another.", line: "" },
      ])
    })

    it("reads an outline, an article, keyword ideas and a rules answer", () => {
      expect(drafts.readOutline("TITLES:\n- One\n- Two\n- Three\nHEADINGS:\n- A\n- B")).toEqual({ titles: ["One", "Two", "Three"], headings: ["A", "B"] })
      expect(drafts.readArticle("SUBTITLE: Sub\nTAGS: Productivity, Small Teams\nBODY:\n## Start\n\nWords.")).toEqual({
        subtitle: "Sub",
        tags: ["productivity", "small-teams"],
        body: "## Start\n\nWords.",
      })
      expect(drafts.readMediumKeywordIdeas("TAG: #Remote Work\nSEARCH: best timer app\nPUBLICATION: Better Programming")).toEqual([
        { kind: "tag", value: "remote-work" },
        { kind: "search", value: "best timer app" },
        { kind: "publication", value: "better-programming" },
      ])
      expect(drafts.readMediumRulesAnswer("OK")).toEqual({ ok: true, problems: [] })
      expect(drafts.readMediumRulesAnswer("- Repeated promotion: it names the product twice.")).toEqual({ ok: false, problems: ["Repeated promotion: it names the product twice."] })
    })
  })

  describe("Medium on a phone", () => {
    it("keeps a phone's response posted when no reader can look up where it landed", async () => {
      const id = uuid()
      await db.insert(promoMediumResponses).values({ id, userId, accountId, projectId, storyId: "a7a7a7a7a7a7", text: "From the phone.", status: "waiting" })
      await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), readerProfileId: null }, db)
      vi.mocked(calls.mediumRespond).mockResolvedValueOnce({ responseId: "", responseUrl: "" })
      await runMediumRespond(userId, id, target, db)
      const [row] = await db.select().from(promoMediumResponses).where(eq(promoMediumResponses.id, id))
      // Marked failed, Try again would send it a second time.
      expect(row.status).toBe("posted")
    })

    it("asks the reader where a phone's response landed, since the app does not say", async () => {
      const id = uuid()
      await db.insert(promoMediumResponses).values({ id, userId, accountId, projectId, storyId: "a6a6a6a6a6a6", text: "From the phone.", status: "waiting" })
      vi.mocked(calls.mediumRespond).mockResolvedValueOnce({ responseId: "", responseUrl: "" })
      await runMediumRespond(userId, id, target, db)
      const jobs = await db.select().from(promoJobs).where(eq(promoJobs.kind, "medium_find"))
      expect(jobs).toHaveLength(1)
      expect(jobs[0].lane).toBe(readerId)

      vi.mocked(calls.mediumFindResponse).mockResolvedValueOnce({ responseId: "" })
      await expect(findPhoneResponse(userId, id, readerTarget, db)).rejects.toThrow("not under the story yet")
      vi.mocked(calls.mediumFindResponse).mockResolvedValueOnce({ responseId: "b6b6b6b6b6b6" })
      await findPhoneResponse(userId, id, readerTarget, db)
      const [row] = await db.select().from(promoMediumResponses).where(eq(promoMediumResponses.id, id))
      expect(row).toMatchObject({ status: "posted", responseId: "b6b6b6b6b6b6", responseUrl: "https://medium.com/p/b6b6b6b6b6b6" })
      expect(vi.mocked(calls.mediumFindResponse).mock.calls[0][1]).toEqual({ storyId: "a6a6a6a6a6a6", writer: "sam", text: "From the phone." })
    })

    it("refuses what the Medium app on a phone does not do, and says why", () => {
      expect(() => refuseOnPhone({ phoneId: "p1", handle: "sam" }, "Publishing an article")).toThrow(
        "@sam runs on a phone, and the Medium app there sends responses and answers only. Publishing an article needs a Medium account on a browser profile."
      )
      expect(() => refuseOnPhone({ phoneId: null, handle: "sam" }, "Publishing an article")).not.toThrow()
      expect(phoneStepRefusal("medium/respond", "Pixel 1")).toBeNull()
      expect(phoneStepRefusal("medium/publish", "Pixel 1")).toContain("the Medium app reads who is signed in, sends responses and answers")
    })
  })

  it("counts this month's Medium AI spend for one project only", async () => {
    const month = new Date().toISOString().slice(0, 8) + "01"
    await db.insert(customShellAiUsageEvents).values([
      { id: uuid(), userId, provider: "anthropic", model: "m", feature: "medium-response", inputTokens: 1, outputTokens: 1, costCents: 80, status: "success", monthStart: month, metadata: { projectId }, createdAt: new Date() },
      { id: uuid(), userId, provider: "anthropic", model: "m", feature: "medium-article", inputTokens: 1, outputTokens: 1, costCents: 310, status: "success", monthStart: month, metadata: { projectId }, createdAt: new Date() },
      { id: uuid(), userId, provider: "gemini", model: "m", feature: "medium-cover", inputTokens: 0, outputTokens: 0, costCents: 4, status: "success", monthStart: month, metadata: { projectId: otherProjectId }, createdAt: new Date() },
      { id: uuid(), userId, provider: "anthropic", model: "m", feature: "reddit-comment", inputTokens: 1, outputTokens: 1, costCents: 50, status: "success", monthStart: month, metadata: { projectId }, createdAt: new Date() },
    ])
    expect(await mediumSpend(userId, projectId, db)).toEqual({ totalCents: 390, parts: { responses: 80, articles: 310, covers: 0 } })
  })

  it("lets a keyword go and keeps the responses sent from its stories", async () => {
    const id = await keyword()
    await searchWith(id, [story({ storyId: "e7e7e7e7e7e7", title: "Kept title" })])
    const [find] = await listMediumFinds(userId, { projectId, keywordId: id, tab: "new" }, db)
    await db.insert(promoMediumResponses).values({ id: uuid(), userId, accountId, projectId, findId: find.id, storyId: find.storyId, storyTitle: find.title, text: "x", status: "posted" })
    await deleteMediumKeyword(userId, id, db)
    const [row] = await db.select().from(promoMediumResponses).where(and(eq(promoMediumResponses.userId, userId)))
    expect(row).toMatchObject({ findId: null, storyTitle: "Kept title" })
  })
})
