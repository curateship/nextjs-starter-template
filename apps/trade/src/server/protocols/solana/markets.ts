import { z } from "zod"

import type {
  CandleBar,
  MarketCatalog,
  MarketCategory,
  MarketRow,
  NetworkId,
} from "@/lib/protocols/contracts"
import { marketKey, protocolLabel } from "@/lib/protocols/contracts"
import { rememberPromise } from "@/lib/protocols/promise-cache"
import { jupiterGet } from "@/server/protocols/solana/client"

/**
 * Solana's market list, from Jupiter's token API.
 *
 * Jupiter already knows what the chain cannot say about a coin: its ticker,
 * decimals, dollar liquidity, the day's volume and move, whether anyone has
 * vouched for it, and whether its own audit flagged it. This file turns that
 * into `MarketRow` the way Aster's `markets.ts` turns Aster's answer.
 *
 * **The market id is the mint address, never the ticker.** Anyone can mint a
 * coin on Solana and call it TRUMP; the verified list alone carried two of
 * them on 3 Sep 2026. Only the address is unique, so the key is
 * `solana:mainnet:<mint>` and the ticker is what prints.
 *
 * **A coin Jupiter has no price for is left out.** 683 of the 3,189 verified
 * coins had no `usdPrice` that day. `MarketRow.price` is a number every
 * screen leans on, and a made-up zero would read as a real one, so those
 * coins are not listed. The same rule keeps them out of a lookup's answer.
 */

/**
 * The dollar every Solana market here is priced and bought in.
 *
 * **Read off Jupiter's own answer, never typed from memory.** The first
 * version of this line was written from memory and was wrong in one
 * character group: it began `EPjFWdd5AufqSSqeM` like the real one and then
 * diverged, so it looked right and matched nothing. Jupiter refused a quote
 * against it with "not tradable". `markets.test.ts` now checks this constant
 * against the saved real answer, so a wrong one fails a test instead of
 * silently listing USDC and, later, building swaps nobody can fill.
 */
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"

/** Jupiter's price call takes this many mints at once. */
export const PRICE_PAGE_SIZE = 50

/**
 * How the Solana page keeps its prices moving, and why these two numbers.
 *
 * **Jupiter publishes no socket.** Measured 4 Sep 2026: its docs list no
 * streaming section and four websocket addresses all closed without a frame.
 * Solana's own node does push (`accountSubscribe` works), but a coin's price
 * there is the best path across several pools — eight of the day's busiest
 * coins routed through nine different venues — so a price off one pool is not
 * the price. Until that is built, the screen asks.
 *
 * **This is a refresh, not a live feed.** It never reaches the trading
 * engine, which asks for a price at the moment it acts. `trading-rules.md`
 * is the rule it is staying on the right side of.
 *
 * The arithmetic, on the free key's sixty requests a minute with forty of
 * them for reads: 200 coins is four pages of fifty, so one refresh costs four
 * requests, and six refreshes a minute costs 24. That leaves the market
 * list's two a minute and room for lookups, and still never touches the
 * twenty kept back for swaps.
 */
export const SOLANA_PRICE_REFRESH = {
  everyMs: 10_000,
  mostMarkets: 4 * PRICE_PAGE_SIZE,
} as const

const numberOrNull = z.number().nullable().optional()

const tokenSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  icon: z.string().nullable().optional(),
  decimals: z.number(),
  usdPrice: numberOrNull,
  stats24h: z
    .object({
      priceChange: numberOrNull,
      buyVolume: numberOrNull,
      sellVolume: numberOrNull,
    })
    .nullable()
    .optional(),
  isVerified: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  audit: z.object({ isSus: z.boolean().optional() }).nullable().optional(),
})

const priceAnswerSchema = z.record(
  z.string(),
  z.object({ usdPrice: numberOrNull }).nullable()
)

/**
 * What kind of thing a coin is, from Jupiter's tags. Solana carries tokenised
 * stocks (the `xstocks` and `stocks` tags, 1,202 of them on 3 Sep 2026) and a
 * few metals; everything else is a coin.
 */
function categoryOf(tags: readonly string[]): MarketCategory {
  const set = new Set(tags)
  if (
    set.has("stocks") ||
    set.has("xstocks") ||
    set.has("equities") ||
    set.has("prestocks") ||
    set.has("pre-ipo")
  ) {
    return "stocks"
  }
  if (set.has("commodities")) return "commodities"
  return "crypto"
}

