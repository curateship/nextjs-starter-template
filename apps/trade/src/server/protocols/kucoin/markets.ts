import { z } from "zod"

import type {
  MarketCatalog,
  MarketRow,
  NetworkId,
} from "@/lib/protocols/contracts"
import { marketKey, protocolLabel } from "@/lib/protocols/contracts"
import {
  KUCOIN_DEFAULT_FUNDING_MS,
  num,
  sizeStepOf,
  toKucoinFigures,
  type KucoinLotRule,
} from "@/lib/protocols/kucoin/translate"
import { snapToTick, stepToDecimals } from "@/lib/protocols/tick"
import { kucoinPublic } from "@/server/protocols/kucoin/client"

/**
 * KuCoin's market catalogue: what trades, its rules, and today's figures.
 *
 * `/api/v1/contracts/active` answers all of it in one call — every contract's
 * tick, lot maths, leverage ceiling, mark price, day's move, turnover, open
 * interest and funding rate. Only dollar-settled contracts are read; the
 * coin-settled ones (`isInverse`) settle in the coin and are a different
 * trade this app does not make.
 *
 * That one call is 1.3 MB, so it is NOT what "today's price" reads. The
 * catalogue is asked for rarely and cached; prices come from the far smaller
 * all-tickers read below.
 */

const contractSchema = z.object({
  symbol: z.string(),
  status: z.string().optional(),
  settleCurrency: z.string().optional(),
  quoteCurrency: z.string().optional(),
  baseCurrency: z.string().optional(),
  isInverse: z.boolean().optional(),
  multiplier: z.union([z.string(), z.number()]).optional(),
  lotSize: z.union([z.string(), z.number()]).optional(),
  tickSize: z.union([z.string(), z.number()]).optional(),
  maxLeverage: z.union([z.string(), z.number()]).optional(),
  markPrice: z.union([z.string(), z.number()]).optional(),
  lastTradePrice: z.union([z.string(), z.number()]).optional(),
  priceChgPct: z.union([z.string(), z.number()]).optional(),
  turnoverOf24h: z.union([z.string(), z.number()]).optional(),
  openInterest: z.union([z.string(), z.number()]).optional(),
  fundingFeeRate: z.union([z.string(), z.number()]).optional(),
  fundingRateGranularity: z.union([z.string(), z.number()]).optional(),
})

type Contract = z.infer<typeof contractSchema>

/** A dollar-settled contract anyone can trade today. */
function tradeable(one: Contract): boolean {
  if (one.status !== undefined && one.status !== "Open") return false
  if (one.isInverse === true) return false
  const settle = one.settleCurrency ?? one.quoteCurrency
  return settle === undefined || settle === "USDT"
}

// ----- The contract rulebook, cached ---------------------------------------

/**
 * How long the rulebook stands. Ticks, lot sizes and leverage ceilings change
 * when a market is listed or re-tiered, which is the exchange's timescale and
 * not ours — and the order path needs these on every single order, so asking
 * each time would spend the whole request allowance on a question whose
 * answer had not moved.
 */
const CONTRACTS_GOOD_FOR_MS = 5 * 60_000

type ContractCache = {
  at: number
  bySymbol: Map<string, Contract>
  inFlight: Promise<Map<string, Contract>> | null
}

const contractCaches = new Map<NetworkId, ContractCache>()

function contractCache(network: NetworkId): ContractCache {
  const found = contractCaches.get(network)
  if (found) return found
  const made: ContractCache = { at: 0, bySymbol: new Map(), inFlight: null }
  contractCaches.set(network, made)
  return made
}

async function contracts(network: NetworkId): Promise<Map<string, Contract>> {
  const cache = contractCache(network)
  if (
    Date.now() - cache.at <= CONTRACTS_GOOD_FOR_MS &&
    cache.bySymbol.size > 0
  ) {
    return cache.bySymbol
  }
  cache.inFlight ??= (async () => {
    const answer = await kucoinPublic(network, "/api/v1/contracts/active")
    const rows = Array.isArray(answer) ? answer : []
    const bySymbol = new Map<string, Contract>()
    for (const raw of rows) {
      const parsed = contractSchema.safeParse(raw)
      if (parsed.success && tradeable(parsed.data)) {
        bySymbol.set(parsed.data.symbol, parsed.data)
      }
    }
    cache.bySymbol = bySymbol
    cache.at = Date.now()
    return bySymbol
  })().finally(() => {
    cache.inFlight = null
  })
  return cache.inFlight
}

