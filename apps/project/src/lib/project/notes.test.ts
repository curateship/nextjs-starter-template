import { describe, expect, it } from "vitest"

import { readTaskNotes } from "@/lib/project/notes"

describe("reading saved notes", () => {
  it("reads a page the database wrote with spaces as a page, not as words", () => {
    // What jsonb::text gives back, as migrations 0174 and 0179 save a page.
    const spaced = '{"type": "doc", "content": [{"type": "noteInbox"}, {"type": "paragraph"}]}'
    const notes = readTaskNotes(spaced, { dashboard: true })
    expect(notes.kind).toBe("doc")
    expect(notes.kind === "doc" ? notes.body.content?.map((node) => node.type) : []).toEqual(["noteInbox", "paragraph"])
  })

  it("keeps words that only start like a page as words", () => {
    expect(readTaskNotes('{"type": "doc" is how it starts').kind).toBe("text")
    expect(readTaskNotes("Plain words").kind).toBe("text")
  })
})
