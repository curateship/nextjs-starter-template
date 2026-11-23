import { z } from "zod"
import type {
  CandleBar,
  CandleInterval,
  MarketCatalog,
  NetworkId,
} from "@/lib/protocols/contracts"
import { intervalMs, venueSliceFrom } from "@/lib/trade/chart-history"

const address = z
  .string()
  .regex(/^0x[\da-f]{40}$/i)
  .transform((value) => value.toLowerCase())
/** A pool contract, or a v4-style pool named by a 64-character hash. */
const poolId = z
  .string()
  .regex(/^0x(?:[\da-f]{40}|[\da-f]{64})$/i)
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

/** GeckoTerminal's public pool endpoint keeps about this much; older stored bars remain readable. */
export function poolHistoryFloor(): number {
  return Date.now() - 184 * 86_400_000
}

/** What one chain's pool candles are read with. */
type CandlesChain = {
  /** Prefix for this chain's own error codes, such as `<code>_CANDLE_RANGE`. */
  code: string
  unsupportedNetwork: string
  /** The chain's name at GeckoTerminal and DexScreener. */
  geckoNetwork: string
  dexChain: string
  get(
    service: "gecko" | "dex",
    path: string,
    params?: Record<string, string | number>
  ): Promise<unknown>
  catalog(network: NetworkId): Promise<MarketCatalog>
  bestPairs(raw: unknown): Map<string, { pairAddress: string }>
}

/**
 * One chain's candles, read from GeckoTerminal for a coin's most liquid pool
 * and priced in dollars for that coin, never for the pool's other coin.
 */
export function evmCandles(chain: CandlesChain) {
  function parse(raw: unknown, from: number, to: number): CandleBar[] {
    const rows = responseSchema.parse(raw).data.attributes.ohlcv_list
    const bars = new Map<number, CandleBar>()
    for (const [seconds, open, high, low, close, volume] of rows) {
      if (
        low > Math.min(open, close) ||
        high < Math.max(open, close) ||
        low > high
      )
        throw new Error(`${chain.code}_CANDLES_INVALID`)
      const openTime = seconds * 1000
      if (openTime >= from && openTime < to)
        bars.set(openTime, { openTime, open, high, low, close, volume })
    }
    return [...bars.values()].sort((a, b) => a.openTime - b.openTime)
  }

  /** One store page. */
  async function history(
    network: NetworkId,
    marketId: string,
    interval: CandleInterval,
    from: number,
    to: number
  ): Promise<CandleBar[]> {
    if (network !== "mainnet") throw new Error(chain.unsupportedNetwork)
    const id = address.parse(marketId)
    const frame = frames[interval]
    if (!frame || !Number.isFinite(from) || !Number.isFinite(to))
      throw new Error(`${chain.code}_CANDLE_RANGE`)
    if (to <= from) return []
    if (Math.ceil((to - from) / intervalMs(interval)) > 1000)
      throw new Error(`${chain.code}_CANDLE_PAGE_TOO_LARGE`)
    const listed = await chain.catalog(network)
    let pool = listed.rows.find((row) => row.marketId === id)?.poolAddress
    // An external search result may not have reached the minute's catalogue yet.
    if (!pool)
      pool = chain
        .bestPairs(await chain.get("dex", `/tokens/v1/${chain.dexChain}/${id}`))
        .get(id)?.pairAddress
    if (!pool) return []
    let raw: unknown
    try {
      raw = await chain.get(
        "gecko",
        `/api/v2/networks/${chain.geckoNetwork}/pools/${poolId.parse(pool)}/ohlcv/${frame[0]}`,
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
        error.message === `${chain.code}_SERVICE_REFUSED:GeckoTerminal:404`
      )
        return []
      throw error
    }
    return parse(raw, from, to)
  }

  /** The recent slice a chart draws first. */
  async function candles(
    network: NetworkId,
    marketId: string,
    interval: CandleInterval,
    from = venueSliceFrom(interval, Date.now())
  ): Promise<CandleBar[]> {
    const step = intervalMs(interval)
    const to = Math.floor(Date.now() / step) * step
    return history(
      network,
      marketId,
      interval,
      Math.max(from, to - 1000 * step),
      to
    )
  }

  return { parse, history, candles }
}
