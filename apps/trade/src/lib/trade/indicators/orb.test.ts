import { describe, expect, it } from "vitest"

import type {
  IndicatorCandle,
  IndicatorContext,
  IndicatorPaint,
  IndicatorParams,
} from "@/lib/trade/indicators/contract"
import { orbIndicator, sessionHours } from "@/lib/trade/indicators/orb"

const MINUTE = 60_000
const QUARTER = 15 * MINUTE

/** Midnight UTC on Friday 21 August 2026, where every test day starts. */
const DAY_ONE = Date.UTC(2026, 7, 21)

/** The chart on New York time with fifteen-minute candles. */
const NEW_YORK: IndicatorContext = {
  zone: "America/New_York",
  interval: "15m",
}

/**
 * A run of quarter-hour candles, all the same dull shape.
 *
 * Every test then poke one or two of them into the shape it is about, so the
 * candle that matters is the only one written down.
 */
function flat(from: number, count: number): IndicatorCandle[] {
  return Array.from({ length: count }, (_, index) => ({
    openTime: from + index * QUARTER,
    high: 100,
    low: 99,
    close: 99.5,
  }))
}

/** One candle given a shape of its own, by the minute it opens. */
function poke(
  candles: IndicatorCandle[],
  at: number,
  shape: { high: number; low: number; close: number }
): IndicatorCandle[] {
  return candles.map((bar) =>
    bar.openTime === at ? { ...bar, ...shape } : bar
  )
}

/** The settings every test starts from. */
function settings(over: Record<string, unknown> = {}): IndicatorParams {
  return {
    session: "newYork",
    startTime: "09:30",
    endTime: "16:00",
    rangeMinutes: 15,
    showSession: true,
    showBox: true,
    showArrows: true,
    showBreakouts: true,
    showBreakdowns: true,
    ...over,
  } as IndicatorParams
}

/**
 * The range boxes alone, and the session tints alone.
 *
 * Both come back in one list because both are the same shape to whatever draws
 * them. A box with prices is the range; one without is the session behind it.
 */
const rangesIn = (paint: IndicatorPaint) =>
  paint.boxes.filter((box) => box.price !== null)
const tintsIn = (paint: IndicatorPaint) =>
  paint.boxes.filter((box) => box.price === null)

/** 09:30 New York on 21 Aug 2026, which is 13:30 UTC that day. */
const SESSION_ONE = DAY_ONE + 13 * 60 * MINUTE + 30 * MINUTE
/** The same the next day. Two days of candles is 192 quarter-hours. */
const SESSION_TWO = SESSION_ONE + 24 * 60 * MINUTE

