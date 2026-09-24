import { z } from "zod"
import { decodeEventLog, parseAbi, type Hex } from "viem"
import {
  evmMarkets,
  type VettedToken,
} from "@/server/protocols/evm-chain/markets"
import {
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_STOCK_FACTORY,
  ROBINHOOD_USDG,
  ROBINHOOD_WETH,
  robinhoodRequestCounts,
  robinhoodServiceGet,
  robinhoodStockLogo,
} from "./client"

const factoryAbi = parseAbi([
  "event Deployed(bytes32 indexed uid, address stock, string name, string symbol)",
])
/** A stock token's own contract sets no decimals, so it keeps the standard 18. */
const STOCK_DECIMALS = 18
/** 204 deploys filled five pages on 23 Sep 2026. This leaves room to grow. */
const MOST_LOG_PAGES = 40

const hex = z.string().regex(/^0x[\da-f]*$/i)
const logsSchema = z.object({
  items: z.array(
    z.object({
      address: z.object({ hash: z.string() }),
      // Blockscout pads the list to four topics with nulls.
      topics: z.array(hex.nullable()),
      data: hex,
    })
  ),
  next_page_params: z
    .record(z.string(), z.union([z.string(), z.number(), z.null()]))
    .nullable(),
})

/** Every token the factory has deployed, read from its events, page by page. */
export function parseStockDeploys(raw: unknown): {
  stocks: VettedToken[]
  next: Record<string, string> | null
} {
  const page = logsSchema.parse(raw)
  const stocks = page.items.flatMap((item): VettedToken[] => {
    if (item.address.hash.toLowerCase() !== ROBINHOOD_STOCK_FACTORY) return []
    const topics = item.topics.filter((topic): topic is string => !!topic)
    try {
      const event = decodeEventLog({
        abi: factoryAbi,
        topics: topics as [Hex, ...Hex[]],
        data: item.data as Hex,
      })
      const stock = event.args.stock.toLowerCase()
      return [
        {
          address: stock,
          symbol: event.args.symbol,
          decimals: STOCK_DECIMALS,
          logoURI: robinhoodStockLogo(stock),
          category: "stocks",
        },
      ]
    } catch {
      // The factory's own upgrade and setup events are not deploys.
      return []
    }
  })
  // Blockscout's cursor carries empty values it wants back as the word null.
  const next = page.next_page_params
    ? Object.fromEntries(
        Object.entries(page.next_page_params).map(([key, value]) => [
          key,
          value === null ? "null" : String(value),
        ])
      )
    : null
  return { stocks, next }
}

async function loadVouched(): Promise<VettedToken[]> {
  const stocks: VettedToken[] = []
  const seen = new Set<string>()
  let params: Record<string, string> = {}
  for (let page = 0; page < MOST_LOG_PAGES; page++) {
    const answer = parseStockDeploys(
      await robinhoodServiceGet(
        "explorer",
        `/api/v2/addresses/${ROBINHOOD_STOCK_FACTORY}/logs`,
        params
      )
    )
    stocks.push(...answer.stocks)
    if (!answer.next) break
    const cursor = JSON.stringify(answer.next)
    // A cursor seen twice would read the same page forever.
    if (seen.has(cursor)) break
    seen.add(cursor)
    params = answer.next
  }
  return [
    ...stocks,
    { address: ROBINHOOD_WETH, symbol: "WETH", decimals: 18, category: "crypto" },
  ]
}

/**
 * Robinhood Chain's market list: every stock token Robinhood's factory has
 * deployed, under TradFi, and the coins in the chain's 200 busiest pools,
 * under Crypto. A stock token needs no clean GoPlus answer, because the
 * factory is the proof; a pool coin reads "Unverified". Any coin GoPlus
 * calls a honeypot or taxes over 10% on a sale reads "Suspicious".
 */
const markets = evmMarkets({
  protocol: "robinhood",
  label: "Robinhood Chain",
  unsupportedNetwork: "ROBINHOOD_NETWORK_UNSUPPORTED",
  serviceCode: "ROBINHOOD_SERVICE",
  dexChain: "robinhood",
  securityChain: ROBINHOOD_CHAIN_ID,
  geckoNetwork: "robinhood",
  dollarCoin: ROBINHOOD_USDG,
  quoteAsset: "USDG",
  wrappedNative: ROBINHOOD_WETH,
  nativeSymbol: "ETH",
  picker: "catalog",
  get: robinhoodServiceGet,
  counts: robinhoodRequestCounts,
  vetted: {
    service: "Blockscout",
    load: loadVouched,
    trustedWithoutAudit: true,
  },
})

export const bestRobinhoodPairs = markets.bestPairs
export const fetchRobinhoodMarkets = markets.catalog
export const searchRobinhoodMarkets = markets.search
export const fetchRobinhoodPrices = markets.prices
export const robinhoodPricesWereRationed = markets.pricesWereRationed
export const robinhoodAccountMarkets = markets.accountMarkets
