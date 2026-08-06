import { createFileRoute } from "@tanstack/react-router"

import { TradeWorkspace } from "@/components/trade/trade-workspace"

/**
 * The Trade workspace.
 *
 * No loader yet: nothing on this page is connected to anything, so there is
 * nothing to fetch before it draws.
 */
export const Route = createFileRoute("/_authenticated/trade")({
  component: TradeRoute,
})

function TradeRoute() {
  return <TradeWorkspace />
}