describe("the opening range indicator", () => {
  it("boxes the first fifteen minutes of the session", () => {
    const candles = poke(flat(DAY_ONE, 96), SESSION_ONE, {
      high: 110,
      low: 100,
      close: 105,
    })
    const paint = orbIndicator.compute(candles, settings(), NEW_YORK)

    // The high and the low of the one candle the range is made of, and a span
    // that covers that candle rather than stopping at the stamp on it.
    expect(rangesIn(paint)).toEqual([
      {
        fromTime: SESSION_ONE,
        toTime: SESSION_ONE + QUARTER,
        price: { high: 110, low: 100 },
      },
    ])
    // No dashes, ever. A dash is a level and a range is an area; drawing both
    // would be two shapes saying the same thing.
    expect(paint.dashes).toEqual([])
  })

  it("arrows the first candle to close above the range", () => {
    let candles = flat(DAY_ONE, 96)
    candles = poke(candles, SESSION_ONE, { high: 110, low: 90, close: 105 })
    candles = poke(candles, SESSION_ONE + QUARTER, {
      high: 112,
      low: 104,
      close: 111,
    })
    const paint = orbIndicator.compute(candles, settings(), NEW_YORK)

    // At the candle's own close, which is what "closed outside" means.
    expect(paint.marks).toEqual([
      { time: SESSION_ONE + QUARTER, price: 111, side: "up" },
    ])
  })

  it("arrows the first candle to close below the range, the other way up", () => {
    let candles = flat(DAY_ONE, 96)
    candles = poke(candles, SESSION_ONE, { high: 110, low: 100, close: 105 })
    candles = poke(candles, SESSION_ONE + QUARTER, {
      high: 106,
      low: 96,
      close: 97,
    })
    const paint = orbIndicator.compute(candles, settings(), NEW_YORK)

    expect(paint.marks).toEqual([
      { time: SESSION_ONE + QUARTER, price: 97, side: "down" },
    ])
  })

  it("breaks once per session and then leaves that session alone", () => {
    let candles = flat(DAY_ONE, 96)
    candles = poke(candles, SESSION_ONE, { high: 110, low: 90, close: 105 })
    // Three candles in a row close above the range. Only the first is a break.
    for (const step of [1, 2, 3]) {
      candles = poke(candles, SESSION_ONE + step * QUARTER, {
        high: 115,
        low: 104,
        close: 111 + step,
      })
    }
    const paint = orbIndicator.compute(candles, settings(), NEW_YORK)

    expect(paint.marks).toHaveLength(1)
    expect(paint.marks[0].time).toBe(SESSION_ONE + QUARTER)
  })

  it("starts again at the next session", () => {
    let candles = flat(DAY_ONE, 192)
    candles = poke(candles, SESSION_ONE, { high: 110, low: 90, close: 105 })
    candles = poke(candles, SESSION_ONE + QUARTER, {
      high: 112,
      low: 104,
      close: 111,
    })
    candles = poke(candles, SESSION_TWO, { high: 120, low: 110, close: 115 })
    candles = poke(candles, SESSION_TWO + QUARTER, {
      high: 116,
      low: 105,
      close: 106,
    })
    const paint = orbIndicator.compute(candles, settings(), NEW_YORK)

    expect(rangesIn(paint).map((box) => box.fromTime)).toEqual([
      SESSION_ONE,
      SESSION_TWO,
    ])
    // Yesterday's break used up yesterday's session and nothing else.
    expect(paint.marks).toEqual([
      { time: SESSION_ONE + QUARTER, price: 111, side: "up" },
      { time: SESSION_TWO + QUARTER, price: 106, side: "down" },
    ])
  })

  it("builds the range out of every candle in it, not just the first", () => {
    let candles = flat(DAY_ONE, 96)
    candles = poke(candles, SESSION_ONE, { high: 110, low: 100, close: 105 })
    candles = poke(candles, SESSION_ONE + QUARTER, {
      high: 106,
      low: 95,
      close: 101,
    })
    const paint = orbIndicator.compute(
      candles,
      settings({ rangeMinutes: 30 }),
      NEW_YORK
    )

    // The highest high of the two and the lowest low of the two.
    expect(rangesIn(paint)).toEqual([
      {
        fromTime: SESSION_ONE,
        toTime: SESSION_ONE + 2 * QUARTER,
        price: { high: 110, low: 95 },
      },
    ])
  })
})

