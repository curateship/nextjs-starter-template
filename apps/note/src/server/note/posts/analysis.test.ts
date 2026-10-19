import { describe, expect, it } from "vitest"

import { readMergeAnswer, readPostAnswer, tidyMergeAnswer, tidyPostAnswer } from "@/server/note/posts/analysis"

/**
 * What is kept of the AI's answer about a post. A folder or a similar post
 * the AI named is kept only when it is one of the person's own; lists are cut
 * to size rather than failed, because the call has been paid for.
 */

const folders = [
  { id: "f1", name: "Newsletter" },
  { id: "f2", name: "Course" },
]
const others = [{ id: "p1" }, { id: "p2" }]

function answer(value: unknown) {
  const read = readPostAnswer(value)
  if (!read.success) throw new Error("unreadable")
  return read.data
}

describe("tidyPostAnswer", () => {
  it("keeps the folder and similar post when they are the person's own", () => {
    const tidied = tidyPostAnswer(
      answer({
        summary: ["  One   point. ", ""],
        actionPlan: ["Write a post", " "],
        tags: ["Growth", "growth", " Newsletters "],
        folder: "newsletter",
        similar: "S2",
      }),
      folders,
      others
    )
    expect(tidied).toEqual({
      summary: ["One point."],
      actionPlan: [{ text: "Write a post", done: false }],
      tags: ["growth", "newsletters"],
      folderId: "f1",
      similarPostId: "p2",
    })
  })

  it("drops a folder or a similar post that is not on the lists", () => {
    const tidied = tidyPostAnswer(
      answer({ summary: [], actionPlan: [], tags: [], folder: "Invented", similar: "S9" }),
      folders,
      others
    )
    expect(tidied.folderId).toBeNull()
    expect(tidied.similarPostId).toBeNull()
  })

  it("cuts long lists to size and reads odd values as none", () => {
    const tidied = tidyPostAnswer(
      answer({
        summary: Array.from({ length: 12 }, (_, index) => `Line ${index}`),
        actionPlan: Array.from({ length: 20 }, (_, index) => `Step ${index}`),
        tags: Array.from({ length: 12 }, (_, index) => `tag ${index}`),
        folder: 7,
        similar: { no: true },
      }),
      folders,
      others
    )
    expect(tidied.summary).toHaveLength(8)
    expect(tidied.actionPlan).toHaveLength(12)
    expect(tidied.tags).toHaveLength(8)
    expect(tidied.folderId).toBeNull()
  })
})

describe("tidyMergeAnswer", () => {
  it("says each step once and names the post it came from", () => {
    const read = readMergeAnswer({
      plan: [
        { text: "Pick one topic", post: 1 },
        { text: "pick one topic", post: 2 },
        { text: "Write every week", post: 2 },
        { text: "Ask readers", post: 9 },
        { text: " ", post: 1 },
      ],
    })
    if (!read.success) throw new Error("unreadable")
    expect(tidyMergeAnswer(read.data, [{ title: "@naval" }, { title: "@paulg" }])).toEqual([
      { text: "Pick one topic", done: false, from: "@naval" },
      { text: "Write every week", done: false, from: "@paulg" },
      { text: "Ask readers", done: false },
    ])
  })
})
