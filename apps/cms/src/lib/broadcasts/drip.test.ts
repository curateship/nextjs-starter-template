import { describe, expect, it } from "vitest"

import {
  DEFAULT_DRIP_CONFIG,
  describeDripSchedule,
  estimateDripBatches,
  isWithinDripWindow,
  nextDripWindowOpen,
  parseDripConfig,
  pickBatchSize,
  pickWaitMs,
  validateDripConfig,
  type DripConfig,
} from "@/lib/broadcasts/drip"

function config(overrides: Partial<DripConfig> = {}): DripConfig {
  return { ...DEFAULT_DRIP_CONFIG, enabled: true, ...overrides }
}

describe("parseDripConfig", () => {
  it("is off when nothing has been saved", () => {
    expect(parseDripConfig(null).enabled).toBe(false)
    expect(parseDripConfig(undefined).enabled).toBe(false)
    expect(parseDripConfig({}).enabled).toBe(false)
  })

  it("falls back to off rather than guessing a pace for a broken config", () => {
    // A pace nobody chose is worse than no pace at all.
    expect(parseDripConfig({ enabled: true, batchSizeMin: -5 })).toEqual(
      DEFAULT_DRIP_CONFIG
    )
    expect(parseDripConfig("nonsense").enabled).toBe(false)
  })

  it("fills in the parts a partly-written config leaves out", () => {
    const parsed = parseDripConfig({ enabled: true, batchSizeMin: 10 })
    expect(parsed.enabled).toBe(true)
    expect(parsed.batchSizeMin).toBe(10)
    expect(parsed.batchSizeMax).toBe(DEFAULT_DRIP_CONFIG.batchSizeMax)
  })

  it("refuses a timezone the server does not know", () => {
    expect(parseDripConfig({ enabled: true, timezone: "Mars/Olympus" })).toEqual(
      DEFAULT_DRIP_CONFIG
    )
  })

  it("keeps a real timezone that is not on the settings list", () => {
    expect(
      parseDripConfig({ enabled: true, timezone: "Europe/Berlin" }).timezone
    ).toBe("Europe/Berlin")
  })

  it("refuses more than two sending windows", () => {
    const three = {
      enabled: true,
      windows: [
        { start: "08:00", end: "09:00" },
        { start: "10:00", end: "11:00" },
        { start: "12:00", end: "13:00" },
      ],
    }
    expect(parseDripConfig(three)).toEqual(DEFAULT_DRIP_CONFIG)
  })
})

describe("picking a batch size and a wait", () => {
  it("stays inside the range at both ends", () => {
    const paced = config({ batchSizeMin: 400, batchSizeMax: 500 })
    expect(pickBatchSize(paced, () => 0)).toBe(400)
    expect(pickBatchSize(paced, () => 0.999999)).toBe(500)
    expect(pickBatchSize(paced, () => 1)).toBe(500)
  })

  it("gives the same number when the range has one value in it", () => {
    const fixed = config({ batchSizeMin: 250, batchSizeMax: 250 })
    expect(pickBatchSize(fixed, () => 0)).toBe(250)
    expect(pickBatchSize(fixed, () => 0.5)).toBe(250)
  })

  it("survives a saved config whose max is below its min", () => {
    const backwards = config({ batchSizeMin: 500, batchSizeMax: 100 })
    const picked = pickBatchSize(backwards, () => 0.5)
    expect(picked).toBeGreaterThanOrEqual(100)
    expect(picked).toBeLessThanOrEqual(500)
  })

  it("turns the wait into milliseconds", () => {
    const paced = config({ waitMinMinutes: 30, waitMaxMinutes: 60 })
    expect(pickWaitMs(paced, () => 0)).toBe(30 * 60_000)
    expect(pickWaitMs(paced, () => 0.999999)).toBe(60 * 60_000)
  })
})

