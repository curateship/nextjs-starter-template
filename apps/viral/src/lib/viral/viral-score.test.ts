import { describe, expect, it } from "vitest"

import { scoreViralVideo, type ViralScoreInput } from "./viral-score"

const now = new Date("2026-10-09T12:00:00Z")

function score(input: Omit<ViralScoreInput, "now">) {
  return scoreViralVideo({ ...input, now })
}

/**
 * The three examples were worked by hand, and the old app's
 * `scoreViralVideoTrend` gives the same answers for the same input.
 */
describe("scoreViralVideo, worked examples", () => {
  it("a big Short from a small channel, four days old, not broken down", () => {
    // 1,200,000 views over 4 days is 300,000 a day: past 200,000, so all 30.
    // 1,200,000 / 40,000 followers = 30 times: log 31 / log 51 = 87.3 → 21.8.
    // (90,000 + 3,000) / 1,200,000 = 0.0775 per view → 77.5 → 15.5.
    // 4 days old → 85 → 12.75. No breakdown → 0. Total 80.08 → 80.
    expect(
      score({
        views: 1_200_000,
        likes: 90_000,
        comments: 3_000,
        postedAt: "2026-10-05T12:00:00Z",
        followers: 40_000,
        breakdown: null,
      })
    ).toEqual({
      score: 80,
      confidence: "medium",
      viewsPerDay: 300_000,
      audienceLift: 30,
      engagementRate: 0.0775,
      parts: {
        velocity: 100,
        audienceLift: 87,
        engagement: 77,
        freshness: 85,
        structure: 0,
      },
      points: {
        velocity: 30,
        audienceLift: 21.8,
        engagement: 15.5,
        freshness: 12.8,
        structure: 0,
      },
      missing: ["Missing breakdown"],
    })
  })

  it("a slow Short, fifty days old, from a channel under the 1,000 floor", () => {
    // 8,000 views over 50 days is 160 a day: log 161 / log 200,001 = 42.
    // 500 followers count as 1,000, so 8 times: log 9 / log 51 = 56.
    // 215 / 8,000 = 0.0269 → 27. 50 days → 20. Total 35.
    const result = score({
      views: 8_000,
      likes: 200,
      comments: 15,
      postedAt: "2026-08-20T12:00:00Z",
      followers: 500,
      breakdown: null,
    })
    expect(result.score).toBe(35)
    expect(result.audienceLift).toBe(8)
    expect(result.parts).toEqual({
      velocity: 42,
      audienceLift: 56,
      engagement: 27,
      freshness: 20,
      structure: 0,
    })
  })

  it("a broken-down Short a day old, with a hook but no ask", () => {
    // Breakdown: transcript, parts, scenes and a hook are 20 each; no ask or
    // proof, so 80 → 8 points. Everything is there, so "high".
    const result = score({
      views: 300_000,
      likes: 25_000,
      comments: 1_200,
      postedAt: "2026-10-08T12:00:00Z",
      followers: 120_000,
      breakdown: {
        transcript: [{ startMs: 0, endMs: 2000, text: "Stop scrolling" }],
        segments: [
          { role: "hook", startMs: 0, endMs: 2000, summary: "A dare" },
          { role: "solution", startMs: 2000, endMs: 9000, summary: "The fix" },
        ],
        scenes: [{ startMs: 0, endMs: 9000 }],
      },
    })
    expect(result.score).toBe(78)
    expect(result.confidence).toBe("high")
    expect(result.parts.structure).toBe(80)
    expect(result.missing).toEqual([])
  })
})

describe("scoreViralVideo, missing numbers", () => {
  it("scores the breakdown 0 and names it when there is none", () => {
    const result = score({
      views: 10_000,
      likes: 500,
      comments: 20,
      postedAt: "2026-10-01T12:00:00Z",
      followers: 5_000,
      breakdown: null,
    })
    expect(result.parts.structure).toBe(0)
    expect(result.missing).toEqual(["Missing breakdown"])
    // Only the breakdown missing costs 25 of 100 sureness points: medium.
    expect(result.confidence).toBe("medium")
  })

  it("is low when the followers and the breakdown are both missing", () => {
    const result = score({
      views: 10_000,
      likes: 500,
      comments: 20,
      postedAt: "2026-10-01T12:00:00Z",
      followers: null,
      breakdown: null,
    })
    expect(result.confidence).toBe("low")
    expect(result.missing).toEqual([
      "Missing follower count",
      "Missing breakdown",
    ])
  })

  it("treats hidden likes and comments as missing, not as zero", () => {
    const result = score({
      views: 10_000,
      likes: null,
      comments: null,
      postedAt: "2026-10-01T12:00:00Z",
      followers: 5_000,
      breakdown: null,
    })
    expect(result.engagementRate).toBeNull()
    expect(result.parts.engagement).toBe(0)
    expect(result.missing).toContain("Missing likes")
  })

  it("never scores a bad date, a negative count or no views", () => {
    const result = score({
      views: 0,
      likes: -4,
      comments: Number.NaN,
      postedAt: "not a date",
      followers: 5_000,
      breakdown: null,
    })
    expect(result.score).toBe(0)
    expect(result.viewsPerDay).toBeNull()
    expect(result.confidence).toBe("low")
    expect(result.missing).toEqual([
      "Missing post date",
      "No views",
      "Missing likes",
      "Missing comments",
      "Missing breakdown",
    ])
  })

  it("counts a video posted an hour ago as a day old", () => {
    const result = score({
      views: 5_000,
      likes: 0,
      comments: 0,
      postedAt: "2026-10-09T11:00:00Z",
      followers: 1_000,
      breakdown: null,
    })
    expect(result.viewsPerDay).toBe(5_000)
    expect(result.parts.freshness).toBe(100)
  })

  it("moves as the video ages, because it is worked out on every read", () => {
    const input = {
      views: 50_000,
      likes: 2_000,
      comments: 100,
      postedAt: "2026-10-01T12:00:00Z",
      followers: 10_000,
      breakdown: null,
    }
    const today = scoreViralVideo({ ...input, now })
    const nextMonth = scoreViralVideo({
      ...input,
      now: new Date("2026-11-09T12:00:00Z"),
    })
    expect(nextMonth.score).toBeLessThan(today.score)
  })
})