/**
 * One market's lot maths and price tick, for the order path. Throws the
 * app's own "this market is not listed" rather than guessing a multiplier —
 * guessing one would size an order by a factor of a hundred on some coins.
 */
export async function kucoinMarketRules(
  network: NetworkId,
  marketId: string
): Promise<{ lot: KucoinLotRule; priceTick: number | null }> {
  const one = (await contracts(network)).get(marketId)
  if (!one) throw new Error("LIVE_UNLISTED")
  const multiplier = num(one.multiplier)
  if (multiplier === null || !(multiplier > 0)) throw new Error("LIVE_UNLISTED")
  return {
    lot: { multiplier, lotSize: num(one.lotSize) ?? 1 },
    priceTick: num(one.tickSize),
  }
}

/** How often this market settles funding — read from the contract, not assumed. */
export async function kucoinFundingIntervalMs(
  marketId: string
): Promise<number> {
  const one = (await contracts("mainnet")).get(marketId)
  return num(one?.fundingRateGranularity) ?? KUCOIN_DEFAULT_FUNDING_MS
}

// ----- The catalogue --------------------------------------------------------

export async function fetchKucoinMarkets(
  network: NetworkId
): Promise<MarketCatalog> {
  const bySymbol = await contracts(network)

  const rows: MarketRow[] = []
  for (const one of bySymbol.values()) {
    const figures = toKucoinFigures(one)
    // A market the exchange would not price is left out rather than drawn at
    // $0 — the same rule as every other catalogue here.
    if (!figures) continue
    const multiplier = num(one.multiplier)
    if (multiplier === null || !(multiplier > 0)) continue

    rows.push({
      key: marketKey({ protocol: "kucoin", network, marketId: one.symbol }),
      marketId: one.symbol,
      // "XBTUSDTM" prints as the coin. KuCoin calls Bitcoin XBT in its ids
      // and BTC nowhere else, so the base currency it states is what is
      // shown — with the id itself as the fallback.
      symbol: one.baseCurrency || one.symbol.replace(/USDTM?$/, ""),
      quoteAsset: "USDT",
      subExchange: null,
      category: "crypto",
      sizeDecimals: stepToDecimals(
        sizeStepOf({ multiplier, lotSize: num(one.lotSize) ?? 1 })
      ),
      priceTick: num(one.tickSize),
      maxLeverage: num(one.maxLeverage),
      isolatedOnly: false,
      iconUrl: null,
      price: figures.price,
      change24h: figures.change24h,
      volume24hUsd: figures.volume24hUsd,
      fundingHourly: figures.fundingHourly,
      openInterestUsd: figures.openInterestUsd,
    })
  }

  return {
    protocol: "kucoin",
    protocolLabel: protocolLabel("kucoin"),
    network,
    // Mainnet is the only network this folder serves; the client refuses any
    // other before a request is built.
    networkLabel: "Mainnet",
    picker: {
      categories: "crypto-only",
      hip3: false,
      funding: true,
      openInterest: true,
    },
    rows,
  }
}

/** The nearest price KuCoin would accept, snapped to the market's own tick. */
export function roundKucoinPx(
  px: number,
  _sizeDecimals: number | null,
  priceTick: number | null
): number {
  return snapToTick(px, priceTick)
}

// ----- Today's price ---------------------------------------------------------

/** How long one market's price stands in for the next ask. */
const PRICES_GOOD_FOR_MS = 2_000

/** How many of these tiny reads go out together. */
const PRICES_AT_ONCE = 6

const markPriceSchema = z.object({
  symbol: z.string(),
  value: z.union([z.string(), z.number()]).optional(),
})

type Held = {
  at: number
  price: number
  /** True while this answer is being served stale because we were rationed. */
  rationed: boolean
}