/**
 * One Jupiter token as a market row, or null when it cannot be one: the
 * record does not parse, it is USDC itself (nothing is bought with USDC by
 * selling USDC), or Jupiter has no price for it.
 */
export function jupiterTokenRow(
  network: NetworkId,
  raw: unknown
): MarketRow | null {
  const parsed = tokenSchema.safeParse(raw)
  if (!parsed.success) return null
  const token = parsed.data
  if (token.id === USDC_MINT) return null
  const price = token.usdPrice ?? null
  if (price === null || !(price > 0)) return null

  const stats = token.stats24h ?? null
  const change = stats?.priceChange ?? null
  const bought = stats?.buyVolume ?? 0
  const sold = stats?.sellVolume ?? 0

  return {
    key: marketKey({ protocol: "solana", network, marketId: token.id }),
    marketId: token.id,
    symbol: token.symbol,
    quoteAsset: "USDC",
    subExchange: null,
    category: categoryOf(token.tags ?? []),
    sizeDecimals: token.decimals,
    minOrderSize: null,
    // A swap has no price grid: Jupiter quotes whatever the pools give.
    priceTick: null,
    minOrderValueUsd: null,
    maxLeverage: null,
    isolatedOnly: false,
    iconUrl: token.icon ?? null,
    price,
    // Jupiter says 3.29 for a 3.29% rise; the row carries the fraction.
    change24h: change === null ? null : change / 100,
    volume24hUsd: bought + sold,
    fundingHourly: null,
    openInterestUsd: null,
    // Jupiter leaves `isVerified` off an unvetted coin rather than saying
    // false, so anything short of a plain true is unverified.
    caution: token.audit?.isSus
      ? "suspicious"
      : token.isVerified !== true
        ? "unverified"
        : null,
  }
}

/**
 * Rows from several Jupiter answers, one per mint. The first answer to name
 * a mint wins, which is why the verified list is handed in first: its
 * record carries the verified tag, and the top-traded copy of the same coin
 * says nothing more.
 */
export function translateSolanaTokens(
  network: NetworkId,
  answers: readonly unknown[]
): MarketRow[] {
  const rows: MarketRow[] = []
  const seen = new Set<string>()
  for (const answer of answers) {
    if (!Array.isArray(answer)) continue
    for (const raw of answer) {
      const row = jupiterTokenRow(network, raw)
      if (row === null || seen.has(row.marketId)) continue
      seen.add(row.marketId)
      rows.push(row)
    }
  }
  return rows
}

/** Saved Jupiter answers translated without touching the network. */
export function toSolanaMarketCatalog(input: {
  network: NetworkId
  verified: unknown
  topTraded: unknown
}): MarketCatalog {
  return {
    protocol: "solana",
    protocolLabel: protocolLabel("solana"),
    network: input.network,
    networkLabel: "Mainnet",
    picker: {
      // Stocks are in the list, so the category tabs show.
      categories: "catalog",
      hip3: false,
      funding: false,
      openInterest: false,
      search: true,
    },
    priceRefresh: SOLANA_PRICE_REFRESH,
    rows: translateSolanaTokens(input.network, [
      input.verified,
      input.topTraded,
    ]),
  }
}

function assertMainnet(network: NetworkId): void {
  if (network !== "mainnet") throw new Error("SOLANA_NETWORK_UNSUPPORTED")
}

/**
 * The last list that came back whole. A failed read — Jupiter busy, the
 * minute spent — answers with this rather than an empty list, because an
 * empty list reads as "Solana lists nothing today" and that is never true.
 * The shared catalogue cache above this file asks once a minute, so a good
 * list is at most a minute old when it stands in.
 */
let lastGood: MarketCatalog | null = null

/**
 * The last good list's prices by mint, kept beside it so a wallet read can
 * price its listed coins without spending a request. The catalogue cache
 * above this file asks once a minute, so these are at most a minute old.
 */
let lastGoodPrices: ReadonlyMap<string, number> = new Map()

export function lastKnownSolanaPrices(): ReadonlyMap<string, number> {
  return lastGoodPrices
}

function rememberCatalog(catalog: MarketCatalog): void {
  lastGood = catalog
  lastGoodPrices = new Map(catalog.rows.map((row) => [row.marketId, row.price]))
}

/**
 * The verified list plus the day's hundred most traded coins, verified or
 * not. Two requests a minute against the shared budget.
 */
