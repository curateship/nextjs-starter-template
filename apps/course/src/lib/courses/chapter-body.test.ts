import { describe, expect, it } from "vitest"

import {
  chapterBodyText,
  chapterHeadings,
  chapterReadMinutes,
  cleanChapterBody,
  publicChapterBody,
  youtubeIdFrom,
  type QuizNode,
} from "@/lib/courses/chapter-body"

const paragraph = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
})

describe("cleanChapterBody", () => {
  it("keeps every course block in its one shape", () => {
    const body = cleanChapterBody({
      type: "doc",
      content: [
        paragraph("Hello"),
        { type: "image", attrs: { src: "https://cdn.example.com/a.png", alt: "A", title: "x" } },
        { type: "video", attrs: { source: "youtube", src: "dQw4w9WgXcQ" } },
        { type: "callout", attrs: { tone: "warning" }, content: [paragraph("Careful")] },
        { type: "codeBlock", attrs: { language: null }, content: [{ type: "text", text: "Copy me" }] },
        { type: "foldout", attrs: { summary: "Answer" }, content: [paragraph("42")] },
        { type: "simpleTable", attrs: { header: true, rows: [["a", "b"], ["c"]] } },
        { type: "checklist", attrs: { items: [{ id: "one", text: "Step" }] } },
        {
          type: "quiz",
          attrs: {
            questions: [
              {
                id: "q1",
                prompt: "Two plus two?",
                choices: [
                  { id: "a", text: "3" },
                  { id: "b", text: "4" },
                ],
                answerId: "b",
              },
            ],
          },
        },
      ],
    })

    expect(body.content?.map((block) => block.type)).toEqual([
      "paragraph",
      "image",
      "video",
      "callout",
      "codeBlock",
      "foldout",
      "simpleTable",
      "checklist",
      "quiz",
    ])
    expect(body.content?.[1]).toEqual({
      type: "image",
      attrs: { src: "https://cdn.example.com/a.png", alt: "A" },
    })
    // A short row is padded, so the grid never has a ragged edge.
    expect(body.content?.[6]).toMatchObject({ attrs: { rows: [["a", "b"], ["c", ""]] } })
  })

  it("drops what a chapter may not hold", () => {
    const body = cleanChapterBody({
      type: "doc",
      content: [
        { type: "image", attrs: { src: "javascript:alert(1)" } },
        { type: "image", attrs: { src: "//evil.example.com/a.png" } },
        { type: "video", attrs: { source: "youtube", src: "not an id" } },
        { type: "video", attrs: { source: "file", src: "data:video/mp4;base64,AAAA" } },
        { type: "script", content: [] },
        { type: "callout", attrs: { tone: "tip" }, content: [{ type: "quiz", attrs: {} }] },
        { type: "checklist", attrs: { items: [{ id: "bad id!", text: "x" }] } },
        paragraph("Kept"),
      ],
    })

    expect(body.content).toEqual([paragraph("Kept")])
  })

  it("keeps an empty prompt box, so a prompt being typed is not lost", () => {
    expect(cleanChapterBody({ type: "doc", content: [{ type: "codeBlock" }] }).content).toEqual([
      { type: "codeBlock" },
    ])
  })

  it("gives a quiz question with a missing answer its first choice", () => {
    const body = cleanChapterBody({
      type: "doc",
      content: [
        {
          type: "quiz",
          attrs: {
            questions: [
              { id: "q", prompt: "?", choices: [{ id: "x", text: "X" }], answerId: "gone" },
            ],
          },
        },
      ],
    })
    expect((body.content?.[0] as QuizNode).attrs.questions[0].answerId).toBe("x")
  })
})

describe("publicChapterBody", () => {
  it("takes every quiz answer out before a reader gets the chapter", () => {
    const body = cleanChapterBody({
      type: "doc",
      content: [
        {
          type: "quiz",
          attrs: {
            questions: [
              {
                id: "q1",
                prompt: "?",
                choices: [
                  { id: "a", text: "A" },
                  { id: "b", text: "B" },
                ],
                answerId: "b",
              },
            ],
          },
        },
      ],
    })
    const shown = publicChapterBody(body)
    expect(JSON.stringify(shown)).not.toContain('"answerId":"b"')
    expect((shown.content?.[0] as QuizNode).attrs.questions[0].choices).toHaveLength(2)
  })
})

describe("chapter text", () => {
  it("counts the words in every block for read time", () => {
    const words = Array.from({ length: 400 }, () => "word").join(" ")
    const body = cleanChapterBody({
      type: "doc",
      content: [
        paragraph(words),
        { type: "callout", attrs: { tone: "tip" }, content: [paragraph(words)] },
      ],
    })
    expect(chapterReadMinutes(body)).toBe(4)
    expect(chapterReadMinutes(cleanChapterBody({ type: "doc", content: [] }))).toBe(1)
    expect(chapterBodyText(body)).toContain("word")
  })

  it("names top-level headings the same way every time", () => {
    const heading = (text: string, level = 2) => ({
      type: "heading",
      attrs: { level },
      content: [{ type: "text", text }],
    })
    const body = cleanChapterBody({
      type: "doc",
      content: [heading("Set up"), heading("Small", 3), heading("Set up")],
    })
    expect(chapterHeadings(body).map((h) => h.id)).toEqual(["set-up", "set-up-2"])
  })
})

describe("youtubeIdFrom", () => {
  it("reads every kind of YouTube link and nothing else", () => {
    expect(youtubeIdFrom("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ")
    expect(youtubeIdFrom("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(youtubeIdFrom("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(youtubeIdFrom("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(youtubeIdFrom("https://vimeo.com/12345")).toBeNull()
    expect(youtubeIdFrom("hello")).toBeNull()
  })
})
