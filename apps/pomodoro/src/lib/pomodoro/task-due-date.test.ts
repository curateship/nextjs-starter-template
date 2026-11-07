import { describe, expect, it } from "vitest"

import { dueDateMark, normalizeDueDate } from "@/lib/pomodoro/tasks"

// A Saturday, so "inside the coming week" reads as weekday names.
const TODAY = "2099-03-07"

describe("dueDateMark", () => {
  it("says today and yesterday in red", () => {
    expect(dueDateMark("2099-03-07", TODAY)).toEqual({ text: "Due today", tone: "due" })
    expect(dueDateMark("2099-03-06", TODAY)).toEqual({ text: "Due yesterday", tone: "due" })
  })

  it("names the day it was due from when it is older", () => {
    expect(dueDateMark("2099-03-02", TODAY)).toEqual({ text: "Overdue since Mar 2", tone: "due" })
  })

  it("says tomorrow in amber", () => {
    expect(dueDateMark("2099-03-08", TODAY)).toEqual({ text: "Due tomorrow", tone: "soon" })
  })

  it("names the weekday inside the coming week, then the date", () => {
    expect(dueDateMark("2099-03-13", TODAY)).toEqual({ text: "Due Fri", tone: "later" })
    expect(dueDateMark("2099-03-14", TODAY)).toEqual({ text: "Due Mar 14", tone: "later" })
  })
})

describe("normalizeDueDate", () => {
  it("keeps a yyyy-mm-dd and drops anything else", () => {
    expect(normalizeDueDate("2099-03-07")).toBe("2099-03-07")
    expect(normalizeDueDate("next friday")).toBe(null)
    expect(normalizeDueDate(undefined)).toBe(null)
  })
})
