import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { marketChartHref } from "@/lib/protocols/contracts"
import {
  LEAST_SEARCH_LETTERS,
  MOST_SEARCH_HITS,
  matchMarketRank,
  orderMarketMatches,
  type MarketMatch,
  type MarketSearchAnswer,
} from "@/lib/trade/market-search"
import { userGet } from "@/server/guards"
import { loadRawMarketCatalog } from "@/server/protocols/market-catalog"
import { listProtocols } from "@/server/protocols/registry"

const marketSearchSchema = z.object({
  query: z.string().trim().min(LEAST_SEARCH_LETTERS).max(64),
})

/**
 * Every market on every exchange whose ticker answers what was typed.
 *
 * One read asks all the exchanges that can list markets, on mainnet only: a
 * testnet market trades pretend dollars, and `rules/trading-rules.md` forbids a
 * list where a pretend dollar could be read as a real one.
 *
 * Catalogs come from `loadRawMarketCatalog`, the same one-minute shared cache
 * the dashboards and the market explorer read, so a search costs the exchanges
 * nothing once a screen has already asked. An exchange that will not answer is
 * named in `unavailable` rather than quietly dropped, because "no results" and
 * "Binance is down" are different answers.
 *
 * The daily-volume cutoff from Settings is deliberately NOT applied. The cutoff
 * keeps a browsing list readable; somebody typing a ticker has already named
 * the market they want, and hiding it would read as the exchange not listing
 * it.
 */
const searchAllMarketsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(marketSearchSchema)
  .handler(async ({ data }): Promise<MarketSearchAnswer> => {
    const asked = data.query.toLowerCase()
    const protocols = listProtocols().filter(
      (protocol) =>
        protocol.capabilities.markets && protocol.networks.includes("mainnet")
    )

    const unavailable: string[] = []
    const found: MarketMatch[] = []

    await Promise.all(
      protocols.map(async (protocol) => {
        try {
          const catalog = await loadRawMarketCatalog(protocol.id, "mainnet")
          for (const row of catalog.rows) {
            const rank = matchMarketRank(row, asked)
            if (rank === null) continue
            found.push({
              rank,
              volume24hUsd: row.volume24hUsd,
              hit: {
                key: row.key,
                symbol: row.symbol,
                protocol: protocol.id,
                protocolLabel: protocol.label,
                subExchange: row.subExchange,
                href: marketChartHref(row.key),
              },
            })
          }
        } catch {
          unavailable.push(protocol.label)
        }
      })
    )

    const ordered = orderMarketMatches(found)
    return {
      hits: ordered.slice(0, MOST_SEARCH_HITS),
      more: Math.max(0, ordered.length - MOST_SEARCH_HITS),
      unavailable: unavailable.sort((a, b) => a.localeCompare(b)),
    }
  })

export function searchAllMarkets(query: string) {
  return searchAllMarketsFn({ data: { query } })
}
