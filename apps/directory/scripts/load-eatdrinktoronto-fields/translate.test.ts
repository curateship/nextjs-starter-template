import { describe, expect, it } from "vitest"

import {
  parseHoursLine,
  parseHoursText,
  translateTemplateFields,
  translateValues,
} from "./translate.mjs"

describe("loading the old app's leftover fields", () => {
  it("reads the four shapes an hours line comes in", () => {
    expect(parseHoursLine("Closed")).toEqual({ shifts: [], understood: true })
    expect(parseHoursLine("Open 24 hours").shifts).toEqual([
      { open: "00:00", close: "00:00" },
    ])
    expect(parseHoursLine("11:30 AM to 10 PM").shifts).toEqual([
      { open: "11:30", close: "22:00" },
    ])
    expect(parseHoursLine("12 to 2:30 PM, 5 to 10 PM").shifts).toEqual([
      { open: "12:00", close: "14:30" },
      { open: "17:00", close: "22:00" },
    ])
  })

  it("gives a bare opening time the half of the day that fits", () => {
    // Noon, not midnight: midnight to 10pm would say the place is open all
    // morning.
    expect(parseHoursLine("12 to 10 PM").shifts).toEqual([
      { open: "12:00", close: "22:00" },
    ])
    expect(parseHoursLine("5 to 10 PM").shifts).toEqual([
      { open: "17:00", close: "22:00" },
    ])
    // Neither reading is before 2am, so the evening one wins.
    expect(parseHoursLine("8 to 2 AM").shifts).toEqual([
      { open: "20:00", close: "02:00" },
    ])
  })

  it("refuses a line it cannot read rather than guessing", () => {
    expect(parseHoursLine("ring first").understood).toBe(false)
    expect(parseHoursLine("11 AM to 3").understood).toBe(false)
    expect(parseHoursLine("25 AM to 3 PM").understood).toBe(false)
  })

  it("counts the lines it could not read in a week", () => {
    const { hours, read, unreadable } = parseHoursText(
      [
        "Monday: 11 AM to 10 PM",
        "Tuesday: Closed",
        "Wednesday: by appointment",
        "Someday: 9 AM to 5 PM",
      ].join("\n")
    )
    expect(hours.monday).toEqual({
      open: "11:00",
      close: "22:00",
      second: null,
    })
    expect(hours.tuesday).toBeNull()
    expect(read).toBe(2)
    expect(unreadable).toBe(2)
  })

  it("turns a template into fields and keeps the old keys pointed at them", () => {
    let next = 0
    const { fields, keyMap, skipped } = translateTemplateFields(
      [
        { key: "field-1", label: "Popular for", type: "tags" },
        { key: "field-2", label: "Chef's note", type: "rich-text" },
        { key: "field-3", label: "Popular for", type: "tags" },
      ],
      () => `id-${(next += 1)}`
    )

    expect(fields.map((field) => field.key)).toEqual([
      "popular_for",
      "popular_for_2",
    ])
    expect(keyMap.get("field-1")).toEqual({ key: "popular_for", type: "tags" })
    expect(skipped).toEqual([{ label: "Chef's note", type: "rich-text" }])
  })

  it("splits a comma-separated tag string into tags", () => {
    const keyMap = new Map([
      ["field-1", { key: "popular_for", type: "tags" }],
      ["field-2", { key: "note", type: "text" }],
    ])
    expect(
      translateValues(
        { "field-1": "Breakfast, Lunch , ,Solo dining", "field-2": " " },
        keyMap
      )
    ).toEqual({ popular_for: ["Breakfast", "Lunch", "Solo dining"] })
  })
})
