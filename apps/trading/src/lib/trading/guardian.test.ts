import { describe, expect, it } from "vitest"

import {
  createEmptyGuardianWatch,
  describeGuardianLimits,
  evaluateGuardianTick,
  globalCommandReason,
  guardianHasLimit,
  guardianUtcDate,
  GUARDIAN_TRIP_STREAK,
  type GuardianLimits,
  type GuardianWatch,
} from "@/lib/trading/guardian"

const NO_LIMITS: GuardianLimits = {
  dailyLossLimitUsd: null,
  dailyLossLimitPct: null,
  maxDrawdownPct: null,
}

const DAY = "2026-07-17"

function run(
  limits: Partial<GuardianLimits>,
  equities: number[],
  start: GuardianWatch = createEmptyGuardianWatch()
) {
  let watch = start
  const results = []
  for (const equity of equities) {
    const result = evaluateGuardianTick({
      limits: { ...NO_LIMITS, ...limits },
      watch,
      equity,
      utcDate: DAY,
    })
    watch = result.watch
    results.push(result)
  }
  return results
}

describe("evaluateGuardianTick", () => {
  it("seeds the day start and peak from the first reading with no breach", () => {
    const [first] = run({ dailyLossLimitUsd: 100 }, [1_000])
    expect(first.watch).toEqual({
      dayDate: DAY,
      dayStartEquity: 1_000,
      peakEquity: 1_000,
      breachStreak: 0,
    })
    expect(first.breaches).toEqual([])
    expect(first.trip).toBeNull()
  })

  it("trips the dollar daily-loss limit only after the full streak", () => {
    const results = run({ dailyLossLimitUsd: 100 }, [1_000, 890, 880, 870])
    expect(results.map((r) => r.breaches.length)).toEqual([0, 1, 1, 1])
    expect(results.map((r) => r.trip !== null)).toEqual([
      false,
      false,
      false,
      true,
    ])
    expect(results[3].trip).toContain("$130")
    expect(results[3].trip).toContain(`${GUARDIAN_TRIP_STREAK} checks in a row`)
  })

  it("a single spike reading resets the streak instead of tripping", () => {
    const results = run(
      { dailyLossLimitUsd: 100 },
      [1_000, 880, 950, 880, 890, 950]
    )
    expect(results.every((r) => r.trip === null)).toBe(true)
    expect(results[4].watch.breachStreak).toBe(2)
    expect(results[5].watch.breachStreak).toBe(0)
  })

  it("trips the percent daily-loss limit against the day's starting value", () => {
    const results = run({ dailyLossLimitPct: 5 }, [2_000, 1_899, 1_899, 1_899])
    expect(results[3].trip).toContain("of the day's starting value")
  })

  it("trips drawdown from the rolling peak even when the day is green", () => {
    // Day starts at 1000, rallies to 1500, then gives back 12% of the peak —
    // still up on the day, but past a 10% drawdown limit.
    const results = run(
      { maxDrawdownPct: 10 },
      [1_000, 1_500, 1_320, 1_320, 1_320]
    )
    expect(results[1].breaches).toEqual([])
    expect(results[4].trip).toContain("below its watched peak")
    expect(results[4].watch.peakEquity).toBe(1_500)
  })

  it("a new peak keeps drawdown at zero", () => {
    const results = run({ maxDrawdownPct: 5 }, [1_000, 1_100, 1_200])
    expect(results.every((r) => r.breaches.length === 0)).toBe(true)
    expect(results[2].watch.peakEquity).toBe(1_200)
  })

  it("re-baselines the daily loss at the UTC day rollover but keeps the peak", () => {
    const [yesterday] = run({ dailyLossLimitUsd: 100 }, [1_000])
    const next = evaluateGuardianTick({
      limits: { ...NO_LIMITS, dailyLossLimitUsd: 100 },
      watch: { ...yesterday.watch, dayDate: "2026-07-16", peakEquity: 1_400 },
      equity: 850,
      utcDate: DAY,
    })
    // 850 is the new day's start, so today's loss is 0 — no breach.
    expect(next.watch.dayStartEquity).toBe(850)
    expect(next.watch.peakEquity).toBe(1_400)
    expect(next.breaches).toEqual([])
  })

  it("a fresh watch after re-arm does not instantly re-trip on the same loss", () => {
    // The account already lost more than the limit today; re-arm resets the
    // baselines so watching restarts from current equity.
    const results = run({ dailyLossLimitUsd: 100, maxDrawdownPct: 10 }, [700])
    expect(results[0].breaches).toEqual([])
  })

  it("ignores percent limits when the baseline is zero", () => {
    const results = run({ dailyLossLimitPct: 5, maxDrawdownPct: 5 }, [0, 0, 0, 0])
    expect(results.every((r) => r.breaches.length === 0)).toBe(true)
  })

  it("treats a zero or negative limit as off, never as instantly crossed", () => {
    const results = run(
      { dailyLossLimitUsd: 0, dailyLossLimitPct: 0, maxDrawdownPct: -1 },
      [1_000, 1_000, 1_000, 1_000]
    )
    expect(results.every((r) => r.breaches.length === 0)).toBe(true)
    expect(results.every((r) => r.trip === null)).toBe(true)
  })

  it("reports every crossed limit in one plain-English reason", () => {
    const results = run(
      { dailyLossLimitUsd: 50, dailyLossLimitPct: 5, maxDrawdownPct: 5 },
      [1_000, 900, 900, 900]
    )
    expect(results[3].breaches).toHaveLength(3)
    expect(results[3].trip).toContain(" and ")
  })
})

describe("guardian helpers", () => {
  it("guardianUtcDate uses the UTC calendar day", () => {
    expect(guardianUtcDate(new Date("2026-07-17T23:59:59Z"))).toBe("2026-07-17")
    expect(guardianUtcDate(new Date("2026-07-18T00:00:01Z"))).toBe("2026-07-18")
  })

  it("guardianHasLimit requires at least one limit", () => {
    expect(guardianHasLimit(NO_LIMITS)).toBe(false)
    expect(guardianHasLimit({ ...NO_LIMITS, maxDrawdownPct: 10 })).toBe(true)
  })

  it("describeGuardianLimits reads as one sentence fragment", () => {
    expect(
      describeGuardianLimits({
        dailyLossLimitUsd: 500,
        dailyLossLimitPct: 2,
        maxDrawdownPct: 10,
      })
    ).toBe(
      "today's loss reaches $500 or 2% of the day's start, or the account drops 10% from its peak"
    )
  })

  it("globalCommandReason is lenient about payload shape", () => {
    expect(globalCommandReason(null)).toBeNull()
    expect(globalCommandReason({})).toBeNull()
    expect(globalCommandReason({ reason: "  " })).toBeNull()
    expect(globalCommandReason({ reason: "Guardian: limit hit" })).toBe(
      "Guardian: limit hit"
    )
  })
})
