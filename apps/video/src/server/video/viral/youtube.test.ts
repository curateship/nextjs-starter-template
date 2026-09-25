import { describe, expect, it } from "vitest"

import {
  parseIsoDuration,
  searchYoutubeShorts,
  type ViralSearchInput,
} from "@/server/video/viral/youtube"

/**
 * The free allowance is 10,000 units a day and one keyword must cost exactly
 * 102: the search (100), one batch of video numbers (1), one batch of channel
 * counts (1). A stray extra call here would quietly halve the day's searches.
 */

const INPUT: ViralSearchInput = { keyword: "home workouts", days: 30, minViews: 0 }

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status })
}

function searchItem(videoId: string) {
  return { id: { videoId } }
}

function videoItem(
  id: string,
  channelId: string,
  overrides: {
    duration?: string
    views?: string
    likes?: string
    comments?: string
  } = {}
) {
  return {
    id,
    snippet: {
      title: `Video ${id}`,
      channelId,
      channelTitle: `Channel ${channelId}`,
      publishedAt: "2026-09-20T00:00:00Z",
      thumbnails: { high: { url: `https://img/${id}.jpg` } },
    },
    contentDetails: { duration: overrides.duration ?? "PT1M30S" },
    statistics: {
      viewCount: overrides.views ?? "1000",
      likeCount: overrides.likes ?? "10",
      commentCount: overrides.comments ?? "5",
    },
  }
}

function channelItem(id: string, subscribers = "5000") {
  return { id, statistics: { subscriberCount: subscribers } }
}

/** A fetch that answers each resource once and writes down every call. */
function fakeYoutube(payloads: {
  search: unknown
  videos?: unknown
  channels?: unknown
}) {
  const calls: string[] = []
  const fetchFn = (async (url: RequestInfo | URL) => {
    const address = String(url)
    calls.push(address)
    if (address.includes("/search?")) return jsonResponse(payloads.search)
    if (address.includes("/videos?")) return jsonResponse(payloads.videos ?? {})
    return jsonResponse(payloads.channels ?? {})
  }) as typeof fetch
  return { calls, fetchFn }
}

describe("what one keyword costs", () => {
  it("makes exactly three calls: one search, one videos batch, one channels batch", async () => {
    const { calls, fetchFn } = fakeYoutube({
      search: { items: [searchItem("a"), searchItem("b")] },
      videos: { items: [videoItem("a", "c1"), videoItem("b", "c1")] },
      channels: { items: [channelItem("c1")] },
    })
    await searchYoutubeShorts(INPUT, "key", fetchFn)

    expect(calls).toHaveLength(3)
    expect(calls[0]).toContain("/search?")
    expect(calls[1]).toContain("/videos?")
    expect(calls[2]).toContain("/channels?")
    // 100 + 1 + 1 = 102 units.
  })

  it("stops after the search when nothing matches", async () => {
    const { calls, fetchFn } = fakeYoutube({ search: { items: [] } })
    const results = await searchYoutubeShorts(INPUT, "key", fetchFn)
    expect(results).toEqual([])
    expect(calls).toHaveLength(1)
  })

  it("batches both follow-up calls instead of asking per video", async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `v${i}`)
    const { calls, fetchFn } = fakeYoutube({
      search: { items: ids.map(searchItem) },
      videos: { items: ids.map((id) => videoItem(id, "c1")) },
      channels: { items: [channelItem("c1")] },
    })
    await searchYoutubeShorts(INPUT, "key", fetchFn)
    expect(calls).toHaveLength(3)
    expect(calls[1]).toContain(encodeURIComponent(ids.join(",")))
  })
})

describe("what comes back", () => {
  it("keeps only Shorts of 3 minutes or less, sorted by views", async () => {
    const { fetchFn } = fakeYoutube({
      search: { items: [searchItem("short"), searchItem("long"), searchItem("top")] },
      videos: {
        items: [
          videoItem("short", "c1", { views: "100" }),
          videoItem("long", "c1", { duration: "PT3M31S", views: "9999" }),
          videoItem("top", "c1", { views: "500" }),
        ],
      },
      channels: { items: [channelItem("c1")] },
    })
    const results = await searchYoutubeShorts(INPUT, "key", fetchFn)
    expect(results.map((one) => one.id)).toEqual(["top", "short"])
    expect(results[0].subscribers).toBe(5000)
  })

  it("drops videos under the minimum view count", async () => {
    const { fetchFn } = fakeYoutube({
      search: { items: [searchItem("big"), searchItem("small")] },
      videos: {
        items: [
          videoItem("big", "c1", { views: "50000" }),
          videoItem("small", "c1", { views: "40" }),
        ],
      },
      channels: { items: [channelItem("c1")] },
    })
    const results = await searchYoutubeShorts(
      { ...INPUT, minViews: 1000 },
      "key",
      fetchFn
    )
    expect(results.map((one) => one.id)).toEqual(["big"])
  })

  it("shows nothing rather than a wrong number when a channel hides its counts", async () => {
    const { fetchFn } = fakeYoutube({
      search: { items: [searchItem("a")] },
      videos: {
        items: [
          {
            ...videoItem("a", "c1"),
            statistics: { viewCount: "1000" },
          },
        ],
      },
      channels: {
        items: [
          { id: "c1", statistics: { hiddenSubscriberCount: true } },
        ],
      },
    })
    const [result] = await searchYoutubeShorts(INPUT, "key", fetchFn)
    expect(result.likes).toBeNull()
    expect(result.comments).toBeNull()
    expect(result.subscribers).toBeNull()
  })
})

describe("how it fails", () => {
  it("turns a used-up quota into YOUTUBE_QUOTA, never raw JSON", async () => {
    const fetchFn = (async () =>
      jsonResponse(
        {
          error: {
            code: 403,
            message: "The request cannot be completed...",
            errors: [{ reason: "quotaExceeded" }],
          },
        },
        403
      )) as typeof fetch
    await expect(searchYoutubeShorts(INPUT, "key", fetchFn)).rejects.toThrow(
      "YOUTUBE_QUOTA"
    )
  })

  it("passes any other refusal on as a sentence with YouTube's own reason", async () => {
    const fetchFn = (async () =>
      jsonResponse(
        {
          error: {
            code: 400,
            message: "API key not valid. Please pass a valid API key.",
            errors: [{ reason: "badRequest" }],
          },
        },
        400
      )) as typeof fetch
    await expect(searchYoutubeShorts(INPUT, "key", fetchFn)).rejects.toThrow(
      "YouTube said: API key not valid. Please pass a valid API key."
    )
  })

  it("never puts the key in the address", async () => {
    const { calls, fetchFn } = fakeYoutube({ search: { items: [] } })
    await searchYoutubeShorts(INPUT, "secret-key", fetchFn)
    expect(calls[0]).not.toContain("secret-key")
  })
})

describe("reading YouTube's durations", () => {
  it("adds hours, minutes and seconds", () => {
    expect(parseIsoDuration("PT2M41S")).toBe(161)
    expect(parseIsoDuration("PT1H")).toBe(3600)
    expect(parseIsoDuration("PT59S")).toBe(59)
  })

  it("refuses what is not a duration", () => {
    expect(parseIsoDuration(undefined)).toBeNull()
    expect(parseIsoDuration("tomorrow")).toBeNull()
  })
})
