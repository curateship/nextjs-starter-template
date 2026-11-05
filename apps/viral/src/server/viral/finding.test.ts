import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { loadVideoComments } from "@/server/viral/comments"
import { loadViralProjectScreen } from "@/server/viral/project-view"
import { createSampleViralProject, createViralProject } from "@/server/viral/projects"
import { findSameIdea, loadSameIdea } from "@/server/viral/same-idea"
import {
  viralChannelUsual,
  viralProjectKeywords,
  viralProjectResults,
  viralSameIdea,
  viralYoutubeUnitSpend,
} from "@/server/viral/schema"
import { markVideoSeen } from "@/server/viral/seen"
import { loadViralToday, searchEveryProject } from "@/server/viral/today"
import { recordViews } from "@/server/viral/view-history"

/**
 * Finding winners (task "Viral features", parts 2 to 9): Rising fast from the
 * daily views figures, the New mark cleared per person, the creator page's
 * figures, Today and its search across projects, Top comments, and "same
 * idea, other creators". YouTube and the AI are stubbed; nothing leaves the
 * machine.
 */

const asked = vi.hoisted(() => ({ calls: [] as { feature: string; prompt: string }[] }))

vi.mock("@/server/viral/writer", () => ({
  WRITER_MODEL: "gemini-3.8-flash",
  askWriter: async ({ feature, prompt, schema }: { feature: string; prompt: string; schema: { parse: (value: unknown) => unknown } }) => {
    asked.calls.push({ feature, prompt })
    return schema.parse({ line: "desk stretch for back pain" })
  },
}))

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  asked.calls = []
  process.env.VIRAL_YOUTUBE_API_KEY = "test-key"
})

afterEach(async () => {
  delete process.env.VIRAL_YOUTUBE_API_KEY
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await client.close()
})

async function project(name = "Meal prep") {
  return createViralProject(user.id, {
    name,
    description: "",
    topic: "meal-prep course for busy dads",
    socials: ["youtube"],
    keywords: ["meal prep"],
    folderId: null,
  })
}

async function addResult(
  projectId: string,
  platformVideoId: string,
  overrides: Partial<typeof viralProjectResults.$inferInsert> = {}
) {
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
    subscribers: 10_000,
    views: 80_000,
    likes: 100,
    comments: 10,
    postedAt: new Date(),
    durationSeconds: 30,
    thumbnailUrl: null,
    isNew: false,
    topicMatch: null,
    foundAt: new Date(),
    ...overrides,
  })
}

const DAY = 24 * 60 * 60 * 1000

describe("Rising fast", () => {
  it("shows a video that doubled since yesterday, and not one that didn't", async () => {
    const made = await project()
    await addResult(made.id, "doubled", { views: 80_000 })
    await addResult(made.id, "slower", { views: 79_000 })
    const today = new Date()
    await recordViews(
      [
        { platform: "youtube", platformVideoId: "doubled", views: 40_000 },
        { platform: "youtube", platformVideoId: "slower", views: 40_000 },
      ],
      new Date(today.getTime() - DAY)
    )
    await recordViews(
      [
        { platform: "youtube", platformVideoId: "doubled", views: 80_000 },
        { platform: "youtube", platformVideoId: "slower", views: 79_000 },
      ],
      today
    )
    const screen = await loadViralProjectScreen(user.id, made.id)
    const growth = Object.fromEntries(screen.videos.map((video) => [video.platformVideoId, video.growth]))
    expect(growth.doubled).toEqual({ times: 2, gained: 40_000 })
    expect(growth.slower.times).toBeLessThan(2)
  })

  it("keeps the higher of two readings on one day", async () => {
    const at = new Date()
    await recordViews([{ platform: "youtube", platformVideoId: "v", views: 900 }], at)
    await recordViews([{ platform: "youtube", platformVideoId: "v", views: 500 }], at)
    const rows = await client.query<{ views: string }>("select views from viral_view_history where platform_video_id = 'v'")
    expect(rows.rows.map((row) => Number(row.views))).toEqual([900])
  })
})

describe("the New mark", () => {
  it("clears for the person who opened the video, and only for them", async () => {
    const made = await project()
    await addResult(made.id, "fresh", { isNew: true })
    let [video] = (await loadViralProjectScreen(user.id, made.id)).videos
    expect([video.isNew, video.seen]).toEqual([true, false])

    await markVideoSeen(user.id, { platform: "youtube", platformVideoId: "fresh" })
    await markVideoSeen(user.id, { platform: "youtube", platformVideoId: "fresh" })
    ;[video] = (await loadViralProjectScreen(user.id, made.id)).videos
    expect(video.seen).toBe(true)

    const other = await insertUser(database)
    const rows = await client.query<{ n: number }>(
      `select count(*)::int as n from viral_seen_videos where user_id = '${other.id}'`
    )
    expect(rows.rows[0].n).toBe(0)
  })
})

describe("the creator page", () => {
  it("names the channel's typical views and how often it doubles them", async () => {
    const made = await project()
    await addResult(made.id, "hit", { views: 400_000 })
    await database.insert(viralChannelUsual).values({
      ownerId: user.id,
      platform: "youtube",
      channelId: "UCchannel",
      typicalViews: 10_000,
      sampleSize: 6,
      recentViews: { a: 10_000, b: 11_000, c: 9_000, d: 10_500, e: 9_500, f: 40_000 },
      workedOutAt: new Date(),
    })
    const screen = await loadViralProjectScreen(user.id, made.id)
    const creator = screen.creators.find((one) => one.key === "youtube:UCchannel")
    expect(creator?.typicalViews).toBe(10_250)
    expect(creator?.beatsUsual).toEqual({ hits: 1, of: 6 })
  })
})

