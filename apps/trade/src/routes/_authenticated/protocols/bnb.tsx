import { createFileRoute } from "@tanstack/react-router"

import { mainnetExchangeRoute } from "@/components/trade/exchange-page"
import type { ProtocolId } from "@/lib/protocols/contracts"

/**
 * The BNB Chain dashboard — the shared exchange page at its own address. The
 * one thing that makes it BNB's is the constant below, held as DATA; the page
 * body lives in `@/components/trade/exchange-page`.
 *
 * This address sits outside `/admin` so that a member reaches it too. What
 * they see is their own: every wallet, order and drawing is keyed to the
 * person who made it, and the two calls this page loads with ask only for a
 * signed-in user. `/admin/bnb` is kept as a redirect.
 */
const PROTOCOL: ProtocolId = "bnb"

export const Route = createFileRoute("/_authenticated/protocols/bnb")(
  mainnetExchangeRoute({ protocol: PROTOCOL, label: "BNB Chain" })
)
