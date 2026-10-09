import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { NO_PROFILE_MESSAGE } from "@/lib/social/options"
import { uuid } from "@/server/auth/security"
import { createProfile } from "@/server/browser/profiles"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"

import { promoAccounts, promoJobs } from "./schema"

vi.mock("@/server/browser/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/browser/session")>()
  return {
    ...actual,
    ensureSession: vi.fn(),
    stopSession: vi.fn(),
    touchSession: vi.fn(),
  }
})

vi.mock("@/server/browser/command", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/browser/command")>()
  return {
    ...actual,
    redditQuickState: vi.fn(),
    redditState: vi.fn(),
    redditHealth: vi.fn(),
  }
})

vi.mock("./reddit/post-comment", () => ({ postComment: vi.fn() }))

vi.mock("./reddit/search", () => ({
  runKeywordSearch: vi.fn(),
  loadFindThread: vi.fn(),
}))

const session = await import("@/server/browser/session")
const command = await import("@/server/browser/command")
const search = await import("./reddit/search")
const { runOneJob } = await import("./runner")
const { queueJob } = await import("./jobs")
const { readBrowserStatus } = await import("./accounts")
const { queueDueHealthChecks, queueHealthCheck, readAccountHealth } = await import("./health")

const ensureSession = vi.mocked(session.ensureSession)
const stopSession = vi.mocked(session.stopSession)
const quickState = vi.mocked(command.redditQuickState)
const fullState = vi.mocked(command.redditState)
const healthRead = vi.mocked(command.redditHealth)
const runKeywordSearch = vi.mocked(search.runKeywordSearch)

const target = { port: 7900, token: "key" }

/**
 * The browser program's turn: a job finds its account, the account's profile,
 * and that profile's browser, and afterwards it writes down what the browser
 * could see. The browser and Reddit are faked; the rows are real.
 */
