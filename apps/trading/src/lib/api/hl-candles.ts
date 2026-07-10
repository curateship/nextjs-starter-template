import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

const olderCandlesSchema = z.object({
  network: z.enum(["mainnet", "testnet"]),
  coin: z.string().min(1).max(20),
  interval: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]),
  /** Fetch candles strictly BEFORE this open time (ms). */
  beforeMs: z.number().int().positive(),
  /** How many bars back to reach for. */
  bars: z.number().int().min(1).max(1000),
})

const INTERVAL_MS: Record<z.infer<typeof olderCandlesSchema>["interval"], number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

export type OlderCandle = {
  t: number
  T: number
  o: string
  h: string
  l: string
  c: string
  v: string
  n: number
}

/**
 * Older Hyperliquid candles for the live charts' scroll-back loading — the
 * websocket only carries a recent window, so panning left backfills through
 * the exchange's candleSnapshot API.
 */
const loadOlderHlCandlesFn = createServerFn({ method: "POST" })
  .inputValidator(olderCandlesSchema)
  .handler(async ({ data }): Promise<{ candles: OlderCandle[] }> => {
    const { findCurrentUser } = await import("@/server/security")
    if (!(await findCurrentUser())) throw new Error("Missing Custom Shell session")
    const { getInfoClient } = await import("@/server/hyperliquid/info")

    const step = INTERVAL_MS[data.interval]
    try {
      const snapshot = await getInfoClient(data.network).candleSnapshot({
        coin: data.coin,
        interval: data.interval,
        startTime: data.beforeMs - data.bars * step,
        endTime: data.beforeMs - 1,
      })
      return {
        candles: snapshot
          .filter((candle) => candle.t < data.beforeMs)
          .map((candle) => ({
            t: candle.t,
            T: candle.T,
            o: candle.o,
            h: candle.h,
            l: candle.l,
            c: candle.c,
            v: candle.v,
            n: candle.n,
          })),
      }
    } catch (error) {
      // Don't leak upstream error text; backfill is best-effort anyway.
      console.error("older-candle fetch failed", error)
      throw new Error("Could not load older candles right now.")
    }
  })

export function loadOlderHlCandles(input: z.input<typeof olderCandlesSchema>) {
  return loadOlderHlCandlesFn({ data: input })
}
