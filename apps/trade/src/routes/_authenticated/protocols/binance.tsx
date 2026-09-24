import { createFileRoute } from "@tanstack/react-router"

import { mainnetExchangeRoute } from "@/components/trade/exchange-page"
import type { ProtocolId } from "@/lib/protocols/contracts"

/**
 * The Binance dashboard — the shared exchange page at its own address. The
 * one thing that makes it Binance's is the constant below, held as DATA; the
 * page body lives in `@/components/trade/exchange-page`.
 *
 * Mainnet only, so this page has no `?network` param. It sits outside
 * `/admin` so that a member reaches it too, the same as every other protocol
 * screen.
 */
const PROTOCOL: ProtocolId = "binance"

export const Route = createFileRoute("/_authenticated/protocols/binance")(
  mainnetExchangeRoute({ protocol: PROTOCOL, label: "Binance" })
)
