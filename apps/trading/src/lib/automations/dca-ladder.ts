import { z } from "zod"

import type { IndicatorCandle } from "@/lib/indicators/contract"
import type { AutomationInterval } from "@/lib/strategies/kinds/contract"
import { baseLevels } from "@/lib/strategies/indicators"

const MONTH_MS = 30 * 86_400_000
const DAY_MS = 86_400_000

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

export const DEFAULT_LADDER_SETTINGS = {
  basePeriods: 36,
  pumpPeriods: 8,
  crackPct: 2.5,
  maxCrackBars: 4,
  volumeMultiplier: 2,
  volumeLookback: 48,
  totalOrders: 5,
  priceStepPct: 1.5,
  stepMultiplier: 1,
  sizeMultiplier: 1.5,
  maxMarketExposurePct: 25,
  maxPortfolioExposurePct: 25,
  takeProfitPct: 1.5,
  ceilingPct: 1,
  stopEnabled: false,
  stopBelowFinalPct: 2,
  timeExitEnabled: false,
  maxHoldHours: 168,
  respectFilterEnabled: false,
  respectLookbackMonths: 6,
  minRespectPct: 80,
  recoveryTargetPct: -2,
}

export const ladderSettingsFieldsSchema = z.object({
  basePeriods: z.number().int().min(4).max(500),
  pumpPeriods: z.number().int().min(1).max(499),
  crackPct: z.number().positive().max(50),
  maxCrackBars: z.number().int().min(1).max(500),
  volumeMultiplier: z.number().min(0).max(100),
  volumeLookback: z.number().int().min(2).max(1_000),
  totalOrders: z.number().int().min(1).max(20),
  priceStepPct: z.number().positive().max(50),
  stepMultiplier: z.number().min(0.1).max(10),
  sizeMultiplier: z.number().min(0.1).max(20),
  maxMarketExposurePct: z.number().positive().max(100),
  maxPortfolioExposurePct: z.number().positive().max(100),
  takeProfitPct: z.number().positive().max(100),
  ceilingPct: z.number().min(0).max(50),
  stopEnabled: z.boolean(),
  stopBelowFinalPct: z.number().positive().max(100),
  timeExitEnabled: z.boolean(),
  maxHoldHours: z
    .number()
    .positive()
    .max(24 * 365),
  respectFilterEnabled: z.boolean(),
  respectLookbackMonths: z.number().int().min(1).max(60),
  minRespectPct: z.number().min(0).max(100),
  recoveryTargetPct: z.number().min(-50).max(50),
})

export const ladderSettingsSchema = ladderSettingsFieldsSchema.superRefine(
  (settings, ctx) => {
    if (settings.pumpPeriods >= settings.basePeriods) {
      ctx.addIssue({
        code: "custom",
        path: ["pumpPeriods"],
        message: "Base confirmation must be shorter than the base search.",
      })
    }
    if (settings.ceilingPct >= settings.crackPct) {
      ctx.addIssue({
        code: "custom",
        path: ["ceilingPct"],
        message: "The profit ceiling must stay above the first buy.",
      })
    }
    if (settings.maxMarketExposurePct > settings.maxPortfolioExposurePct) {
      ctx.addIssue({
        code: "custom",
        path: ["maxMarketExposurePct"],
        message: "One ladder cannot exceed the shared wallet exposure limit.",
      })
    }
    if (settings.recoveryTargetPct <= -settings.crackPct) {
      ctx.addIssue({
        code: "custom",
        path: ["recoveryTargetPct"],
        message: "Recovery must be above the crack entry level.",
      })
    }
    const deepestDeviation = ladderDeviations(settings).at(-1) ?? 0
    if (deepestDeviation >= 100) {
      ctx.addIssue({
        code: "custom",
        path: ["priceStepPct"],
        message: "The final planned buy must remain above zero.",
      })
    }
  }
)

export type LadderSettings = z.infer<typeof ladderSettingsSchema>

export function ladderRequiredHistoryMonths(
  settings: LadderSettings,
  marketScanner?: MarketScannerSettings
): number {
  return Math.max(
    // Respect always ranks simultaneous cracks; the toggle only decides
    // whether an incomplete or weak score must reject the market entirely.
    settings.respectLookbackMonths,
    marketScanner?.historyFilterEnabled
      ? marketScanner.minHistoryMonths
      : 0
  )
}

export type BaseRespectScore = {
  respected: number
  total: number
  rate: number | null
  hasFullHistory: boolean
}

export type LadderCandidate = {
  candleTime: number
  base: number
  triggerPrice: number
  volumeMultiple: number
  dailyVolumeUsd: number
  respect: BaseRespectScore
}

export type BaseTracker = {
  processedTime: number | null
  basePeriods: number
  pumpPeriods: number
  currentBase: number | null
  previousBase: number | null
  lows: number[]
}

export function ladderDeviations(
  settings: Pick<
    LadderSettings,
    "crackPct" | "priceStepPct" | "stepMultiplier" | "totalOrders"
  >
): number[] {
  const deviations: number[] = []
  let deviation = settings.crackPct
  for (let index = 0; index < settings.totalOrders; index += 1) {
    deviations.push(deviation)
    deviation +=
      settings.priceStepPct * settings.stepMultiplier ** Math.max(0, index)
  }
  return deviations
}

export function ladderLevels(base: number, settings: LadderSettings): number[] {
  return ladderDeviations(settings).map(
    (deviation) => base * (1 - deviation / 100)
  )
}

