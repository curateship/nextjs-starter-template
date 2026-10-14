import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { uuid } from "@/server/auth/security"
import { createProfile } from "@/server/browser/profiles"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"
import { describeBulkResult } from "@/lib/format/bulk-result"

import { addAccount, readAccount } from "./accounts"
import { listRedditAccounts, retireAccounts, setAccountsStatus } from "./account-list"
import { readBehaviour, saveBehaviour } from "./behaviour"
import { listSentComments } from "./comments"
import { createProject } from "./projects"
import { promoAccounts, promoComments, promoFinds, promoKeywords } from "./schema"

const DAY_MS = 86_400_000
const NOW = new Date()

/**
 * The Reddit accounts dashboard: several accounts, each in its own profile,
 * with the status the app works out, a status set by hand, and retiring.
 */
describe("the Reddit accounts list", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
  })

  afterEach(async () => {
    await client.close()
  })

  async function account(daysOld: number | null, patch: Partial<typeof promoAccounts.$inferInsert> = {}) {
    const profileId = await createProfile(userId, { name: `Profile ${uuid().slice(0, 4)}` }, db)
    const id = await addAccount(userId, { profileId, phoneId: null, voiceId: null }, db)
    await db
      .update(promoAccounts)
      .set({
        handle: `persona_${id.slice(0, 4)}`,
        redditCreatedAt: daysOld === null ? null : new Date(NOW.getTime() - daysOld * DAY_MS),
        ...patch,
      })
      .where(eq(promoAccounts.id, id))
    return { id, profileId }
  }

  async function sentFrom(accountId: string, daysAgo: number) {
    const projectId = await createProject(userId, `P ${uuid().slice(0, 4)}`, db)
    const keywordId = uuid()
    await db.insert(promoKeywords).values({ id: keywordId, userId, projectId, term: uuid() })
    const findId = uuid()
    await db.insert(promoFinds).values({
      id: findId,
      userId,
      keywordId,
      redditId: `t3_${findId.slice(0, 6)}`,
      permalink: `/r/x/comments/${findId.slice(0, 6)}/`,
      subreddit: "x",
    })
    await db.insert(promoComments).values({
      id: uuid(),
      userId,
      findId,
      accountId,
      text: "Sent.",
      commentUrl: "https://www.reddit.com/r/x/comments/abc/_/def/",
      postedAt: new Date(NOW.getTime() - daysAgo * DAY_MS),
    })
  }

  it("lists two accounts in two profiles, and refuses a profile already holding one", async () => {
    const first = await account(400)
    await account(400)

    expect(await listRedditAccounts(userId, { retired: false }, db, NOW)).toHaveLength(2)
    await expect(addAccount(userId, { profileId: first.profileId, phoneId: null, voiceId: null }, db)).rejects.toThrow(
      "already has a Reddit account in it"
    )
  })

  it("refuses the reader browser for an account", async () => {
    const reader = await createProfile(userId, { name: "Reader" }, db)
    await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), readerProfileId: reader }, db)
    await expect(addAccount(userId, { profileId: reader, phoneId: null, voiceId: null }, db)).rejects.toThrow("reader browser")
  })

  it("works out Warming up, Working, Ready and Banned", async () => {
    const warming = await account(1)
    const working = await account(10)
    await sentFrom(working.id, 1)
    const ready = await account(10)
    await sentFrom(ready.id, 8)
    const banned = await account(400, {
      profileCheck: {
        handle: "x",
        signedInStatus: 200,
        signedInFound: true,
        signedOutStatus: 200,
        signedOutFound: true,
        suspended: true,
        readAt: NOW.toISOString(),
      },
    })
    const unread = await account(null)

    const rows = await listRedditAccounts(userId, { retired: false }, db, NOW)
    const status = (id: string) => rows.find((row) => row.id === id)?.status.status
    expect(status(warming.id)).toBe("warming_up")
    expect(status(working.id)).toBe("working")
    expect(status(ready.id)).toBe("ready")
    expect(status(banned.id)).toBe("banned")
    expect(status(unread.id)).toBeNull()
  })

  it("sets a status by hand on three accounts in one request, and lets the app decide again", async () => {
    const ids = [(await account(1)).id, (await account(1)).id, (await account(1)).id]

    const answer = await setAccountsStatus(userId, ids, "ready", db)
    expect(
      describeBulkResult({ done: answer.completed.length, kept: answer.skipped.length, one: "account", many: "accounts", verb: "set to Ready" })
    ).toBe("3 accounts set to Ready.")
    let rows = await listRedditAccounts(userId, { retired: false }, db, NOW)
    expect(rows.every((row) => row.status.status === "ready" && row.status.byHand)).toBe(true)

    await setAccountsStatus(userId, ids, null, db)
    rows = await listRedditAccounts(userId, { retired: false }, db, NOW)
    expect(rows.every((row) => row.status.status === "warming_up" && !row.status.byHand)).toBe(true)
  })

  it("takes a retired account out of the list and Settings, keeps its comments, and brings it back", async () => {
    const oldest = await account(400)
    await sentFrom(oldest.id, 2)
    const next = await account(400)

    await retireAccounts(userId, [oldest.id], true, db)
    expect((await listRedditAccounts(userId, { retired: false }, db, NOW)).map((row) => row.id)).toEqual([next.id])
    expect((await readAccount(userId, db))?.id).toBe(next.id)
    expect(await listSentComments(userId, db)).toHaveLength(1)
    expect((await listRedditAccounts(userId, { retired: true }, db, NOW)).map((row) => row.id)).toContain(oldest.id)

    await retireAccounts(userId, [oldest.id], false, db)
    expect(await listRedditAccounts(userId, { retired: false }, db, NOW)).toHaveLength(2)
  })
})
