import { describe, expect, it } from "vitest"

import type { ProtectionSettings } from "@/lib/strategies/settings"
import { exitLevels, tickExit } from "./trade-manager"

const FLAT_STATE = { exitRequested: false }

describe("exitLevels / tickExit — the one TP/SL implementation", () => {
  const position = (szi: number, entryPx = 100) => ({ szi, entryPx })

  it("computes long TP above and SL below entry (mirrored for shorts)", () => {
    const s: ProtectionSettings = { takeProfitPct: 5, stopLossPct: 2 }
    expect(exitLevels(s, position(1), FLAT_STATE)).toEqual([105, 98])
    expect(exitLevels(s, position(-1), FLAT_STATE)).toEqual([95, 102])
  })

  it("matches the legacy vwap/qqe exitTriggers formula exactly", () => {
    // Legacy: entry * (1 ± sign*pct/100) — worker vwap.ts exitTriggers.
    const s: ProtectionSettings = { takeProfitPct: 3.3, stopLossPct: 1.7 }
    const entry = 77.55
    const sign = 1
    expect(exitLevels(s, position(2, entry), FLAT_STATE)).toEqual([
      entry * (1 + (sign * 3.3) / 100),
      entry * (1 - (sign * 1.7) / 100),
    ])
  })

  it("returns nothing while flat, exit-requested, or without TP/SL", () => {
    const s: ProtectionSettings = { takeProfitPct: 5 }
    expect(exitLevels(s, null, FLAT_STATE)).toEqual([])
    expect(exitLevels(s, position(0), FLAT_STATE)).toEqual([])
    expect(exitLevels(s, position(1), { exitRequested: true })).toEqual([])
    expect(exitLevels({}, position(1), FLAT_STATE)).toEqual([])
  })

  it("tickExit fires tp/sl at and beyond the exact levels, both sides", () => {
    const s: ProtectionSettings = { takeProfitPct: 5, stopLossPct: 2 }
    expect(tickExit(s, position(1), FLAT_STATE, 105)).toBe("tp")
    expect(tickExit(s, position(1), FLAT_STATE, 104.99)).toBeNull()
    expect(tickExit(s, position(1), FLAT_STATE, 98)).toBe("sl")
    expect(tickExit(s, position(-1), FLAT_STATE, 95)).toBe("tp")
    expect(tickExit(s, position(-1), FLAT_STATE, 102)).toBe("sl")
    expect(tickExit(s, position(-1), FLAT_STATE, 100)).toBeNull()
  })

  it("a trailing stop's level follows the ratcheted extreme", () => {
    const s: ProtectionSettings = {
      takeProfitPct: 10,
      stopLossPct: 2,
      stopLossMode: "trailing",
    }
    const ratcheted = {
      exitRequested: false,
      trail: { dir: 1 as const, extremePx: 105 },
    }
    // TP stays entry-based; the stop moved up to 105 · 0.98 = 102.9.
    const levels = exitLevels(s, position(1), ratcheted)
    expect(levels[0]).toBeCloseTo(110, 10)
    expect(levels[1]).toBeCloseTo(102.9, 10)
    expect(tickExit(s, position(1), ratcheted, 102.89)).toBe("sl")
    expect(tickExit(s, position(1), ratcheted, 102.95)).toBeNull()
    // Without a ratchet yet the trailing stop sits at the fixed distance.
    expect(exitLevels(s, position(1), FLAT_STATE)[1]).toBe(98)
    expect(tickExit(s, position(1), FLAT_STATE, 98)).toBe("sl")
  })

  it("fixed-mode behavior is untouched by a stray trail state", () => {
    const s: ProtectionSettings = { takeProfitPct: 5, stopLossPct: 2 }
    const withTrail = {
      exitRequested: false,
      trail: { dir: 1 as const, extremePx: 200 },
    }
    expect(exitLevels(s, position(1), withTrail)).toEqual([105, 98])
    expect(tickExit(s, position(1), withTrail, 98)).toBe("sl")
  })

  describe("a stop anchored to the session open", () => {
    const s: ProtectionSettings = {
      stopLossPct: 5,
      takeProfitRr: 2,
      stopLossLevel: { kind: "sessionOpen", session: "utcLondon" },
    }

    it("stops AT the session-open price, and targets twice that distance", () => {
      // Long in at 100 with the session open at 98: 2% of risk, 4% of reward.
      const state = { exitRequested: false, stopLevelPx: 98 }
      const levels = exitLevels(s, position(1), state)
      expect(levels[0]).toBeCloseTo(104, 10)
      expect(levels[1]).toBeCloseTo(98, 10)
      expect(tickExit(s, position(1), state, 98)).toBe("sl")
      expect(tickExit(s, position(1), state, 98.01)).toBeNull()
      expect(tickExit(s, position(1), state, 104)).toBe("tp")
    })

    it("mirrors for a short — the level sits above the entry", () => {
      const state = { exitRequested: false, stopLevelPx: 102 }
      const levels = exitLevels(s, position(-1), state)
      expect(levels[1]).toBeCloseTo(102, 10)
      expect(levels[0]).toBeCloseTo(96, 10)
      expect(tickExit(s, position(-1), state, 102)).toBe("sl")
    })

    it("uses the configured percent for a trade opened outside the session", () => {
      // 0 is the engine's record of "looked, and no session was running".
      const state = { exitRequested: false, stopLevelPx: 0 }
      const levels = exitLevels(s, position(1), state)
      expect(levels[0]).toBeCloseTo(110, 10)
      expect(levels[1]).toBeCloseTo(95, 10)
    })

    it("rests ON the level even when the stop is anchored to the first buy", () => {
      // The ladder bug: the level used to be turned into a percent of the
      // AVERAGE and then applied to the FIRST buy, so the stop came out at
      // level * first/average — above the base by however far the ladder had
      // dragged the average down (~8.5% on a four-rung ladder), matching no
      // base and no rung. A stop set to a level belongs ON that level.
      const anchored: ProtectionSettings = {
        stopLossPct: 100,
        stopAnchor: "first",
        stopLossLevel: {
          kind: "confirmedBase",
          basePeriods: 100,
          pumpPeriods: 5,
        },
      }
      // First buy at 112.1, averaged down to 103.28, fresh base at 100.
      const state = {
        exitRequested: false,
        stopAnchorPx: 112.1,
        stopLevelPx: 100,
      }
      expect(exitLevels(anchored, position(1, 103.28), state)[0]).toBeCloseTo(
        100,
        10
      )
      expect(tickExit(anchored, position(1, 103.28), state, 100)).toBe("sl")
      // The old level, 8.5% up, must no longer close the ladder.
      expect(
        tickExit(anchored, position(1, 103.28), state, 108.54)
      ).toBeNull()
    })

    it("leaves the base stop off while the level sits above the anchor", () => {
      // The ladder buys BELOW the base it armed on, so that base is not a stop
      // for it — only a fresh, lower base is. The configured percent stands.
      const anchored: ProtectionSettings = {
        stopLossPct: 20,
        stopAnchor: "first",
        stopLossLevel: {
          kind: "confirmedBase",
          basePeriods: 100,
          pumpPeriods: 5,
        },
      }
      const state = {
        exitRequested: false,
        stopAnchorPx: 95,
        stopLevelPx: 100,
      }
      expect(exitLevels(anchored, position(1, 90), state)[0]).toBeCloseTo(76, 10)
    })
  })
})
