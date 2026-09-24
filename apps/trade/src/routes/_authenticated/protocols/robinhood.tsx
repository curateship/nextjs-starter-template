import { createFileRoute } from "@tanstack/react-router"

import { mainnetExchangeRoute } from "@/components/trade/exchange-page"
import type { ProtocolId } from "@/lib/protocols/contracts"

/**
 * The Robinhood Chain dashboard — the shared exchange page at its own
 * address. The one thing that makes it Robinhood's is the constant below,
 * held as DATA; the page body lives in `@/components/trade/exchange-page`.
 *
 * This address sits outside `/admin` so that a member reaches it too. What
 * they see is their own: every wallet, order and drawing is keyed to the
 * person who made it.
 */
const PROTOCOL: ProtocolId = "robinhood"

export const Route = createFileRoute("/_authenticated/protocols/robinhood")(
  mainnetExchangeRoute({ protocol: PROTOCOL, label: "Robinhood Chain" })
)
