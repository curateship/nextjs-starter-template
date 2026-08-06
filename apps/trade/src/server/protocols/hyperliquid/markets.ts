import { z } from "zod"

import {
  marketKey,
  type MarketCatalog,
  type MarketRow,
  type NetworkId,
} from "@/lib/protocols/contracts"
import { namespaceMarketId, num } from "@/lib/protocols/hyperliquid/translate"
import { infoClient } from "@/server/protocols/hyperliquid/client"

/**
 * Everything this app knows about Hyperliquid lives in this folder, and this
 * folder is the only place `@nktkas/hyperliquid` may be imported —
 * `../fence.test.ts` fails the build if it leaks. Screens see `MarketRow`s;
 * the exchange's own names for things stop at this file.
 *
 * Read-only. The market list is public data — no key, no signature, no
 * account — so there is nothing here to protect beyond not trusting the
 * response blindly.
 *
 * Hyperliquid is several venues in one: the main exchange plus the
 * sub-exchanges it hosts (stocks, indices and whatever gets deployed next).
 * This module reads them all. A sub-exchange asset arrives already
 * namespaced — `"xyz:AAPL"` — which is what keeps every market id unique
 * across venues, and that namespaced id is exactly what the candle endpoint
 * expects back.
 */

/** The venue list: null is the main exchange, the rest are sub-exchanges. */
const perpDexsSchema = z.array(
  z.union([
    z.null(),
    z.object({
      name: z.string().min(1),
      fullName: z.string(),
    }),
  ])
)

type PerpDex = z.infer<typeof perpDexsSchema>[number]

/**
 * The slice of the exchange's answer this module actually reads, checked at
 * runtime. The SDK is typed, but the wire is the wire: a field that arrives
 * missing or renamed should fail here, loudly, not as NaN three screens away.
 * Everything else in the response is deliberately ignored.
 */
const metaAndCtxsSchema = z.tuple([
  z.object({
    universe: z.array(
      z.object({
        name: z.string().min(1),
        isDelisted: z.boolean().optional(),
      })
    ),
  }),
  z.array(
    z.object({
      markPx: z.string(),
      prevDayPx: z.string(),
      dayNtlVlm: z.string(),
      funding: z.string(),
      openInterest: z.string(),
    })
  ),
])

export function toMarketRows(
  data: z.infer<typeof metaAndCtxsSchema>,
  network: NetworkId,
  dex: PerpDex = null
): MarketRow[] {
  const [meta, ctxs] = data
  const rows: MarketRow[] = []

  meta.universe.forEach((asset, index) => {
    // A delisted market no longer trades; a market the exchange sent no
    // figures for cannot be priced. Neither belongs in the list.
    if (asset.isDelisted) return
    const ctx = ctxs[index]
    if (!ctx) return

    const price = num(ctx.markPx)
    if (price === null) return

    // The shared namespacing rule: ids must be unique across venues or two
    // markets share one key. `translate.ts` owns it so the browser stream
    // names markets identically.
    const marketId = namespaceMarketId(dex?.name ?? "", asset.name)
    // The coin art is filed under the bare symbol, without the venue prefix.
    const artSymbol = marketId.includes(":")
      ? marketId.slice(marketId.indexOf(":") + 1)
      : marketId

    const prevDay = num(ctx.prevDayPx)
    // The exchange reports open interest in coins; in dollars it is worth
    // coins × price.
    const openInterest = num(ctx.openInterest)
    rows.push({
      key: marketKey({ protocol: "hyperliquid", network, marketId }),
      marketId,
      // The full namespaced name on purpose: with one flat list, a stripped
      // "BTC" from a sub-exchange would be a lookalike of the real one.
      symbol: marketId,
      subExchange: dex?.fullName || dex?.name || null,
      // The exchange's own coin art, from where its app serves it.
      iconUrl: `https://app.hyperliquid.xyz/coins/${encodeURIComponent(artSymbol)}.svg`,
      price,
      change24h:
        prevDay !== null && prevDay > 0 ? (price - prevDay) / prevDay : null,
      volume24hUsd: num(ctx.dayNtlVlm) ?? 0,
      fundingHourly: num(ctx.funding),
      openInterestUsd: openInterest !== null ? openInterest * price : null,
    })
  })

  return rows
}

/**
 * Every market Hyperliquid lists right now — main exchange and every
 * sub-exchange — with their day's figures.
 *
 * The venues are fetched in parallel, and one venue failing drops that venue
 * while the rest still serve. Only every venue failing is an error: a page
 * with most of the list beats no page, but an empty answer must never look
 * like "no markets exist".
 */
export async function fetchHyperliquidMarkets(
  network: NetworkId
): Promise<MarketCatalog> {
  const client = infoClient(network)
  const dexs = perpDexsSchema.parse(await client.perpDexs())

  const venues = await Promise.all(
    dexs.map((dex) =>
      client
        .metaAndAssetCtxs({ dex: dex?.name ?? "" })
        .then((response) => ({
          dex,
          data: metaAndCtxsSchema.parse(response),
          error: null as unknown,
        }))
        .catch((error: unknown) => ({ dex, data: null, error }))
    )
  )

  const answered = venues.filter(
    (venue): venue is typeof venue & { data: z.infer<typeof metaAndCtxsSchema> } =>
      venue.data !== null
  )
  if (answered.length === 0) {
    throw venues[0]?.error ?? new Error("Hyperliquid did not answer.")
  }

  return {
    protocol: "hyperliquid",
    protocolLabel: "Hyperliquid",
    network,
    networkLabel: network === "mainnet" ? "Mainnet" : "Testnet",
    rows: answered.flatMap(({ dex, data }) => toMarketRows(data, network, dex)),
  }
}
