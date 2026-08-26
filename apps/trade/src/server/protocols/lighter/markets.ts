import { z } from "zod"

import type {
  MarketCatalog,
  MarketRow,
  NetworkId,
} from "@/lib/protocols/contracts"
import { marketKey, protocolLabel } from "@/lib/protocols/contracts"
import { lighterTickFromDecimals, num } from "@/lib/protocols/lighter/translate"
import { lighterPublic } from "@/server/protocols/lighter/client"

/**
 * Lighter's docs list weights for a handful of endpoints and say the rest
 * weigh 300. None of the market-data reads here are on the list, so 300 is
 * what each declares. A Standard account's 60-a-minute cap counts requests
 * unweighted, so the declared weight only matters to the snapshot and to
 * the premium arithmetic in `lighter.md`.
 */
const UNLISTED_WEIGHT = 300

const numeric = z.union([z.string(), z.number()])

const marketSchema = z.object({
  symbol: z.string(),
  market_id: z.number(),
  market_type: z.string().optional(),
  status: z.string(),
  /** Epoch milliseconds, as a string, of the market's first day. */
  created_at: numeric.optional(),
  size_decimals: z.number(),
  price_decimals: z.number(),
  min_base_amount: numeric.optional(),
  min_quote_amount: numeric.optional(),
  min_initial_margin_fraction: z.number().optional(),
  mark_price: numeric.optional(),
  last_trade_price: numeric.optional(),
  daily_price_change: numeric.optional(),
  daily_quote_token_volume: numeric.optional(),
  open_interest: numeric.optional(),
})

const catalogSchema = z.object({
  order_book_details: z.array(z.unknown()).default([]),
})

const fundingRateRowSchema = z.object({
  market_id: z.number(),
  exchange: z.string(),
  rate: numeric,
})

const fundingRatesSchema = z.object({
  funding_rates: z.array(z.unknown()).default([]),
})

/**
 * Lighter quotes every venue's funding as the eight-hour figure so they can
 * sit beside each other — its own hourly charge times eight matched the
 * quoted rate exactly on 26 Aug 2026. The market list shows one hour, so
 * the quoted rate is divided back down here.
 */
const FUNDING_QUOTE_HOURS = 8

function lighterHourlyFunding(answer: unknown): Map<number, number> {
  const parsed = fundingRatesSchema.safeParse(answer)
  const rates = new Map<number, number>()
  if (!parsed.success) return rates
  for (const raw of parsed.data.funding_rates) {
    const row = fundingRateRowSchema.safeParse(raw)
    if (!row.success || row.data.exchange !== "lighter") continue
    const rate = num(row.data.rate)
    if (rate === null) continue
    rates.set(row.data.market_id, rate / FUNDING_QUOTE_HOURS)
  }
  return rates
}

/**
 * Lighter states a market's most generous margin requirement in hundredths
 * of a percent: 200 is 2%, which is 50x leverage. 20.00% is 5x.
 */
function maxLeverageOf(minInitialMarginFraction: number | undefined): number | null {
  if (
    minInitialMarginFraction === undefined ||
    !(minInitialMarginFraction > 0)
  ) {
    return null
  }
  return Math.round((10_000 / minInitialMarginFraction) * 100) / 100
}

