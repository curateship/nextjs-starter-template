import { createFileRoute } from "@tanstack/react-router"

import { tradePageTitle, useTradePageTitle } from "@/app/page-title"
import { routeErrorComponent } from "@/components/shell/route-error"
import { AdminCopyTradingPage } from "@/components/social/admin-copy-trading"
import {
  getCopyErrorMessage,
  readCopyAdmin,
} from "@/lib/api/trade/copy-trading"

/**
 * The fee on copied trades, the trader's share, the real-money switch, the
 * payout list and a per-trader stop on new copies. The link goes in the admin
 * sidebar by hand, like every other admin page here.
 */
export const Route = createFileRoute("/_authenticated/admin/copy-trading")({
  head: ({ matches }) => ({
    meta: [{ title: tradePageTitle(matches, "Copy trading") }],
  }),
  gcTime: 0,
  loader: () => readCopyAdmin(),
  component: AdminCopyTradingRoute,
  errorComponent: routeErrorComponent(getCopyErrorMessage),
})

function AdminCopyTradingRoute() {
  useTradePageTitle("Copy trading")
  return <AdminCopyTradingPage initial={Route.useLoaderData()} />
}
