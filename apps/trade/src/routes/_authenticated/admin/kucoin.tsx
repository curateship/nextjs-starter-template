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
 */
const PROTOCOL: ProtocolId = "kucoin"

export const Route = createFileRoute("/_authenticated/admin/kucoin")(
  mainnetExchangeRoute({ protocol: PROTOCOL, label: "KuCoin" })
)
