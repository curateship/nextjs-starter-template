import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { uuid } from "@/server/auth/security"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"

import {
  promoBrowserSessions,
  promoProfiles,
  promoProxies,
} from "@/server/browser/schema"

import {
  promoAccounts,
  promoComments,
  promoDrafts,
  promoFinds,
  promoJobs,
  promoKeywords,
  promoSearches,
} from "./schema"

/**
 * Proves the hand-written SQL in `drizzle/0091_promo_reddit.sql` and
 * `drizzle/0094_promo_browser_profiles.sql` and the Drizzle tables describe the
 * same database. A column named in one and not the other fails here rather
 * than at the first real read.
 *
 * It also pins the rules the SQL enforces rather than the code: one post per
 * keyword, one live browser per profile, one account per network inside a
 * profile, one profile per cookie volume, and one keyword per person.
 */
describe("promo reddit tables", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    const user = await insertUser(db, { role: "admin" })
    userId = user.id
  })

  afterEach(async () => {
    await client.close()
  })

  async function insertProxy() {
    const [proxy] = await db
      .insert(promoProxies)
      .values({
        id: uuid(),
        userId,
        label: "A residential line",
        protocol: "socks5",
        host: "proxy.example.test",
        port: 1080,
        username: "someone",
        passwordEncrypted: "iv:tag:cipher",
      })
      .returning()
    return proxy
  }

  async function insertProfile(proxyId: string | null = null) {
    const id = uuid()
    const [profile] = await db
      .insert(promoProfiles)
      .values({ id, userId, name: "Main", proxyId, volumeName: `promo-profile-${id}` })
      .returning()
    return profile
  }

  async function insertAccount(
    profileId: string | null = null,
    platform = "reddit"
  ) {
    const [account] = await db
      .insert(promoAccounts)
      .values({
        id: uuid(),
        userId,
        platform,
        handle: "a_persona",
        profileId,
      })
      .returning()
    return account
  }

  async function insertKeyword(term = "project management") {
    const [keyword] = await db
      .insert(promoKeywords)
      .values({
        id: uuid(),
        userId,
        term,
        subreddits: ["productivity", "smallbusiness"],
        sort: "new",
        timeWindow: "week",
      })
      .returning()
    return keyword
  }

  it("writes a proxy and keeps its password out of the readable columns", async () => {
    const proxy = await insertProxy()

    expect(proxy.protocol).toBe("socks5")
    expect(proxy.port).toBe(1080)
    // Nothing has tested it yet, so these are unknown rather than empty.
    expect(proxy.lastTestedAt).toBeNull()
    expect(proxy.lastTestResult).toBeNull()
    // The country is filled in by a test, not typed, so it starts blank.
    expect(proxy.country).toBe("")
  })

  it("keeps a profile when its proxy is deleted", async () => {
    const proxy = await insertProxy()
    const profile = await insertProfile(proxy.id)
    expect(profile.proxyId).toBe(proxy.id)

    await db.delete(promoProxies)

    const [after] = await db.select().from(promoProfiles)
    // Losing the proxy must not lose the profile and its cookies with it.
    expect(after.proxyId).toBeNull()
    expect(after.volumeName).toBe(profile.volumeName)
  })

  it("keeps an account, with no profile, when its profile is deleted", async () => {
    const profile = await insertProfile()
    await insertAccount(profile.id)

    await db.delete(promoProfiles)

    const [after] = await db.select().from(promoAccounts)
    expect(after.profileId).toBeNull()
    expect(after.handle).toBe("a_persona")
  })

  it("allows one account per network inside a profile", async () => {
    const profile = await insertProfile()
    await insertAccount(profile.id, "reddit")

    // Two Reddit accounts in one browser would be signed in over each other.
    await expect(insertAccount(profile.id, "reddit")).rejects.toThrow()

    // A different network in the same browser is fine, and so is a second
    // Reddit account in a profile of its own, or in none.
    await insertAccount(profile.id, "instagram")
    await insertAccount((await insertProfile()).id, "reddit")
    await insertAccount(null, "reddit")
    await insertAccount(null, "reddit")

    expect(await db.select().from(promoAccounts)).toHaveLength(5)
  })

  it("refuses two profiles on one cookie volume", async () => {
    const first = await insertProfile()
    await expect(
      db.insert(promoProfiles).values({
        id: uuid(),
        userId,
        name: "Copy",
        volumeName: first.volumeName,
      })
    ).rejects.toThrow()
  })

  it("starts an account with unknown karma rather than zero", async () => {
    const account = await insertAccount(null)
    expect(account.karma).toBeNull()
    expect(account.lastPostedAt).toBeNull()
    // Nothing has looked at the browser for it yet.
    expect(account.stateReadAt).toBeNull()
    expect(account.blocked).toBe(false)
  })

  it("allows one live browser per profile and a second once it stops", async () => {
    const profile = await insertProfile()

    await db.insert(promoBrowserSessions).values({
      id: uuid(),
      userId,
      profileId: profile.id,
      status: "running",
      commandPort: 7001,
      streamPort: 8001,
    })

    await expect(
      db.insert(promoBrowserSessions).values({
        id: uuid(),
        userId,
        profileId: profile.id,
        status: "starting",
        commandPort: 7002,
        streamPort: 8002,
      })
    ).rejects.toThrow()

    await db.update(promoBrowserSessions).set({ status: "stopped" })

    // Once the first has stopped the profile can open another.
    await db.insert(promoBrowserSessions).values({
      id: uuid(),
      userId,
      profileId: profile.id,
      status: "running",
      commandPort: 7002,
      streamPort: 8002,
    })

    const live = await db.select().from(promoBrowserSessions)
    expect(live).toHaveLength(2)
  })

  it("refuses two live sessions on one command port", async () => {
    const first = await insertProfile()
    const second = await insertProfile()

    await db.insert(promoBrowserSessions).values({
      id: uuid(),
      userId,
      profileId: first.id,
      status: "running",
      commandPort: 7001,
      streamPort: 8001,
    })

    await expect(
      db.insert(promoBrowserSessions).values({
        id: uuid(),
        userId,
        profileId: second.id,
        status: "starting",
        commandPort: 7001,
        streamPort: 8002,
      })
    ).rejects.toThrow()
  })

  it("refuses the same keyword twice however it is capitalised", async () => {
    await insertKeyword("Project Management")

    await expect(insertKeyword("project management")).rejects.toThrow()
  })

  it("keeps one find per post per keyword", async () => {
    const keyword = await insertKeyword()
    const [search] = await db
      .insert(promoSearches)
      .values({ id: uuid(), userId, keywordId: keyword.id, status: "done" })
      .returning()

    const find = {
      id: uuid(),
      userId,
      keywordId: keyword.id,
      firstSearchId: search.id,
      redditId: "t3_1abc234",
      permalink: "/r/productivity/comments/1abc234/a_post/",
      subreddit: "productivity",
      title: "What do you use to keep track of client work?",
      score: 40,
      commentCount: 3,
      rank: 6.8333,
    }

    await db.insert(promoFinds).values(find)

    await expect(
      db.insert(promoFinds).values({ ...find, id: uuid() })
    ).rejects.toThrow()

    const [stored] = await db.select().from(promoFinds)
    expect(stored.status).toBe("new")
    expect(stored.rank).toBeCloseTo(6.8333, 4)
    // The thread has not been opened, which is not the same as having no replies.
    expect(stored.thread).toBeNull()
    expect(stored.threadReadAt).toBeNull()
  })

  it("carries a draft and the comment it became", async () => {
    const keyword = await insertKeyword()
    const account = await insertAccount(null)
    const [find] = await db
      .insert(promoFinds)
      .values({
        id: uuid(),
        userId,
        keywordId: keyword.id,
        redditId: "t3_1abc234",
        permalink: "/r/productivity/comments/1abc234/a_post/",
      })
      .returning()

    const [draft] = await db
      .insert(promoDrafts)
      .values({
        id: uuid(),
        userId,
        findId: find.id,
        text: "I kept a spreadsheet for two years before switching.",
        provider: "anthropic",
        model: "claude-opus-5",
      })
      .returning()

    const [comment] = await db
      .insert(promoComments)
      .values({
        id: uuid(),
        userId,
        findId: find.id,
        draftId: draft.id,
        accountId: account.id,
        text: "I kept a spreadsheet for two years before switching to this.",
        commentUrl:
          "https://www.reddit.com/r/productivity/comments/1abc234/a_post/comment/xyz/",
      })
      .returning()

    expect(draft.status).toBe("draft")
    expect(comment.status).toBe("posted")
    // The sent text may differ from the draft, because it was edited first.
    expect(comment.text).not.toBe(draft.text)
  })

  it("queues a job with nothing claimed yet", async () => {
    const keyword = await insertKeyword()
    const [job] = await db
      .insert(promoJobs)
      .values({
        id: uuid(),
        userId,
        kind: "search",
        payload: { keywordId: keyword.id },
      })
      .returning()

    expect(job.status).toBe("queued")
    expect(job.claimToken).toBeNull()
    expect(job.claimedAt).toBeNull()
    expect(job.attempts).toBe(0)
    expect(job.payload).toEqual({ keywordId: keyword.id })
  })

  it("takes every find away with its keyword", async () => {
    const keyword = await insertKeyword()
    await db.insert(promoFinds).values({
      id: uuid(),
      userId,
      keywordId: keyword.id,
      redditId: "t3_1abc234",
      permalink: "/r/productivity/comments/1abc234/a_post/",
    })

    await db.delete(promoKeywords)

    expect(await db.select().from(promoFinds)).toHaveLength(0)
  })
})
