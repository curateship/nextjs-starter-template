import { z } from "zod"
import {
  CANDLE_INTERVALS,
  KNOWN_PROTOCOLS,
  type CandleBar,
} from "@/lib/protocols/contracts"
import { marketPace } from "@/lib/trade/market-discovery"
import type { MarketWindow } from "@/lib/trade/market-history"

export const scannerSettingsSchema = z.object({
  enabled: z.boolean(),
  exchanges: z
    .array(z.enum(KNOWN_PROTOCOLS))
    .min(1)
    .max(KNOWN_PROTOCOLS.length),
  mode: z.enum(["price", "volume", "volatility", "both"]),
  priceIncreasePct: z.number().finite().min(0.1).max(1000).default(5),
  priceWindowSeconds: z.union([z.literal(60), z.literal(300)]).default(60),
  volumeMultiple: z.number().finite().min(0.1).max(1000),
  minimumVolumeUsd: z.number().finite().min(0).max(1e12),
  interval: z.enum(CANDLE_INTERVALS),
  atrPeriod: z.number().int().min(2).max(100),
  volatilityMultiple: z.number().finite().min(0.1).max(1000),
})
export type ScannerSettings = z.infer<typeof scannerSettingsSchema>
export function defaultScannerSettings(): ScannerSettings {
  return {
    enabled: true,
    exchanges: ["hyperliquid"],
    mode: "volume",
    priceIncreasePct: 5,
    priceWindowSeconds: 60,
    volumeMultiple: 5,
    minimumVolumeUsd: 10_000,
    interval: "5m",
    atrPeriod: 14,
    volatilityMultiple: 2,
  }
}
export const scannerIntervalMs: Record<ScannerSettings["interval"], number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

/** All inputs are real exchange candles. The current candle never enters ATR. */
export function scannerMovement(
  bars: readonly CandleBar[],
  settings: ScannerSettings,
  now: number
) {
  const step = scannerIntervalMs[settings.interval]
  const count = Math.max(settings.atrPeriod + 1, 20)
  const recent = bars.slice(-(count + 1))
  const current = recent.at(-1)
  if (
    !current ||
    recent.length < count + 1 ||
    current.openTime !== Math.floor(now / step) * step
  )
    return null
  if (
    recent.some(
      (bar, i) =>
        ![bar.openTime, bar.open, bar.high, bar.low, bar.close].every(
          Number.isFinite
        ) ||
        bar.low <= 0 ||
        bar.low > Math.min(bar.open, bar.close) ||
        bar.high < Math.max(bar.open, bar.close) ||
        (i > 0 && bar.openTime - recent[i - 1].openTime !== step)
    )
  )
    return null
  const finished = recent.slice(0, -1)
  const baseline = finished.slice(-settings.atrPeriod)
  const offset = finished.length - settings.atrPeriod
  const atr =
    baseline.reduce((sum, bar, i) => {
      const previous = finished[offset + i - 1].close
      return (
        sum +
        Math.max(
          bar.high - bar.low,
          Math.abs(bar.high - previous),
          Math.abs(bar.low - previous)
        )
      )
    }, 0) / settings.atrPeriod
  if (!(atr > 0) || !Number.isFinite(atr)) return null
  const range = current.high - current.low
  const closes = recent.slice(-20).map((bar) => bar.close)
  const middle = closes.reduce((sum, close) => sum + close, 0) / 20
  const deviation = Math.sqrt(
    closes.reduce((sum, close) => sum + (close - middle) ** 2, 0) / 20
  )
  return {
    range,
    atr,
    multiple: range / atr,
    rangeFraction: range / current.close,
    atrFraction: atr / current.close,
    bandWidth: middle > 0 ? (4 * deviation) / middle : null,
    change: (current.close - current.open) / current.open,
  }
}
export type ScannerMovement = ReturnType<typeof scannerMovement>
export function scannerMatch(
  settings: ScannerSettings,
  volume24h: number,
  minute: MarketWindow | null,
  movement: ScannerMovement
) {
  const pace = marketPace(volume24h, minute)
  const volume =
    pace !== null &&
    pace >= settings.volumeMultiple &&
    minute !== null &&
    Number.isFinite(minute.traded) &&
    minute.traded >= settings.minimumVolumeUsd
  const volatility =
    movement !== null && movement.multiple >= settings.volatilityMultiple
  return {
    pace,
    volume,
    volatility,
    matches:
      settings.enabled &&
      (settings.mode === "volume"
        ? volume
        : settings.mode === "volatility"
          ? volatility
          : volume && volatility),
  }
}

/** Rolling price comparison, independent of candle boundaries and volume. */
export function scannerPriceMatches(
  settings: ScannerSettings,
  window: MarketWindow | null
) {
  return (
    settings.enabled &&
    window !== null &&
    Number.isFinite(window.fraction) &&
    window.fraction >= settings.priceIncreasePct / 100
  )
}