/** Saved Lighter responses translated without touching the network. */
export function toLighterMarketCatalog(input: {
  network: NetworkId
  orderBookDetails: unknown
  fundingRates: unknown
}): MarketCatalog {
  const catalog = catalogSchema.parse(input.orderBookDetails)
  const funding = lighterHourlyFunding(input.fundingRates)
  const rows: MarketRow[] = []

  for (const raw of catalog.order_book_details) {
    const parsed = marketSchema.safeParse(raw)
    if (!parsed.success) continue
    const one = parsed.data
    if (one.status !== "active") continue
    if (one.market_type !== undefined && one.market_type !== "perp") continue
    const price = num(one.mark_price)
    if (price === null || !(price > 0)) continue
    /**
     * A market nothing has ever traded on is left out.
     *
     * Lighter calls a market "active" from the moment it is listed, before
     * anyone has bought or sold on it, and still prices it — the mark comes
     * from an outside index, not from trading. On 26 Aug 2026, 18 of its 212
     * active markets were in that state: no volume, no open interest, and
     * Lighter answered zero candles on every one of the six timeframes. A
     * row that cannot draw a chart is a row that looks like a broken app
     * when it is clicked.
     *
     * The test is whether it has EVER traded, not whether it traded today.
     * Two markets that day had a last trade but no trades since midnight,
     * and those have history worth charting.
     */
    const lastTrade = num(one.last_trade_price)
    if (lastTrade === null || !(lastTrade > 0)) continue
    const changePercent = num(one.daily_price_change)
    // The REST catalogue's open interest is in coins; the socket's is in
    // dollars. This is the REST side, so the coins are priced here.
    const openInterestCoins = num(one.open_interest)

    rows.push({
      key: marketKey({
        protocol: "lighter",
        network: input.network,
        marketId: one.symbol,
      }),
      marketId: one.symbol,
      symbol: one.symbol,
      // Every Lighter perpetual settles in USDC.
      quoteAsset: "USDC",
      subExchange: null,
      /**
       * Lighter states no kind, so the app claims none.
       *
       * Its catalogue really does mix kinds — 212 active markets on 26 Aug
       * 2026 included 111 coins, 55 US stocks, 9 currency pairs and 11
       * metals and fuels — but no field says which is which. The closest is
       * an undocumented `strategy_index`, and it groups cleanly right up to
       * its seventh group, which holds a bond yield, two private-company
       * markets and two memecoins together. Guessing from it would file
       * markets under a heading Lighter never agreed to, so every row says
       * "other" and the picker shows no category tabs.
       */
      category: "other",
      sizeDecimals: one.size_decimals,
      minOrderSize: num(one.min_base_amount),
      priceTick: lighterTickFromDecimals(one.price_decimals),
      minOrderValueUsd: num(one.min_quote_amount),
      maxLeverage: maxLeverageOf(one.min_initial_margin_fraction),
      isolatedOnly: false,
      iconUrl: null,
      price,
      change24h: changePercent === null ? null : changePercent / 100,
      volume24hUsd: num(one.daily_quote_token_volume) ?? 0,
      fundingHourly: funding.get(one.market_id) ?? null,
      openInterestUsd:
        openInterestCoins === null ? null : openInterestCoins * price,
    })
  }

  return {
    protocol: "lighter",
    protocolLabel: protocolLabel("lighter"),
    network: input.network,
    networkLabel: input.network === "mainnet" ? "Mainnet" : "Testnet",
    picker: {
      categories: "crypto-only",
      hip3: false,
      funding: true,
      openInterest: true,
    },
    rows,
  }
}

/**
 * What the catalogue teaches about a market beyond its figures: the small
 * integer Lighter's own reads name it by, and the day it first traded.
 *
 * Both are kept for the life of the process because neither can change —
 * Lighter does not renumber a market or move its first day — so candle and
 * funding reads rarely cost a lookup. The birthday is what stops a history
 * walk asking for years before the coin existed, which on BTC was a third of
 * the requests a four-hour chart spent.
 */
type MarketFacts = {
  id: number
  bornAt: number | null
  /**
   * How many decimal places this market allows on a price and on a size.
   * The order path scales every number it sends by these, because whole
   * numbers are the only shape Lighter takes.
   */
  priceDecimals: number | null
  sizeDecimals: number | null
}

const factsBySymbol = new Map<NetworkId, Map<string, MarketFacts>>()

function rememberFacts(network: NetworkId, answer: unknown): void {
  const parsed = catalogSchema.safeParse(answer)
  if (!parsed.success) return
  const facts = factsBySymbol.get(network) ?? new Map<string, MarketFacts>()
  for (const raw of parsed.data.order_book_details) {
    const row = marketSchema.safeParse(raw)
    if (!row.success) continue
    const bornAt = num(row.data.created_at)
    facts.set(row.data.symbol, {
      id: row.data.market_id,
      bornAt: bornAt !== null && bornAt > 0 ? bornAt : null,
      priceDecimals: row.data.price_decimals,
      sizeDecimals: row.data.size_decimals,
    })
  }
  factsBySymbol.set(network, facts)
}

