import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { uuid } from "@/server/auth/security"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"

import { buildDraftPrompt } from "./drafts"
import { exampleComments, listSentComments, setNotExample } from "./examples"
import { promoAccounts, promoComments, promoDrafts, promoFinds, promoKeywords } from "./schema"

/**
 * Which sent comments the next draft copies the voice of. Read from the
 * database and then out of the prompt text, because the prompt is what the
 * model actually sees.
 */
describe("sent comments as examples", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let accountId: string
  let findId: string
  let draftId: string

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    accountId = uuid()
    await db.insert(promoAccounts).values({ id: accountId, userId, handle: "me" })
    const keywordId = uuid()
    await db.insert(promoKeywords).values({ id: keywordId, userId, term: "a term" })
    findId = uuid()
    await db
      .insert(promoFinds)
      .values({ id: findId, userId, keywordId, redditId: "t3_a", permalink: "/r/x/comments/a/" })
    draftId = uuid()
    await db.insert(promoDrafts).values({ id: draftId, userId, findId, text: "a draft" })
  })

  afterEach(async () => {
    await client.close()
  })

  async function sent(
    text: string,
    minutesAgo: number,
    overrides: Partial<typeof promoComments.$inferInsert> = {}
  ) {
    const id = uuid()
    await db.insert(promoComments).values({
      id,
      userId,
      findId,
      accountId,
      text,
      draftId,
      postedAt: new Date(Date.UTC(2099, 0, 1) - minutesAgo * 60_000),
      ...overrides,
    })
    return id
  }

  function promptWith(examples: string[]) {
    return buildDraftPrompt({
      subreddit: "x",
      title: "t",
      body: "b",
      replies: [],
      voice: "",
      product: "",
      commentRules: "",
      examples,
      count: 2,
    })
  }

  it("carries all three sent comments, and drops one marked as not an example", async () => {
    const first = await sent("first comment", 30)
    await sent("second comment", 20)
    await sent("third comment", 10)

    const prompt = promptWith(await exampleComments(userId, accountId, db))
    expect(prompt).toContain("first comment")
    expect(prompt).toContain("second comment")
    expect(prompt).toContain("third comment")

    await setNotExample(userId, first, true, db)
    const next = promptWith(await exampleComments(userId, accountId, db))
    expect(next).not.toContain("first comment")
    expect(next).toContain("third comment")
  })

  it("puts hand-written comments first, then the newest", async () => {
    await sent("model, newest", 1)
    await sent("model, older", 50)
    await sent("typed by hand, oldest", 500, { draftId: null })

    expect(await exampleComments(userId, accountId, db)).toEqual([
      "typed by hand, oldest",
      "model, newest",
      "model, older",
    ])
  })

  it("never uses a failed attempt or another person's comment", async () => {
    await sent("never landed", 5, { status: "failed" })
    const other = (await insertUser(db, { role: "admin" })).id
    await expect(exampleComments(other, accountId, db)).resolves.toEqual([])
    expect(await exampleComments(userId, accountId, db)).toEqual([])
    await expect(setNotExample(other, uuid(), true, db)).rejects.toThrow("no longer saved")
  })

  it("lists the sent comments and says which three the next draft uses", async () => {
    await sent("a", 40)
    const b = await sent("b", 30)
    await sent("c", 20)
    await sent("d", 10)
    await setNotExample(userId, b, true, db)

    const listed = await listSentComments(userId, accountId, db)
    expect(listed.map((row) => [row.text, row.inNextDraft, row.notExample])).toEqual([
      ["d", true, false],
      ["c", true, false],
      ["b", false, true],
      ["a", true, false],
    ])
  })
})
