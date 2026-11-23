import type { CandleInterval } from "@/lib/protocols/contracts"

const RECONNECT_BACKOFF_MS = [
  1_000, 2_000, 5_000, 10_000, 30_000,
] as const

export function reconnectDelay(
  attempt: number,
  backoff: readonly number[] = RECONNECT_BACKOFF_MS
): number {
  return backoff[Math.min(attempt, backoff.length - 1)]
}

const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

export function candleIntervalMs(interval: CandleInterval): number {
  return INTERVAL_MS[interval]
}