/**
 * How long one catalogue read stands in for the next. Ten seconds keeps a
 * background price poll at six requests a minute against the sixty allowed.
 */
const CATALOG_HELD_MS = 10_000

type HeldCatalog = { at: number; load: Promise<unknown> }
const heldCatalogs = new Map<NetworkId, HeldCatalog>()

async function orderBookDetails(network: NetworkId): Promise<unknown> {
  const held = heldCatalogs.get(network)
  if (held && Date.now() - held.at < CATALOG_HELD_MS) return held.load
  const load = lighterPublic(
    network,
    "/api/v1/orderBookDetails",
    UNLISTED_WEIGHT,
    { filter: "perp" }
  ).then((answer) => {
    rememberFacts(network, answer)
    return answer
  })
  heldCatalogs.set(network, { at: Date.now(), load })
  load.catch(() => {
    if (heldCatalogs.get(network)?.load === load) heldCatalogs.delete(network)
  })
  return load
}

/**
 * The symbol behind one of Lighter's market numbers, and what that market
 * is scaled by.
 *
 * Lighter answers an order row with a number rather than a name, and a screen
 * showing "1" where every other part of the app says "BTC" would match
 * nothing — not the position beside it, not the chart, not a saved market.
 */
export async function lighterMarketByIndex(
  network: NetworkId,
  marketIndex: number
): Promise<{ symbol: string; facts: MarketFacts } | null> {
  const search = () => {
    for (const [symbol, facts] of factsBySymbol.get(network) ?? []) {
      if (facts.id === marketIndex) return { symbol, facts }
    }
    return null
  }
  return search() ?? ((await orderBookDetails(network)), search())
}

/**
 * The integer Lighter calls this market and the day it opened, or a refusal
 * naming neither. `bornAt` is null on a market whose catalogue row did not
 * state a first day, and a history walk then asks all the way back rather
 * than trusting a blank.
 */
export async function lighterMarketFacts(
  network: NetworkId,
  symbol: string
): Promise<MarketFacts> {
  const known = factsBySymbol.get(network)?.get(symbol)
  if (known !== undefined) return known
  await orderBookDetails(network)
  const found = factsBySymbol.get(network)?.get(symbol)
  if (found === undefined) throw new Error("LIGHTER_MARKET_UNKNOWN")
  return found
}

/** Lighter's active perpetual catalogue and current figures. */
export async function fetchLighterMarkets(
  network: NetworkId
): Promise<MarketCatalog> {
  const [details, fundingRates] = await Promise.all([
    orderBookDetails(network),
    // A funding read that fails leaves the funding column blank rather than
    // taking the whole market list down with it. Prices, volumes and the
    // chart do not depend on it.
    lighterPublic(network, "/api/v1/funding-rates", UNLISTED_WEIGHT).catch(
      () => null
    ),
  ])
  return toLighterMarketCatalog({
    network,
    orderBookDetails: details,
    fundingRates,
  })
}

/** Mark prices for only the markets requested by the practice engine. */
export async function fetchLighterPrices(
  network: NetworkId,
  marketIds: readonly string[]
): Promise<Map<string, number>> {
  const parsed = catalogSchema.safeParse(await orderBookDetails(network))
  const prices = new Map<string, number>()
  if (!parsed.success) return prices
  const wanted = new Set(marketIds)
  for (const raw of parsed.data.order_book_details) {
    const row = marketSchema.safeParse(raw)
    if (!row.success || !wanted.has(row.data.symbol)) continue
    const price = num(row.data.mark_price)
    if (price !== null && price > 0) prices.set(row.data.symbol, price)
  }
  return prices
}

/** Lighter never serves a stale fallback when its request lane is held. */
export function lighterPricesWereRationed(): boolean {
  return false
}

/** Tests must not inherit facts or a held catalogue from an earlier case. */
export function clearLighterMarketState(): void {
  factsBySymbol.clear()
  heldCatalogs.clear()
}
