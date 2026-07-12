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
})