const priceCaches = new Map<NetworkId, Map<string, Held>>()

function priceCache(network: NetworkId): Map<string, Held> {
  const found = priceCaches.get(network)
  if (found) return found
  const made = new Map<string, Held>()
  priceCaches.set(network, made)
  return made
}

/**
 * Today's price for these markets — **the mark price**, one small read each.
 *
 * **The mark price, because that is what the engine acts on.** Both other
 * exchanges push the mark price down their live feed, and a trigger that
 * fires on one number while the rest of the app values the position with
 * another is a bug nobody can see. KuCoin's all-markets read carries the last
 * traded price instead, and the two are not interchangeable: measured across
 * its whole catalogue on 20 Aug 2026 they were 2.8% apart at the worst — a
 * hair on Bitcoin, a real difference on a thin book, and the thin books are
 * exactly where a rung sits waiting.
 *
 * One request per market sounds expensive and is not, because of who asks.
 * Every caller here is the engine, and the engine asks about the one market
 * it is settling, or the handful a wallet holds — never the catalogue. Each
 * read is a tenth of a kilobyte, they go six at a time, and each market's
 * answer stands for two seconds.
 */
export async function fetchKucoinPrices(
  network: NetworkId,
  marketIds: readonly string[]
): Promise<Map<string, number>> {
  const cache = priceCache(network)
  const now = Date.now()
  const stale = [...new Set(marketIds)].filter(
    (marketId) => now - (cache.get(marketId)?.at ?? 0) > PRICES_GOOD_FOR_MS
  )

  for (let at = 0; at < stale.length; at += PRICES_AT_ONCE) {
    await Promise.all(
      stale.slice(at, at + PRICES_AT_ONCE).map(async (marketId) => {
        try {
          const answer = await kucoinPublic(
            network,
            `/api/v1/mark-price/${encodeURIComponent(marketId)}/current`
          )
          const row = markPriceSchema.safeParse(answer)
          const price = row.success ? num(row.data.value) : null
          if (price !== null && price > 0) {
            cache.set(marketId, { at: Date.now(), price, rationed: false })
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : ""
          const held = cache.get(marketId)
          // Rationed: serve the stale answer, and say out loud that it is
          // stale so the engine can decide whether to act on it.
          if (message === "EXCHANGE_BUSY" && held) {
            cache.set(marketId, { ...held, rationed: true })
            return
          }
          // A market this exchange will not price is not a failure of the
          // read — it is one market with no price, and the others asked for
          // in the same breath must still come back. A wallet holding one
          // delisted coin would otherwise lose the prices for everything
          // else it holds, and the engine settles none of it.
          if (unpriced(message)) {
            // Remembered AS having no price, rather than forgotten. Forgetting
            // it means the next pass asks again — and the engine's pass is
            // every second, so one delisted coin in a wallet would knock on
            // this exchange's door once a second for as long as the app runs.
            cache.set(marketId, { at: Date.now(), price: 0, rationed: false })
            return
          }
          // Anything else means the exchange itself is unwell, and a silent
          // "no prices" would read as a market that simply has none.
          throw error
        }
      })
    )
  }

  const answer = new Map<string, number>()
  for (const marketId of marketIds) {
    const held = cache.get(marketId)
    // Zero is how "this exchange will not price that market" is remembered,
    // and it is never an answer.
    if (held && held.price > 0) answer.set(marketId, held.price)
  }
  return answer
}

/**
 * Whether a refusal means "no such price here" rather than "we are broken".
 * `415000` is what the exchange answers for a market it does not mark-price,
 * and a plain 404 is what a bad path gives; both are about the one market.
 */
function unpriced(message: string): boolean {
  return (
    message.startsWith("KUCOIN_415000") || message.startsWith("KUCOIN_HTTP_404")
  )
}

/** Tests drive their own clock; a held price across them would leak. */
export function clearKucoinPriceCache(): void {
  priceCaches.clear()
}

/** Whether the last price answer for this market was a rationed, stale one. */
export function kucoinPricesWereRationed(
  network: NetworkId,
  marketId: string
): boolean {
  return priceCache(network).get(marketId)?.rationed ?? false
}
