import { describe, expect, it } from "vitest"

import {
  DEFAULT_EMA_GRID_CLEAN_HOURS,
  DEFAULT_EMA_GRID_PERIOD,
  emaGridCleanBars,
  emaGridCleanHours,
  emaGridDaysForCleanHours,
  tradeGridNode,
  tradeGridSettingsSchema,
} from "@/lib/automations/nodes/trade-grid"

describe("the Grid step", () => {
  it("starts with 72 clean hours and its own EMA 200 setting", () => {
    const settings = tradeGridSettingsSchema.parse(
      tradeGridNode.createSettings()
    )

    expect(emaGridCleanHours(settings)).toBe(DEFAULT_EMA_GRID_CLEAN_HOURS)
    expect(emaGridCleanBars(settings)).toBe(18)
    expect(settings.emaPeriod).toBe(DEFAULT_EMA_GRID_PERIOD)
    expect(settings.grid).not.toHaveProperty("direction")
    expect(settings.grid).not.toHaveProperty("anchor")
    expect(settings.grid).not.toHaveProperty("reverseWhenStopped")
    expect(settings.grid).not.toHaveProperty("takeProfitPct")
    expect(settings.grid).toMatchObject({
      manualSizing: false,
      manualRungPcts: null,
      follow: false,
      followDown: false,
    })
  })

  it("describes the saved wait, EMA, levels, and wallet share", () => {
    expect(tradeGridNode.description(tradeGridNode.createSettings())).toBe(
      "72 clean hours on the 4h EMA 200, 12 levels using 20% of the wallet."
    )
  })

  it("accepts clean hours in 4-hour steps", () => {
    const settings = tradeGridSettingsSchema.parse({
      ...tradeGridNode.createSettings(),
      days: emaGridDaysForCleanHours(4),
    })

    expect(emaGridCleanHours(settings)).toBe(4)
    expect(emaGridCleanBars(settings)).toBe(1)
    expect(
      tradeGridSettingsSchema.safeParse({
        ...settings,
        days: emaGridDaysForCleanHours(6),
      }).success
    ).toBe(false)
  })

  it("refuses waits longer than 336 hours", () => {
    expect(
      tradeGridSettingsSchema.safeParse({
        ...tradeGridNode.createSettings(),
        days: emaGridDaysForCleanHours(340),
      }).success
    ).toBe(false)
  })

  it("keeps an older saved Grid step even when it lacks the new controls", () => {
    const settings = tradeGridSettingsSchema.parse(
      tradeGridNode.createSettings()
    )
    const {
      follow: _follow,
      followDown: _followDown,
      ...withoutFollowing
    } = settings.grid
    const {
      manualSizing: _manualSizing,
      manualRungPcts: _manualRungPcts,
      ...olderGrid
    } = withoutFollowing

    expect(
      tradeGridSettingsSchema.parse({ ...settings, grid: olderGrid }).grid
    ).toMatchObject({
      manualSizing: false,
      manualRungPcts: null,
      follow: false,
      followDown: false,
    })
  })
})