describe("running a browser job", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let profileId: string
  let accountId: string

  beforeEach(async () => {
    vi.clearAllMocks()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    profileId = await createProfile(userId, { name: "Main" }, db)
    accountId = uuid()
    await db.insert(promoAccounts).values({ id: accountId, userId, profileId })

    ensureSession.mockResolvedValue({ id: "session-1", profileId, target })
    quickState.mockResolvedValue({
      checked: true,
      handle: "a_persona",
      karma: 120,
      createdSeconds: 1_600_000_000,
      blocked: false,
      reason: "",
    })
  })

  afterEach(async () => {
    await client.close()
  })

  async function account() {
    const [row] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
    return row
  }

  async function job(id: string) {
    const [row] = await db.select().from(promoJobs).where(eq(promoJobs.id, id))
    return row
  }

  it("opens the browser of the account's profile for a search", async () => {
    await queueJob(userId, "search", { keywordId: "k1" }, db)

    const result = await runOneJob("worker", db)

    expect(result).toMatchObject({ did: "job", ok: true })
    expect(ensureSession).toHaveBeenCalledWith(userId, profileId, db)
    expect(runKeywordSearch).toHaveBeenCalledWith(userId, "k1", target, db)
  })

  it("writes down who is signed in after the job, without moving the page", async () => {
    await queueJob(userId, "search", { keywordId: "k1" }, db)

    await runOneJob("worker", db)

    const saved = await account()
    expect(saved.handle).toBe("a_persona")
    expect(saved.blocked).toBe(false)
    expect(saved.stateReadAt).toBeInstanceOf(Date)
    // The navigating check is only for a person who asked for it.
    expect(quickState).toHaveBeenCalledTimes(1)
    expect(fullState).not.toHaveBeenCalled()
  })

  it("still writes down a captcha when the search itself failed", async () => {
    runKeywordSearch.mockRejectedValueOnce(new Error("the page never loaded"))
    quickState.mockResolvedValue({
      checked: true,
      handle: "a_persona",
      karma: null,
      createdSeconds: null,
      blocked: true,
      reason: "a challenge or captcha is on screen",
    })
    const id = await queueJob(userId, "search", { keywordId: "k1" }, db)

    await runOneJob("worker", db)

    expect((await job(id)).lastError).toBe("the page never loaded")
    const saved = await account()
    expect(saved.blocked).toBe(true)
    expect(saved.blockedReason).toBe("a challenge or captcha is on screen")
  })

  it("keeps the last answer when the page was not on Reddit", async () => {
    await db.update(promoAccounts).set({ handle: "a_persona" })
    quickState.mockResolvedValue({
      checked: false,
      handle: null,
      karma: null,
      createdSeconds: null,
      blocked: false,
      reason: "",
    })
    await queueJob(userId, "search", { keywordId: "k1" }, db)

    await runOneJob("worker", db)

    // A cookie read from another site's page would have said "signed out".
    expect((await account()).handle).toBe("a_persona")
  })

  it("refuses a job whose account has no profile, in words a person can act on", async () => {
    await db.update(promoAccounts).set({ profileId: null })
    const id = await queueJob(userId, "search", { keywordId: "k1" }, db)

    const result = await runOneJob("worker", db)

    expect(result).toMatchObject({ ok: false, error: NO_PROFILE_MESSAGE })
    expect((await job(id)).lastError).toBe(NO_PROFILE_MESSAGE)
    expect(ensureSession).not.toHaveBeenCalled()
  })

  it("opens a profile's browser for an open job and reads who is signed in", async () => {
    await queueJob(userId, "open", { profileId }, db)

    await runOneJob("worker", db)

    expect(ensureSession).toHaveBeenCalledWith(userId, profileId, db)
    expect((await account()).handle).toBe("a_persona")
  })

  it("closes a profile's browser for a close job", async () => {
    await queueJob(userId, "close", { profileId }, db)

    await runOneJob("worker", db)

    expect(stopSession).toHaveBeenCalledWith(profileId, db)
    expect(ensureSession).not.toHaveBeenCalled()
  })

  it("refuses to close another person's browser", async () => {
    const other = (await insertUser(db, { role: "admin" })).id
    const id = await queueJob(other, "close", { profileId }, db)

    await runOneJob("worker", db)

    expect((await job(id)).lastError).toBe("That browser profile does not exist.")
    expect(stopSession).not.toHaveBeenCalled()
  })

  it("runs the navigating check only for a check job", async () => {
    fullState.mockResolvedValue({
      handle: "someone_else",
      karma: null,
      createdSeconds: null,
      blocked: false,
      reason: "",
      url: "https://www.reddit.com/",
    })
    await queueJob(userId, "check", { profileId }, db)

    await runOneJob("worker", db)

    expect(fullState).toHaveBeenCalledTimes(1)
    expect(quickState).not.toHaveBeenCalled()
    expect((await account()).handle).toBe("someone_else")
  })

  it("does not look at another person's account from a job naming its profile", async () => {
    const other = (await insertUser(db, { role: "admin" })).id
    await queueJob(other, "check", { profileId }, db)

    await runOneJob("worker", db)

    // ensureSession is faked here, so the guard that matters is the one that
    // reads accounts: only the job owner's accounts are ever looked at.
    expect(fullState).not.toHaveBeenCalled()
  })

  it("tries a comment once and never again, whatever went wrong", async () => {
    vi.mocked((await import("./reddit/post-comment")).postComment).mockRejectedValueOnce(
      new Error("The browser did not answer reddit/comment within 300 seconds.")
    )
    const id = await queueJob(userId, "comment", { findId: "f1", text: "Hello.", accountId }, db)

    await runOneJob("worker", db)

    const failed = await job(id)
    expect(failed.status).toBe("failed")
    expect(failed.attempts).toBe(1)
    // Nothing is waiting to post it a second time.
    expect(await runOneJob("worker", db)).toEqual({ did: "nothing" })
  })

  it("fails a refusal at once instead of trying it three times", async () => {
    await db.update(promoAccounts).set({ profileId: null })
    const id = await queueJob(userId, "search", { keywordId: "k1" }, db)

    await runOneJob("worker", db)

    const failed = await job(id)
    expect(failed.status).toBe("failed")
    expect(failed.attempts).toBe(1)
  })
})

/**
 * What a dashboard reads. It must answer from the rows alone: asking a browser
 * used to move its page every two seconds while the Reddit dashboard was open.
 */
describe("reading the browser's status", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let profileId: string

  beforeEach(async () => {
    vi.clearAllMocks()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    profileId = await createProfile(userId, { name: "Main" }, db)
    await db.insert(promoAccounts).values({
      id: uuid(),
      userId,
      profileId,
      handle: "a_persona",
      blocked: true,
      blockedReason: "a challenge or captcha is on screen",
    })
  })

  afterEach(async () => {
    await client.close()
  })

  it("answers from the saved rows, names the profile, and never calls a browser", async () => {
    const status = await readBrowserStatus(userId, db)

    expect(status).toMatchObject({
      handle: "a_persona",
      blocked: true,
      reason: "a challenge or captcha is on screen",
      profile: { id: profileId, name: "Main" },
    })
    expect(quickState).not.toHaveBeenCalled()
    expect(fullState).not.toHaveBeenCalled()
  })
})

/**
 * Karma, age and how the profile looks to a stranger. The browser is faked;
 * what matters is what is stored, and that "never read" never becomes a zero.
 */
