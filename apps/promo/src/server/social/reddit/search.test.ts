import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"
import { promoFinds, promoKeywords } from "@/server/social/schema"
import { setFindStatus } from "@/server/social/reddit/search"

/**
 * The rule this file exists to protect: **a re-run never undoes a decision.**
 *
 * Running a keyword again is the ordinary thing to do, several times a day.
 * If it reset what had already been skipped or replied to, the list would be
 * useless by the second day, and nothing on screen would say why.
 */
describe("running a keyword again", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let keywordId: string

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    keywordId = uuid()
    await db.insert(promoKeywords).values({ id: keywordId, userId, term: "a term" })
  })

  afterEach(async () => {
    await client.close()
  })

  async function insertFind(overrides: Partial<typeof promoFinds.$inferInsert> = {}) {
    const [find] = await db
      .insert(promoFinds)
      .values({
        id: uuid(),
        userId,
        keywordId,
        redditId: "t3_one",
        permalink: "/r/x/comments/one/",
        score: 5,
        commentCount: 2,
        rank: 1,
        ...overrides,
      })
      .returning()
    return find
  }

  it("keeps a skipped post skipped when the figures change", async () => {
    const find = await insertFind({ status: "skipped" })

    // What a re-run writes: the same post, new figures, through the same
    // conflict target the search uses.
    await db
      .insert(promoFinds)
      .values({
        id: uuid(),
        userId,
        keywordId,
        redditId: "t3_one",
        permalink: find.permalink,
        score: 99,
        commentCount: 40,
        rank: 0.2,
      })
      .onConflictDoUpdate({
        target: [promoFinds.keywordId, promoFinds.redditId],
        set: { score: 99, commentCount: 40, rank: 0.2 },
      })

    const [after] = await db.select().from(promoFinds)
    expect(after.id).toBe(find.id)
    expect(after.score).toBe(99)
    // The figures moved and the decision did not.
    expect(after.status).toBe("skipped")
  })

  it("keeps one row per post per keyword", async () => {
    await insertFind()
    await expect(insertFind()).rejects.toThrow()
    expect(await db.select().from(promoFinds)).toHaveLength(1)
  })

  it("lets the same post be found under a different keyword", async () => {
    await insertFind()
    const second = uuid()
    await db.insert(promoKeywords).values({ id: second, userId, term: "another" })

    // Two keywords can each have their own view of one post, with their own
    // decision about it.
    await insertFind({ keywordId: second })
    expect(await db.select().from(promoFinds)).toHaveLength(2)
  })
})

describe("moving posts to a status", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let keywordId: string

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    keywordId = uuid()
    await db.insert(promoKeywords).values({ id: keywordId, userId, term: "a term" })
  })

  afterEach(async () => {
    await client.close()
  })

  async function insertFind(redditId: string, status: "new" | "commented" = "new") {
    const id = uuid()
    await db.insert(promoFinds).values({
      id,
      userId,
      keywordId,
      redditId,
      permalink: `/r/x/comments/${redditId}/`,
      status,
    })
    return id
  }

  it("leaves a post that was already replied to alone", async () => {
    // Moving it back would offer it up to be answered a second time.
    const open = await insertFind("t3_open")
    const answered = await insertFind("t3_answered", "commented")

    const result = await setFindStatus(userId, [open, answered], "skipped", db)

    expect(result.completed).toEqual([open])
    expect(result.skipped).toEqual([answered])

    const [stillAnswered] = await db
      .select()
      .from(promoFinds)
      .where(eq(promoFinds.id, answered))
    expect(stillAnswered.status).toBe("commented")
  })

  it("never touches another person's posts", async () => {
    const mine = await insertFind("t3_mine")
    const other = (await insertUser(db)).id

    const result = await setFindStatus(other, [mine], "skipped", db)

    expect(result.completed).toEqual([])
    expect(result.skipped).toEqual([mine])
    const [untouched] = await db.select().from(promoFinds)
    expect(untouched.status).toBe("new")
  })

  it("answers with nothing when asked to move nothing", async () => {
    expect(await setFindStatus(userId, [], "skipped", db)).toEqual({
      completed: [],
      skipped: [],
    })
  })
})
