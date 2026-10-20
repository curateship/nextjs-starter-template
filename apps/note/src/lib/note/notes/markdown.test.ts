import { describe, expect, it } from "vitest"

import { markdownFileName, markdownToNote, noteToMarkdown } from "@/lib/note/notes/markdown"

/**
 * Markdown out and back in keeps the title, tags, priority, the checklist and
 * the table, and anything in a file a note does not keep is named, never lost
 * quietly.
 */

const body = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Chapters" }] },
    {
      type: "taskList",
      content: [
        {
          type: "taskItem",
          attrs: { checked: true },
          content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }],
        },
        {
          type: "taskItem",
          attrs: { checked: false },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Two" }] }],
        },
      ],
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }] },
            { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "1" }] }] },
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "2" }] }] },
          ],
        },
      ],
    },
    {
      type: "callout",
      attrs: { tone: "yellow" },
      content: [{ type: "paragraph", content: [{ type: "text", text: "Careful" }] }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "See " },
        { type: "noteLink", attrs: { id: "n1", label: "Reading list" } },
      ],
    },
  ],
}

describe("noteToMarkdown", () => {
  const file = noteToMarkdown({
    title: "The Dispossessed",
    body,
    tags: ["books", "sci-fi"],
    priority: "high",
    sourceUrl: "https://youtu.be/jNQXAC9IVRw",
  })

  it("writes the title, tags, priority and link between --- lines", () => {
    expect(file).toContain('title: "The Dispossessed"')
    expect(file).toContain('tags: ["books","sci-fi"]')
    expect(file).toContain('priority: "High"')
    expect(file).toContain('source: "https://youtu.be/jNQXAC9IVRw"')
  })

  it("writes checklists, tables, callouts and note links as Markdown", () => {
    expect(file).toContain("## Chapters")
    expect(file).toContain("- [x] One")
    expect(file).toContain("- [ ] Two")
    expect(file).toMatch(/\| A\s*\| B\s*\|/)
    expect(file).toContain("> Careful")
    expect(file).toContain("[[Reading list]]")
  })

  it("comes back in with the same title, tags, priority and checklist", () => {
    const back = markdownToNote("whatever.md", file)
    expect(back.title).toBe("The Dispossessed")
    expect(back.tags).toEqual(["books", "sci-fi"])
    expect(back.priority).toBe("high")
    expect(back.problems).toEqual([])
    const json = JSON.stringify(back.body)
    expect(json).toContain('"taskItem"')
    expect(json).toContain('"checked":true')
    expect(json).toContain('"table"')
  })
})

describe("markdownToNote", () => {
  it("names a header a note does not keep and a priority that does not fit", () => {
    const back = markdownToNote("Notes on pricing.md", "---\nMood: happy\npriority: urgent\n---\n\nHello")
    expect(back.title).toBe("Notes on pricing")
    expect(back.problems).toEqual(["“Mood” is not something a note keeps", "“priority” did not fit High, Normal or Low"])
    expect(back.priority).toBe("normal")
  })

  it("reads tags the way other tools write them", () => {
    expect(markdownToNote("x.md", "---\ntags: [Pricing, Sales]\n---\nBody").tags).toEqual(["pricing", "sales"])
    expect(markdownToNote("x.md", "---\ntags: pricing, sales\n---\nBody").tags).toEqual(["pricing", "sales"])
  })

  it("reads an empty header as no header", () => {
    const back = markdownToNote("Empty.md", "---\n---\nJust text")
    expect(back.title).toBe("Empty")
    expect(back.problems).toEqual([])
    expect(JSON.stringify(back.body)).toContain("Just text")
    expect(JSON.stringify(back.body)).not.toContain("---")
  })

  it("reads a file with no header as a plain note", () => {
    const back = markdownToNote("Plain.md", "# Hi\n\n- [ ] task")
    expect(back.title).toBe("Plain")
    expect(JSON.stringify(back.body)).toContain('"taskItem"')
  })
})

describe("markdownFileName", () => {
  it("keeps a title a computer accepts", () => {
    expect(markdownFileName('What: "it" / is?')).toBe("What it is.md")
    expect(markdownFileName("   ")).toBe("Untitled.md")
  })
})