describe("reading the account's health", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let profileId: string
  let accountId: string

  const seen = { status: 200, found: true, suspended: false }

  beforeEach(async () => {
    vi.clearAllMocks()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    profileId = await createProfile(userId, { name: "Main" }, db)
    accountId = uuid()
    await db.insert(promoAccounts).values({ id: accountId, userId, profileId, handle: "a_persona" })
    ensureSession.mockResolvedValue({ id: "session-1", profileId, target })
    quickState.mockResolvedValue({
      checked: true,
      handle: "a_persona",
      karma: 120,
      createdSeconds: 1_600_000_000,
      blocked: false,
      reason: "",
    })
  })

  afterEach(async () => {
    await client.close()
  })

  async function account() {
    const [row] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
    return row
  }

  it("leaves karma and age unread, not zero, before any reading", async () => {
    const health = await readAccountHealth(userId, accountId, db)
    expect(health).toMatchObject({ karma: null, redditCreatedAt: null, karmaReadAt: null, profileCheck: null })
  })

  it("stores karma and age from the sign-in read every job already takes", async () => {
    await queueJob(userId, "search", { keywordId: "k1" }, db)
    await runOneJob("worker", db)

    const saved = await account()
    expect(saved.karma).toBe(120)
    expect(saved.redditCreatedAt?.toISOString()).toBe("2020-09-13T12:26:40.000Z")
    expect(saved.karmaReadAt).toBeInstanceOf(Date)
  })

  it("keeps the last karma reading when the browser is signed out", async () => {
    await db.update(promoAccounts).set({ karma: 55 })
    quickState.mockResolvedValue({
      checked: true,
      handle: null,
      karma: null,
      createdSeconds: null,
      blocked: false,
      reason: "",
    })
    await queueJob(userId, "search", { keywordId: "k1" }, db)
    await runOneJob("worker", db)

    expect((await account()).karma).toBe(55)
  })

  it("stores what the profile answered signed in and signed out", async () => {
    healthRead.mockResolvedValue({
      handle: "a_persona",
      karma: 0,
      createdSeconds: 1_600_000_000,
      blocked: false,
      reason: "",
      profile: { signedIn: seen, signedOut: { status: 404, found: false, suspended: false } },
    })
    // The sign-in read after every job reads the same answer.
    quickState.mockResolvedValue({
      checked: true,
      handle: "a_persona",
      karma: 0,
      createdSeconds: 1_600_000_000,
      blocked: false,
      reason: "",
    })
    await queueHealthCheck(userId, accountId, db)

    const result = await runOneJob("worker", db)

    expect(result).toMatchObject({ kind: "health", ok: true })
    const saved = await account()
    // A real reading of zero is stored as zero, which is not the same as null.
    expect(saved.karma).toBe(0)
    expect(saved.profileCheck).toMatchObject({
      handle: "a_persona",
      signedInStatus: 200,
      signedInFound: true,
      signedOutStatus: 404,
      signedOutFound: false,
      suspended: false,
    })
    expect((await readAccountHealth(userId, accountId, db))?.checking).toBe(false)
  })

  it("refuses a health check while signed out and keeps the last reading", async () => {
    await db.update(promoAccounts).set({ karma: 9 })
    healthRead.mockResolvedValue({
      handle: null,
      karma: null,
      createdSeconds: null,
      blocked: false,
      reason: "",
      profile: null,
    })
    quickState.mockResolvedValue({
      checked: true,
      handle: null,
      karma: null,
      createdSeconds: null,
      blocked: false,
      reason: "",
    })
    await queueHealthCheck(userId, accountId, db)

    await runOneJob("worker", db)

    const health = await readAccountHealth(userId, accountId, db)
    expect(health?.lastError).toContain("not signed in to Reddit")
    expect(health?.karma).toBe(9)
    expect(health?.profileCheck).toBeNull()
  })

  it("queues one check at a time from the button", async () => {
    await queueHealthCheck(userId, accountId, db)
    await queueHealthCheck(userId, accountId, db)

    const jobs = await db.select().from(promoJobs).where(eq(promoJobs.kind, "health"))
    expect(jobs).toHaveLength(1)
    expect((await readAccountHealth(userId, accountId, db))?.checking).toBe(true)
  })

  it("asks once a day for a signed-in account with a profile, and never for the rest", async () => {
    const signedOut = uuid()
    const otherProfile = await createProfile(userId, { name: "Second" }, db)
    await db
      .insert(promoAccounts)
      .values({ id: signedOut, userId, profileId: otherProfile, handle: "", platform: "reddit" })

    const now = new Date(Date.UTC(2099, 0, 2))
    expect(await queueDueHealthChecks(db, now)).toBe(1)
    // A failed or finished one an hour ago still counts as asked today.
    await db.update(promoJobs).set({ status: "failed", createdAt: new Date(now.getTime() - 3_600_000) })
    expect(await queueDueHealthChecks(db, now)).toBe(0)
    // A day later it is asked again.
    expect(await queueDueHealthChecks(db, new Date(now.getTime() + 25 * 3_600_000))).toBe(1)
  })
})
