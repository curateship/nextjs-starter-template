import { createFileRoute } from "@tanstack/react-router"

import { mainnetExchangeRoute } from "@/components/trade/exchange-page"
import type { ProtocolId } from "@/lib/protocols/contracts"

const PROTOCOL: ProtocolId = "bnb"

export const Route = createFileRoute("/_authenticated/admin/bnb")(
  mainnetExchangeRoute({ protocol: PROTOCOL, label: "BNB Chain" })
)
