import { createFileRoute } from "@tanstack/react-router"

import { tradePageTitle, useTradePageTitle } from "@/app/page-title"
import { PnlPage } from "@/components/pnl/pnl-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getPnlErrorMessage, loadPnlPageData } from "@/lib/api/trade/pnl"

/**
 * P&L, profit and loss: how the trading has gone.
 *
 * A page of its own, open to every member, at `/pnl`. The Journal on the left
 * is the same finished-trade list the bottom panel shows on every exchange
 * screen, here across every exchange and at full height; the month grid and
 * the cards on the right add up the real-money half of it.
 */
export const Route = createFileRoute("/_authenticated/pnl")({
  head: ({ matches }) => ({
    meta: [{ title: tradePageTitle(matches, "P&L") }],
  }),
  // Dropped on close so coming back never draws an older Journal while the
  // fresh one is on its way.
  gcTime: 0,
  loader: () => loadPnlPageData(),
  component: PnlRoute,
  errorComponent: routeErrorComponent(getPnlErrorMessage),
})

function PnlRoute() {
  useTradePageTitle("P&L")
  return <PnlPage initial={Route.useLoaderData()} />
}
