import { describe, expect, it } from "vitest"

import {
  BODY_SAYS,
  cleanNoteBody,
  countWords,
  noteBodyFacts,
  noteHeadings,
  readingMinutes,
} from "@/lib/note/notes/body"

/**
 * A note's body is checked against the same block list the editor uses, so a
 * link nobody should follow or a block the editor cannot draw is never stored.
 */

const doc = (...content: object[]) => ({ type: "doc", content })
const p = (...content: object[]) => ({ type: "paragraph", content })
const text = (value: string, marks?: object[]) => ({ type: "text", text: value, ...(marks ? { marks } : {}) })

describe("cleanNoteBody", () => {
  it("keeps every block the editor offers", () => {
    const body = doc(
      { type: "heading", attrs: { level: 2 }, content: [text("Chapters")] },
      {
        type: "taskList",
        content: [
          { type: "taskItem", attrs: { checked: true }, content: [p(text("One"))] },
          { type: "taskItem", attrs: { checked: false }, content: [p(text("Two"))] },
        ],
      },
      { type: "callout", attrs: { tone: "yellow" }, content: [p(text("Careful"))] },
      {
        type: "details",
        attrs: { open: true },
        content: [
          { type: "detailsSummary", content: [text("More")] },
          { type: "detailsContent", content: [p(text("Hidden"))] },
        ],
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [p(text("A"))] },
              { type: "tableHeader", content: [p(text("B"))] },
            ],
          },
        ],
      },
      p(text("See "), { type: "noteLink", attrs: { id: "abc-123", label: "Reading list" } }),
      p(text("marked", [{ type: "highlight", attrs: { colour: "green" } }])),
      p(text("blue", [{ type: "textColour", attrs: { colour: "blue" } }])),
      { type: "image", attrs: { src: "https://cdn.example.com/a.png", alt: "Cover" } }
    )
    const cleaned = cleanNoteBody(body)
    expect(JSON.stringify(cleaned)).toContain('"callout"')
    expect(JSON.stringify(cleaned)).toContain('"noteLink"')
    expect(JSON.stringify(cleaned)).toContain('"tone":"yellow"')
    expect(JSON.stringify(cleaned)).toContain('"open":true')
  })

  it("drops a link nobody should follow and keeps the words", () => {
    const cleaned = cleanNoteBody(
      doc(p(text("click", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])))
    )
    expect(JSON.stringify(cleaned)).not.toContain("javascript")
    expect(JSON.stringify(cleaned)).toContain("click")
  })

  it("drops a picture from a data address or a script address", () => {
    const cleaned = cleanNoteBody(
      doc(
        { type: "image", attrs: { src: "data:image/png;base64,AAAA" } },
        { type: "image", attrs: { src: "javascript:alert(1)" } },
        { type: "image", attrs: { src: "/api/media/file/a.png" } }
      )
    )
    const images = (cleaned.content ?? []).filter((node) => node.type === "image")
    expect(images).toHaveLength(1)
    expect(images[0].attrs?.src).toBe("/api/media/file/a.png")
  })

  it("drops a colour that is not one of the named ones", () => {
    const cleaned = cleanNoteBody(
      doc(p(text("x", [{ type: "textColour", attrs: { colour: "url(evil)" } }])))
    )
    expect(JSON.stringify(cleaned)).not.toContain("evil")
  })

  it("keeps a video time and drops one that is not a whole number within a day", () => {
    const cleaned = cleanNoteBody(
      doc(
        p(
          { type: "videoTime", attrs: { ms: 252_000 } },
          text(" the pricing trick"),
          { type: "videoTime", attrs: { ms: -1 } },
          { type: "videoTime", attrs: { ms: 1.5 } },
          { type: "videoTime", attrs: { ms: "252000" } },
          { type: "videoTime", attrs: { ms: 25 * 60 * 60 * 1000 } }
        )
      )
    )
    const times = (cleaned.content?.[0]?.content ?? []).filter((node) => node.type === "videoTime")
    expect(times).toEqual([{ type: "videoTime", attrs: { ms: 252_000 } }])
    expect(noteBodyFacts(cleaned).text).toBe("4:12 the pricing trick")
  })

  it("refuses a block the editor does not have", () => {
    expect(() => cleanNoteBody(doc({ type: "script", content: [] }))).toThrow(BODY_SAYS.unreadable)
    expect(() => cleanNoteBody({ type: "paragraph" })).toThrow(BODY_SAYS.unreadable)
  })

  it("refuses a body over the size limit", () => {
    expect(() => cleanNoteBody(doc(p(text("a".repeat(500_000)))))).toThrow(BODY_SAYS.tooLong)
  })
})

describe("noteBodyFacts", () => {
  it("reads the words, the first line, the ticks and the linked notes", () => {
    const facts = noteBodyFacts(
      doc(
        p(),
        p(text("First real line")),
        {
          type: "taskList",
          content: [
            { type: "taskItem", attrs: { checked: true }, content: [p(text("Done"))] },
            { type: "taskItem", attrs: { checked: false }, content: [p(text("Not yet"))] },
          ],
        },
        p(text("See "), { type: "noteLink", attrs: { id: "n1", label: "Other" } }),
        p({ type: "noteLink", attrs: { id: "n1", label: "Other" } })
      )
    )
    expect(facts.firstLine).toBe("First real line")
    expect(facts.checklist).toEqual({ done: 1, total: 2 })
    expect(facts.linkedIds).toEqual(["n1"])
    expect(facts.text).toBe("First real line\nDone\nNot yet\nSee Other\nOther")
    expect(facts.words).toBe(9)
  })

  it("counts words and reading time", () => {
    expect(countWords("It's a well-known fact, 42 times.")).toBe(6)
    expect(readingMinutes(0)).toBe(0)
    expect(readingMinutes(10)).toBe(1)
    expect(readingMinutes(412)).toBe(2)
  })

  it("lists the headings in order", () => {
    expect(
      noteHeadings(
        doc(
          { type: "heading", attrs: { level: 1 }, content: [text("Top")] },
          p(text("x")),
          { type: "heading", attrs: { level: 3 }, content: [text("Deep")] }
        )
      )
    ).toEqual([
      { level: 1, text: "Top", index: 0 },
      { level: 3, text: "Deep", index: 1 },
    ])
  })
})
