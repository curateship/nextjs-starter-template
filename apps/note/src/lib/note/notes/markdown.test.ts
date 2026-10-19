import { describe, expect, it } from "vitest"

import type { NoteField } from "@/lib/note/notes/fields"
import { markdownFileName, markdownToNote, noteToMarkdown } from "@/lib/note/notes/markdown"

/**
 * Markdown out and back in keeps the fields, the checklist and the table, and
 * anything in a file that does not fit the folder is named, never lost quietly.
 */

const fields: NoteField[] = [
  { id: "f1", key: "author", name: "Author", type: "text", options: [], remind: false, position: 0 },
  { id: "f2", key: "rating", name: "Rating", type: "number", options: [], remind: false, position: 1 },
  {
    id: "f3",
    key: "status",
    name: "Status",
    type: "select",
    options: [
      { id: "o1", label: "To read", colour: "grey" },
      { id: "o2", label: "Done", colour: "green" },
    ],
    remind: false,
    position: 2,
  },
  {
    id: "f4",
    key: "topics",
    name: "Topics",
    type: "multi_select",
    options: [
      { id: "t1", label: "Pricing", colour: "blue" },
      { id: "t2", label: "Sales, B2B", colour: "red" },
    ],
    remind: false,
    position: 3,
  },
  { id: "f5", key: "finished", name: "Finished", type: "date", options: [], remind: true, position: 4 },
  { id: "f6", key: "owned", name: "Owned", type: "checkbox", options: [], remind: false, position: 5 },
]

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
  const values = {
    author: "Ursula Le Guin",
    rating: 4.5,
    status: "o2",
    topics: ["t1", "t2"],
    finished: "2026-10-20",
    owned: true,
  }
  const file = noteToMarkdown({ title: "The Dispossessed", body, fields, values })

  it("writes the fields between --- lines", () => {
    expect(file).toContain('title: "The Dispossessed"')
    expect(file).toContain('Author: "Ursula Le Guin"')
    expect(file).toContain("Rating: 4.5")
    expect(file).toContain('Status: "Done"')
    expect(file).toContain('Topics: ["Pricing","Sales, B2B"]')
    expect(file).toContain('Finished: "2026-10-20"')
    expect(file).toContain("Owned: true")
  })

  it("writes checklists, tables, callouts and note links as Markdown", () => {
    expect(file).toContain("## Chapters")
    expect(file).toContain("- [x] One")
    expect(file).toContain("- [ ] Two")
    expect(file).toMatch(/\| A\s*\| B\s*\|/)
    expect(file).toContain("> Careful")
    expect(file).toContain("[[Reading list]]")
  })

  it("comes back in with the same fields and checklist", () => {
    const back = markdownToNote("whatever.md", file, fields)
    expect(back.title).toBe("The Dispossessed")
    expect(back.values).toEqual(values)
    expect(back.problems).toEqual([])
    const json = JSON.stringify(back.body)
    expect(json).toContain('"taskItem"')
    expect(json).toContain('"checked":true')
    expect(json).toContain('"table"')
  })
})

describe("markdownToNote", () => {
  it("names a header that is not a field and a value that does not fit", () => {
    const back = markdownToNote(
      "Notes on pricing.md",
      '---\nMood: happy\nRating: lots\nStatus: Abandoned\n---\n\nHello',
      fields
    )
    expect(back.title).toBe("Notes on pricing")
    expect(back.problems).toEqual([
      "“Mood” is not a field in this folder",
      "“Rating” did not fit the Rating field",
      "“Status” did not fit the Status field",
    ])
    expect(back.values).toEqual({})
  })

  it("reads plain values the way other tools write them", () => {
    const back = markdownToNote(
      "x.md",
      "---\nStatus: done\nTopics: [Pricing]\nOwned: yes\nFinished: 2026-10-20 14:30\n---\nBody",
      fields
    )
    expect(back.values).toEqual({ status: "o2", topics: ["t1"], owned: true, finished: "2026-10-20T14:30" })
  })

  it("reads a file with no header as a plain note", () => {
    const back = markdownToNote("Plain.md", "# Hi\n\n- [ ] task", fields)
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
