import { createFileRoute } from "@tanstack/react-router"

import { mainnetExchangeRoute } from "@/components/trade/exchange-page"
import type { ProtocolId } from "@/lib/protocols/contracts"

/**
 * The KuCoin dashboard — the shared exchange page at its own address. The
 * one thing that makes it KuCoin's is the constant below, held as DATA; the
 * page body lives in `@/components/trade/exchange-page`.
 *
 * Mainnet only, and not by choice: KuCoin shut its practice environment down
 * in 2023. So this page has no `?network` param at all — a pasted one is
 * dropped from the address rather than accepted and overridden.
 *
 * This address sits outside `/admin` so that a member reaches it too. What
 * they see is their own: every wallet, order and drawing is keyed to the
 * person who made it, and the two calls this page loads with ask only for a
 * signed-in user. `/admin/kucoin` is kept as a redirect.
 */
const PROTOCOL: ProtocolId = "kucoin"

export const Route = createFileRoute("/_authenticated/protocols/kucoin")(
  mainnetExchangeRoute({ protocol: PROTOCOL, label: "KuCoin" })
)
