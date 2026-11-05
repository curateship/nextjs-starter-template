import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { refreshChannelUsuals } from "@/server/viral/outliers"
import { scoreVideos, type UnscoredVideo } from "@/server/viral/project-view"
import { createViralProject } from "@/server/viral/projects"
import { viralCreatorPosts, viralCreators, viralProjectKeywords, viralYoutubeUnitSpend } from "@/server/viral/schema"

/**
 * The Outlier figures (task part 12): a YouTube channel is read once a week
 * for at most 2 units, and a TikTok creator's usual comes from their listed
 * posts at no cost.
 */

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
})

afterEach(async () => {
  await client.close()
})

/** A YouTube whose channel has six uploads at about 10,000 views. */
function fakeYoutube() {
  const calls: string[] = []
  const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
    const address = new URL(String(url))
    calls.push(address.pathname)
    if (address.pathname.endsWith("/playlistItems")) {
      return Response.json({ items: ["a", "b", "c", "d", "e", "f"].map((videoId) => ({ contentDetails: { videoId } })) })
    }
    return Response.json({
      items: ["a", "b", "c", "d", "e", "f"].map((id, index) => ({
        id,
        snippet: { title: id, publishedAt: "2099-01-01T00:00:00Z" },
        contentDetails: { duration: "PT30S" },
        statistics: { viewCount: String(9_000 + index * 400), likeCount: "1", commentCount: "1" },
      })),
    })
  }) as unknown as typeof fetch
  return { fetchFn, calls }
}

function video(overrides: Partial<UnscoredVideo>): UnscoredVideo {
  return {
    platform: "youtube",
    platformVideoId: "hit",
    url: "https://www.youtube.com/shorts/hit",
    title: "Hit",
    channelId: "UCchef",
    channelName: "Chef",
    subscribers: 5_000,
    views: 400_000,
    likes: 100,
    comments: 10,
    postedAt: null,
    durationSeconds: 30,
    thumbnailUrl: null,
    keywords: [],
    isNew: false,
    topicMatch: null,
    source: "search",
    sample: false,
    ...overrides,
  }
}

describe("a YouTube channel's usual views", () => {
  it("is read once a week for 2 units, and gives the Outlier figure", async () => {
    const project = await createViralProject(user.id, { name: "P", description: "", keywords: [], folderId: null })
    const youtube = fakeYoutube()
    expect(await refreshChannelUsuals(user.id, project.id, ["UCchef", "UCchef"], "key", { fetchFn: youtube.fetchFn })).toBe(2)
    // The same search again within the week makes no second channel call.
    expect(await refreshChannelUsuals(user.id, project.id, ["UCchef"], "key", { fetchFn: youtube.fetchFn })).toBe(0)
    expect(youtube.calls).toHaveLength(2)
    const units = await database.select().from(viralYoutubeUnitSpend)
    expect(units.reduce((sum, row) => sum + row.units, 0)).toBe(2)

    // Eight days on, it is read again.
    const later = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)
    expect(await refreshChannelUsuals(user.id, project.id, ["UCchef"], "key", { fetchFn: youtube.fetchFn, at: later })).toBe(2)

    const [scored] = await scoreVideos(user.id, [video({})])
    expect(scored.outlier.typicalViews).toBe(10_000)
    expect(scored.outlier.times).toBe(40)
  })

  it("never takes the units a queued search was promised", async () => {
    const project = await createViralProject(user.id, { name: "P", description: "", socials: ["youtube"], keywords: ["meal prep"], folderId: null })
    await database.update(viralProjectKeywords).set({ status: "queued", queuedAt: now() }).where(eq(viralProjectKeywords.projectId, project.id))
    // 103 left: the queued search needs 102, so one channel read would take
    // the last unit it was promised.
    await database.insert(viralYoutubeUnitSpend).values({ id: uuid(), units: 9_897, reason: "viral_search", spentAt: now() })
    const youtube = fakeYoutube()
    expect(await refreshChannelUsuals(user.id, project.id, ["UCchef"], "key", { fetchFn: youtube.fetchFn })).toBe(0)
    expect(youtube.calls).toHaveLength(0)
  })

  it("leaves a channel id that isn't YouTube's alone", async () => {
    const project = await createViralProject(user.id, { name: "P", description: "", keywords: [], folderId: null })
    const youtube = fakeYoutube()
    expect(await refreshChannelUsuals(user.id, project.id, ["@chef"], "key", { fetchFn: youtube.fetchFn })).toBe(0)
    expect(youtube.calls).toHaveLength(0)
  })
})

describe("a TikTok creator's usual views", () => {
  it("comes from their listed posts, leaving out the video compared", async () => {
    const at = now()
    const creatorId = uuid()
    await database.insert(viralCreators).values({
      id: creatorId,
      ownerId: user.id,
      platform: "tiktok",
      handle: "chef",
      profileUrl: "https://www.tiktok.com/@chef",
      createdAt: at,
      updatedAt: at,
    })
    const views = [10_000, 10_000, 10_000, 10_000, 10_000, 400_000]
    await database.insert(viralCreatorPosts).values(
      views.map((count, index) => ({
        id: uuid(),
        ownerId: user.id,
        creatorId,
        platform: "tiktok",
        platformVideoId: index === 5 ? "hit" : `p${index}`,
        url: `https://www.tiktok.com/@chef/video/${index}`,
        views: count,
        firstSeenAt: at,
      }))
    )
    const [scored] = await scoreVideos(user.id, [video({ platform: "tiktok", channelId: "@chef", source: "creator" })])
    expect(scored.outlier.times).toBe(40)
  })
})
