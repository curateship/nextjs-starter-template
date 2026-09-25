import { createFileRoute } from "@tanstack/react-router"

import { mainnetExchangeRoute } from "@/components/trade/exchange-page"
import type { ProtocolId } from "@/lib/protocols/contracts"

/**
 * The Solana dashboard — the shared exchange page at its own address. The
 * one thing that makes it Solana's is the constant below, held as DATA; the
 * page body lives in `@/components/trade/exchange-page`.
 *
 * Mainnet only: Solana's devnet has a faucet but Jupiter cannot swap on it,
 * so this page has no `?network` param at all — a pasted one is dropped from
 * the address rather than accepted and overridden.
 *
 * This address sits outside `/admin` so that a member reaches it too. What
 * they see is their own: every wallet, order and drawing is keyed to the
 * person who made it, and the two calls this page loads with ask only for a
 * signed-in user. `/admin/solana` is kept as a redirect.
 */
const PROTOCOL: ProtocolId = "solana"

export const Route = createFileRoute("/_authenticated/protocols/solana")(
  mainnetExchangeRoute({ protocol: PROTOCOL, label: "Solana" })
)