describe("Today", () => {
  it("shows a project's new video until it is opened", async () => {
    const made = await project()
    await addResult(made.id, "overnight", { isNew: true })
    await addResult(made.id, "old")
    let today = await loadViralToday(user.id)
    expect(today.projects[0].videos.map((video) => video.platformVideoId)).toEqual(["overnight"])

    await markVideoSeen(user.id, { platform: "youtube", platformVideoId: "overnight" })
    today = await loadViralToday(user.id)
    expect(today.projects[0].videos).toEqual([])
  })

  it("searches every project's titles and channels, and takes % as itself", async () => {
    const first = await project("Meal prep")
    const second = await project("Lunch")
    await addResult(first.id, "a", { title: "High protein lunch" })
    await addResult(second.id, "b", { title: "Lunch in 5 minutes" })
    await addResult(second.id, "c", { title: "100% chicken" })

    const hits = await searchEveryProject(user.id, "lunch")
    expect(hits.map((hit) => [hit.projectName, hit.key]).sort()).toEqual([
      ["Lunch", "youtube:b"],
      ["Meal prep", "youtube:a"],
    ])
    expect((await searchEveryProject(user.id, "%")).map((hit) => hit.key)).toEqual(["youtube:c"])

    const stranger = await insertUser(database)
    expect(await searchEveryProject(stranger.id, "lunch")).toEqual([])
  })
})

describe("Top comments", () => {
  it("says TikTok can't share them and asks nothing", async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    const answer = await loadVideoComments({ platform: "tiktok", platformVideoId: "1", sample: false })
    expect(answer.state).toBe("unavailable")
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("reads a YouTube video's 20 most-liked comments once a day, for 1 unit", async () => {
    const fetchSpy = vi.fn(async () =>
      Response.json({
        items: [
          { snippet: { topLevelComment: { snippet: { authorDisplayName: "A", textDisplay: "Less liked", likeCount: 3 } } } },
          { snippet: { topLevelComment: { snippet: { authorDisplayName: "B", textDisplay: "Most liked", likeCount: 90 } } } },
        ],
      })
    )
    vi.stubGlobal("fetch", fetchSpy)
    const first = await loadVideoComments({ platform: "youtube", platformVideoId: "yt1", sample: false })
    const again = await loadVideoComments({ platform: "youtube", platformVideoId: "yt1", sample: false })
    expect(first.state === "ready" && first.comments.map((one) => one.text)).toEqual(["Most liked", "Less liked"])
    expect(again).toEqual(first)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const spent = await database.select().from(viralYoutubeUnitSpend)
    expect(spent.map((row) => [row.units, row.reason])).toEqual([[1, "viral_comments"]])
  })

  it("says so when comments are switched off", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { errors: [{ reason: "commentsDisabled" }], message: "off" } }, { status: 403 }))
    )
    expect(await loadVideoComments({ platform: "youtube", platformVideoId: "yt2", sample: false })).toEqual({ state: "disabled" })
  })
})

describe("same idea, other creators", () => {
  function youtubeStub() {
    return vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes("/search?")) {
        return Response.json({ items: [{ id: { videoId: "theirs" } }, { id: { videoId: "mine-again" } }] })
      }
      if (url.includes("/videos?")) {
        return Response.json({
          items: [
            {
              id: "theirs",
              snippet: { channelId: "UCother", channelTitle: "Other", title: "Their version", publishedAt: "2099-01-01T00:00:00Z" },
              contentDetails: { duration: "PT30S" },
              statistics: { viewCount: "500000" },
            },
            {
              id: "mine-again",
              snippet: { channelId: "UCchannel", channelTitle: "Channel", title: "Original's channel", publishedAt: "2099-01-01T00:00:00Z" },
              contentDetails: { duration: "PT30S" },
              statistics: { viewCount: "9000" },
            },
          ],
        })
      }
      if (url.includes("/channels?")) return Response.json({ items: [] })
      return Response.json({ items: [] })
    })
  }

  it("asks the AI for one search line, leaves out the original's channel, and keeps the answer", async () => {
    const made = await project()
    await addResult(made.id, "orig", { title: "The 30 second stretch that fixed my back" })
    const fetchFn = youtubeStub()

    const found = await findSameIdea(user.id, made.id, { platform: "youtube", platformVideoId: "orig" }, fetchFn as unknown as typeof fetch)
    expect(asked.calls.map((call) => call.feature)).toEqual(["viral_same_idea"])
    expect(asked.calls[0].prompt).toContain("The 30 second stretch that fixed my back")
    expect(found.searchLine).toBe("desk stretch for back pain")
    expect(found.videos.map((video) => video.platformVideoId)).toEqual(["theirs"])

    const kept = await loadSameIdea(user.id, made.id, { platform: "youtube", platformVideoId: "orig" })
    expect(kept?.videos.map((video) => video.platformVideoId)).toEqual(["theirs"])
    const spent = await database.select().from(viralYoutubeUnitSpend)
    expect(spent.some((row) => row.reason === "viral_same_idea")).toBe(true)
  })

  it("refuses a sample project and another person's project", async () => {
    const sample = await createSampleViralProject(user.id)
    await expect(findSameIdea(user.id, sample.id, { platform: "youtube", platformVideoId: "sample-1" })).rejects.toThrow(/sample/)
    const made = await project()
    const stranger = await insertUser(database)
    await expect(findSameIdea(stranger.id, made.id, { platform: "youtube", platformVideoId: "x" })).rejects.toThrow()
    expect(await database.select().from(viralSameIdea)).toEqual([])
  })
})
