import { describe, expect, it } from "vitest"

import { postsPerWeek, typical, type ViralCreator, type ViralVideo } from "./viral"
import { scoreViralVideo } from "./viral-score"
import { filterCreators, filterVideos, formatShortDay, sortVideos } from "./viral-view"

const NOW = new Date("2099-01-30T00:00:00Z")

function video(id: string, overrides: Partial<ViralVideo> = {}): ViralVideo {
  const base = {
    views: 10_000,
    likes: 500,
    comments: 20,
    postedAt: "2099-01-28T00:00:00Z",
    subscribers: 5_000,
  }
  const merged = { ...base, ...overrides }
  return {
    key: `youtube:${id}`,
    platform: "youtube",
    platformVideoId: id,
    url: `https://www.youtube.com/shorts/${id}`,
    title: `Video ${id}`,
    channelId: "UCchannel",
    channelName: "Channel",
    durationSeconds: 30,
    thumbnailUrl: null,
    keywords: ["gym tips"],
    isNew: false,
    topicMatch: null,
    source: "search",
    sample: false,
    savedVideoId: null,
    savedStatus: null,
    hook: null,
    ...merged,
    score: scoreViralVideo({
      views: merged.views,
      likes: merged.likes,
      comments: merged.comments,
      postedAt: merged.postedAt,
      followers: merged.subscribers,
      breakdown: null,
      now: NOW,
    }),
  }
}

const NO_FILTER = { minViews: 0, minScore: 0, source: "both" as const, keyword: null, text: "", minFit: 0 }

describe("the middle panel's filters", () => {
  it("applies the project's minimum views and score without asking anybody", () => {
    const videos = [video("small", { views: 50 }), video("big", { views: 900_000 })]
    expect(filterVideos(videos, { ...NO_FILTER, minViews: 1_000 }).map((one) => one.platformVideoId)).toEqual(["big"])
    const best = Math.max(...videos.map((one) => one.score.score))
    expect(filterVideos(videos, { ...NO_FILTER, minScore: best }).map((one) => one.platformVideoId)).toEqual(["big"])
  })

  it("narrows to one keyword, one source and words in the title or channel", () => {
    const videos = [
      video("a", { keywords: ["gym tips"] }),
      video("b", { keywords: ["home workout"], channelName: "Desk Fit" }),
      video("c", { keywords: [], source: "creator" }),
      video("d", { keywords: [], source: "link" }),
    ]
    expect(filterVideos(videos, { ...NO_FILTER, keyword: "home workout" }).map((one) => one.platformVideoId)).toEqual(["b"])
    expect(filterVideos(videos, { ...NO_FILTER, source: "creators" }).map((one) => one.platformVideoId)).toEqual(["c"])
    expect(filterVideos(videos, { ...NO_FILTER, source: "links" }).map((one) => one.platformVideoId)).toEqual(["d"])
    expect(filterVideos(videos, { ...NO_FILTER, source: "search" })).toHaveLength(2)
    expect(filterVideos(videos, NO_FILTER)).toHaveLength(4)
    expect(filterVideos(videos, { ...NO_FILTER, text: "desk fit" }).map((one) => one.platformVideoId)).toEqual(["b"])
  })

  it("hides off-topic videos but keeps the ones the AI has not judged", () => {
    const videos = [video("on", { topicMatch: 90 }), video("off", { topicMatch: 10 }), video("unknown")]
    expect(filterVideos(videos, { ...NO_FILTER, minFit: 40 }).map((one) => one.platformVideoId)).toEqual(["on", "unknown"])
  })
})

describe("sorting", () => {
  it("sorts by score by default, highest first", () => {
    const videos = [video("low", { views: 100 }), video("high", { views: 2_000_000 })]
    expect(sortVideos(videos, "score", "desc").map((one) => one.platformVideoId)).toEqual(["high", "low"])
  })

  it("sorts by newest and by how well they fit", () => {
    const videos = [
      video("old", { postedAt: "2099-01-01T00:00:00Z", topicMatch: 90 }),
      video("new", { postedAt: "2099-01-29T00:00:00Z", topicMatch: 20 }),
    ]
    expect(sortVideos(videos, "newest", "desc")[0].platformVideoId).toBe("new")
    expect(sortVideos(videos, "topic", "desc")[0].platformVideoId).toBe("old")
    expect(sortVideos(videos, "newest", "asc")[0].platformVideoId).toBe("old")
  })
})

describe("creators", () => {
  const creator = (name: string, subscribers: number | null): ViralCreator => ({
    key: `youtube:${name}`,
    platform: "youtube",
    channelId: name,
    name,
    handle: null,
    subscribers,
    hits: 1,
    typicalScore: 50,
    followedId: null,
    watch: null,
    lastCheckedAt: null,
    avatarUrl: null,
    profileUrl: "",
    postsPerWeek: null,
  })

  it("keeps only creators inside the subscriber range", () => {
    const list = [creator("tiny", 900), creator("mid", 40_000), creator("huge", 3_000_000), creator("hidden", null)]
    expect(filterCreators(list, { min: 10_000, max: 500_000 }, "").map((one) => one.name)).toEqual(["mid"])
    expect(filterCreators(list, { min: null, max: null }, "")).toHaveLength(4)
  })
})

describe("the figures", () => {
  it("works out the typical number as the middle one", () => {
    expect(typical([5, 1, 9])).toBe(5)
    expect(typical([1, 2, 3, 4])).toBe(3)
    expect(typical([])).toBeNull()
  })

  it("counts videos a week over the last four weeks, or says too few", () => {
    const days = (count: number) => new Date(NOW.getTime() - count * 86_400_000).toISOString()
    expect(postsPerWeek([days(1), days(5)], NOW)).toBeNull()
    expect(postsPerWeek([days(1), days(8), days(15), days(22), days(60)], NOW)).toBe(1)
  })
})

describe("formatShortDay", () => {
  const now = new Date("2026-10-20T12:00:00Z")
  it("leaves the year off this year's days and keeps it on others", () => {
    expect(formatShortDay("2026-10-15T12:00:00Z", now)).toBe("Oct 15")
    expect(formatShortDay("2025-12-30T12:00:00Z", now)).toBe("Dec 30, 2025")
    expect(formatShortDay(null, now)).toBe("—")
  })
})
