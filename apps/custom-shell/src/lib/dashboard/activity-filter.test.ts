import { describe, expect, it } from "vitest"

import {
  ACTIVITY_VIEWS,
  DEFAULT_ACTIVITY_VIEW,
  emptyActivityText,
  keepShownActivity,
  type ActivityRow,
} from "@/lib/dashboard/activity-filter"

const NOW = new Date("2026-08-06T12:00:00.000Z")
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

function row(days: number, read = true): ActivityRow {
  return { read, createdAt: daysAgo(days) }
}

describe("activity tabs", () => {
  it("puts Unread last while keeping 7 days selected by default", () => {
    expect(ACTIVITY_VIEWS.at(-1)).toEqual({ value: "unread", label: "Unread" })
    expect(DEFAULT_ACTIVITY_VIEW).toBe(7)
  })
})

describe("keepShownActivity", () => {
  const rows = [row(1, false), row(3), row(12), row(45)]

  it("cuts to the last 7 days", () => {
    expect(keepShownActivity(rows, 7, NOW)).toEqual([rows[0], rows[1]])
  })

  it("cuts to the last 30 days", () => {
    expect(keepShownActivity(rows, 30, NOW)).toEqual([
      rows[0],
      rows[1],
      rows[2],
    ])
  })

  it("shows every unread row regardless of age", () => {
    expect(keepShownActivity(rows, "unread", NOW)).toEqual([rows[0]])
  })

  it("leaves the rows in the order they arrived in", () => {
    const kept = keepShownActivity(rows, 30, NOW)
    expect(kept.map((entry) => entry.createdAt.getTime())).toEqual(
      [...kept]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((entry) => entry.createdAt.getTime())
    )
  })
})

describe("emptyActivityText", () => {
  it("says how far back it looked", () => {
    expect(emptyActivityText(7)).toContain("last 7 days")
    expect(emptyActivityText(30)).toContain("last 30 days")
    expect(emptyActivityText("unread")).toBe(
      "All notifications have been read."
    )
  })
})
