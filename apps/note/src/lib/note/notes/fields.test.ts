import { describe, expect, it } from "vitest"

import {
  carryFieldValues,
  cleanFieldValues,
  cleanOptions,
  FIELDS_SAY,
  fieldsSearchText,
  makeFieldKey,
  parseFieldValue,
  VALUE_SAYS,
  type NoteField,
} from "@/lib/note/notes/fields"

/**
 * Every field type takes only what fits it, an empty value clears it, and a
 * note moving between folders keeps the values whose field has the same name
 * and type on the other side (Tyler, 18 Oct 2026).
 */

function field(type: NoteField["type"], extra: Partial<NoteField> = {}): NoteField {
  return { id: `f-${type}`, key: type, name: type, type, options: [], remind: false, position: 0, ...extra }
}

const status = field("select", {
  name: "Status",
  key: "status",
  options: [
    { id: "a", label: "To read", colour: "grey" },
    { id: "b", label: "Done", colour: "green" },
  ],
})
const topics = field("multi_select", {
  name: "Topics",
  key: "topics",
  options: [
    { id: "x", label: "Pricing", colour: "blue" },
    { id: "y", label: "Sales", colour: "red" },
  ],
})

describe("parseFieldValue", () => {
  it("takes text, trims it, and clears on empty", () => {
    expect(parseFieldValue(field("text"), "  hi  ")).toEqual({ ok: true, value: "hi" })
    expect(parseFieldValue(field("text"), "   ")).toEqual({ ok: true, value: null })
    expect(parseFieldValue(field("text"), "a".repeat(2001))).toEqual({ ok: false, reason: VALUE_SAYS.tooLong })
  })

  it("takes a number, with commas, and refuses words", () => {
    expect(parseFieldValue(field("number"), "1,250.5")).toEqual({ ok: true, value: 1250.5 })
    expect(parseFieldValue(field("number"), 4)).toEqual({ ok: true, value: 4 })
    expect(parseFieldValue(field("number"), "lots")).toEqual({ ok: false, reason: VALUE_SAYS.notNumber })
    expect(parseFieldValue(field("number"), "")).toEqual({ ok: true, value: null })
  })

  it("stores a ticked box and clears an unticked one", () => {
    expect(parseFieldValue(field("checkbox"), true)).toEqual({ ok: true, value: true })
    expect(parseFieldValue(field("checkbox"), false)).toEqual({ ok: true, value: null })
    expect(parseFieldValue(field("checkbox"), "yes")).toEqual({ ok: false, reason: VALUE_SAYS.notTick })
  })

  it("takes only an option the field has", () => {
    expect(parseFieldValue(status, "b")).toEqual({ ok: true, value: "b" })
    expect(parseFieldValue(status, "zzz")).toEqual({ ok: false, reason: VALUE_SAYS.notOption })
    expect(parseFieldValue(topics, ["y", "x", "y"])).toEqual({ ok: true, value: ["x", "y"] })
    expect(parseFieldValue(topics, [])).toEqual({ ok: true, value: null })
    expect(parseFieldValue(topics, ["x", "nope"])).toEqual({ ok: false, reason: VALUE_SAYS.notOption })
  })

  it("takes a real day, with or without a time", () => {
    expect(parseFieldValue(field("date"), "2026-10-20")).toEqual({ ok: true, value: "2026-10-20" })
    expect(parseFieldValue(field("date"), "2026-10-20T14:30")).toEqual({ ok: true, value: "2026-10-20T14:30" })
    expect(parseFieldValue(field("date"), "2026-02-30")).toEqual({ ok: false, reason: VALUE_SAYS.notDate })
    expect(parseFieldValue(field("date"), "2026-10-20T25:00")).toEqual({ ok: false, reason: VALUE_SAYS.notDate })
  })

  it("takes only web links, real-looking emails and phone numbers", () => {
    expect(parseFieldValue(field("url"), "https://example.com/a")).toEqual({ ok: true, value: "https://example.com/a" })
    expect(parseFieldValue(field("url"), "javascript:alert(1)")).toEqual({ ok: false, reason: VALUE_SAYS.notLink })
    expect(parseFieldValue(field("email"), "me@example.com")).toEqual({ ok: true, value: "me@example.com" })
    expect(parseFieldValue(field("email"), "me@")).toEqual({ ok: false, reason: VALUE_SAYS.notEmail })
    expect(parseFieldValue(field("phone"), "+44 (20) 7946-0000")).toEqual({ ok: true, value: "+44 (20) 7946-0000" })
    expect(parseFieldValue(field("phone"), "call me")).toEqual({ ok: false, reason: VALUE_SAYS.notPhone })
  })
})

describe("cleanFieldValues", () => {
  it("keeps only values for fields the folder has, that still fit", () => {
    expect(
      cleanFieldValues([status, field("number")], { status: "a", number: "x", gone: "y", number2: 3 })
    ).toEqual({ status: "a" })
  })
})

describe("carryFieldValues", () => {
  const books = [
    field("text", { name: "Author", key: "author" }),
    field("number", { name: "Rating", key: "rating" }),
    status,
    topics,
  ]
  const reading = [
    field("text", { name: "author", key: "author_2" }),
    field("text", { name: "Rating", key: "rating" }),
    field("select", {
      name: "Status",
      key: "state",
      options: [
        { id: "q", label: "DONE", colour: "green" },
        { id: "r", label: "Reading", colour: "blue" },
      ],
    }),
    field("multi_select", {
      name: "Topics",
      key: "topics",
      options: [{ id: "z", label: "pricing", colour: "blue" }],
    }),
  ]

  it("keeps a same-named field of the same type, and a choice by its option's name", () => {
    const { values, lost } = carryFieldValues(books, reading, {
      author: "Le Guin",
      rating: 5,
      status: "b",
      topics: ["x", "y"],
    })
    expect(values).toEqual({ author_2: "Le Guin", state: "q", topics: ["z"] })
    // Rating is a number in one folder and text in the other; Sales has no
    // option in the new folder.
    expect(lost).toEqual(["Rating", "Topics"])
  })

  it("loses a choice whose option is not there", () => {
    const { values, lost } = carryFieldValues(books, reading, { status: "a" })
    expect(values).toEqual({})
    expect(lost).toEqual(["Status"])
  })

  it("loses everything moving to a loose note", () => {
    expect(carryFieldValues(books, [], { author: "A", rating: 1 })).toEqual({
      values: {},
      lost: ["Author", "Rating"],
    })
  })
})

describe("field keys, options and search words", () => {
  it("makes a key from the name and never reuses one", () => {
    expect(makeFieldKey("Due date!", [])).toBe("due_date")
    expect(makeFieldKey("Due date", ["due_date", "due_date_2"])).toBe("due_date_3")
    expect(makeFieldKey("✨", [])).toBe("field")
  })

  it("refuses blank or repeated option names", () => {
    expect(() => cleanOptions("select", [{ id: "1", label: " ", colour: "grey" }])).toThrow(FIELDS_SAY.optionEmpty)
    expect(() =>
      cleanOptions("select", [
        { id: "1", label: "Done", colour: "grey" },
        { id: "2", label: "done", colour: "grey" },
      ])
    ).toThrow(FIELDS_SAY.optionTaken)
    expect(cleanOptions("text", [{ id: "1", label: "x", colour: "grey" }])).toEqual([])
  })

  it("writes values as words for the search box", () => {
    expect(fieldsSearchText([status, topics], { status: "b", topics: ["x", "y"] })).toBe(
      "Status: Done\nTopics: Pricing, Sales"
    )
  })
})