describe("isWithinDripWindow", () => {
  it("is open at any hour when no hours were chosen", () => {
    const anyHour = config({ windows: [] })
    expect(isWithinDripWindow(anyHour, new Date("2026-08-04T07:00:00Z"))).toBe(true)
    expect(isWithinDripWindow(anyHour, new Date("2026-08-04T23:00:00Z"))).toBe(true)
  })

  it("opens and closes on the chosen hours in the chosen timezone", () => {
    // 8am–1pm Eastern. In August that is 12:00–17:00 UTC.
    const paced = config({
      windows: [{ start: "08:00", end: "13:00" }],
      timezone: "America/New_York",
    })
    expect(isWithinDripWindow(paced, new Date("2026-08-04T11:59:00Z"))).toBe(false)
    expect(isWithinDripWindow(paced, new Date("2026-08-04T12:00:00Z"))).toBe(true)
    expect(isWithinDripWindow(paced, new Date("2026-08-04T16:59:00Z"))).toBe(true)
    expect(isWithinDripWindow(paced, new Date("2026-08-04T17:00:00Z"))).toBe(false)
  })

  it("holds the same wall-clock hours after the clocks change", () => {
    // The same 8am–1pm Eastern in January is 13:00–18:00 UTC, an hour later,
    // because Eastern is on standard time. Re-parsing a formatted date string
    // gets this wrong; reading the offset does not.
    const paced = config({
      windows: [{ start: "08:00", end: "13:00" }],
      timezone: "America/New_York",
    })
    expect(isWithinDripWindow(paced, new Date("2026-01-06T12:30:00Z"))).toBe(false)
    expect(isWithinDripWindow(paced, new Date("2026-01-06T13:30:00Z"))).toBe(true)
    expect(isWithinDripWindow(paced, new Date("2026-01-06T17:59:00Z"))).toBe(true)
    expect(isWithinDripWindow(paced, new Date("2026-01-06T18:30:00Z"))).toBe(false)
  })

  it("handles a window that runs past midnight", () => {
    // 10pm–2am Eastern = 02:00–06:00 UTC in August.
    const overnight = config({
      windows: [{ start: "22:00", end: "02:00" }],
      timezone: "America/New_York",
    })
    expect(isWithinDripWindow(overnight, new Date("2026-08-04T03:00:00Z"))).toBe(true)
    expect(isWithinDripWindow(overnight, new Date("2026-08-04T07:00:00Z"))).toBe(false)
    expect(isWithinDripWindow(overnight, new Date("2026-08-05T02:30:00Z"))).toBe(true)
  })

  it("is open when either of two windows is open", () => {
    const twice = config({
      windows: [
        { start: "08:00", end: "13:00" },
        { start: "19:00", end: "21:00" },
      ],
      timezone: "America/New_York",
    })
    // 3pm Eastern sits between the two.
    expect(isWithinDripWindow(twice, new Date("2026-08-04T19:00:00Z"))).toBe(false)
    // 8pm Eastern is inside the second.
    expect(isWithinDripWindow(twice, new Date("2026-08-05T00:00:00Z"))).toBe(true)
  })

  it("closes at the weekend when asked", () => {
    const weekdays = config({ windows: [], skipWeekends: true })
    // 1 Aug 2026 is a Saturday, 3 Aug a Monday.
    expect(isWithinDripWindow(weekdays, new Date("2026-08-01T15:00:00Z"))).toBe(false)
    expect(isWithinDripWindow(weekdays, new Date("2026-08-02T15:00:00Z"))).toBe(false)
    expect(isWithinDripWindow(weekdays, new Date("2026-08-03T15:00:00Z"))).toBe(true)
  })

  it("judges the weekend by the reader's timezone, not the server's", () => {
    // Saturday 00:30 UTC is still Friday evening in New York.
    const weekdays = config({
      windows: [],
      skipWeekends: true,
      timezone: "America/New_York",
    })
    expect(isWithinDripWindow(weekdays, new Date("2026-08-01T00:30:00Z"))).toBe(true)
  })

  it("reads a start and end at the same time as any hour, not as never", () => {
    const broken = config({ windows: [{ start: "09:00", end: "09:00" }] })
    expect(isWithinDripWindow(broken, new Date("2026-08-04T03:00:00Z"))).toBe(true)
  })
})

