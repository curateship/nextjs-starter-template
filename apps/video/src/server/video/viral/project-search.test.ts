import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  videoViralProjectKeywords,
  videoViralProjectResults,
  videoViralProjects,
  videoYoutubeUnitSpend,
} from "@/server/video/schema"
import {
  queueViralSearch,
  viralSearchTick,
} from "@/server/video/viral/project-search"
import {
  addViralKeyword,
  createSampleViralProject,
  createViralProject,
} from "@/server/video/viral/projects"
import { loadViralProjectScreen } from "@/server/video/viral/project-view"
import { pacificMidnight } from "@/server/video/viral/youtube-units"

// The topic match asks an AI; these tests are about searching, so it answers
// nothing and costs nothing.
vi.mock("@/server/video/viral/topic-match", () => ({
  matchTopics: async () => 0,
}))

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  process.env.VIDEO_YOUTUBE_API_KEY = "test-key"
})

afterEach(async () => {
  vi.unstubAllGlobals()
  delete process.env.VIDEO_YOUTUBE_API_KEY
  await client.close()
})

async function newProject(keywords: string[]) {
  return createViralProject(user.id, {
    name: "Gym tips",
    description: "",
    keywords,
    folderId: null,
  })
}

/**
 * A YouTube that answers each keyword with the videos listed for it, and
 * fails any keyword listed in `failing`. Every call is written down.
 */
function fakeYoutube(
  byKeyword: Record<string, string[]>,
  failing: string[] = []
) {
  const calls: string[] = []
  let lastIds: string[] = []
  const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
    const address = new URL(String(url))
    calls.push(address.pathname)
    if (address.pathname.endsWith("/search")) {
      const keyword = address.searchParams.get("q") ?? ""
      if (failing.includes(keyword)) {
        return new Response(
          JSON.stringify({ error: { message: "Backend Error", errors: [{ reason: "backendError" }] } }),
          { status: 500 }
        )
      }
      lastIds = byKeyword[keyword] ?? []
      return Response.json({ items: lastIds.map((videoId) => ({ id: { videoId } })) })
    }
    if (address.pathname.endsWith("/videos")) {
      return Response.json({
        items: lastIds.map((id) => ({
          id,
          snippet: {
            title: `Video ${id}`,
            channelId: "UCchannel",
            channelTitle: "Channel",
            publishedAt: new Date(Date.now() - 86_400_000).toISOString(),
            thumbnails: { high: { url: `https://img.example/${id}.jpg` } },
          },
          contentDetails: { duration: "PT45S" },
          statistics: { viewCount: "10000", likeCount: "500", commentCount: "20" },
        })),
      })
    }
    return Response.json({
      items: [{ id: "UCchannel", statistics: { subscriberCount: "2000" } }],
    })
  })
  vi.stubGlobal("fetch", fetchFn)
  return { calls }
}

async function unitsSpent() {
  const rows = await database.select().from(videoYoutubeUnitSpend)
  return rows.reduce((sum, row) => sum + row.units, 0)
}

