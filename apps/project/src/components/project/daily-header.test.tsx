import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { DailyHeader } from "@/components/project/daily-habits"
import type { DailyCard } from "@/lib/api/project/daily-card"

const daily = {
  firstName: "Tyler",
  cardDay: "2099-03-02",
  settings: { hours: { morning: "05:00", afternoon: "12:00", night: "18:00" } },
  admin: { habits: [] },
} as unknown as DailyCard

const draw = (part: "morning" | "night", weather: Parameters<typeof DailyHeader>[0]["weather"]) =>
  renderToStaticMarkup(<DailyHeader daily={daily} part={part} afterMidnight={false} weather={weather} />)

describe("the Daily habits block's greeting", () => {
  it("says the weather under it in words (Tyler, 12 Nov 2026: \"23°C with clear blue sky\")", () => {
    const html = draw("morning", { city: "Toronto", temperature: 23, kind: "clear" })
    expect(html).toContain("Good morning, Tyler")
    expect(html).toContain("23°C with clear blue sky")
    expect(draw("night", { city: "Toronto", temperature: -2, kind: "clear" })).toContain("-2°C with clear night sky")
    expect(draw("morning", { city: "Toronto", temperature: 8, kind: "rain" })).toContain("8°C with rain")
  })

  it("leaves the line out with no weather, as with no city set", () => {
    expect(draw("morning", null)).not.toContain("°C")
  })
})
