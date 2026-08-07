import { describe, expect, it } from "vitest"

import {
  ACTIVITY_FILTERS,
  DEFAULT_ACTIVITY_FILTER,
  emptyActivityText,
  keepShownActivity,
  showsDatedActivity,
  showsUrgent,
  type ActivityRow,
} from "@/lib/dashboard/activity-filter"
import {
  notificationTypeLabels,
} from "@/lib/notification-types"

const NOW = new Date("2026-08-06T12:00:00.000Z")
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

function row(
  type: ActivityRow["type"],
  days: number,
  read = true
): ActivityRow {
  return { type, read, createdAt: daysAgo(days) }
}

describe("the dropdown", () => {
  it("opens on Urgent", () => {
    expect(DEFAULT_ACTIVITY_FILTER).toBe("urgent")
    expect(ACTIVITY_FILTERS[0]?.value).toBe("urgent")
  })

  it("offers every kind of notice the app can send", () => {
    const offered = new Set(ACTIVITY_FILTERS.map((entry) => entry.value))
    for (const type of Object.keys(notificationTypeLabels)) {
      expect(offered.has(type as never)).toBe(true)
    }
  })

  it("shows the urgent rows on Urgent and on Everything, nowhere else", () => {
    expect(showsUrgent("urgent")).toBe(true)
    expect(showsUrgent("all")).toBe(true)
    expect(showsUrgent("unread")).toBe(false)
    expect(showsUrgent("feedback_comment")).toBe(false)
  })

  it("has no dated rows under Urgent", () => {
    expect(showsDatedActivity("urgent")).toBe(false)
    expect(showsDatedActivity("all")).toBe(true)
  })
})

describe("keepShownActivity", () => {
  const rows = [
    row("feedback_comment", 1, false),
    row("announcement", 3),
    row("feedback_comment", 12),
    row("changelog", 45),
  ]

  it("shows nothing dated under Urgent", () => {
    expect(keepShownActivity(rows, "urgent", 30, NOW)).toEqual([])
  })

  it("cuts to the last 7 days", () => {
    expect(keepShownActivity(rows, "all", 7, NOW)).toEqual([rows[0], rows[1]])
  })

  it("cuts to the last 30 days", () => {
    expect(keepShownActivity(rows, "all", 30, NOW)).toEqual([
      rows[0],
      rows[1],
      rows[2],
    ])
  })

  it("keeps only unopened rows on Unread, still inside the range", () => {
    expect(keepShownActivity(rows, "unread", 30, NOW)).toEqual([rows[0]])
  })

  it("keeps only one kind when a kind is chosen", () => {
    expect(keepShownActivity(rows, "feedback_comment", 30, NOW)).toEqual([
      rows[0],
      rows[2],
    ])
  })

  it("leaves the rows in the order they arrived in", () => {
    const kept = keepShownActivity(rows, "all", 30, NOW)
    expect(kept.map((entry) => entry.createdAt.getTime())).toEqual(
      [...kept].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((entry) => entry.createdAt.getTime())
    )
  })
})

describe("emptyActivityText", () => {
  it("says what was asked for, and how far back it looked", () => {
    expect(emptyActivityText("urgent", 7)).toBe("Nothing needs you right now.")
    expect(emptyActivityText("all", 30)).toContain("last 30 days")
    expect(emptyActivityText("unread", 7)).toContain("last 7 days")
    expect(emptyActivityText("announcement", 30)).toBe(
      "No announcement notices in the last 30 days."
    )
  })
})
