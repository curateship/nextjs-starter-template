import { createFileRoute } from "@tanstack/react-router"

import { practiceExchangeRoute } from "@/components/trade/exchange-page"
import type { ProtocolId } from "@/lib/protocols/contracts"

/**
 * The Aster dashboard — the shared exchange page at its own address. The one
 * thing that makes it Aster's is the constant below, held as DATA; the page
 * body lives in `@/components/trade/exchange-page`.
 *
 * Aster has a public testnet, so `?network=testnet` is honoured here.
 */
const PROTOCOL: ProtocolId = "aster"

export const Route = createFileRoute("/_authenticated/admin/aster")(
  practiceExchangeRoute({ protocol: PROTOCOL, label: "Aster" })
)
