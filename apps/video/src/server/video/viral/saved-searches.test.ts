import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { videoViralResults, videoViralVideos } from "@/server/video/schema"
import {
  deleteOwnedViralSearches,
  getOwnedViralSearch,
  listOwnedViralSearches,
  runAndSaveViralSearch,
} from "@/server/video/viral/saved-searches"
import { type ViralSearchInput } from "@/server/video/viral/youtube"

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

const INPUT: ViralSearchInput = { keyword: "meal prep", days: 7, minViews: 0 }

/** A fetch whose search finds the given videos, all 90 seconds long. */
function fakeYoutube(videos: { id: string; views: number }[]) {
  return (async (url: RequestInfo | URL) => {
    const address = String(url)
    if (address.includes("/search?")) {
      return json({ items: videos.map((v) => ({ id: { videoId: v.id } })) })
    }
    if (address.includes("/videos?")) {
      return json({
        items: videos.map((v) => ({
          id: v.id,
          snippet: {
            title: `Video ${v.id}`,
            channelId: "c1",
            channelTitle: "Channel c1",
            publishedAt: "2026-09-20T00:00:00Z",
            thumbnails: { high: { url: `https://img/${v.id}.jpg` } },
          },
          contentDetails: { duration: "PT1M30S" },
          statistics: { viewCount: String(v.views), likeCount: "10" },
        })),
      })
    }
    return json({ items: [{ id: "c1", statistics: { subscriberCount: "5000" } }] })
  }) as typeof fetch
}

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200 })
}

describe("keeping every search", () => {
  it("saves the search with its results, and the list counts them", async () => {
    await runAndSaveViralSearch(
      user.id,
      INPUT,
      "key",
      fakeYoutube([{ id: "a", views: 100 }, { id: "b", views: 900 }]),
      database
    )
    const listed = await listOwnedViralSearches(user.id, database)
    expect(listed).toHaveLength(1)
    expect(listed[0].keyword).toBe("meal prep")
    expect(listed[0].platform).toBe("youtube")
    expect(listed[0].result_count).toBe(2)
    expect(listed[0].days).toBe(7)
  })

  it("opens a saved search with its results, most viewed first, spending nothing", async () => {
    const { search } = await runAndSaveViralSearch(
      user.id,
      INPUT,
      "key",
      fakeYoutube([{ id: "a", views: 100 }, { id: "b", views: 900 }]),
      database
    )
    const opened = await getOwnedViralSearch(user.id, search.id, database)
    expect(opened?.results.map((one) => one.id)).toEqual(["b", "a"])
    expect(opened?.results[0].url).toBe("https://www.youtube.com/shorts/b")
    expect(opened?.results[0].subscribers).toBe(5000)
  })

  it("scores every result on read, counting a breakdown only once it is ready and theirs", async () => {
    const stranger = await insertUser(database)
    const breakdown = {
      transcript: [{ startMs: 0, endMs: 1000, text: "Watch this" }],
      segments: [{ role: "hook", startMs: 0, endMs: 1000, summary: "Opens" }],
      scenes: [{ startMs: 0, endMs: 1000 }],
    }
    const at = now()
    const saved = (ownerId: string, videoId: string, status: string) => ({
      id: uuid(),
      ownerId,
      platform: "youtube",
      platformVideoId: videoId,
      sourceUrl: `https://www.youtube.com/shorts/${videoId}`,
      status,
      breakdown,
      createdAt: at,
      updatedAt: at,
    })
    await database
      .insert(videoViralVideos)
      .values([
        saved(user.id, "a", "ready"),
        saved(user.id, "b", "analysing"),
        saved(stranger.id, "c", "ready"),
      ])

    const fresh = await runAndSaveViralSearch(
      user.id,
      INPUT,
      "key",
      fakeYoutube([
        { id: "a", views: 100 },
        { id: "b", views: 900 },
        { id: "c", views: 500 },
      ]),
      database
    )
    const opened = await getOwnedViralSearch(user.id, fresh.search.id, database)

    for (const results of [fresh.results, opened?.results ?? []]) {
      const byId = new Map(results.map((one) => [one.id, one.score]))
      // Transcript, parts, scenes and a hook: 80 of the breakdown's 100.
      expect(byId.get("a")?.parts.structure).toBe(80)
      expect(byId.get("a")?.missing).not.toContain("Missing breakdown")
      // Still being broken down, and somebody else's: both count as missing.
      expect(byId.get("b")?.missing).toContain("Missing breakdown")
      expect(byId.get("c")?.parts.structure).toBe(0)
      expect(byId.get("c")?.missing).toContain("Missing breakdown")
    }
  })

  it("updates the old row when the same keyword runs again, even in another case", async () => {
    const first = await runAndSaveViralSearch(
      user.id,
      INPUT,
      "key",
      fakeYoutube([{ id: "a", views: 100 }]),
      database
    )
    const again = await runAndSaveViralSearch(
      user.id,
      { keyword: "Meal Prep", days: 30, minViews: 50 },
      "key",
      fakeYoutube([{ id: "b", views: 900 }]),
      database
    )
    expect(again.search.id).toBe(first.search.id)

    const listed = await listOwnedViralSearches(user.id, database)
    expect(listed).toHaveLength(1)
    expect(listed[0].keyword).toBe("Meal Prep")
    expect(listed[0].days).toBe(30)
    expect(listed[0].result_count).toBe(1)

    const opened = await getOwnedViralSearch(user.id, first.search.id, database)
    expect(opened?.results.map((one) => one.id)).toEqual(["b"])
  })

  it("saves nothing when the YouTube call fails", async () => {
    const failing = (async () => {
      throw new Error("boom")
    }) as unknown as typeof fetch
    await expect(
      runAndSaveViralSearch(user.id, INPUT, "key", failing, database)
    ).rejects.toThrow()
    expect(await listOwnedViralSearches(user.id, database)).toEqual([])
  })

  it("never shows or deletes somebody else's search", async () => {
    const { search } = await runAndSaveViralSearch(
      user.id,
      INPUT,
      "key",
      fakeYoutube([{ id: "a", views: 100 }]),
      database
    )
    const stranger = await insertUser(database)
    expect(await getOwnedViralSearch(stranger.id, search.id, database)).toBeNull()
    expect(
      await deleteOwnedViralSearches(stranger.id, [search.id], database)
    ).toEqual([])
    expect(await listOwnedViralSearches(user.id, database)).toHaveLength(1)
  })

  it("deleting a search takes its result rows with it", async () => {
    const { search } = await runAndSaveViralSearch(
      user.id,
      INPUT,
      "key",
      fakeYoutube([{ id: "a", views: 100 }, { id: "b", views: 900 }]),
      database
    )
    expect(await deleteOwnedViralSearches(user.id, [search.id], database)).toEqual([
      search.id,
    ])
    expect(await listOwnedViralSearches(user.id, database)).toEqual([])
    expect(await database.select().from(videoViralResults)).toEqual([])
  })
})
