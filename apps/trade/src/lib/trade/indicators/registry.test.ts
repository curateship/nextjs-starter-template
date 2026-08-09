import { describe, expect, it } from "vitest"

import type { IndicatorCandle } from "@/lib/trade/indicators/contract"
import {
  INDICATOR_LIST,
  defaultIndicatorSettings,
  indicatorPaint,
  indicatorSettingsSchema,
  indicatorsOn,
  readIndicatorSettings,
} from "@/lib/trade/indicators/registry"

const HOUR = 3_600_000

const CANDLES: IndicatorCandle[] = [10, 9, 8, 7, 5, 6, 7, 8, 9, 10].map(
  (low, index) => ({
    openTime: index * HOUR,
    low,
    high: low + 100,
    close: low + 0.5,
  })
)

describe("the indicator library", () => {
  it("starts with everything off, folded away, and at its own defaults", () => {
    const settings = defaultIndicatorSettings()
    expect(indicatorsOn(settings)).toBe(0)
    for (const module of INDICATOR_LIST) {
      expect(settings[module.kind].on).toBe(false)
      expect(settings[module.kind].params.searchBars).toBeDefined()
      // The menu opens compact; the cards inside are open once you get to them.
      expect(settings[module.kind].open).toBe(false)
      expect(settings[module.kind].shutCards).toEqual([])
    }
  })

  it("remembers which folds were left shut", () => {
    const settings = readIndicatorSettings({
      base: { on: true, params: {}, open: true, shutCards: ["Visibility"] },
    })
    expect(settings.base.open).toBe(true)
    expect(settings.base.shutCards).toEqual(["Visibility"])
  })

  it("forgets a fold whose card no longer exists", () => {
    const settings = readIndicatorSettings({
      base: {
        on: true,
        params: {},
        open: true,
        // One real card, one from a build that arranged them differently, and
        // one that is not even a name.
        shutCards: ["Settings", "Crack rule", 7],
      },
    })
    expect(settings.base.shutCards).toEqual(["Settings"])
  })

  it("takes a fold list that is not a list as nothing being folded", () => {
    const settings = readIndicatorSettings({
      base: { on: true, params: {}, shutCards: "Visibility" },
    })
    expect(settings.base.shutCards).toEqual([])
  })

  it("puts every setting on exactly one card", () => {
    for (const module of INDICATOR_LIST) {
      const onCards = module.groups.flatMap((group) => group.keys)
      // A setting on no card would simply never be drawn, and a setting on two
      // would be two boxes writing over each other.
      expect([...onCards].sort()).toEqual(
        module.fields.map((field) => field.key).sort()
      )
      // And every card names a setting that exists.
      for (const key of onCards) {
        expect(module.fields.some((field) => field.key === key)).toBe(true)
      }
    }
  })

  it("draws nothing while nothing is switched on", () => {
    expect(indicatorPaint(defaultIndicatorSettings(), CANDLES)).toEqual({
      dashes: [],
      marks: [],
    })
  })

  it("draws what a switched-on indicator asks for", () => {
    const settings = readIndicatorSettings({
      base: {
        on: true,
        params: {
          searchBars: 4,
          holdBars: 1,
          minBarsApart: 1,
          withTrendOnly: false,
          showBases: true,
          showCeilings: false,
        },
      },
    })
    expect(indicatorsOn(settings)).toBe(1)
    const paint = indicatorPaint(settings, CANDLES)
    expect(paint.marks).toHaveLength(1)
    expect(paint.dashes).toHaveLength(1)
  })

  it("has nothing to draw over a chart with no candles", () => {
    const settings = readIndicatorSettings({ base: { on: true, params: {} } })
    expect(indicatorPaint(settings, [])).toEqual({ dashes: [], marks: [] })
  })

  it("drops an indicator this build does not have", () => {
    const settings = readIndicatorSettings({
      qqe: { on: true, params: { length: 14 } },
    })
    expect(settings.qqe).toBeUndefined()
    expect(indicatorsOn(settings)).toBe(0)
  })

  it("takes a whole row it cannot read as nobody having set anything", () => {
    for (const stored of [null, "base", 7, ["base"]]) {
      expect(readIndicatorSettings(stored)).toEqual(defaultIndicatorSettings())
    }
  })

  it("normalises a save through the same reader before it is stored", () => {
    const parsed = indicatorSettingsSchema.safeParse({
      base: {
        on: true,
        params: { searchBars: 9000 },
        open: true,
        shutCards: ["Visibility"],
      },
      qqe: { on: true, params: {} },
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.qqe).toBeUndefined()
    expect(parsed.data?.base.on).toBe(true)
    // Held inside the range the field offers, exactly as a read would.
    expect(parsed.data?.base.params.searchBars).toBe(500)
    // And the folds ride through rather than being stripped on the way in.
    expect(parsed.data?.base.open).toBe(true)
    expect(parsed.data?.base.shutCards).toEqual(["Visibility"])
  })

  it("takes a save with nothing in it as everything at its defaults", () => {
    const parsed = indicatorSettingsSchema.safeParse({ base: {} })
    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual(defaultIndicatorSettings())
  })

  it("refuses a save whose shape is not settings at all", () => {
    expect(indicatorSettingsSchema.safeParse("base").success).toBe(false)
    expect(
      indicatorSettingsSchema.safeParse({ base: { on: "yes", params: {} } })
        .success
    ).toBe(false)
  })

  it("refuses a save naming far more than the library could ever hold", () => {
    const many = Object.fromEntries(
      Array.from({ length: 200 }, (_, index) => [`made-up-${index}`, { on: true }])
    )
    expect(indicatorSettingsSchema.safeParse(many).success).toBe(false)
    const manySettings = Object.fromEntries(
      Array.from({ length: 200 }, (_, index) => [`madeUp${index}`, 1])
    )
    expect(
      indicatorSettingsSchema.safeParse({ base: { params: manySettings } })
        .success
    ).toBe(false)
  })
})
