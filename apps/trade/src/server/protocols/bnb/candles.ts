import { z } from "zod"
import type {
  CandleBar,
  CandleInterval,
  NetworkId,
} from "@/lib/protocols/contracts"
import { intervalMs, venueSliceFrom } from "@/lib/trade/chart-history"
import { bnbServiceGet } from "./client"
import { bestBnbPairs, fetchBnbMarkets } from "./markets"

const address = z
  .string()
  .regex(/^0x[\da-f]{40}$/i)
  .transform((value) => value.toLowerCase())
const number = z.number().finite().positive()
const responseSchema = z.object({
  data: z.object({
    attributes: z.object({
      ohlcv_list: z.array(
        z.tuple([
          z.number().int().nonnegative(),
          number,
          number,
          number,
          number,
          z.number().finite().nonnegative(),
        ])
      ),
    }),
  }),
})
const frames: Record<CandleInterval, readonly [string, number]> = {
  "1m": ["minute", 1],
  "5m": ["minute", 5],
  "15m": ["minute", 15],
  "1h": ["hour", 1],
  "4h": ["hour", 4],
  "1d": ["day", 1],
}

/** The public endpoint's measured retention; older stored bars remain readable. */
export function bnbHistoryFloor(): number {
  return Date.now() - 184 * 86_400_000
}

export function parseBnbCandles(
  raw: unknown,
  from: number,
  to: number
): CandleBar[] {
  const rows = responseSchema.parse(raw).data.attributes.ohlcv_list
  const bars = new Map<number, CandleBar>()
  for (const [seconds, open, high, low, close, volume] of rows) {
    if (
      low > Math.min(open, close) ||
      high < Math.max(open, close) ||
      low > high
    )
      throw new Error("BNB_CANDLES_INVALID")
    const openTime = seconds * 1000
    if (openTime >= from && openTime < to)
      bars.set(openTime, { openTime, open, high, low, close, volume })
  }
  return [...bars.values()].sort((a, b) => a.openTime - b.openTime)
}

/** One store page, priced in dollars for the requested token, not the pool's other coin. */
export async function fetchBnbCandleHistory(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  from: number,
  to: number
): Promise<CandleBar[]> {
  if (network !== "mainnet") throw new Error("BNB_NETWORK_UNSUPPORTED")
  const id = address.parse(marketId)
  const frame = frames[interval]
  if (!frame || !Number.isFinite(from) || !Number.isFinite(to))
    throw new Error("BNB_CANDLE_RANGE")
  if (to <= from) return []
  if (Math.ceil((to - from) / intervalMs(interval)) > 1000)
    throw new Error("BNB_CANDLE_PAGE_TOO_LARGE")
  const catalog = await fetchBnbMarkets(network)
  let pool = catalog.rows.find((row) => row.marketId === id)?.poolAddress
  // An external search result may not have reached the minute's catalogue yet.
  if (!pool)
    pool = bestBnbPairs(await bnbServiceGet("dex", `/tokens/v1/bsc/${id}`)).get(
      id
    )?.pairAddress
  if (!pool) return []
  let raw: unknown
  try {
    raw = await bnbServiceGet(
      "gecko",
      `/api/v2/networks/bsc/pools/${address.parse(pool)}/ohlcv/${frame[0]}`,
      {
        aggregate: frame[1],
        before_timestamp: Math.floor((to - 1) / 1000),
        limit: 1000,
        currency: "usd",
        token: id,
        include_empty_intervals: "false",
      }
    )
  } catch (error) {
    // A pool missing from GeckoTerminal has no candles there. Other failures stay failures.
    if (
      error instanceof Error &&
      error.message === "BNB_SERVICE_REFUSED:GeckoTerminal:404"
    )
      return []
    throw error
  }
  return parseBnbCandles(raw, from, to)
}

export async function fetchBnbCandles(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  from = venueSliceFrom(interval, Date.now())
): Promise<CandleBar[]> {
  const step = intervalMs(interval)
  const to = Math.floor(Date.now() / step) * step
  return fetchBnbCandleHistory(
    network,
    marketId,
    interval,
    Math.max(from, to - 1000 * step),
    to
  )
}