export async function fetchSolanaMarkets(
  network: NetworkId
): Promise<MarketCatalog> {
  assertMainnet(network)
  try {
    const [verified, topTraded] = await Promise.all([
      jupiterGet("/tokens/v2/tag", { query: "verified" }),
      jupiterGet("/tokens/v2/toptraded/24h", { limit: 100 }),
    ])
    const catalog = toSolanaMarketCatalog({ network, verified, topTraded })
    rememberCatalog(catalog)
    return catalog
  } catch (error) {
    // Nothing to fall back to yet, so the page shows the refusal itself.
    if (lastGood === null) throw error
    console.error("Solana market list could not be refreshed", error)
    return lastGood
  }
}

/**
 * Any coin by name or address, for one not in the list. Jupiter answers up
 * to twenty, verified or not; the caution flag rides on each row so an
 * unvetted coin never looks like a verified one.
 */
export async function searchSolanaMarkets(
  network: NetworkId,
  query: string
): Promise<MarketRow[]> {
  assertMainnet(network)
  const answer = await jupiterGet("/tokens/v2/search", { query: query.trim() })
  return translateSolanaTokens(network, [answer])
}

/**
 * Today's prices for these mints, in pages of fifty, each page held for two
 * seconds so the engine's settle and the panel's poll share one request. A
 * mint Jupiter does not price — not traded in seven days — is left out of
 * the answer rather than given a made-up one.
 */
const PRICES_HELD_MS = 2_000
const pricePages = new Map<
  string,
  { at: number; answer: Promise<Map<string, number>> }
>()

async function fetchPricePage(
  ids: readonly string[],
  priority: "read" | "order"
): Promise<Map<string, number>> {
  const key = [...ids].sort().join(",")
  const now = Date.now()
  // **Every page ever asked for used to stay here forever.** The key is the
  // list of mints, so each different set of coins made its own entry, and
  // the engine asks about whatever it is settling. Nothing ever removed
  // them, so a server left running grew a map of dead price pages. They are
  // only useful for two seconds, so the stale ones go on the way past.
  for (const [seen, page] of pricePages) {
    if (now - page.at >= PRICES_HELD_MS) pricePages.delete(seen)
  }
  const held = pricePages.get(key)
  if (held && now - held.at < PRICES_HELD_MS) return held.answer
  const load = jupiterGet("/price/v3", { ids: ids.join(",") }, { priority })
    .then((answer) => {
      const parsed = priceAnswerSchema.safeParse(answer)
      const prices = new Map<string, number>()
      if (!parsed.success) return prices
      for (const [mint, row] of Object.entries(parsed.data)) {
        const price = row?.usdPrice ?? null
        if (price !== null && price > 0) prices.set(mint, price)
      }
      return prices
    })
  // `rememberPromise` forgets a rejected answer itself, and it is the only
  // thing that can: it compares against the entry it stored, which does not
  // exist until the line below runs.
  return rememberPromise(pricePages, key, { at: now, answer: load })
}

export async function fetchSolanaPrices(
  network: NetworkId,
  marketIds: readonly string[],
  options: { forOrder?: boolean } = {}
): Promise<Map<string, number>> {
  assertMainnet(network)
  const unique = [...new Set(marketIds)]
  const pages: string[][] = []
  for (let i = 0; i < unique.length; i += PRICE_PAGE_SIZE) {
    pages.push(unique.slice(i, i + PRICE_PAGE_SIZE))
  }
  const answers = await Promise.all(
    pages.map((page) =>
      fetchPricePage(page, options.forOrder ? "order" : "read")
    )
  )
  const prices = new Map<string, number>()
  for (const answer of answers) {
    for (const [mint, price] of answer) prices.set(mint, price)
  }
  return prices
}

/**
 * Solana publishes no candles, and neither does Jupiter nor the chain.
 *
 * An empty answer rather than a refusal, because having none is the ordinary
 * truth here and not a failure. What the chart draws instead is decided a
 * level up: borrowed history where the coin has a pinned Binance twin, and
 * otherwise the one-minute bars the app recorded while watching. The registry
 * entry says so with `recordsOwnBars`.
 */
export async function solanaHasNoCandles(): Promise<CandleBar[]> {
  return []
}

/** Tests must not answer from another case's list or price page. */
export function clearSolanaMarketState(): void {
  lastGood = null
  lastGoodPrices = new Map()
  pricePages.clear()
}
