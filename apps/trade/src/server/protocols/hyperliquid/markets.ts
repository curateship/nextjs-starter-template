import { z } from "zod"

import {
  marketKey,
  type MarketCatalog,
  type MarketRow,
  type NetworkId,
} from "@/lib/protocols/contracts"
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
 */

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

/** A figure the exchange sent as a decimal string, or null if it was junk. */
function num(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function toMarketRows(
  data: z.infer<typeof metaAndCtxsSchema>,
  network: NetworkId
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

    const prevDay = num(ctx.prevDayPx)
    // The exchange reports open interest in coins; in dollars it is worth
    // coins × price.
    const openInterest = num(ctx.openInterest)
    rows.push({
      key: marketKey({
        protocol: "hyperliquid",
        network,
        marketId: asset.name,
      }),
      marketId: asset.name,
      symbol: asset.name,
      // The exchange's own coin art, from where its app serves it.
      iconUrl: `https://app.hyperliquid.xyz/coins/${encodeURIComponent(asset.name)}.svg`,
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

/** The perp markets Hyperliquid lists right now, with their day's figures. */
export async function fetchHyperliquidMarkets(
  network: NetworkId
): Promise<MarketCatalog> {
  const response = await infoClient(network).metaAndAssetCtxs()
  const data = metaAndCtxsSchema.parse(response)

  return {
    protocol: "hyperliquid",
    protocolLabel: "Hyperliquid",
    network,
    networkLabel: network === "mainnet" ? "Mainnet" : "Testnet",
    rows: toMarketRows(data, network),
  }
}
