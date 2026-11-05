import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { dailyRecheckTick, ringRecheckBell } from "@/server/viral/daily-checks"
import { createViralProject } from "@/server/viral/projects"
import {
  viralNotifiedVideos,
  viralProjectKeywords,
  viralProjectResults,
  viralProjects,
  viralYoutubeUnitSpend,
} from "@/server/viral/schema"

/**
 * The daily re-check (task part 8): off without the switch, never twice in a
 * day, never into the last 1,000 units, and one bell per project per run that
 * never names the same video twice.
 */

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  process.env.VIRAL_YOUTUBE_API_KEY = "test-key"
  process.env.VIRAL_WATCH_ENABLED = "1"
})

afterEach(async () => {
  delete process.env.VIRAL_YOUTUBE_API_KEY
  delete process.env.VIRAL_WATCH_ENABLED
  vi.restoreAllMocks()
  await client.close()
})

async function project(keywords = ["meal prep", "high protein lunch"], minScore = 0) {
  const made = await createViralProject(user.id, {
    name: "Meal prep",
    description: "",
    topic: "meal-prep course for busy dads",
    socials: ["youtube"],
    keywords,
    folderId: null,
  })
  await database.update(viralProjects).set({ minScore }).where(eq(viralProjects.id, made.id))
  return made
}

async function statuses(projectId: string) {
  const rows = await database.select().from(viralProjectKeywords).where(eq(viralProjectKeywords.projectId, projectId))
  return rows.map((row) => row.status).sort()
}

async function addNewResult(projectId: string, platformVideoId: string) {
  const [keyword] = await database.select().from(viralProjectKeywords).where(eq(viralProjectKeywords.projectId, projectId))
  await database.insert(viralProjectResults).values({
    id: uuid(),
    keywordId: keyword.id,
    projectId,
    platform: "youtube",
    platformVideoId,
    url: `https://www.youtube.com/shorts/${platformVideoId}`,
    title: `Video ${platformVideoId}`,
    channelId: "UCchannel",
    channelName: "Channel",
    subscribers: 1_000,
    views: 400_000,
    likes: 20_000,
    comments: 500,
    postedAt: new Date(Date.now() - 86_400_000),
    durationSeconds: 30,
    isNew: true,
    foundAt: now(),
  })
}

describe("queueing the daily re-check", () => {
  it("does nothing without VIRAL_WATCH_ENABLED", async () => {
    delete process.env.VIRAL_WATCH_ENABLED
    const made = await project()
    await dailyRecheckTick()
    expect(await statuses(made.id)).toEqual(["idle", "idle"])
  })

  it("queues a project's keywords once, and not again the same day", async () => {
    const made = await project()
    await dailyRecheckTick()
    expect(await statuses(made.id)).toEqual(["queued", "queued"])
    const [marked] = await database.select().from(viralProjects).where(eq(viralProjects.id, made.id))
    expect(marked.watchRunAt).not.toBeNull()

    // A tick in the middle of the run leaves the run alone and rings nothing.
    await dailyRecheckTick()
    const [still] = await database.select().from(viralProjects).where(eq(viralProjects.id, made.id))
    expect(still.watchRunAt).toEqual(marked.watchRunAt)
    expect(await database.select().from(customShellNotifications)).toHaveLength(0)

    // The run finishes: the keywords ran just now and the bell cleared the mark.
    await database.update(viralProjectKeywords).set({ status: "done", ranAt: now() })
    await ringRecheckBell(made.id)
    await dailyRecheckTick()
    expect(await statuses(made.id)).toEqual(["done", "done"])
  })

  it("leaves 1,000 of the day's units for searches somebody presses", async () => {
    const made = await project()
    // 8,900 used leaves 1,100; two keywords cost 204, which would dip under 1,000.
    await database.insert(viralYoutubeUnitSpend).values({ id: uuid(), units: 8_900, reason: "viral_search", spentAt: now() })
    await dailyRecheckTick()
    expect(await statuses(made.id)).toEqual(["idle", "idle"])
  })

  it("counts each keyword's Outlier reads in the reserve", async () => {
    const made = await project()
    // 8,750 used leaves 1,250. Two searches are 204, which would fit; with
    // up to 50 Outlier units each they are 304, which would not.
    await database.insert(viralYoutubeUnitSpend).values({ id: uuid(), units: 8_750, reason: "viral_search", spentAt: now() })
    await dailyRecheckTick()
    expect(await statuses(made.id)).toEqual(["idle", "idle"])
  })

  it("starts again for a project whose run lost its last keyword before it was searched", async () => {
    const made = await project()
    // A mark left behind: nothing of the run is waiting any more.
    await database.update(viralProjects).set({ watchRunAt: new Date(Date.now() - 2 * 86_400_000) }).where(eq(viralProjects.id, made.id))
    await dailyRecheckTick()
    expect(await statuses(made.id)).toEqual(["queued", "queued"])
  })

  it("is not crowded out by projects that paused YouTube", async () => {
    for (let index = 0; index < 13; index += 1) {
      const paused = await project([`paused ${index}`])
      await database.update(viralProjects).set({ pausedSocials: ["youtube"] }).where(eq(viralProjects.id, paused.id))
    }
    const made = await project(["meal prep"])
    await dailyRecheckTick()
    expect(await statuses(made.id)).toEqual(["queued"])
  })

  it("skips a project that paused YouTube, or has no YouTube", async () => {
    const made = await project()
    await database.update(viralProjects).set({ pausedSocials: ["youtube"] }).where(eq(viralProjects.id, made.id))
    await dailyRecheckTick()
    expect(await statuses(made.id)).toEqual(["idle", "idle"])
  })
})

describe("the bell", () => {
  async function notices() {
    return database.select().from(customShellNotifications).where(eq(customShellNotifications.recipientUserId, user.id))
  }

  it("rings once for the run, naming the new videos above the project's score", async () => {
    const made = await project(["meal prep"], 10)
    await database.update(viralProjects).set({ watchRunAt: now() }).where(eq(viralProjects.id, made.id))
    await addNewResult(made.id, "a")
    await addNewResult(made.id, "b")
    expect(await ringRecheckBell(made.id)).toBe(2)
    const [notice] = await notices()
    expect(notice.message).toBe("2 new videos above 10 in Meal prep")
    // The mark is cleared, so the end of a later manual search rings nothing.
    expect(await ringRecheckBell(made.id)).toBe(0)
    expect(await notices()).toHaveLength(1)
  })

  it("never names the same video twice, and rings nothing when nothing is new", async () => {
    const made = await project(["meal prep"])
    await addNewResult(made.id, "a")
    await database.update(viralProjects).set({ watchRunAt: now() }).where(eq(viralProjects.id, made.id))
    expect(await ringRecheckBell(made.id)).toBe(1)
    await database.update(viralProjects).set({ watchRunAt: now() }).where(eq(viralProjects.id, made.id))
    expect(await ringRecheckBell(made.id)).toBe(0)
    expect(await database.select().from(viralNotifiedVideos)).toHaveLength(1)
    expect(await notices()).toHaveLength(1)
  })

  it("does not ring for a search somebody pressed", async () => {
    const made = await project(["meal prep"])
    await addNewResult(made.id, "a")
    expect(await ringRecheckBell(made.id)).toBe(0)
    expect(await notices()).toHaveLength(0)
  })
})
