import { createFileRoute, redirect } from "@tanstack/react-router"

import { readTradeSearch } from "@/lib/trade/trade-network"

/**
 * The old address of the Hyperliquid dashboard, kept as a redirect.
 *
 * Each exchange has its own dashboard now, and Hyperliquid's lives at
 * `/admin/hyper-liquid`. Old links, the browser's memory and anything else
 * still pointing here keep working — the market and network in the address
 * ride along, so a saved link to a testnet coin still lands on that coin.
 */
export const Route = createFileRoute("/_authenticated/trade")({
  validateSearch: readTradeSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/admin/hyper-liquid", search, replace: true })
  },
})
