import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { createProfile } from "@/server/browser/profiles"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

import { readBehaviour, saveBehaviour } from "./behaviour"
import { checkInBrowserProgram, checkOutBrowserProgram, readBrowserProgram } from "./browser-program"
import { cancelJobs, listJobs, retryJobs } from "./job-list"
import { claimNextJob, jobCounts, queueJob } from "./jobs"
import { createProject } from "./projects"
import { promoJobs, promoKeywords } from "./schema"

describe("the Jobs tab's list", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let keywordId: string

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    const readerId = await createProfile(userId, { name: "Reader" }, db)
    await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), readerProfileId: readerId }, db)
    keywordId = uuid()
    await db
      .insert(promoKeywords)
      .values({ id: keywordId, userId, projectId: await createProject(userId, "A project", db), term: "czxvcv" })
  })

  afterEach(async () => {
    await client.close()
  })

  it("names the keyword a search is for and the browser it runs in", async () => {
    await queueJob(userId, "search", { keywordId }, db)
    const { jobs } = await listJobs(userId, db)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.what).toBe('Search a keyword: "czxvcv"')
    expect(jobs[0]?.where).toBe("Reader")
    expect(jobs[0]?.status).toBe("queued")
  })

  it("says a search's keyword is gone rather than leaving it blank", async () => {
    await queueJob(userId, "search", { keywordId: "deleted" }, db)
    expect((await listJobs(userId, db)).jobs[0]?.what).toBe("Search a keyword: a keyword since deleted")
  })

  it("marks a waiting job whose browser already has one running", async () => {
    await queueJob(userId, "search", { keywordId }, db)
    await queueJob(userId, "search", { keywordId }, db)
    await claimNextJob("token", db)
    const waiting = (await listJobs(userId, db)).jobs.find((job) => job.status === "queued")
    expect(waiting?.laneBusy).toBe(true)
  })

  it("cancels a waiting job and leaves a running one alone", async () => {
    const running = await queueJob(userId, "search", { keywordId }, db)
    await claimNextJob("token", db)
    const waiting = await queueJob(userId, "search", { keywordId }, db)
    const answer = await cancelJobs(userId, [running, waiting], db)
    expect(answer).toEqual({ completed: [waiting], skipped: [running] })
    expect(await db.select().from(promoJobs).where(eq(promoJobs.id, running))).toHaveLength(1)
  })

  it("puts a failed search back but never a failed comment, which may be on Reddit", async () => {
    const search = await queueJob(userId, "search", { keywordId }, db)
    const comment = uuid()
    await db.insert(promoJobs).values({ id: comment, userId, kind: "comment", payload: {}, status: "failed" })
    await db.update(promoJobs).set({ status: "failed", attempts: 3, lastError: "Reddit said no" }).where(eq(promoJobs.id, search))
    const answer = await retryJobs(userId, [search, comment], db)
    expect(answer).toEqual({ completed: [search], skipped: [comment] })
    const [row] = await db.select().from(promoJobs).where(eq(promoJobs.id, search))
    expect(row?.status).toBe("queued")
    expect(row?.attempts).toBe(0)
    expect(row?.lastError).toBe("")
  })

  it("never lists or touches another person's jobs", async () => {
    const other = (await insertUser(db, { role: "admin" })).id
    const theirs = uuid()
    await db.insert(promoJobs).values({ id: theirs, userId: other, kind: "search", payload: {} })
    expect((await listJobs(userId, db)).jobs).toHaveLength(0)
    expect(await cancelJobs(userId, [theirs], db)).toEqual({ completed: [], skipped: [theirs] })
  })
})

describe("whether the browser program is running", () => {
  let client: PGlite
  let db: TestDatabase

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
  })

  afterEach(async () => {
    await client.close()
  })

  it("is not running before any copy has checked in", async () => {
    expect((await readBrowserProgram(db)).running).toBe(false)
  })

  it("is running within two minutes of a check-in, and stopped after", async () => {
    const at = new Date("2026-10-13T12:00:00Z")
    await checkInBrowserProgram("copy", 1, db, at)
    expect((await readBrowserProgram(db, new Date(at.getTime() + 60_000))).running).toBe(true)
    expect((await readBrowserProgram(db, new Date(at.getTime() + 3 * 60_000))).running).toBe(false)
  })

  it("stops counting a copy that checked out", async () => {
    await checkInBrowserProgram("copy", 1, db)
    await checkOutBrowserProgram("copy", db)
    expect((await readBrowserProgram(db)).running).toBe(false)
  })

  it("tells the Projects dashboard, through the job counts", async () => {
    const userId = (await insertUser(db, { role: "admin" })).id
    expect((await jobCounts(userId, db)).programRunning).toBe(false)
    await checkInBrowserProgram("copy", 1, db)
    expect((await jobCounts(userId, db)).programRunning).toBe(true)
  })
})
