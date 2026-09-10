import { createFileRoute } from "@tanstack/react-router"

import { practiceExchangeRoute } from "@/components/trade/exchange-page"
import type { ProtocolId } from "@/lib/protocols/contracts"

/**
 * The Aster dashboard — the shared exchange page at its own address. The one
 * thing that makes it Aster's is the constant below, held as DATA; the page
 * body lives in `@/components/trade/exchange-page`.
 *
 * Aster has a public testnet, so `?network=testnet` is honoured here.
 *
 * This address sits outside `/admin` so that a member reaches it too. What
 * they see is their own: every wallet, order and drawing is keyed to the
 * person who made it, and the two calls this page loads with ask only for a
 * signed-in user. `/admin/aster` is kept as a redirect.
 */
const PROTOCOL: ProtocolId = "aster"

export const Route = createFileRoute("/_authenticated/protocols/aster")(
  practiceExchangeRoute({ protocol: PROTOCOL, label: "Aster" })
)
