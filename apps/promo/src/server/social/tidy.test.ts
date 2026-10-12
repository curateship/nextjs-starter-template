import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"
import { createProject } from "@/server/social/projects"
import type { FindStatus } from "@/lib/social/options"

import {
  promoAccounts,
  promoComments,
  promoDrafts,
  promoFinds,
  promoKeywords,
} from "./schema"
import { TIDY_BATCH, readTidyAfterDays, saveTidyAfterDays, tidyOldFinds } from "./tidy"

const NOW = new Date("2099-06-01T12:00:00.000Z")
const DAY_MS = 24 * 60 * 60 * 1000
const THREAD = { body: "the post", replies: [{ author: "a", text: "a reply", score: 1 }] }

/**
 * The tidy-up's three outcomes, and the one thing it must never do: touch a
 * post with a comment against it. Each outcome is checked against the rows
 * in the database, not against what the sweep says it did.
 */
describe("tidying up old posts", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let keywordId: string
  let accountId: string

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    keywordId = uuid()
    await db.insert(promoKeywords).values({ id: keywordId, userId, projectId: await createProject(userId, "A project", db), term: "a term" })
    accountId = uuid()
    await db.insert(promoAccounts).values({ id: accountId, userId, handle: "me" })
  })

  afterEach(async () => {
    await client.close()
  })

  async function find(status: FindStatus, daysUnseen: number, owner = userId, keyword = keywordId) {
    const id = uuid()
    await db.insert(promoFinds).values({
      id,
      userId: owner,
      keywordId: keyword,
      redditId: `t3_${id.slice(0, 8)}`,
      permalink: `/r/x/comments/${id.slice(0, 8)}/`,
      status,
      thread: THREAD,
      threadReadAt: new Date(NOW.getTime() - daysUnseen * DAY_MS),
      lastSeenAt: new Date(NOW.getTime() - daysUnseen * DAY_MS),
    })
    return id
  }

  async function row(id: string) {
    const [found] = await db.select().from(promoFinds).where(eq(promoFinds.id, id))
    return found ?? null
  }

  it("deletes a skipped post past the age and keeps a younger one", async () => {
    const old = await find("skipped", 31)
    const young = await find("skipped", 29)

    expect(await tidyOldFinds(db, NOW)).toEqual({ deleted: 1, cleared: 0 })
    expect(await row(old)).toBeNull()
    expect(await row(young)).not.toBeNull()
  })

  it("never touches a commented post, or one with a failed attempt against it", async () => {
    const commented = await find("commented", 400)
    const tried = await find("skipped", 400)
    const triedOpen = await find("new", 400)
    for (const [findId, status] of [
      [commented, "posted"],
      [tried, "failed"],
      [triedOpen, "failed"],
    ] as const) {
      await db.insert(promoComments).values({ id: uuid(), userId, findId, accountId, text: "hi", status })
    }

    expect(await tidyOldFinds(db, NOW)).toEqual({ deleted: 0, cleared: 0 })
    expect((await row(commented))?.thread).toEqual(THREAD)
    expect(await row(tried)).not.toBeNull()
    expect((await row(triedOpen))?.thread).toEqual(THREAD)
  })

  it("keeps a skipped post that has drafts, since deleting it would take them too", async () => {
    const drafted = await find("skipped", 90)
    await db.insert(promoDrafts).values({ id: uuid(), userId, findId: drafted, text: "a draft" })
    await tidyOldFinds(db, NOW)
    expect(await row(drafted)).not.toBeNull()
  })

  it("keeps an open post's row and clears its stored thread", async () => {
    const open = await find("new", 45)
    const shortlisted = await find("shortlisted", 45)
    const fresh = await find("new", 2)

    expect(await tidyOldFinds(db, NOW)).toEqual({ deleted: 0, cleared: 2 })
    for (const id of [open, shortlisted]) {
      expect(await row(id)).toMatchObject({ thread: null, threadReadAt: null })
    }
    expect((await row(fresh))?.thread).toEqual(THREAD)
  })

  it("does nothing at all for a person whose setting is 0", async () => {
    await saveTidyAfterDays(userId, 0, db)
    const skipped = await find("skipped", 400)
    const open = await find("new", 400)

    // Another person on the default is still tidied.
    const other = (await insertUser(db, { role: "admin" })).id
    const otherKeyword = uuid()
    await db.insert(promoKeywords).values({ id: otherKeyword, userId: other, projectId: await createProject(other, "A project", db), term: "a term" })
    const theirs = await find("skipped", 400, other, otherKeyword)

    expect(await tidyOldFinds(db, NOW)).toEqual({ deleted: 1, cleared: 0 })
    expect(await row(skipped)).not.toBeNull()
    expect((await row(open))?.thread).toEqual(THREAD)
    expect(await row(theirs)).toBeNull()
  })

  it("follows a person's own number of days", async () => {
    await saveTidyAfterDays(userId, 7, db)
    expect(await readTidyAfterDays(userId, db)).toBe(7)
    const week = await find("skipped", 8)
    await tidyOldFinds(db, NOW)
    expect(await row(week)).toBeNull()
  })

  it("refuses a number outside 0 to 365", async () => {
    await expect(saveTidyAfterDays(userId, -1, db)).rejects.toThrow("from 0 to 365")
    await expect(saveTidyAfterDays(userId, 1.5, db)).rejects.toThrow("from 0 to 365")
    expect(await readTidyAfterDays(userId, db)).toBe(30)
  })

  it("takes a bounded number each pass, oldest first", async () => {
    const values = Array.from({ length: TIDY_BATCH + 3 }, (_, index) => ({
      id: uuid(),
      userId,
      keywordId,
      redditId: `t3_${index}`,
      permalink: `/r/x/comments/${index}/`,
      status: "skipped" as const,
      lastSeenAt: new Date(NOW.getTime() - (40 + index) * DAY_MS),
    }))
    await db.insert(promoFinds).values(values)

    expect(await tidyOldFinds(db, NOW)).toEqual({ deleted: TIDY_BATCH, cleared: 0 })
    const left = await db.select({ redditId: promoFinds.redditId }).from(promoFinds)
    expect(left.map((item) => item.redditId).sort()).toEqual(["t3_0", "t3_1", "t3_2"])
    expect(await tidyOldFinds(db, NOW)).toEqual({ deleted: 3, cleared: 0 })
  })
})
