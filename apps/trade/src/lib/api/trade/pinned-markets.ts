import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { marketSymbol, parseMarketKey } from "@/lib/protocols/contracts"
import {
  normalizePinnedMarkets,
  type PinnedMarketQuote,
} from "@/lib/trade/pinned-markets"
import { userGet, userPost } from "@/server/guards"
import { loadRawMarketCatalog } from "@/server/protocols/market-catalog"
import {
  loadPinnedMarkets,
  savePinnedMarket,
} from "@/server/trade/pinned-markets"
import { marksForKeys } from "@/server/trade/paper"

const loadPinsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => {
    const pins = await loadPinnedMarkets(context.user.id)
    // One shared price read per venue, never one per chip.
    const scopes = new Map(
      pins.map((key) => {
        const ref = parseMarketKey(key)!
        return [`${ref.protocol}:${ref.network}`, ref] as const
      })
    )
    const [marks, catalogs] = await Promise.all([
      marksForKeys(pins),
      Promise.all(
        [...scopes.values()].map(async (ref) =>
          loadRawMarketCatalog(ref.protocol, ref.network).catch(() => null)
        )
      ),
    ])
    const rows = new Map(
      catalogs
        .flatMap((catalog) => catalog?.rows ?? [])
        .map((row) => [row.key, row])
    )
    const quotes: PinnedMarketQuote[] = pins.map((key) => {
      const row = rows.get(key)
      const mark = marks.get(key)
      const price =
        mark !== undefined && Number.isFinite(mark) && mark > 0 ? mark : null
      const previous =
        row && row.change24h !== null && row.change24h > -1
          ? row.price / (1 + row.change24h)
          : null
      return {
        key,
        symbol: row?.symbol ?? marketSymbol(key),
        price,
        change24h:
          price !== null &&
          previous !== null &&
          previous > 0 &&
          Number.isFinite(previous)
            ? price / previous - 1
            : null,
      }
    })
    return { pins, quotes }
  })

const savePinFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      key: z
        .string()
        .max(180)
        .refine((key) => normalizePinnedMarkets([key]).length === 1),
      pinned: z.boolean(),
    })
  )
  .handler(({ context, data }) =>
    savePinnedMarket(context.user.id, data.key, data.pinned)
  )

export function loadHeaderPinnedMarkets() {
  return loadPinsFn()
}
export function saveHeaderPinnedMarket(key: string, pinned: boolean) {
  return savePinFn({ data: { key, pinned } })
}
