import { describe, expect, it } from "vitest"

import { readMergeAnswer, readPostAnswer, tidyMergeAnswer, tidyPostAnswer } from "@/server/note/library/post-analysis"

/**
 * What is kept of the AI's answer about an X post. Lists are cut to size
 * rather than failed, because the call has been paid for.
 */

function answer(value: unknown) {
  const read = readPostAnswer(value)
  if (!read.success) throw new Error("unreadable")
  return read.data
}

describe("tidyPostAnswer", () => {
  it("tidies the words, says each tag once and unticks every step", () => {
    const tidied = tidyPostAnswer(
      answer({
        summary: ["  One   point. ", ""],
        actionPlan: ["Write a post", " "],
        quotes: ["  The best line. ", ""],
        tags: ["Growth", "growth", " Newsletters "],
      })
    )
    expect(tidied).toEqual({
      summary: ["One point."],
      actionPlan: [{ text: "Write a post", done: false }],
      quotes: [{ text: "The best line.", startMs: null }],
      tags: ["growth", "newsletters"],
    })
  })

  it("cuts long lists to size and reads missing quotes as none", () => {
    const tidied = tidyPostAnswer(
      answer({
        summary: Array.from({ length: 12 }, (_, index) => `Line ${index}`),
        actionPlan: Array.from({ length: 20 }, (_, index) => `Step ${index}`),
        quotes: "not a list",
        tags: Array.from({ length: 12 }, (_, index) => `tag ${index}`),
      })
    )
    expect(tidied.summary).toHaveLength(8)
    expect(tidied.actionPlan).toHaveLength(12)
    expect(tidied.quotes).toEqual([])
    expect(tidied.tags).toHaveLength(8)
  })
})

describe("tidyMergeAnswer", () => {
  it("says each step once and names the note it came from", () => {
    const read = readMergeAnswer({
      plan: [
        { text: "Pick one topic", note: 1 },
        { text: "pick one topic", note: 2 },
        { text: "Write every week", note: 2 },
        { text: "Ask readers", note: 9 },
        { text: " ", note: 1 },
      ],
    })
    if (!read.success) throw new Error("unreadable")
    expect(tidyMergeAnswer(read.data, [{ title: "Naval on wealth" }, { title: "How to write" }])).toEqual([
      { text: "Pick one topic", done: false, from: "Naval on wealth" },
      { text: "Write every week", done: false, from: "How to write" },
      { text: "Ask readers", done: false },
    ])
  })
})
