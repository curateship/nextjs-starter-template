import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { DailyCard, type DailyNow } from "@/components/project/daily-card"
import type { DailyCard as DailyCardData } from "@/lib/api/project/daily-card"

/** Sunday 15 Nov 2026, Thursday to Saturday rated, today not yet. */
const week = [
  { day: "2026-11-09", rating: null, win: "" },
  { day: "2026-11-10", rating: null, win: "" },
  { day: "2026-11-11", rating: null, win: "" },
  { day: "2026-11-12", rating: 6, win: "Shipped the card" },
  { day: "2026-11-13", rating: 4, win: "" },
  { day: "2026-11-14", rating: 10, win: "" },
  { day: "2026-11-15", rating: null, win: "" },
]

const daily = {
  firstName: "Tyler",
  cardDay: "2026-11-15",
  zone: "UTC",
  dayOff: null,
  meetings: [],
  settings: { hours: { morning: "05:00", afternoon: "12:00", night: "18:00" }, sections: [], hidden: [], city: null },
  admin: { habits: [], milestone: null, today: { upAt: "2026-11-15T08:00:00Z" }, lookBack: week, monthly: null },
} as unknown as DailyCardData

const now = {
  nowMs: Date.parse("2026-11-15T14:00:00Z"),
  local: { day: "2026-11-15", time: "14:00" },
  part: "afternoon",
  phase: "day",
  weather: null,
} as unknown as DailyNow

const html = renderToStaticMarkup(<DailyCard daily={daily} now={now} checkin={null} frame={(body) => body} />)
const columns = [...html.matchAll(/<li class="grid min-w-0 justify-items-center[^"]*">(.*?)<\/li>/g)].map((match) => match[1])

describe("Your week on Sunday (Tyler, 15 Nov 2026: \"revamp the your week part to look like this\")", () => {
  it("draws a bar per rated day, as tall as its rating, with the number above it", () => {
    expect(columns).toHaveLength(7)
    expect(columns[3]).toContain(">6<")
    expect(columns[3]).toContain("height:51.2px")
    expect(columns[5]).toContain("height:80px")
    // A 10's bar, the gap and its number fit the 104px column.
    expect(columns[5]).toContain("h-26")
  })

  it("draws an unrated day as a grey stub under a dash, and today as a dashed stub under a ?", () => {
    expect(columns[0]).toContain(">–<")
    expect(columns[0]).toContain("bg-muted")
    expect(columns[6]).toContain(">?<")
    expect(columns[6]).toContain("border-dashed")
    expect(columns[6]).toMatch(/font-semibold">Sun</)
  })

  it("puts the chart on its own faint grey card and keeps the wins under it", () => {
    expect(html).toMatch(/<ol class="[^"]*rounded-xl bg-muted\/40[^"]*" aria-label="This week&#x27;s ratings">/)
    expect(html).toContain("Shipped the card")
  })

  it("has no average and no foot (Tyler, 15 Nov 2026: \"remove all this and average rating\")", () => {
    expect(html).not.toContain("avg")
    expect(html).not.toContain("days rated")
    expect(html).not.toContain("Rate today")
  })
})
