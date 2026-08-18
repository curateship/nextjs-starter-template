import type { CandleBar } from "@/lib/protocols/contracts"
import {
  ensureCandleCoverage,
  loadStoredCandles,
} from "@/server/trade/candle-store"

/**
 * Minute prices for the bars a backtest actually needs them for.
 *
 * A candle never says the order it did things in, so the walk used to invent
 * one — and the invention decided which of two levels inside the same candle
 * fired first, and what every other coin was worth while one of them was being
 * walked. This is where the guessing stops: the engine asks for a coin's
 * minutes, walks them for real, and asks for nothing it cannot use.
 *
 * Three things keep the cost down to the days a ladder was actually live:
 *
 * - The engine only asks about a coin holding a position or resting an order.
 * - A whole day is fetched at a time, so a coin held for a week costs seven
 *   fetches rather than forty-two.
 * - Fetched minutes go into `trade_candles` like every other candle, so the
 *   second run over the same window fetches nothing at all.
 *
 * A coin the exchange has no minutes for answers null, every time, without
 * asking again — and the engine walks that bar whole, exactly as before.
 */

const DAY_MS = 86_400_000
const MINUTE_MS = 60_000

export type BarZoom = {
  /** The engine's `zoomIn`: one coin's bar, as real minutes, or null. */
  read: (
    marketKey: string,
    barOpen: number,
    barMs: number
  ) => Promise<readonly CandleBar[] | null>
  /** How many coin-bars were walked minute by minute. */
  zoomedBars: () => number
  /** Coins the exchange publishes no minute prices for, so the run can say so. */
  coinsWithoutMinutes: () => string[]
}

const dayStart = (at: number) => Math.floor(at / DAY_MS) * DAY_MS

export function createBarZoom(): BarZoom {
  // marketKey -> the one day held for it, and that day's minutes by open time.
  const held = new Map<
    string,
    { day: number; minutes: Map<number, CandleBar> }
  >()
  // Coins the exchange has no minute history for. Asked once, never again: a
  // coin with none would otherwise cost a fetch on every bar it holds through.
  const barren = new Set<string>()
  let zoomed = 0

  async function loadDay(marketKey: string, day: number) {
    await ensureCandleCoverage(marketKey, "1m", day, day + DAY_MS)
    const bars = await loadStoredCandles(marketKey, "1m", day, day + DAY_MS)
    const minutes = new Map(bars.map((bar) => [bar.openTime, bar]))
    held.set(marketKey, { day, minutes })
    return minutes
  }

  return {
    zoomedBars: () => zoomed,
    coinsWithoutMinutes: () => [...barren].sort(),
    read: async (marketKey, barOpen, barMs) => {
      if (barren.has(marketKey)) return null

      const day = dayStart(barOpen)
      let have = held.get(marketKey)
      if (!have || have.day !== day) {
        try {
          await loadDay(marketKey, day)
        } catch {
          // A coin whose minutes cannot be fetched is not a failed run. The bar
          // is walked whole, the same way every bar was walked before this
          // existed, and the run's warnings name the coin.
          barren.add(marketKey)
          held.delete(marketKey)
          return null
        }
        have = held.get(marketKey)
        // A whole day with no minutes at all means the exchange does not
        // publish them for this market. Asking again on every bar the ladder
        // holds through would cost a fetch each time and get the same answer.
        if (!have || have.minutes.size === 0) {
          barren.add(marketKey)
          return null
        }
      }

      const minutes: CandleBar[] = []
      for (let at = barOpen; at < barOpen + barMs; at += MINUTE_MS) {
        const bar = have.minutes.get(at)
        if (bar) minutes.push(bar)
      }
      if (minutes.length === 0) return null
      zoomed += 1
      return minutes
    },
  }
}
