import { createFileRoute } from "@tanstack/react-router"

import { practiceExchangeRoute } from "@/components/trade/exchange-page"
import type { ProtocolId } from "@/lib/protocols/contracts"

/**
 * The Hyperliquid dashboard — the shared exchange page at its own address.
 * The one thing that makes it Hyperliquid's is the constant below, held as
 * DATA; the page body lives in `@/components/trade/exchange-page`.
 *
 * Hyperliquid still runs a practice network, so `?network=testnet` is
 * honoured here.
 */
const PROTOCOL: ProtocolId = "hyperliquid"

export const Route = createFileRoute("/_authenticated/admin/hyper-liquid")(
  practiceExchangeRoute({ protocol: PROTOCOL, label: "Hyperliquid" })
)
