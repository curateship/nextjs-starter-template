import type { CandleBar } from "@/lib/protocols/contracts"

/**
 * Turns one real candle into its Heikin-Ashi reading.
 *
 * The first bar starts halfway between its real open and close. Every later
 * open starts halfway through the previous Heikin-Ashi body. Time and volume
 * stay real because smoothing changes only how the price body is drawn.
 */
export function heikinAshiBar(
  candle: CandleBar,
  previous: CandleBar | null
): CandleBar {
  const close = (candle.open + candle.high + candle.low + candle.close) / 4
  const open = previous
    ? (previous.open + previous.close) / 2
    : (candle.open + candle.close) / 2

  return {
    ...candle,
    open,
    high: Math.max(candle.high, open, close),
    low: Math.min(candle.low, open, close),
    close,
  }
}

export function toHeikinAshi(candles: readonly CandleBar[]): CandleBar[] {
  const result: CandleBar[] = []
  for (const candle of candles) {
    result.push(heikinAshiBar(candle, result.at(-1) ?? null))
  }
  return result
}
