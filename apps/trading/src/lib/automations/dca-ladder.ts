import { z } from "zod"

import type { IndicatorCandle } from "@/lib/indicators/contract"
import { baseLevels } from "@/lib/strategies/indicators"

const MONTH_MS = 30 * 86_400_000

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

export type BaseRespectScore = {
  respected: number
  total: number
  rate: number | null
  hasFullHistory: boolean
}

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

/** The base/crack/recovery fields the respect scan reads. A DCA node's config
 * carries all five, so it can be scored directly. */
export type BaseRespectSettings = {
  basePeriods: number
  pumpPeriods: number
  crackPct: number
  recoveryTargetPct: number
  respectLookbackMonths: number
}

export function baseRespectScore(
  candles: IndicatorCandle[],
  settings: BaseRespectSettings,
  now: number = candles.at(-1)?.t ?? 0
): BaseRespectScore {
  const visible = candles.filter((candle) => candle.t <= now)
  const cutoff = now - settings.respectLookbackMonths * MONTH_MS
  const hasFullHistory = (visible[0]?.t ?? Number.POSITIVE_INFINITY) <= cutoff
  const bases = baseLevels(visible, settings.basePeriods, settings.pumpPeriods).raw
  let active: { base: number; startedAt: number } | null = null
  let respected = 0
  let total = 0

  for (let index = 1; index < visible.length; index += 1) {
    const candle = visible[index]
    if (active) {
      const recovery = active.base * (1 + settings.recoveryTargetPct / 100)
      if (candle.h >= recovery) {
        if (active.startedAt >= cutoff) {
          total += 1
          respected += 1
        }
        active = null
      }
      continue
    }

    const base = bases[index]
    const previousBase = bases[index - 1]
    if (!Number.isFinite(base) || !Number.isFinite(previousBase)) continue
    const threshold = base * (1 - settings.crackPct / 100)
    const previousThreshold = previousBase * (1 - settings.crackPct / 100)
    if (visible[index - 1].c >= previousThreshold && candle.c < threshold) {
      active = { base, startedAt: candle.t }
    }
  }

  if (active && active.startedAt >= cutoff) total += 1
  return {
    respected,
    total,
    rate: total > 0 ? (respected / total) * 100 : null,
    hasFullHistory,
  }
}
