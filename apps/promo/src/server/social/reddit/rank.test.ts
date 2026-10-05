import { describe, expect, it } from "vitest"

import {
  FIT_BAND_LABELS,
  fitBand,
  freshnessWeight,
  rankFind,
  rankReason,
  relevanceWeight,
  replyRoomWeight,
} from "./rank"

// A fixed now, so these never start failing on a particular Tuesday.
const NOW = new Date("2099-06-01T12:00:00.000Z")

function hoursAgo(hours: number) {
  return new Date(NOW.getTime() - hours * 3_600_000)
}

describe("how worth commenting a post is", () => {
  it("scores the two worked examples from the doc", () => {
    // Reddit's fourth result, posted today, 5 replies: 1/1.3 * 0.6 * 3/8 * 10
    expect(
      rankFind({ position: 3, commentCount: 5, postedAt: hoursAgo(10) }, NOW)
    ).toBe(1.7308)

    // Reddit's second result, three weeks old, 400 replies: 1/1.1 * 0.1 * 3/403 * 10
    expect(
      rankFind({ position: 1, commentCount: 400, postedAt: hoursAgo(500) }, NOW)
    ).toBe(0.0068)
  })

  it("puts the fresh quiet post 255 times above the old buried one", () => {
    const fresh = rankFind(
      { position: 3, commentCount: 5, postedAt: hoursAgo(10) },
      NOW
    )
    const buried = rankFind(
      { position: 1, commentCount: 400, postedAt: hoursAgo(500) },
      NOW
    )
    expect(Math.round(fresh / buried)).toBe(255)
  })

  it("no longer lets a popular off-topic post win", () => {
    // The failure this ranking was rewritten for. A horror story Reddit
    // listed third, 28 replies and a week old, against the r/SaaS post Reddit
    // listed fifteenth with 5 replies, posted this week. The second one is the
    // one worth answering and it now wins.
    const horrorStory = rankFind(
      { position: 2, commentCount: 28, postedAt: hoursAgo(200) },
      NOW
    )
    const worthAnswering = rankFind(
      { position: 14, commentCount: 5, postedAt: hoursAgo(50) },
      NOW
    )
    expect(worthAnswering).toBeGreaterThan(horrorStory)
    // And by a margin worth seeing, not a rounding difference.
    expect(worthAnswering / horrorStory).toBeGreaterThan(5)
  })

  it("prefers the quieter of two otherwise identical posts", () => {
    const quiet = rankFind(
      { position: 5, commentCount: 2, postedAt: hoursAgo(2) },
      NOW
    )
    const loud = rankFind(
      { position: 5, commentCount: 200, postedAt: hoursAgo(2) },
      NOW
    )
    expect(quiet).toBeGreaterThan(loud)
  })

  it("prefers the fresher of two otherwise identical posts", () => {
    const fresh = rankFind(
      { position: 5, commentCount: 5, postedAt: hoursAgo(1) },
      NOW
    )
    const older = rankFind(
      { position: 5, commentCount: 5, postedAt: hoursAgo(100) },
      NOW
    )
    expect(fresh).toBeGreaterThan(older)
  })

  it("prefers the better match of two otherwise identical posts", () => {
    const better = rankFind(
      { position: 0, commentCount: 5, postedAt: hoursAgo(1) },
      NOW
    )
    const worse = rankFind(
      { position: 20, commentCount: 5, postedAt: hoursAgo(1) },
      NOW
    )
    expect(better).toBeGreaterThan(worse)
  })

  it("never scores a brand-new post at zero", () => {
    // Nobody has voted and nobody has replied, which is the best moment to
    // comment, not the worst.
    expect(
      rankFind({ position: 0, commentCount: 0, postedAt: hoursAgo(0.5) }, NOW)
    ).toBe(10)
  })

  it("treats a post with no time on it as old, not fresh", () => {
    // A missing time must never win the list on no evidence.
    expect(freshnessWeight(null, NOW)).toBe(0.1)
    const unknown = rankFind({ position: 0, commentCount: 1, postedAt: null }, NOW)
    const known = rankFind(
      { position: 0, commentCount: 1, postedAt: hoursAgo(1) },
      NOW
    )
    expect(unknown).toBeLessThan(known)
  })

  it("treats a post dated in the future as old, not brand new", () => {
    // A wrong clock would otherwise park one post at the top permanently.
    expect(freshnessWeight(new Date(NOW.getTime() + 3_600_000), NOW)).toBe(0.1)
  })

  it("survives nonsense figures instead of producing one", () => {
    expect(
      rankFind(
        { position: Number.NaN, commentCount: -5, postedAt: hoursAgo(1) },
        NOW
      )
    ).toBe(10)
  })

  it("walks down the freshness bands in order", () => {
    expect(freshnessWeight(hoursAgo(1), NOW)).toBe(1)
    expect(freshnessWeight(hoursAgo(12), NOW)).toBe(0.6)
    expect(freshnessWeight(hoursAgo(48), NOW)).toBe(0.3)
    expect(freshnessWeight(hoursAgo(400), NOW)).toBe(0.1)
  })

  it("halves relevance by Reddit's tenth result and keeps a quarter by the last", () => {
    expect(relevanceWeight(0)).toBe(1)
    expect(relevanceWeight(10)).toBeCloseTo(0.5, 2)
    expect(relevanceWeight(24)).toBeCloseTo(0.294, 3)
  })

  it("halves a comment's room by the third reply", () => {
    expect(replyRoomWeight(0)).toBe(1)
    expect(replyRoomWeight(3)).toBe(0.5)
    expect(replyRoomWeight(27)).toBe(0.1)
  })

  it("says why a post is near the top in plain words", () => {
    expect(
      rankReason({ position: 0, commentCount: 0, postedAt: hoursAgo(2) }, NOW)
    ).toBe("Reddit's best match, posted in the last few hours, no replies yet")
    expect(
      rankReason({ position: 14, commentCount: 300, postedAt: hoursAgo(400) }, NOW)
    ).toBe("Reddit's match 15, older than a week, 300 replies already")
  })
})

describe("the three bands the list groups under", () => {
  it("splits a real run the way a person would", () => {
    // The 15 scores a real search for "reddit marketing tool" produced on
    // 5 Oct 2026, highest first.
    const run = [
      2.0, 1.33, 1.13, 0.66, 0.64, 0.63, 0.47, 0.45, 0.36, 0.32, 0.28, 0.21,
      0.18, 0.15, 0.13,
    ]
    const counts = { strong: 0, possible: 0, low: 0 }
    for (const score of run) counts[fitBand(score)] += 1

    expect(counts).toEqual({ strong: 3, possible: 7, low: 5 })
  })

  it("puts a fresh quiet post in the strong band", () => {
    const score = rankFind(
      { position: 0, commentCount: 2, postedAt: hoursAgo(3) },
      NOW
    )
    expect(fitBand(score)).toBe("strong")
  })

  it("puts a buried old post in the low band", () => {
    const score = rankFind(
      { position: 1, commentCount: 135, postedAt: hoursAgo(300) },
      NOW
    )
    expect(fitBand(score)).toBe("low")
  })

  it("treats a nonsense score as the worst band, never the best", () => {
    expect(fitBand(Number.NaN)).toBe("low")
  })

  it("names each band in words", () => {
    expect(FIT_BAND_LABELS.strong).toBe("Strong fit")
    expect(FIT_BAND_LABELS.possible).toBe("Possible")
    expect(FIT_BAND_LABELS.low).toBe("Low fit")
  })
})