describe("queueing a search", () => {
  it("prices five keywords at 510 units and queues them all", async () => {
    const project = await newProject(["a", "b", "c", "d", "e"])
    const queued = await queueViralSearch(user.id, project.id)
    expect(queued).toEqual({ queued: 5, units: 510 })
    const keywords = await database.select().from(videoViralProjectKeywords)
    expect(keywords.every((keyword) => keyword.status === "queued")).toBe(true)
  })

  it("prices both lengths at 204 units a keyword", async () => {
    const project = await newProject(["a"])
    await database
      .update(videoViralProjects)
      .set({ videoLength: "both" })
      .where(eq(videoViralProjects.id, project.id))
    expect((await queueViralSearch(user.id, project.id)).units).toBe(204)
  })

  it("starts nothing when today's allowance cannot cover the whole run", async () => {
    // 9,700 spent leaves 300: room for 2 of 5 keywords.
    await database.insert(videoYoutubeUnitSpend).values({
      id: uuid(),
      units: 9_700,
      reason: "viral_search",
      spentAt: now(),
    })
    const project = await newProject(["a", "b", "c", "d", "e"])
    await expect(queueViralSearch(user.id, project.id)).rejects.toThrow(
      "room for 2 of these 5 keywords"
    )
    const keywords = await database.select().from(videoViralProjectKeywords)
    expect(keywords.every((keyword) => keyword.status === "idle")).toBe(true)
  })

  it("counts units spent before today's midnight Pacific as yesterday's", async () => {
    await database.insert(videoYoutubeUnitSpend).values({
      id: uuid(),
      units: 10_000,
      reason: "viral_search",
      spentAt: new Date(pacificMidnight(new Date()).getTime() - 60_000),
    })
    const project = await newProject(["a"])
    await expect(queueViralSearch(user.id, project.id)).resolves.toEqual({
      queued: 1,
      units: 102,
    })
  })

  it("counts keywords already waiting elsewhere against the allowance", async () => {
    await database.insert(videoYoutubeUnitSpend).values({
      id: uuid(),
      units: 9_800,
      reason: "viral_search",
      spentAt: now(),
    })
    const first = await newProject(["a"])
    await queueViralSearch(user.id, first.id)
    const second = await newProject(["b"])
    // 200 left, and 102 already promised to the first project.
    await expect(queueViralSearch(user.id, second.id)).rejects.toThrow(
      "allowance is used up"
    )
  })

  it("refuses a sample project and a missing key", async () => {
    const sample = await createSampleViralProject(user.id)
    await expect(queueViralSearch(user.id, sample.id)).rejects.toThrow("sample")
    delete process.env.VIDEO_YOUTUBE_API_KEY
    const project = await newProject(["a"])
    await expect(queueViralSearch(user.id, project.id)).rejects.toThrow(
      "needs the YouTube key"
    )
  })
})