describe("the session behind the range", () => {
  it("shades from the moment the session opens to the moment it shuts", () => {
    const candles = poke(flat(DAY_ONE, 96), SESSION_ONE, {
      high: 110,
      low: 100,
      close: 105,
    })
    // 09:30 to 16:00 New York on this day is 13:30 to 20:00 UTC. The last
    // candle inside it opens at 19:45, so the tint ends where that one does.
    expect(tintsIn(orbIndicator.compute(candles, settings(), NEW_YORK))).toEqual(
      [
        {
          fromTime: SESSION_ONE,
          toTime: DAY_ONE + 20 * 60 * MINUTE,
          price: null,
        },
      ]
    )
  })

  it("shades a day whose opening range cannot honestly be drawn", () => {
    // The hours are a fact about the clock, not about the candles. Seeing the
    // session shaded with no box in it is how you tell that the range is the
    // thing that is missing.
    let candles = flat(DAY_ONE, 96)
    candles = candles.filter((bar) => bar.openTime !== SESSION_ONE + QUARTER)
    const paint = orbIndicator.compute(
      candles,
      settings({ rangeMinutes: 30 }),
      NEW_YORK
    )
    expect(rangesIn(paint)).toEqual([])
    expect(tintsIn(paint)).toHaveLength(1)
  })

  it("stops looking for a break once the session has shut", () => {
    let candles = flat(DAY_ONE, 96)
    candles = poke(candles, SESSION_ONE, { high: 110, low: 90, close: 105 })
    // 21:00 UTC is 17:00 New York — an hour after the session shut. A close
    // outside the range then is not this session breaking out of anything.
    candles = poke(candles, DAY_ONE + 21 * 60 * MINUTE, {
      high: 130,
      low: 104,
      close: 125,
    })
    expect(orbIndicator.compute(candles, settings(), NEW_YORK).marks).toEqual([])

    // The same candles with the session running all day do mark it.
    expect(
      orbIndicator.compute(candles, settings({ session: "dayStart" }), NEW_YORK)
        .marks
    ).toHaveLength(1)
  })

  it("carries a session that shuts after midnight onto the next day", () => {
    // 22:00 to 05:00 New York is 02:00 to 09:00 UTC. The first of these in the
    // data belongs to New York's 20th of August even though every candle in it
    // is stamped the 21st in UTC, and it is one session rather than two.
    const candles = flat(DAY_ONE, 192)
    const opens = DAY_ONE + 2 * 60 * MINUTE
    const tints = tintsIn(
      orbIndicator.compute(
        candles,
        settings({ session: "custom", startTime: "22:00", endTime: "05:00" }),
        NEW_YORK
      )
    )
    expect(tints[0]).toEqual({
      fromTime: opens,
      toTime: opens + 7 * 60 * MINUTE,
      price: null,
    })
  })
})

describe("the opening range and the clock", () => {
  it("puts the session where the chart's own clock puts it", () => {
    // The very same candles. On New York time the session is at 13:30 UTC; on
    // UTC it is at 09:30 UTC, four hours earlier, and the box moves with it.
    const utcSession = DAY_ONE + 9 * 60 * MINUTE + 30 * MINUTE
    let candles = flat(DAY_ONE, 96)
    candles = poke(candles, SESSION_ONE, { high: 110, low: 100, close: 105 })
    candles = poke(candles, utcSession, { high: 130, low: 120, close: 125 })

    expect(
      rangesIn(orbIndicator.compute(candles, settings(), NEW_YORK))[0]
    ).toMatchObject({ fromTime: SESSION_ONE, price: { high: 110 } })
    expect(
      rangesIn(
        orbIndicator.compute(candles, settings(), {
          zone: "UTC",
          interval: "15m",
        })
      )[0]
    ).toMatchObject({ fromTime: utcSession, price: { high: 130 } })
  })

  it("follows the clocks going back, so the open stays 09:30 all year", () => {
    // 21 January 2026: New York is five hours behind UTC, not four, so 09:30
    // New York is 14:30 UTC. A session stored as a fixed offset would be an
    // hour out here and this is the test that would catch it.
    const winter = Date.UTC(2026, 0, 21)
    const winterSession = winter + 14 * 60 * MINUTE + 30 * MINUTE
    const candles = poke(flat(winter, 96), winterSession, {
      high: 110,
      low: 100,
      close: 105,
    })
    const paint = orbIndicator.compute(candles, settings(), NEW_YORK)
    expect(rangesIn(paint).map((box) => box.fromTime)).toEqual([winterSession])
  })

  it("reads the hours somebody typed when the session is a custom one", () => {
    expect(sessionHours(settings())).toEqual({ start: 570, end: 960 })
    expect(sessionHours(settings({ session: "london" }))).toEqual({
      start: 480,
      end: 990,
    })
    expect(
      sessionHours(
        settings({ session: "custom", startTime: "16:45", endTime: "23:15" })
      )
    ).toEqual({ start: 16 * 60 + 45, end: 23 * 60 + 15 })
  })

  it("runs a session that shuts before it opens on past midnight", () => {
    expect(
      sessionHours(
        settings({ session: "custom", startTime: "22:00", endTime: "05:00" })
      )
    ).toEqual({ start: 22 * 60, end: 5 * 60 + 1_440 })
  })

  it("takes a session that shuts when it opens as the whole day", () => {
    expect(sessionHours(settings({ session: "dayStart" }))).toEqual({
      start: 0,
      end: 1_440,
    })
  })
})

