import { describe, expect, it } from "vitest"

import { cents, manyPriceLine, mergePriceLine, postAnalyseDollars, postPriceLine } from "@/lib/note/posts/analyse-price"
import { planAsMarkdown, planAsText } from "@/lib/note/posts/copy-plan"
import {
  addHighlight,
  cleanHighlights,
  firstHighlightText,
  highlightPieces,
  isHighlightPart,
  removeHighlight,
} from "@/lib/note/posts/highlights"
import { analyseRefusal, planProgress, POST_SAYS } from "@/lib/note/posts/posts"

/**
 * The small rules the Posts screen and the server share: how far a plan has
 * got, when Analyse may be pressed, the price line, highlights and Copy plan.
 */

describe("planProgress", () => {
  it("is nothing without a plan, then not started, in progress and done", () => {
    expect(planProgress(null)).toBeNull()
    expect(planProgress([])).toBeNull()
    expect(planProgress([{ text: "a", done: false }])).toBe("not_started")
    expect(planProgress([{ text: "a", done: true }, { text: "b", done: false }])).toBe("in_progress")
    expect(planProgress([{ text: "a", done: true }])).toBe("done")
  })
})

describe("analyseRefusal", () => {
  it("waits for the words and for the video", () => {
    expect(analyseRefusal({ status: "reading", videoStatus: "none", hasText: false })).toBe(POST_SAYS.notReadable)
    expect(analyseRefusal({ status: "saved", videoStatus: "downloading", hasText: true })).toBe(
      POST_SAYS.videoStillSaving
    )
    expect(analyseRefusal({ status: "saved", videoStatus: "failed", hasText: true })).toBeNull()
    expect(analyseRefusal({ status: "ready", videoStatus: "too_long", hasText: true })).toBeNull()
  })
})

describe("the price line", () => {
  it("works one post out from the shell's price list", () => {
    // 600 + 4,000 / 4 = 1,600 tokens in at $0.75 a million, 1,200 out at $3.75:
    // $0.0012 + $0.0045 = $0.0057.
    expect(postAnalyseDollars({ chars: 4_000, pictures: 0, videoSeconds: 0 }, 0)).toBeCloseTo(0.0057, 6)
    expect(cents(0.0057)).toBe("under 1¢")
  })

  it("adds each picture, the similar-post lines and the video", () => {
    const plain = postAnalyseDollars({ chars: 0, pictures: 0, videoSeconds: 0 }, 0)
    // A picture is 1,120 tokens in: $0.00084.
    expect(postAnalyseDollars({ chars: 0, pictures: 1, videoSeconds: 0 }, 0) - plain).toBeCloseTo(0.00084, 6)
    // 200 saved posts at 40 tokens each is 8,000 tokens in: $0.006. Past 200 costs no more.
    expect(postAnalyseDollars({ chars: 0, pictures: 0, videoSeconds: 0 }, 500) - plain).toBeCloseTo(0.006, 6)
    // 60 seconds of video: 1,920 sound tokens in and 240 words out, then 240 words read.
    const video = 1_920 * 0.75e-6 + 240 * 3.75e-6 + 240 * 0.75e-6
    expect(postAnalyseDollars({ chars: 0, pictures: 0, videoSeconds: 60 }, 0) - plain).toBeCloseTo(video, 6)
  })

  it("says what Analyse again replaces", () => {
    expect(postPriceLine({ chars: 100, pictures: 0, videoSeconds: 0 }, 0, false)).toMatch(
      /^Analysing costs under 1¢ with .+\.$/
    )
    expect(postPriceLine({ chars: 100, pictures: 0, videoSeconds: 0 }, 0, true)).toMatch(
      /replaces the summary, the plan and your ticks and edits\.$/
    )
  })

  it("adds up several posts, and a merge", () => {
    const post = { analyse: { chars: 100, pictures: 0, videoSeconds: 0 }, status: "saved" }
    // Each is 625 tokens in and 1,200 out: $0.00047 + $0.0045 = $0.00497.
    // Three come to $0.0149, which reads "about 1¢".
    expect(manyPriceLine([post, post, post], 0)).toMatch(/^Analysing 3 posts costs about 1¢/)
    expect(mergePriceLine([{ planChars: 400 }, { planChars: 400 }])).toMatch(/^One plan from 2 posts costs under 1¢/)
  })

  it("warns when some picked posts were analysed before", () => {
    const fresh = { analyse: { chars: 100, pictures: 0, videoSeconds: 0 }, status: "saved" }
    const done = { ...fresh, status: "ready" }
    expect(manyPriceLine([fresh, done], 0)).toMatch(
      /It replaces the plan of the one already analysed, ticks and edits included\.$/
    )
    expect(manyPriceLine([done, done], 0)).toMatch(/It replaces the plans of the 2 already analysed/)
  })
})

