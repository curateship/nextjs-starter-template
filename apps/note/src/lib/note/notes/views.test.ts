import { describe, expect, it } from "vitest"

import type { NoteField } from "@/lib/note/notes/fields"
import type { NoteCard } from "@/lib/note/notes/notes"
import { applyView, cleanViewSettings, columnTotal, EMPTY_VIEW_SETTINGS } from "@/lib/note/notes/views"

/** A view filters and sorts what is on screen, and forgets fields that have gone. */

const fields: NoteField[] = [
  { id: "1", key: "rating", name: "Rating", type: "number", options: [], remind: false, position: 0 },
  {
    id: "2",
    key: "status",
    name: "Status",
    type: "select",
    options: [
      { id: "todo", label: "To read", colour: "grey" },
      { id: "done", label: "Done", colour: "green" },
    ],
    remind: false,
    position: 1,
  },
  { id: "3", key: "finished", name: "Finished", type: "date", options: [], remind: false, position: 2 },
]

function note(id: string, values: NoteCard["values"], extra: Partial<NoteCard> = {}): NoteCard {
  return {
    id,
    folderId: "f",
    title: id,
    icon: null,
    firstLine: "",
    values,
    checklist: { done: 0, total: 0 },
    pinned: false,
    archived: false,
    deletedAt: null,
    trashedWithFolderId: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
    lastOpenedAt: null,
    folderName: null,
    ...extra,
  }
}

const notes = [
  note("a", { rating: 4, status: "done", finished: "2026-09-01" }),
  note("b", { rating: 2, status: "todo" }),
  note("c", {}, { pinned: true }),
  note("d", { rating: 5, status: "done", finished: "2026-10-15" }),
]

describe("applyView", () => {
  it("filters on every rule and keeps pinned notes first", () => {
    const shown = applyView(notes, fields, {
      ...EMPTY_VIEW_SETTINGS,
      filters: [{ fieldKey: "status", op: "is", value: "done" }],
      sort: { key: "rating", dir: "desc" },
    })
    expect(shown.map((each) => each.id)).toEqual(["d", "a"])
  })

  it("sorts empty values last both ways", () => {
    const up = applyView(notes, fields, { ...EMPTY_VIEW_SETTINGS, sort: { key: "finished", dir: "asc" } })
    expect(up.map((each) => each.id)).toEqual(["c", "a", "d", "b"])
    const down = applyView(notes, fields, { ...EMPTY_VIEW_SETTINGS, sort: { key: "finished", dir: "desc" } })
    expect(down.map((each) => each.id)).toEqual(["c", "d", "a", "b"])
  })

  it("filters numbers and dates", () => {
    const above = applyView(notes, fields, {
      ...EMPTY_VIEW_SETTINGS,
      filters: [
        { fieldKey: "rating", op: "above", value: 3 },
        { fieldKey: "finished", op: "after", value: "2026-10-01" },
      ],
    })
    expect(above.map((each) => each.id)).toEqual(["d"])
  })
})

describe("columnTotal", () => {
  it("adds up or averages the notes showing, and says nothing with no numbers", () => {
    expect(columnTotal(notes, "rating", "sum")).toBe(11)
    expect(columnTotal(notes, "rating", "average")).toBeCloseTo(11 / 3)
    expect(columnTotal([], "rating", "sum")).toBeNull()
  })
})

describe("cleanViewSettings", () => {
  it("drops filters, sorts, groupings and totals on fields that are gone or the wrong kind", () => {
    expect(
      cleanViewSettings(fields, {
        filters: [
          { fieldKey: "gone", op: "contains", value: "x" },
          { fieldKey: "rating", op: "contains", value: "x" },
          { fieldKey: "status", op: "is", value: "nope" },
          { fieldKey: "rating", op: "below", value: 3 },
        ],
        sort: { key: "gone", dir: "asc" },
        groupBy: "rating",
        totals: { rating: "sum", status: "sum" },
      })
    ).toEqual({
      filters: [{ fieldKey: "rating", op: "below", value: 3 }],
      sort: null,
      groupBy: null,
      totals: { rating: "sum" },
    })
  })
})
