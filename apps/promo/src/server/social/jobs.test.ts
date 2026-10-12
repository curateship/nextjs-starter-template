import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"

import {
  claimNextJob,
  failExpiredClaims,
  failJob,
  finishJob,
  jobAccount,
  jobCounts,
  putJobBack,
  queueJob,
  JOB_MAX_ATTEMPTS,
} from "./jobs"
import { createProfile } from "@/server/browser/profiles"
import { readBehaviour, saveBehaviour } from "./behaviour"

import { promoAccounts, promoJobs } from "./schema"

describe("the browser work queue", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let readerId: string

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    // Searches run in the reader, so every search below needs one picked.
    readerId = await createProfile(userId, { name: "Reader" }, db)
    await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), readerProfileId: readerId }, db)
  })

  afterEach(async () => {
    await client.close()
  })

  it("claims the oldest waiting job first", async () => {
    const first = await queueJob(userId, "search", { keywordId: "a" }, db)
    // Pushed back so the order is by creation rather than by chance.
    await db
      .update(promoJobs)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(promoJobs.id, first))
    await queueJob(userId, "search", { keywordId: "b" }, db)

    const claimed = await claimNextJob(uuid(), db)
    expect(claimed?.id).toBe(first)
    expect(claimed?.payload).toEqual({ keywordId: "a" })
    expect(claimed?.attempts).toBe(1)
  })

  it("never hands one job to two workers", async () => {
    await queueJob(userId, "search", { keywordId: "a" }, db)

    const first = await claimNextJob(uuid(), db)
    const second = await claimNextJob(uuid(), db)

    expect(first).not.toBeNull()
    // The second worker finds nothing rather than the same job.
    expect(second).toBeNull()
  })

  describe("one lane per profile", () => {
    /** Queues a job and pushes it back in time, so claim order is certain. */
    async function queueAt(secondsAgo: number, payload: Record<string, unknown>) {
      const id = await queueJob(userId, "search", payload, db)
      await db
        .update(promoJobs)
        .set({ createdAt: new Date(Date.now() - secondsAgo * 1000) })
        .where(eq(promoJobs.id, id))
      return id
    }

    it("puts an account's job in its profile, a search in the reader's, and a dashboard job in the one it names", async () => {
      const profileId = await createProfile(userId, { name: "Main" }, db)
      const named = await createProfile(userId, { name: "Named" }, db)
      const accountId = uuid()
      await db.insert(promoAccounts).values({ id: accountId, userId, profileId })

      const health = await queueJob(userId, "health", { accountId }, db)
      const search = await queueJob(userId, "search", { keywordId: "a" }, db)
      const dashboard = await queueJob(userId, "open", { profileId: named }, db)

      const rows = await db.select().from(promoJobs)
      expect(rows.find((row) => row.id === health)?.lane).toBe(profileId)
      expect(rows.find((row) => row.id === search)?.lane).toBe(readerId)
      expect(rows.find((row) => row.id === dashboard)?.lane).toBe(named)
    })

    it("files an account's job under the same profile the runner will use, with two Reddit accounts", async () => {
      const older = await createProfile(userId, { name: "Older" }, db)
      const newer = await createProfile(userId, { name: "Newer" }, db)
      // Inserted newest first, so an unordered read would likely take it.
      await db.insert(promoAccounts).values({ id: uuid(), userId, profileId: newer, createdAt: new Date() })
      await db
        .insert(promoAccounts)
        .values({ id: uuid(), userId, profileId: older, createdAt: new Date(Date.now() - 60_000) })

      const id = await queueJob(userId, "health", {}, db)

      const [row] = await db.select().from(promoJobs).where(eq(promoJobs.id, id))
      expect(row.lane).toBe(older)
      expect((await jobAccount(userId, {}, db))?.profileId).toBe(older)
    })

    it("holds a profile's next job while one runs, and lets another profile's go ahead", async () => {
      const a1 = await queueAt(30, { profileId: "profile-a" })
      const a2 = await queueAt(20, { profileId: "profile-a" })
      const b1 = await queueAt(10, { profileId: "profile-b" })

      const token = uuid()
      expect((await claimNextJob(token, db))?.id).toBe(a1)
      // a2 is older than b1, but its profile is busy.
      expect((await claimNextJob(uuid(), db))?.id).toBe(b1)
      expect(await claimNextJob(uuid(), db)).toBeNull()

      await finishJob(a1, token, db)
      expect((await claimNextJob(uuid(), db))?.id).toBe(a2)
    })

    it("never holds back a job from before lanes", async () => {
      await queueAt(20, { profileId: "profile-a" })
      const old = await queueAt(10, {})
      await db.update(promoJobs).set({ lane: null }).where(eq(promoJobs.id, old))

      await claimNextJob(uuid(), db)
      expect((await claimNextJob(uuid(), db))?.id).toBe(old)
    })

    it("lets two workers claiming at once take different profiles, never one profile twice", async () => {
      await queueAt(30, { profileId: "profile-a" })
      await queueAt(20, { profileId: "profile-a" })
      await queueAt(10, { profileId: "profile-b" })

      const claimed = await Promise.all([claimNextJob(uuid(), db), claimNextJob(uuid(), db), claimNextJob(uuid(), db)])

      const rows = await db.select().from(promoJobs)
      const running = rows.filter((row) => row.status === "running").map((row) => row.lane).sort()
      expect(running).toEqual(["profile-a", "profile-b"])
      expect(claimed.filter(Boolean)).toHaveLength(2)
    })
  })

  it("holds a job back until its time, and leaves it out of the counts until then", async () => {
    const later = await queueJob(userId, "comment", { findId: "f1", text: "Hi." }, db, new Date(Date.now() + 3_600_000))

    expect(await claimNextJob(uuid(), db)).toBeNull()
    // Counted, the Projects dashboard would ask every two seconds until morning.
    expect((await jobCounts(userId, db)).queued).toBe(0)

    await db.update(promoJobs).set({ runAfter: new Date(Date.now() - 1000) }).where(eq(promoJobs.id, later))
    expect((await claimNextJob(uuid(), db))?.id).toBe(later)
  })

  it("puts a job taken too early back to wait, without counting the go", async () => {
    const id = await queueJob(userId, "comment", { findId: "f1", text: "Hi." }, db)
    const token = uuid()
    await claimNextJob(token, db)
    const until = new Date(Date.now() + 3_600_000)

    await putJobBack(id, token, { runAfter: until }, db)

    const [row] = await db.select().from(promoJobs).where(eq(promoJobs.id, id))
    expect(row).toMatchObject({ status: "queued", attempts: 0, claimToken: null })
    expect(row.runAfter?.getTime()).toBe(until.getTime())
    expect(await claimNextJob(uuid(), db)).toBeNull()
  })

  it("answers with nothing when the queue is empty", async () => {
    expect(await claimNextJob(uuid(), db)).toBeNull()
  })

  it("hands back a job whose worker vanished", async () => {
    await queueJob(userId, "search", {}, db)
    const token = uuid()
    const claimed = await claimNextJob(token, db)
    expect(claimed).not.toBeNull()

    // The worker died without finishing: its claim goes stale.
    await db
      .update(promoJobs)
      .set({ claimedAt: new Date(Date.now() - 20 * 60_000) })
      .where(eq(promoJobs.id, claimed!.id))

    expect(await failExpiredClaims(db)).toBe(1)

    const again = await claimNextJob(uuid(), db)
    expect(again?.id).toBe(claimed!.id)
    // The abandoned try counted, so this cannot loop forever.
    expect(again?.attempts).toBe(2)
  })

  it("gives a comment's whole visit longer before calling its worker gone", async () => {
    await queueJob(userId, "comment", { findId: "f1", text: "Hello." }, db)
    const claimed = await claimNextJob(uuid(), db)
    // Twenty minutes in, a comment may still be in its visit's feed.
    await db
      .update(promoJobs)
      .set({ claimedAt: new Date(Date.now() - 20 * 60_000) })
      .where(eq(promoJobs.id, claimed!.id))

    expect(await failExpiredClaims(db)).toBe(0)
    expect((await db.select().from(promoJobs))[0].status).toBe("running")
  })

  it("never hands back a comment whose worker vanished", async () => {
    await queueJob(userId, "comment", { findId: "f1", text: "Hello." }, db)
    const claimed = await claimNextJob(uuid(), db)
    await db
      .update(promoJobs)
      .set({ claimedAt: new Date(Date.now() - 30 * 60_000) })
      .where(eq(promoJobs.id, claimed!.id))

    await failExpiredClaims(db)

    // The comment may already be on Reddit, so a second go could post it twice.
    const [row] = await db.select().from(promoJobs)
    expect(row.status).toBe("failed")
    expect(row.lastError).toContain("may already be on Reddit")
    expect(await claimNextJob(uuid(), db)).toBeNull()
  })

  it("gives up on a job abandoned three times", async () => {
    await queueJob(userId, "search", {}, db)
    const [row] = await db.select().from(promoJobs)

    await db
      .update(promoJobs)
      .set({
        status: "running",
        attempts: JOB_MAX_ATTEMPTS,
        claimToken: uuid(),
        claimedAt: new Date(Date.now() - 20 * 60_000),
      })
      .where(eq(promoJobs.id, row.id))

    await failExpiredClaims(db)

    const [after] = await db.select().from(promoJobs)
    expect(after.status).toBe("failed")
    expect(after.lastError).toContain("three times")
    expect(after.finishedAt).not.toBeNull()
    // And it is not offered again.
    expect(await claimNextJob(uuid(), db)).toBeNull()
  })

  it("puts a failed job back while it still has tries left", async () => {
    await queueJob(userId, "search", {}, db)
    const token = uuid()
    const claimed = await claimNextJob(token, db)

    await failJob(claimed!.id, token, "Reddit timed out", claimed!.attempts, db)

    const [after] = await db.select().from(promoJobs)
    expect(after.status).toBe("queued")
    expect(after.lastError).toBe("Reddit timed out")
    expect(after.claimToken).toBeNull()
  })

  it("stops a job that has failed three times", async () => {
    await queueJob(userId, "search", {}, db)
    const token = uuid()
    const claimed = await claimNextJob(token, db)

    await failJob(claimed!.id, token, "Reddit timed out", JOB_MAX_ATTEMPTS, db)

    const [after] = await db.select().from(promoJobs)
    expect(after.status).toBe("failed")
  })

  it("ignores a worker that lost its claim", async () => {
    await queueJob(userId, "search", {}, db)
    const token = uuid()
    const claimed = await claimNextJob(token, db)

    // Somebody else took it over in the meantime.
    const newToken = uuid()
    await db
      .update(promoJobs)
      .set({ claimToken: newToken })
      .where(eq(promoJobs.id, claimed!.id))

    // The old worker's finish must not touch it.
    await finishJob(claimed!.id, token, db)

    const [after] = await db.select().from(promoJobs)
    expect(after.status).toBe("running")
    expect(after.claimToken).toBe(newToken)
  })

  it("marks a job done and clears its claim", async () => {
    await queueJob(userId, "search", {}, db)
    const token = uuid()
    const claimed = await claimNextJob(token, db)

    await finishJob(claimed!.id, token, db)

    const [after] = await db.select().from(promoJobs)
    expect(after.status).toBe("done")
    expect(after.claimToken).toBeNull()
    expect(after.finishedAt).not.toBeNull()
  })

  it("counts what is waiting, running and failed", async () => {
    await queueJob(userId, "search", {}, db)
    await queueJob(userId, "thread", {}, db)
    const token = uuid()
    await claimNextJob(token, db)
    await db
      .insert(promoJobs)
      .values({ id: uuid(), userId, kind: "comment", status: "failed" })

    const counts = await jobCounts(userId, db)
    expect(counts).toEqual({
      queued: 1,
      running: 1,
      failed: 1,
      searchingKeywordIds: [],
    })
  })

  it("names the keywords with a live search, and no others", async () => {
    // What this is for: a card saying "Searching Reddit" has to mean its own
    // keyword. Reading one post's replies used to light up every card.
    await queueJob(userId, "search", { keywordId: "alpha" }, db)
    await queueJob(userId, "search", { keywordId: "beta" }, db)
    await queueJob(userId, "thread", { findId: "a-post" }, db)

    const counts = await jobCounts(userId, db)
    expect([...counts.searchingKeywordIds].sort()).toEqual(["alpha", "beta"])
  })

  it("stops naming a keyword once its search has finished", async () => {
    await queueJob(userId, "search", { keywordId: "alpha" }, db)
    const token = uuid()
    const claimed = await claimNextJob(token, db)

    // Claimed and running still counts as searching.
    expect((await jobCounts(userId, db)).searchingKeywordIds).toEqual(["alpha"])

    await finishJob(claimed!.id, token, db)
    expect((await jobCounts(userId, db)).searchingKeywordIds).toEqual([])
  })

  it("names a keyword once however many searches it has waiting", async () => {
    await queueJob(userId, "search", { keywordId: "alpha" }, db)
    await queueJob(userId, "search", { keywordId: "alpha" }, db)

    expect((await jobCounts(userId, db)).searchingKeywordIds).toEqual(["alpha"])
  })

  it("keeps one person's jobs out of another's counts", async () => {
    const other = (await insertUser(db)).id
    await queueJob(userId, "health", {}, db)
    await queueJob(other, "health", {}, db)

    expect((await jobCounts(userId, db)).queued).toBe(1)
    expect((await jobCounts(other, db)).queued).toBe(1)
  })
})