describe("highlights", () => {
  it("joins overlapping highlights in one part and keeps other parts apart", () => {
    let list = addHighlight([], { part: "post", start: 0, end: 5 })
    list = addHighlight(list, { part: "post", start: 3, end: 9 })
    list = addHighlight(list, { part: "quoted", start: 0, end: 4 })
    expect(list).toEqual([
      { part: "post", start: 0, end: 9 },
      { part: "quoted", start: 0, end: 4 },
    ])
    expect(removeHighlight(list, { part: "quoted", start: 0, end: 4 })).toEqual([{ part: "post", start: 0, end: 9 }])
  })

  it("keeps only highlights that fit their words", () => {
    const words = (part: string) => (part === "post" ? "Hello world" : part === "thread-0" ? "Next" : null)
    expect(
      cleanHighlights(
        [
          { part: "post", start: 6, end: 99 },
          { part: "post", start: 5, end: 6 },
          { part: "quoted", start: 0, end: 2 },
          { part: "thread-0", start: 0, end: 4 },
        ],
        words
      )
    ).toEqual([
      { part: "post", start: 6, end: 11 },
      { part: "thread-0", start: 0, end: 4 },
    ])
  })

  it("cuts the words into plain and marked pieces", () => {
    const pieces = highlightPieces("one two three", "post", [{ part: "post", start: 4, end: 7 }])
    expect(pieces.map((piece) => [piece.text, piece.highlight !== null])).toEqual([
      ["one ", false],
      ["two", true],
      [" three", false],
    ])
    expect(firstHighlightText([{ part: "post", start: 4, end: 7 }], () => "one two three")).toBe("two")
  })

  it("knows which parts there are", () => {
    expect(isHighlightPart("post")).toBe(true)
    expect(isHighlightPart("thread-12")).toBe(true)
    expect(isHighlightPart("thread-x")).toBe(false)
    expect(isHighlightPart("article")).toBe(false)
  })
})

describe("Copy plan", () => {
  const plan = {
    title: "Naval (@naval)",
    url: "https://x.com/naval/status/1",
    summary: ["Wealth is assets that earn while you sleep."],
    actionPlan: [
      { text: "List one skill *nobody* else has", done: true },
      { text: "Write about it", done: false, from: "@paulg" },
    ],
  }

  it("copies as plain text", () => {
    expect(planAsText(plan)).toBe(
      [
        "Naval (@naval)",
        "https://x.com/naval/status/1",
        "",
        "Summary",
        "- Wealth is assets that earn while you sleep.",
        "",
        "Action plan",
        "[x] List one skill *nobody* else has",
        "[ ] Write about it (@paulg)",
      ].join("\n")
    )
  })

  it("copies as Markdown, escaping the AI's words", () => {
    expect(planAsMarkdown(plan)).toContain("# [Naval (@naval)](https://x.com/naval/status/1)")
    expect(planAsMarkdown(plan)).toContain("- [x] List one skill \\*nobody\\* else has")
    expect(planAsMarkdown(plan)).toContain("- [ ] Write about it (@paulg)")
  })
})
