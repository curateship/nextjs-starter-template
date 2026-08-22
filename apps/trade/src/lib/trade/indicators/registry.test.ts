import { describe, expect, it } from "vitest"

import type {
  IndicatorCandle,
  IndicatorContext,
} from "@/lib/trade/indicators/contract"
import {
  INDICATOR_LIST,
  SIGNAL_INDICATORS,
  defaultIndicatorSettings,
  indicatorPaint,
  indicatorSettingsSchema,
  indicatorSignals,
  indicatorsOn,
  readIndicatorSettings,
  signalIndicatorsOn,
} from "@/lib/trade/indicators/registry"

const HOUR = 3_600_000

/** What the chart these candles came off is set to. */
const CHART: IndicatorContext = { zone: "UTC", interval: "1h" }

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
      // Its OWN settings, not any one indicator's. Asserting on a Base field
      // here passed for exactly as long as Base was the only indicator, and
      // would have failed the moment a second one arrived without saying
      // anything true about it.
      for (const field of module.fields) {
        expect(settings[module.kind].params[field.key]).toBeDefined()
      }
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
    expect(indicatorPaint(defaultIndicatorSettings(), CANDLES, CHART)).toEqual({
      lines: [],
      dashes: [],
      marks: [],
      boxes: [],
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
    const paint = indicatorPaint(settings, CANDLES, CHART)
    expect(paint.marks).toHaveLength(1)
    expect(paint.dashes).toHaveLength(1)
  })

  it("can draw one indicator from finer candles than the chart", () => {
    const settings = readIndicatorSettings({
      orb: {
        on: true,
        params: {
          session: "custom",
          startTime: "00:00",
          endTime: "04:00",
          rangeMinutes: 15,
        },
      },
    })
    const quarterHour = Array.from({ length: 16 }, (_, index) => ({
      openTime: index * 15 * 60_000,
      low: 99,
      high: 101,
      close: index === 2 ? 102 : 100,
    }))

    const paint = indicatorPaint(settings, CANDLES, CHART, {
      orb: { candles: quarterHour, interval: "15m" },
    })

    expect(paint.boxes.some((box) => box.price !== null)).toBe(true)
    expect(paint.marks).toEqual([
      { time: 2 * 15 * 60_000, price: 102, side: "up" },
    ])
  })

  it("has nothing to draw over a chart with no candles", () => {
    const settings = readIndicatorSettings({ base: { on: true, params: {} } })
    expect(indicatorPaint(settings, [], CHART)).toEqual({
      lines: [],
      dashes: [],
      marks: [],
      boxes: [],
    })
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
      Array.from({ length: 200 }, (_, index) => [
        `made-up-${index}`,
        { on: true },
      ])
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

describe("asking the library for signals", () => {
  it("offers only the indicators that can actually call a trade", () => {
    // A shorter list than the library is allowed and expected. What is not
    // allowed is an indicator appearing here without a way to answer.
    for (const module of SIGNAL_INDICATORS) {
      expect(module.signals).toBeDefined()
      expect(INDICATOR_LIST).toContain(module)
    }
  })

  it("says nothing while every indicator is switched off", () => {
    expect(indicatorSignals(defaultIndicatorSettings(), CANDLES)).toEqual([])
    expect(signalIndicatorsOn(defaultIndicatorSettings())).toBe(0)
  })

  it("answers the switched-on ones, and counts them", () => {
    const settings = readIndicatorSettings({
      base: {
        on: true,
        params: { searchBars: 4, holdBars: 1, minBarsApart: 1 },
      },
    })
    expect(signalIndicatorsOn(settings)).toBe(1)
    const called = indicatorSignals(settings, CANDLES)
    expect(called).toEqual([{ time: 5 * HOUR, side: "buy" }])
  })

  it("answers an empty list rather than throwing on no candles", () => {
    // The panel and the engine both ask this while prices are still arriving.
    const settings = readIndicatorSettings({ base: { on: true, params: {} } })
    expect(indicatorSignals(settings, [])).toEqual([])
  })

  it("hands back one moment per indicator, never a merged one", () => {
    // Two indicators calling the same candle is two signals. Merging them here
    // would be the registry inventing a rule nobody asked it for; what to do
    // about a crowded moment belongs to whatever is trading.
    const settings = readIndicatorSettings({
      base: {
        on: true,
        params: { searchBars: 4, holdBars: 1, minBarsApart: 1 },
      },
    })
    const called = indicatorSignals(settings, CANDLES)
    const times = called.map((one) => one.time)
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })
})