export function ladderAllocationPcts(settings: LadderSettings): number[] {
  const weights = Array.from(
    { length: settings.totalOrders },
    (_, index) => settings.sizeMultiplier ** index
  )
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  return weights.map(
    (weight) => (settings.maxMarketExposurePct * weight) / total
  )
}

export function ladderProfitTarget(
  fillPrice: number,
  base: number,
  settings: LadderSettings
): number {
  return Math.min(
    fillPrice * (1 + settings.takeProfitPct / 100),
    base * (1 - settings.ceilingPct / 100)
  )
}

export function ladderStopPrice(base: number, settings: LadderSettings): number {
  const deepest = ladderLevels(base, settings).at(-1) ?? base
  return deepest * (1 - settings.stopBelowFinalPct / 100)
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

/** Only the base/crack/recovery fields the respect scan reads — so a DCA
 * config (which shares these) can be scored without a full LadderSettings. */
export type BaseRespectSettings = Pick<
  LadderSettings,
  | "basePeriods"
  | "pumpPeriods"
  | "crackPct"
  | "recoveryTargetPct"
  | "respectLookbackMonths"
>

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

export function findLadderCandidate(
  candles: IndicatorCandle[],
  settings: LadderSettings
): LadderCandidate | null {
  const index = candles.length - 1
  if (index < Math.max(settings.volumeLookback, settings.maxCrackBars) + 1) {
    return null
  }
  const bases = baseLevels(candles, settings.basePeriods, settings.pumpPeriods).raw
  const base = bases[index]
  const previousBase = bases[index - 1]
  return findLadderCandidateAtBase(candles, settings, base, previousBase)
}

export function findLadderCandidateAtBase(
  candles: IndicatorCandle[],
  settings: LadderSettings,
  base: number | null,
  previousBase: number | null
): LadderCandidate | null {
  const index = candles.length - 1
  if (index < Math.max(settings.volumeLookback, settings.maxCrackBars) + 1) {
    return null
  }
  if (
    base === null ||
    previousBase === null ||
    !Number.isFinite(base) ||
    !Number.isFinite(previousBase)
  ) {
    return null
  }

  const candle = candles[index]
  const previous = candles[index - 1]
  const threshold = base * (1 - settings.crackPct / 100)
  const previousThreshold = previousBase * (1 - settings.crackPct / 100)
  if (!(previous.c >= previousThreshold && candle.c < threshold)) return null

  const fastStart = Math.max(0, index - settings.maxCrackBars)
  if (!candles.slice(fastStart, index).some((item) => item.c >= base)) {
    return null
  }

  const volumeWindow = candles.slice(index - settings.volumeLookback, index)
  const averageVolume =
    volumeWindow.reduce((sum, item) => sum + item.v, 0) / volumeWindow.length
  const volumeMultiple = averageVolume > 0 ? candle.v / averageVolume : 0
  if (
    settings.volumeMultiplier > 0 &&
    volumeMultiple < settings.volumeMultiplier
  ) {
    return null
  }

  // The current crack is the candidate, not historical evidence for itself.
  const respect = baseRespectScore(
    candles.slice(0, index),
    settings,
    candle.t
  )
  if (
    settings.respectFilterEnabled &&
    (!respect.hasFullHistory ||
      respect.rate === null ||
      respect.rate < settings.minRespectPct)
  ) {
    return null
  }

  const dayStart = candle.t - DAY_MS
  const dailyVolumeUsd = candles
    .slice(0, index + 1)
    .filter((item) => item.t >= dayStart)
    .reduce((sum, item) => sum + item.c * item.v, 0)

  return {
    candleTime: candle.t,
    base,
    triggerPrice: candle.c,
    volumeMultiple,
    dailyVolumeUsd,
    respect,
  }
}

export function ladderMinimumBars(settings: LadderSettings): number {
  return Math.max(
    settings.basePeriods + settings.pumpPeriods + settings.maxCrackBars + 5,
    settings.volumeLookback + 5
  )
}

export function ladderHistoryBars(
  settings: LadderSettings,
  interval: AutomationInterval,
  historyMonths = settings.respectLookbackMonths
): number {
  const intervalMs: Record<AutomationInterval, number> = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": DAY_MS,
  }
  // Candidate ranking and Market Scanner both use trailing daily volume.
  // Keep a complete day even when the base/volume lookbacks are shorter.
  const minimumBars = Math.max(
    ladderMinimumBars(settings),
    Math.ceil(DAY_MS / intervalMs[interval]) + 1
  )
  if (historyMonths <= 0) return minimumBars
  return (
    Math.ceil((historyMonths * MONTH_MS) / intervalMs[interval]) +
    minimumBars
  )
}

export function sharedWalletHistoryBars(
  settings: LadderSettings,
  interval: AutomationInterval,
  marketScanner: MarketScannerSettings | undefined,
  marketCount: number
): number {
  return (
    Math.max(0, marketCount) *
    ladderHistoryBars(
      settings,
      interval,
      ladderRequiredHistoryMonths(settings, marketScanner)
    )
  )
}

export function hasMinimumMarketHistory(
  candles: Pick<IndicatorCandle, "t">[],
  months: number,
  now: number = candles.at(-1)?.t ?? 0
): boolean {
  return (
    candles.length > 0 &&
    (candles[0]?.t ?? Number.POSITIVE_INFINITY) <= now - months * MONTH_MS
  )
}