describe("an opening range that cannot honestly be drawn", () => {
  it("draws nothing when a candle is longer than the whole range", () => {
    // The four-hour chart is the default, and a fifteen-minute range on it is
    // not a range that is hard to draw — it is one that does not exist.
    const candles = flat(DAY_ONE, 96)
    const paint = orbIndicator.compute(candles, settings(), {
      zone: "America/New_York",
      interval: "4h",
    })
    expect(paint).toEqual({ dashes: [], marks: [], boxes: [] })
    expect(orbIndicator.note?.(settings(), { zone: "UTC", interval: "4h" })).toBe(
      "A 15-minute range cannot be made out of 4h candles, so nothing is drawn. Put the chart on a shorter timeframe."
    )
  })

  it("draws nothing when the range is not a whole number of candles", () => {
    const candles = poke(flat(DAY_ONE, 96), SESSION_ONE, {
      high: 110,
      low: 100,
      close: 105,
    })
    expect(
      rangesIn(
        orbIndicator.compute(candles, settings({ rangeMinutes: 20 }), NEW_YORK)
      )
    ).toEqual([])
  })

  it("draws nothing when no candle opens on the session's own minute", () => {
    // Hourly candles open on the hour, so there is no 09:30 candle. Taking the
    // 10:00 one instead would be a box labelled as the opening range that is
    // nothing of the sort.
    const hourly = Array.from({ length: 48 }, (_, index) => ({
      openTime: DAY_ONE + index * 60 * MINUTE,
      high: 100,
      low: 99,
      close: 99.5,
    }))
    const paint = orbIndicator.compute(hourly, settings({ rangeMinutes: 60 }), {
      zone: "America/New_York",
      interval: "1h",
    })
    expect(rangesIn(paint)).toEqual([])
  })

  it("draws nothing for a day with a candle missing out of its range", () => {
    let candles = flat(DAY_ONE, 96)
    candles = poke(candles, SESSION_ONE, { high: 110, low: 100, close: 105 })
    // The second candle of a half-hour range never arrived.
    candles = candles.filter(
      (bar) => bar.openTime !== SESSION_ONE + QUARTER
    )
    expect(
      rangesIn(
        orbIndicator.compute(candles, settings({ rangeMinutes: 30 }), NEW_YORK)
      )
    ).toEqual([])
  })

  it("draws the range so far while the session is still in it, and no arrow", () => {
    // The candles run out one into a half-hour range. What price has done so
    // far is worth seeing; a break out of a box that has not finished being a
    // box is not something to point at.
    let candles = flat(DAY_ONE, 96)
    candles = poke(candles, SESSION_ONE, { high: 110, low: 100, close: 105 })
    candles = candles.filter((bar) => bar.openTime <= SESSION_ONE)
    const paint = orbIndicator.compute(
      candles,
      settings({ rangeMinutes: 30 }),
      NEW_YORK
    )
    expect(rangesIn(paint)).toEqual([
      {
        fromTime: SESSION_ONE,
        toTime: SESSION_ONE + QUARTER,
        price: { high: 110, low: 100 },
      },
    ])
    expect(paint.marks).toEqual([])
  })

  it("has nothing to say about a chart with no candles", () => {
    expect(orbIndicator.compute([], settings(), NEW_YORK)).toEqual({
      dashes: [],
      marks: [],
      boxes: [],
    })
  })

  it("reads its own settings, so junk in a saved row draws the defaults", () => {
    const candles = poke(flat(DAY_ONE, 96), SESSION_ONE, {
      high: 110,
      low: 100,
      close: 105,
    })
    const fromJunk = orbIndicator.compute(
      candles,
      {
        session: "shanghai",
        startTime: "half nine",
        rangeMinutes: Number.NaN,
      } as never,
      NEW_YORK
    )
    // A session name this build does not offer and a time that is not one both
    // fall back, which lands on the New York default: the same box as above.
    expect(rangesIn(fromJunk)).toEqual([
      {
        fromTime: SESSION_ONE,
        toTime: SESSION_ONE + QUARTER,
        price: { high: 110, low: 100 },
      },
    ])
  })
})