describe("the worker", () => {
  it("searches each keyword, writes its results and counts 102 units each", async () => {
    const { calls } = fakeYoutube({ "gym tips": ["v1", "v2"], "home workout": ["v2", "v3"] })
    const project = await newProject(["gym tips", "home workout"])
    await queueViralSearch(user.id, project.id)
    await viralSearchTick()

    expect(calls).toHaveLength(6)
    expect(await unitsSpent()).toBe(204)
    const screen = await loadViralProjectScreen(user.id, project.id)
    expect(screen.videos.map((video) => video.platformVideoId).sort()).toEqual(["v1", "v2", "v3"])
    expect(screen.keywords.every((keyword) => keyword.status === "done")).toBe(true)
    expect(screen.project.units_spent).toBe(204)
    expect(screen.project.cover_url).toMatch(/^https:\/\/img\.example\//)
    // The first search of a project has nothing to be new against.
    expect(screen.videos.some((video) => video.isNew)).toBe(false)
  })

  it("marks only the videos that were not there last time as new", async () => {
    fakeYoutube({ "gym tips": ["v1", "v2"] })
    const project = await newProject(["gym tips"])
    await queueViralSearch(user.id, project.id)
    await viralSearchTick()

    fakeYoutube({ "gym tips": ["v2", "v9"] })
    await queueViralSearch(user.id, project.id)
    await viralSearchTick()

    const screen = await loadViralProjectScreen(user.id, project.id)
    const newOnes = screen.videos.filter((video) => video.isNew)
    expect(newOnes.map((video) => video.platformVideoId)).toEqual(["v9"])
    expect(screen.keywords[0].new_count).toBe(1)

    // The badge clears on the next search, not on a reload.
    fakeYoutube({ "gym tips": ["v2", "v9"] })
    await queueViralSearch(user.id, project.id)
    await viralSearchTick()
    const again = await loadViralProjectScreen(user.id, project.id)
    expect(again.videos.some((video) => video.isNew)).toBe(false)
  })

  it("marks a keyword added later as finding new videos for the project", async () => {
    fakeYoutube({ a: ["v1"], b: ["v1", "v2"] })
    const project = await newProject(["a"])
    await queueViralSearch(user.id, project.id)
    await viralSearchTick()

    const keywordId = await addViralKeyword(user.id, project.id, "b")
    await queueViralSearch(user.id, project.id, [keywordId])
    await viralSearchTick()
    const screen = await loadViralProjectScreen(user.id, project.id)
    expect(screen.videos.filter((video) => video.isNew).map((video) => video.platformVideoId)).toEqual(["v2"])
    // Searching one keyword spends for that keyword only.
    expect(await unitsSpent()).toBe(204)
  })

  it("keeps a title's topic match when the keyword is searched again", async () => {
    fakeYoutube({ a: ["v1", "v2"] })
    const project = await newProject(["a"])
    await queueViralSearch(user.id, project.id)
    await viralSearchTick()
    await database
      .update(videoViralProjectResults)
      .set({ topicMatch: 88 })
      .where(eq(videoViralProjectResults.platformVideoId, "v1"))

    fakeYoutube({ a: ["v1", "v3"] })
    await queueViralSearch(user.id, project.id)
    await viralSearchTick()
    const rows = await database.select().from(videoViralProjectResults)
    expect(Object.fromEntries(rows.map((row) => [row.platformVideoId, row.topicMatch]))).toEqual({
      v1: 88,
      v3: null,
    })
  })

  it("marks nothing new when the first search failed and the retry is the first to find anything", async () => {
    fakeYoutube({}, ["a"])
    const project = await newProject(["a"])
    await queueViralSearch(user.id, project.id)
    await viralSearchTick()

    fakeYoutube({ a: ["v1", "v2"] })
    await queueViralSearch(user.id, project.id)
    await viralSearchTick()
    const screen = await loadViralProjectScreen(user.id, project.id)
    expect(screen.videos).toHaveLength(2)
    expect(screen.videos.some((video) => video.isNew)).toBe(false)
  })

  it("keeps the other keywords' results when one keyword fails", async () => {
    fakeYoutube({ a: ["v1"], c: ["v3"] }, ["b"])
    const project = await newProject(["a", "b", "c"])
    await queueViralSearch(user.id, project.id)
    await viralSearchTick()

    const screen = await loadViralProjectScreen(user.id, project.id)
    const statuses = Object.fromEntries(
      screen.keywords.map((keyword) => [keyword.keyword, keyword.status])
    )
    expect(statuses).toEqual({ a: "done", b: "failed", c: "done" })
    expect(screen.keywords.find((keyword) => keyword.keyword === "b")?.error).toBe(
      "YouTube said: Backend Error"
    )
    expect(screen.videos.map((video) => video.platformVideoId).sort()).toEqual(["v1", "v3"])
  })

  it("keeps a keyword's old results when its search again fails", async () => {
    fakeYoutube({ a: ["v1"] })
    const project = await newProject(["a"])
    await queueViralSearch(user.id, project.id)
    await viralSearchTick()

    fakeYoutube({}, ["a"])
    await queueViralSearch(user.id, project.id)
    await viralSearchTick()
    expect(await database.select().from(videoViralProjectResults)).toHaveLength(1)
  })

  it("puts a keyword back in the queue when its worker went away", async () => {
    const project = await newProject(["a"])
    await database
      .update(videoViralProjectKeywords)
      .set({
        status: "searching",
        leaseToken: uuid(),
        leaseExpiresAt: new Date(Date.now() - 1000),
      })
      .where(eq(videoViralProjectKeywords.projectId, project.id))
    fakeYoutube({ a: ["v1"] })
    await viralSearchTick()
    const [keyword] = await database.select().from(videoViralProjectKeywords)
    expect(keyword.status).toBe("done")
  })
})