describe("nextDripWindowOpen", () => {
  it("gives back the moment it was asked about when sending is already open", () => {
    const at = new Date("2026-08-04T14:00:00Z")
    expect(nextDripWindowOpen(config({ windows: [] }), at)).toEqual(at)
  })

  it("points at this morning's opening when the night is still young", () => {
    const paced = config({
      windows: [{ start: "08:00", end: "13:00" }],
      timezone: "America/New_York",
    })
    // 2am Eastern on the 4th → 8am Eastern the same day = 12:00 UTC.
    const next = nextDripWindowOpen(paced, new Date("2026-08-04T06:00:00Z"))
    expect(next.toISOString()).toBe("2026-08-04T12:00:00.000Z")
  })

  it("rolls to tomorrow once the last window has closed", () => {
    const paced = config({
      windows: [{ start: "08:00", end: "13:00" }],
      timezone: "America/New_York",
    })
    // 6pm Eastern on the 4th → 8am Eastern on the 5th.
    const next = nextDripWindowOpen(paced, new Date("2026-08-04T22:00:00Z"))
    expect(next.toISOString()).toBe("2026-08-05T12:00:00.000Z")
  })

  it("picks the nearer of two windows", () => {
    const twice = config({
      windows: [
        { start: "08:00", end: "13:00" },
        { start: "19:00", end: "21:00" },
      ],
      timezone: "America/New_York",
    })
    // 3pm Eastern → the 7pm window today, not 8am tomorrow.
    const next = nextDripWindowOpen(twice, new Date("2026-08-04T19:00:00Z"))
    expect(next.toISOString()).toBe("2026-08-04T23:00:00.000Z")
  })

  it("skips the whole weekend and lands on Monday morning", () => {
    const paced = config({
      windows: [{ start: "08:00", end: "13:00" }],
      skipWeekends: true,
      timezone: "America/New_York",
    })
    // Friday 31 July 2026, 6pm Eastern → Monday 3 August, 8am Eastern.
    const next = nextDripWindowOpen(paced, new Date("2026-07-31T22:00:00Z"))
    expect(next.toISOString()).toBe("2026-08-03T12:00:00.000Z")
  })

  it("waits for Monday midnight when only the weekend is closed", () => {
    const paced = config({
      windows: [],
      skipWeekends: true,
      timezone: "America/New_York",
    })
    // Saturday afternoon → midnight Monday Eastern = 04:00 UTC Monday.
    const next = nextDripWindowOpen(paced, new Date("2026-08-01T18:00:00Z"))
    expect(next.toISOString()).toBe("2026-08-03T04:00:00.000Z")
  })

  it("gets the opening right across a clocks-change weekend", () => {
    // US clocks go forward on Sunday 8 March 2026. 8am Eastern on the 9th is
    // 12:00 UTC; on the 6th it was 13:00 UTC.
    const paced = config({
      windows: [{ start: "08:00", end: "13:00" }],
      timezone: "America/New_York",
    })
    const next = nextDripWindowOpen(paced, new Date("2026-03-08T20:00:00Z"))
    expect(next.toISOString()).toBe("2026-03-09T12:00:00.000Z")
  })

  it("rolls over the end of a month", () => {
    const paced = config({
      windows: [{ start: "08:00", end: "13:00" }],
      timezone: "America/New_York",
    })
    // 31 August, 6pm Eastern → 1 September, 8am Eastern.
    const next = nextDripWindowOpen(paced, new Date("2026-08-31T22:00:00Z"))
    expect(next.toISOString()).toBe("2026-09-01T12:00:00.000Z")
  })

  it("always moves forward, never back", () => {
    const paced = config({
      windows: [{ start: "08:00", end: "13:00" }],
      timezone: "America/New_York",
    })
    for (const hour of [0, 5, 11, 12, 16, 17, 20, 23]) {
      const at = new Date(`2026-08-04T${String(hour).padStart(2, "0")}:00:00Z`)
      const next = nextDripWindowOpen(paced, at)
      expect(next.getTime()).toBeGreaterThanOrEqual(at.getTime())
    }
  })
})

describe("validateDripConfig", () => {
  it("says nothing when drip is off, whatever the numbers are", () => {
    expect(
      validateDripConfig(
        config({ enabled: false, batchSizeMin: 900, batchSizeMax: 100 })
      )
    ).toBeNull()
  })

  it("catches a batch range the wrong way round", () => {
    expect(
      validateDripConfig(config({ batchSizeMin: 900, batchSizeMax: 100 }))
    ).toMatch(/batch size/i)
  })

  it("catches a wait range the wrong way round", () => {
    expect(
      validateDripConfig(config({ waitMinMinutes: 90, waitMaxMinutes: 10 }))
    ).toMatch(/wait/i)
  })

  it("catches a window with no time in it", () => {
    expect(
      validateDripConfig(
        config({ windows: [{ start: "09:00", end: "09:00" }] })
      )
    ).toMatch(/sending hours/i)
  })

  it("passes a sensible config", () => {
    expect(validateDripConfig(config())).toBeNull()
  })
})

describe("describeDripSchedule", () => {
  it("says so plainly when drip is off", () => {
    expect(describeDripSchedule(config({ enabled: false }))).toMatch(
      /as fast as the server can send/i
    )
  })

  it("reads as a sentence", () => {
    const text = describeDripSchedule(
      config({
        batchSizeMin: 400,
        batchSizeMax: 500,
        waitMinMinutes: 30,
        waitMaxMinutes: 60,
        windows: [
          { start: "08:00", end: "13:00" },
          { start: "19:00", end: "21:00" },
        ],
        skipWeekends: true,
        timezone: "America/New_York",
      })
    )
    expect(text).toBe(
      "400–500 people at a time, 30–60 minutes apart, 8am–1pm and 7pm–9pm Eastern time, weekdays only."
    )
  })

  it("does not write a range when both ends are the same", () => {
    const text = describeDripSchedule(
      config({
        batchSizeMin: 200,
        batchSizeMax: 200,
        waitMinMinutes: 15,
        waitMaxMinutes: 15,
        windows: [],
      })
    )
    expect(text).toBe("200 people at a time, 15 minutes apart, any time of day.")
  })
})

describe("estimateDripBatches", () => {
  it("counts the chunks and the waits between them", () => {
    const paced = config({
      batchSizeMin: 400,
      batchSizeMax: 500,
      waitMinMinutes: 30,
      waitMaxMinutes: 60,
    })
    // 4,500 people at a typical 450 a time is 10 chunks, so 9 waits of 45 min.
    expect(estimateDripBatches(paced, 4500)).toEqual({
      batches: 10,
      minutes: 405,
    })
  })

  it("has no wait to count when everyone fits in one chunk", () => {
    const paced = config({ batchSizeMin: 400, batchSizeMax: 500 })
    expect(estimateDripBatches(paced, 50)).toEqual({ batches: 1, minutes: 0 })
  })

  it("never claims zero chunks for an empty list", () => {
    expect(estimateDripBatches(config(), 0).batches).toBe(1)
  })
})