describe("what the opening range shows and what it watches", () => {
  function broken() {
    let candles = flat(DAY_ONE, 96)
    candles = poke(candles, SESSION_ONE, { high: 110, low: 100, close: 105 })
    candles = poke(candles, SESSION_ONE + QUARTER, {
      high: 112,
      low: 104,
      close: 111,
    })
    return candles
  }

  it("hides the arrows on their own, leaving the box", () => {
    const paint = orbIndicator.compute(
      broken(),
      settings({ showArrows: false }),
      NEW_YORK
    )
    expect(paint.marks).toEqual([])
    expect(rangesIn(paint)).toHaveLength(1)
  })

  it("hides the box on its own, leaving the tint and the arrows", () => {
    const paint = orbIndicator.compute(
      broken(),
      settings({ showBox: false }),
      NEW_YORK
    )
    expect(rangesIn(paint)).toEqual([])
    expect(tintsIn(paint)).toHaveLength(1)
    expect(paint.marks).toHaveLength(1)
  })

  it("hides the tint on its own, leaving the box", () => {
    const paint = orbIndicator.compute(
      broken(),
      settings({ showSession: false }),
      NEW_YORK
    )
    expect(tintsIn(paint)).toEqual([])
    expect(rangesIn(paint)).toHaveLength(1)
  })

  it("stops watching a side, so that side no longer uses up the break", () => {
    // A wide range, so the dull candles around it all sit inside it and the
    // only two things that happen are the two this test puts there.
    let candles = flat(DAY_ONE, 96)
    candles = poke(candles, SESSION_ONE, { high: 110, low: 90, close: 105 })
    candles = poke(candles, SESSION_ONE + QUARTER, {
      high: 112,
      low: 104,
      close: 111,
    })
    // Later in the same session, price falls through the bottom of the range.
    candles = poke(candles, SESSION_ONE + 5 * QUARTER, {
      high: 95,
      low: 80,
      close: 85,
    })

    // Watching both, the close above at 09:45 is the break and the fall is
    // never reached.
    expect(
      orbIndicator.compute(candles, settings(), NEW_YORK).marks
    ).toEqual([{ time: SESSION_ONE + QUARTER, price: 111, side: "up" }])

    // Watching only the down side, the close above is not a break at all, so
    // the fall an hour later is the one that gets the arrow.
    expect(
      orbIndicator.compute(
        candles,
        settings({ showBreakouts: false }),
        NEW_YORK
      ).marks
    ).toEqual([{ time: SESSION_ONE + 5 * QUARTER, price: 85, side: "down" }])
  })
})

describe("what the opening range says about its own settings", () => {
  it("names the clock it is on, because that is not on this card", () => {
    expect(orbIndicator.note?.(settings(), NEW_YORK)).toBe(
      "The range runs 09:30 to 09:45 and the session to 16:00, on the chart's clock, which is set to New York."
    )
  })

  it("says why nothing is drawn when the range does not fit the candles", () => {
    expect(
      orbIndicator.note?.(settings({ rangeMinutes: 20 }), NEW_YORK)
    ).toBe(
      "20 minutes is not a whole number of 15m candles, so nothing is drawn. Pick a length these candles divide into."
    )
  })
})
