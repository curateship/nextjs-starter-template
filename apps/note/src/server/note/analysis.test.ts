import { describe, expect, it } from "vitest"

import { readSummaryAnswer, tidySummary, tidyTranscript } from "@/server/note/analysis"

/**
 * What is kept of Gemini's two answers. The player is jumped to these times,
 * so a time past the end, or lines out of order, would send it to the wrong
 * place; and a summary that comes back with one bad quote time must not throw
 * away the transcript that has already been paid for.
 */

describe("tidying the transcript", () => {
  it("clamps every time into the sound and puts the lines in order", () => {
    const lines = tidyTranscript(
      [
        { startMs: 5200.4, endMs: 9100, text: "Second line." },
        { startMs: -300, endMs: 2400, text: "  First   line. " },
        { startMs: 58_000, endMs: 75_000, text: "Last line, past the end." },
      ],
      60_000
    )
    expect(lines).toEqual([
      { startMs: 0, endMs: 2400, text: "First line." },
      { startMs: 5200, endMs: 9100, text: "Second line." },
      { startMs: 58_000, endMs: 60_000, text: "Last line, past the end." },
    ])
  })

  it("drops empty lines and a line said twice in a row", () => {
    const lines = tidyTranscript(
      [
        { startMs: 0, endMs: 1000, text: "Hello." },
        { startMs: 1000, endMs: 2000, text: "Hello." },
        { startMs: 2000, endMs: 3000, text: "   " },
        { startMs: 3000, endMs: 4000, text: "Goodbye." },
      ],
      10_000
    )
    expect(lines.map((line) => line.text)).toEqual(["Hello.", "Goodbye."])
  })

  it("gives a line with no length the time up to the next one", () => {
    const lines = tidyTranscript(
      [
        { startMs: 1000, endMs: 1000, text: "Quick." },
        { startMs: 2500, endMs: 4000, text: "Next." },
      ],
      10_000
    )
    expect(lines[0]).toEqual({ startMs: 1000, endMs: 2500, text: "Quick." })
  })
})

describe("the summary answer", () => {
  const transcript = [
    { startMs: 0, endMs: 5000, text: "One." },
    { startMs: 5000, endMs: 60_000, text: "Two." },
  ]

  it("drops a quote with a bad time and keeps the rest", () => {
    const parsed = readSummaryAnswer({
      summary: ["A point."],
      actionPlan: ["Do a thing."],
      quotes: [
        { text: "Kept.", startMs: 5000 },
        { text: "Not a number.", startMs: "soon" },
        { text: "Past the end.", startMs: 90_000 },
        { text: "Before the start.", startMs: -5 },
      ],
      tags: ["Pricing"],
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return

    const summary = tidySummary(parsed.data, transcript, 60_000)
    expect(summary.quotes).toEqual([{ text: "Kept.", startMs: 5000 }])
    expect(summary.summary).toEqual(["A point."])
  })

  it("caps each list, unticks every step and lowercases the tags once each", () => {
    const parsed = readSummaryAnswer({
      summary: Array.from({ length: 10 }, (_, index) => `Point ${index}.`),
      actionPlan: Array.from({ length: 15 }, (_, index) => `Step ${index}.`),
      quotes: [],
      tags: ["Pricing", "pricing", " SaaS ", "", "a", "b", "c", "d", "e", "f", "g"],
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return

    const summary = tidySummary(parsed.data, transcript, 60_000)
    expect(summary.summary).toHaveLength(8)
    expect(summary.actionPlan).toHaveLength(12)
    expect(summary.actionPlan.every((step) => step.done === false)).toBe(true)
    expect(summary.tags).toEqual(["pricing", "saas", "a", "b", "c", "d", "e", "f"])
  })

  it("refuses an answer that is not a summary at all", () => {
    expect(readSummaryAnswer({ summary: "one line" }).success).toBe(false)
  })
})
