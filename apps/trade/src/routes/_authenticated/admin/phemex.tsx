import { createFileRoute } from "@tanstack/react-router"

import { mainnetExchangeRoute } from "@/components/trade/exchange-page"
import type { ProtocolId } from "@/lib/protocols/contracts"

/**
 * The Phemex dashboard — the shared exchange page at its own address. The
 * one thing that makes it Phemex's is the constant below, held as DATA; the
 * page body lives in `@/components/trade/exchange-page`.
 *
 * Mainnet only: Phemex's practice network is not carried (decided 19 Aug
 * 2026), so this page has no `?network` param at all — a pasted one is
 * dropped from the address rather than accepted and overridden.
 */
const PROTOCOL: ProtocolId = "phemex"

export const Route = createFileRoute("/_authenticated/admin/phemex")(
  mainnetExchangeRoute({ protocol: PROTOCOL, label: "Phemex" })
)
