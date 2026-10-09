import { describe, expect, it } from "vitest"

import {
  APP_SETTING_DEFAULTS,
  defaultPairOn,
  readAppSetting,
  seasonsProblem,
  type MediaSeason,
} from "@/lib/pomodoro/app-settings"

const season = (name: string, starts: string, ends: string): MediaSeason => ({
  id: crypto.randomUUID(),
  name,
  starts,
  ends,
  sound: null,
  background: "scene:stars",
})

describe("the admin's settings", () => {
  it("reads a broken stored value as the default", () => {
    expect(readAppSetting("timer.newAccount", { focusMinutes: "lots" })).toEqual(
      APP_SETTING_DEFAULTS["timer.newAccount"]
    )
    expect(readAppSetting("media.shuffleUnset", true)).toBe(true)
  })

  it("refuses seasons that overlap or run backwards", () => {
    expect(
      seasonsProblem([season("Winter", "2026-12-01", "2026-12-31"), season("New year", "2026-12-31", "2027-01-05")])
    ).toBe('"New year" overlaps "Winter". Two seasons may not share a day.')
    expect(seasonsProblem([season("Odd", "2026-12-31", "2026-12-01")])).toBe(
      '"Odd" ends before it starts.'
    )
    expect(
      seasonsProblem([season("Winter", "2026-12-01", "2026-12-31"), season("Spring", "2027-03-01", "2027-03-31")])
    ).toBeNull()
  })

  it("uses a season's theme on its days and the default's sound where the season has none", () => {
    const defaults = { sound: "curated:rain", background: "scene:plain" }
    const seasons = [season("Winter", "2026-12-01", "2026-12-31")]
    expect(defaultPairOn(defaults, seasons, "2026-12-15")).toEqual({
      sound: "curated:rain",
      background: "scene:stars",
    })
    expect(defaultPairOn(defaults, seasons, "2027-01-01")).toEqual(defaults)
  })
})
