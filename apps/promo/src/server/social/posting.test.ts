import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { uuid } from "@/server/auth/security"
import { createProfile } from "@/server/browser/profiles"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"
import { createProject } from "@/server/social/projects"
import { localMinutes } from "@/lib/social/waking"

import { readBehaviour, saveBehaviour, type BehaviourSettings } from "./behaviour"
import { setAccountsPaused, setProjectPaused } from "./pause"
import { cancelWaitingComment, queueComment, readPostingState } from "./posting"
import { promoAccounts, promoComments, promoFinds, promoJobs, promoKeywords } from "./schema"

const DAY_MS = 86_400_000

/**
 * What Post does with the behaviour rules: a warming account is refused with
 * the date, a young one past its pace is refused with the next time, and
 * outside waking hours the comment waits. The rows are real; no browser runs.
 */
describe("pressing Post", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let profileId: string
  let accountId: string
  let findIds: string[]
  const now = new Date()

  /** Waking hours that are, or are not, around now on a UTC clock. */
  function hours(awake: boolean): Pick<BehaviourSettings, "wakeFromMinute" | "wakeUntilMinute"> {
    const minute = localMinutes(now, "UTC")
    const shift = (by: number) => (((minute + by) % 1440) + 1440) % 1440
    return awake
      ? { wakeFromMinute: shift(-120), wakeUntilMinute: shift(120) }
      : { wakeFromMinute: shift(120), wakeUntilMinute: shift(240) }
  }

  async function set(patch: Partial<BehaviourSettings>) {
    await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), ...patch }, db)
  }

  async function account() {
    const [row] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
    return row
  }

  async function sentAgo(minutes: number, findIndex: number) {
    await db.insert(promoComments).values({
      id: uuid(),
      userId,
      findId: findIds[findIndex],
      accountId,
      text: "Sent.",
      status: "posted",
      postedAt: new Date(now.getTime() - minutes * 60_000),
    })
  }

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    profileId = await createProfile(userId, { name: "Main" }, db)
    accountId = uuid()
    // A year-old account: past its warm-up and no longer young.
    await db.insert(promoAccounts).values({
      id: accountId,
      userId,
      profileId,
      handle: "a_persona",
      redditCreatedAt: new Date(now.getTime() - 365 * DAY_MS),
    })
    const keywordId = uuid()
    await db.insert(promoKeywords).values({ id: keywordId, userId, projectId: await createProject(userId, "A project", db), term: "a term" })
    findIds = []
    for (let index = 0; index < 8; index += 1) {
      const id = uuid()
      findIds.push(id)
      await db.insert(promoFinds).values({
        id,
        userId,
        keywordId,
        redditId: `t3_${index}`,
        permalink: `/r/x/comments/p${index}/`,
        subreddit: "x",
      })
    }
    await set(hours(true))
  })

  afterEach(async () => {
    await client.close()
  })

  const post = (findIndex: number) =>
    queueComment(userId, { id: accountId, handle: "", importance: "throwaway", movingToPhoneId: null, profileId, phoneId: null, redditCreatedAt: null, pausedAt: null, projectId: null }, { findId: findIds[findIndex], text: "Hi.", draftId: null }, db, now)

  const postAs = async (findIndex: number) => {
    const row = await account()
    return queueComment(userId, row, { findId: findIds[findIndex], text: "Hi.", draftId: null }, db, now)
  }

  it("queues inside waking hours, held ten seconds so it can be undone", async () => {
    const { runAfter, undoUntil } = await postAs(0)
    expect(runAfter).toBeNull()
    expect(undoUntil!.getTime()).toBe(now.getTime() + 10_000)
    const [job] = await db.select().from(promoJobs)
    expect(job).toMatchObject({ kind: "comment", status: "queued", runAfter: undoUntil, lane: profileId })

    // Undo inside the ten seconds takes it back, and nothing is sent.
    await cancelWaitingComment(userId, findIds[0], db)
    expect(await db.select().from(promoJobs)).toHaveLength(0)
  })

  it("holds a comment pressed outside waking hours for the account's morning, and says when", async () => {
    await set(hours(false))

    const { runAfter } = await postAs(0)

    expect(runAfter!.getTime()).toBeGreaterThan(now.getTime())
    expect(localMinutes(runAfter!, "UTC")).toBe(hours(false).wakeFromMinute)
    const state = await readPostingState(userId, await account(), db, now)
    expect(state.waiting).toEqual([{ findId: findIds[0], runAfter }])
    expect(state.awake).toBe(false)
  })

  it("refuses a second comment on a post while the first is on its way", async () => {
    await postAs(0)
    await expect(postAs(0)).rejects.toThrow("already on its way")
  })

  it("cancels a waiting comment, and refuses once it has started", async () => {
    await set(hours(false))
    await postAs(0)

    await cancelWaitingComment(userId, findIds[0], db)
    expect(await db.select().from(promoJobs)).toHaveLength(0)

    await set(hours(true))
    await postAs(1)
    await db.update(promoJobs).set({ status: "running" })
    await expect(cancelWaitingComment(userId, findIds[1], db)).rejects.toThrow("no longer waiting")
  })

  it("refuses Post on a warming account with the date its warm-up ends", async () => {
    await db
      .update(promoAccounts)
      .set({ redditCreatedAt: new Date(now.getTime() - DAY_MS) })
      .where(eq(promoAccounts.id, accountId))

    await expect(postAs(0)).rejects.toThrow(/still warming up\. Its first comment is allowed (tomorrow|on .+) at \d+:\d\d \S+ time\./)
    expect(await db.select().from(promoJobs)).toHaveLength(0)
  })

  it("refuses Post when nobody has read how old the account is", async () => {
    await expect(post(0)).rejects.toThrow("has not read how old this account is")
  })

  it("lets an account comment once the warm-up is switched off", async () => {
    await set({ warmUpDays: 0, youngDays: 0 })
    await expect(post(0)).resolves.toMatchObject({ runAfter: null })
  })

  it("refuses a young account past its comments an hour, with when the next is allowed", async () => {
    // Ten days old: warmed up (3 days), still young (90).
    await db
      .update(promoAccounts)
      .set({ redditCreatedAt: new Date(now.getTime() - 10 * DAY_MS) })
      .where(eq(promoAccounts.id, accountId))
    await sentAgo(40, 0)
    await sentAgo(10, 1)

    await expect(postAs(2)).rejects.toThrow(
      /A young account may send 2 comments an hour, and this one has\. The next one is allowed (today|tomorrow) at \d+:\d\d \S+ time\./
    )
  })

  it("counts a young account's waiting comments against its limit", async () => {
    await db
      .update(promoAccounts)
      .set({ redditCreatedAt: new Date(now.getTime() - 10 * DAY_MS) })
      .where(eq(promoAccounts.id, accountId))
    await set(hours(false))
    await postAs(0)
    await postAs(1)

    await expect(postAs(2)).rejects.toThrow("that many are sent or waiting to go")
  })

  it("only warns an older account, however fast it goes", async () => {
    for (let index = 0; index < 5; index += 1) await sentAgo(5 + index, index)

    await expect(postAs(5)).resolves.toMatchObject({ runAfter: null })
    const state = await readPostingState(userId, await account(), db, now)
    expect(state).toMatchObject({ young: false, lastHour: 5, limit: null })
  })

  it("never counts a failed attempt", async () => {
    await db.insert(promoComments).values({
      id: uuid(),
      userId,
      findId: findIds[0],
      accountId,
      text: "Never went.",
      status: "failed",
      postedAt: now,
    })
    const state = await readPostingState(userId, await account(), db, now)
    expect(state.lastHour).toBe(0)
  })

  it("refuses Post while the account is paused, and again once resumed it goes", async () => {
    await setAccountsPaused(userId, [accountId], true, db, now)
    await expect(postAs(0)).rejects.toThrow("This account is paused")
    expect((await readPostingState(userId, await account(), db, now)).paused).toBe("account")

    await setAccountsPaused(userId, [accountId], false, db, now)
    const { runAfter } = await postAs(0)
    expect(runAfter).toBeNull()
  })

  it("refuses Post for every account in a paused project", async () => {
    const projectId = await createProject(userId, "Paused one", db)
    await db.update(promoAccounts).set({ projectId }).where(eq(promoAccounts.id, accountId))
    await setProjectPaused(userId, projectId, true, db, now)
    await expect(postAs(0)).rejects.toThrow("project is paused")

    await setProjectPaused(userId, projectId, false, db, now)
    await expect(postAs(0)).resolves.toMatchObject({ runAfter: null })
  })

  it("never pauses a retired account, and says it skipped it", async () => {
    await db.update(promoAccounts).set({ retiredAt: now }).where(eq(promoAccounts.id, accountId))
    expect(await setAccountsPaused(userId, [accountId], true, db, now)).toEqual({
      completed: [],
      skipped: [accountId],
    })
  })
})
