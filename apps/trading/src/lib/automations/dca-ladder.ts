import { z } from "zod"

import type { IndicatorCandle } from "@/lib/indicators/contract"

/** Bounds history retained across every market in one live shared-wallet bot. */
export const MAX_SHARED_WALLET_HISTORY_BARS = 1_000_000

export const DEFAULT_MARKET_SCANNER_SETTINGS = {
  minDailyVolumeUsd: 5_000_000,
  historyFilterEnabled: false,
  minHistoryMonths: 6,
}

export const marketScannerSettingsFieldsSchema = z.object({
  minDailyVolumeUsd: z.number().min(0).max(1_000_000_000_000),
  historyFilterEnabled: z.boolean(),
  minHistoryMonths: z.number().int().min(1).max(60),
})

export const marketScannerSettingsSchema = marketScannerSettingsFieldsSchema
export type MarketScannerSettings = z.infer<typeof marketScannerSettingsSchema>

export type BaseTracker = {
  processedTime: number | null
  basePeriods: number
  pumpPeriods: number
  currentBase: number | null
  previousBase: number | null
  lows: number[]
}

export function createBaseTracker(
  basePeriods: number,
  pumpPeriods: number
): BaseTracker {
  return {
    processedTime: null,
    basePeriods,
    pumpPeriods,
    currentBase: null,
    previousBase: null,
    lows: [],
  }
}

export function advanceBaseTracker(
  tracker: BaseTracker,
  candle: Pick<IndicatorCandle, "t" | "l">
): BaseTracker {
  if (tracker.processedTime !== null && candle.t <= tracker.processedTime) {
    return tracker
  }

  const pump = Math.min(tracker.pumpPeriods, tracker.basePeriods - 1)
  const windowSize = tracker.basePeriods + pump + 1
  const lows = [...tracker.lows, Number(candle.l)].slice(-windowSize)
  const previousBase = tracker.currentBase
  let currentBase = tracker.currentBase

  if (lows.length === windowSize) {
    const prior = Math.min(...lows.slice(0, tracker.basePeriods))
    const held = Math.min(...lows.slice(1, tracker.basePeriods + 1))
    const now = Math.min(...lows.slice(pump + 1))
    if (prior > held && held === now) currentBase = now
  }

  return {
    ...tracker,
    processedTime: candle.t,
    currentBase,
    previousBase,
    lows,
  }
}
