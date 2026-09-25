import {
  CONVERTER_EXCHANGE,
  OWN_PAGE_MIN_VOLUME_USD,
  pairSlug,
  type ConverterPrices,
} from "@/lib/free-tools/price-converter"
import type { MarketRow } from "@/lib/protocols/contracts"
import { loadRawMarketCatalog } from "@/server/protocols/market-catalog"
import {
  livePrices,
  openLivePrices,
} from "@/server/protocols/hyperliquid/live-prices"

/** How long the first visitor after a restart waits for the line to speak. */
const FIRST_PRICES_WAIT_MS = 3_000
const FIRST_PRICES_CHECK_MS = 100

/**
 * The converter's prices, the same for every visitor.
 *
 * **No visitor asks the exchange anything.** Prices come off the Hyperliquid
 * socket this server keeps open, the same line the trading engine reads
 * (`src/server/protocols/hyperliquid/live-prices.ts`). The exchange pushes
 * every market about once a second whether one visitor is reading or a
 * thousand. The coin list and the day's trading come from the market list,
 * which the server keeps for a minute and shares with the trading screens
 * (`loadRawMarketCatalog`).
 *
 * The website and the trading engine run as two separate programs, so the
 * website keeps a line of its own. Opening it is a socket, not a timer of
 * questions.
 */
export async function loadConverterPrices(): Promise<ConverterPrices> {
  openLivePrices("mainnet")
  const [rows] = await Promise.all([
    mainCoins().catch((error: unknown) => {
      console.error("The converter could not read Hyperliquid's coins", error)
      throw new Error("CONVERTER_COINS_UNAVAILABLE")
    }),
    firstPrices(),
  ])
  const { prices, ageMs } = livePrices("mainnet")
  return {
    exchange: CONVERTER_EXCHANGE,
    coins: rows.map((row) => ({
      symbol: row.symbol,
      price: prices.get(row.marketId) ?? null,
      ownPage: row.volume24hUsd >= OWN_PAGE_MIN_VOLUME_USD,
    })),
    ageMs: Number.isFinite(ageMs) ? ageMs : null,
  }
}

/**
 * The coin pages listed in the sitemap: coins that traded at least
 * `OWN_PAGE_MIN_VOLUME_USD` over the last day. An exchange that cannot answer
 * leaves them out rather than breaking the sitemap for every other page.
 */
export async function listConverterPagePaths(): Promise<{ path: string }[]> {
  try {
    const rows = await mainCoins()
    return rows
      .filter((row) => row.volume24hUsd >= OWN_PAGE_MIN_VOLUME_USD)
      .map((row) => ({ path: `/tools/convert/${pairSlug(row.symbol)}` }))
  } catch (error) {
    console.error("Converter pages left out of the sitemap", error)
    return []
  }
}

/**
 * Hyperliquid's own coins, busiest first. The markets other groups host on
 * Hyperliquid (stocks, indexes) are left out: they are not coins, and some
 * share a coin's name.
 */
async function mainCoins(): Promise<MarketRow[]> {
  const catalog = await loadRawMarketCatalog("hyperliquid", "mainnet")
  return catalog.rows
    .filter((row) => row.subExchange === null)
    .sort((a, b) => b.volume24hUsd - a.volume24hUsd)
}

/**
 * Right after the server starts, the line is open but has not said anything
 * yet. Waiting a moment here means the first visitor sees prices instead of a
 * page of dashes. A line that stays quiet is not waited on past three seconds.
 */
async function firstPrices(): Promise<void> {
  const until = Date.now() + FIRST_PRICES_WAIT_MS
  while (livePrices("mainnet").prices.size === 0 && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, FIRST_PRICES_CHECK_MS))
  }
}
