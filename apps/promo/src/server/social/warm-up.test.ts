import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { createProfile, listFoldersAndLabels } from "@/server/browser/profiles"
import { promoProfiles } from "@/server/browser/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"
import { createProject } from "@/server/social/projects"
import { localMinutes } from "@/lib/social/waking"

vi.mock("@/server/browser/command", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/browser/command")>()
  return { ...actual, redditWarmUp: vi.fn() }
})

const command = await import("@/server/browser/command")
const { readBehaviour, saveBehaviour } = await import("./behaviour")
const { queueDueWarmUps, runWarmUp } = await import("./warm-up")
const { promoAccounts, promoBlockedSubreddits, promoFinds, promoJobs, promoKeywords } = await import("./schema")

const warmUpVisit = vi.mocked(command.redditWarmUp)
const DAY_MS = 86_400_000

/**
 * The daily warm-up: picked once a day inside the account's waking hours,
 * never for an account past it, and the profile label kept in step.
 */
describe("warming up a new account", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let profileId: string
  let accountId: string
  const now = new Date()

  async function hoursAround(awake: boolean) {
    const minute = localMinutes(now, "UTC")
    const shift = (by: number) => (((minute + by) % 1440) + 1440) % 1440
    await saveBehaviour(
      userId,
      {
        ...(await readBehaviour(userId, db)),
        ...(awake
          ? { wakeFromMinute: shift(-120), wakeUntilMinute: shift(300) }
          : { wakeFromMinute: shift(120), wakeUntilMinute: shift(240) }),
      },
      db
    )
  }

  async function labelNamed(name: string) {
    const { labels } = await listFoldersAndLabels(userId, db)
    return labels.find((label) => label.name === name)!.id
  }

  async function profileLabel() {
    const [row] = await db.select({ labelId: promoProfiles.labelId }).from(promoProfiles).where(eq(promoProfiles.id, profileId))
    return row.labelId
  }

  beforeEach(async () => {
    warmUpVisit.mockReset()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    profileId = await createProfile(userId, { name: "Main" }, db)
    accountId = uuid()
    // Made by Reddit a day ago, so it warms for two more days.
    await db.insert(promoAccounts).values({
      id: accountId,
      userId,
      profileId,
      handle: "new_one",
      redditCreatedAt: new Date(now.getTime() - DAY_MS),
    })
    await hoursAround(true)
  })

  afterEach(async () => {
    await client.close()
  })

  it("picks one time today, inside waking hours and within four hours, and no second one", async () => {
    expect(await queueDueWarmUps(db, now, () => 0.5)).toBe(1)
    const [job] = await db.select().from(promoJobs)
    expect(job).toMatchObject({ kind: "warm_up", lane: profileId, payload: { accountId } })
    expect(job.runAfter!.getTime()).toBeGreaterThan(now.getTime())
    expect(job.runAfter!.getTime()).toBeLessThanOrEqual(now.getTime() + 4 * 3_600_000)

    expect(await queueDueWarmUps(db, now)).toBe(0)
    // Done earlier today still counts as today's.
    await db.update(promoJobs).set({ status: "done" })
    expect(await queueDueWarmUps(db, now)).toBe(0)
  })

  it("never picks a time while the account is asleep", async () => {
    await hoursAround(false)
    expect(await queueDueWarmUps(db, now)).toBe(0)
  })

  it("leaves an account past its warm-up alone, and one whose age was never read", async () => {
    await db.update(promoAccounts).set({ redditCreatedAt: new Date(now.getTime() - 10 * DAY_MS) })
    expect(await queueDueWarmUps(db, now)).toBe(0)
    await db.update(promoAccounts).set({ redditCreatedAt: null })
    expect(await queueDueWarmUps(db, now)).toBe(0)
  })

  it("never warms a signed-out account, which would only be browsing as nobody", async () => {
    await db.update(promoAccounts).set({ handle: "" })
    expect(await queueDueWarmUps(db, now)).toBe(0)
  })

  it("labels an unlabelled profile Warming, and moves it to Ready when the warm-up ends", async () => {
    // The labels a person starts with are made when the dashboard first lists them.
    const warming = await labelNamed("Warming")
    await queueDueWarmUps(db, now)
    expect(await profileLabel()).toBe(warming)

    await db.update(promoAccounts).set({ redditCreatedAt: new Date(now.getTime() - 5 * DAY_MS) })
    await queueDueWarmUps(db, now)
    expect(await profileLabel()).toBe(await labelNamed("Ready"))
  })

  it("never touches a label a person chose", async () => {
    const banned = await labelNamed("Banned")
    await db.update(promoProfiles).set({ labelId: banned })
    await queueDueWarmUps(db, now)
    expect(await profileLabel()).toBe(banned)
  })

  it("joins the subreddits found most often, skipping blocked and joined ones, and remembers them", async () => {
    const keywordId = uuid()
    await db.insert(promoKeywords).values({ id: keywordId, userId, projectId: await createProject(userId, "A project", db), term: "a term" })
    const counts: Record<string, number> = { SaaS: 3, startups: 2, Entrepreneur: 4, smallbusiness: 1 }
    let index = 0
    for (const [subreddit, count] of Object.entries(counts)) {
      for (let made = 0; made < count; made += 1) {
        index += 1
        await db.insert(promoFinds).values({
          id: uuid(),
          userId,
          keywordId,
          redditId: `t3_${index}`,
          permalink: `/r/${subreddit}/comments/p${index}/`,
          subreddit,
        })
      }
    }
    await db.insert(promoBlockedSubreddits).values({ id: uuid(), userId, subreddit: "Entrepreneur" })
    await db.update(promoAccounts).set({ joinedSubreddits: ["saas"] })
    warmUpVisit.mockResolvedValue({
      feedSeconds: 300,
      postsOpened: 3,
      scrolls: 40,
      joined: ["startups"],
      alreadyJoined: ["smallbusiness"],
      problems: [],
    })
    const [row] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))

    // Two today, from the random draw.
    await runWarmUp(userId, row, { port: 1, token: "t" }, db, () => 0.9)

    expect(warmUpVisit).toHaveBeenCalledWith({ port: 1, token: "t" }, { subreddits: ["startups", "smallbusiness"] })
    const [saved] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
    expect([...saved.joinedSubreddits].sort()).toEqual(["saas", "smallbusiness", "startups"])
  })
})
