import { createFileRoute } from "@tanstack/react-router"

import { tradePageTitle, useTradePageTitle } from "@/app/page-title"
import { FlowRunsListPage } from "@/components/flow-run/flow-runs-list-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getFlowRunErrorMessage, loadFlowRuns } from "@/lib/api/trade/flow-runs"

/**
 * Every flow this account has ever switched on.
 *
 * A page of its own rather than a tab on the trading screen, for the same
 * reason the backtests have one: a run outlives the flow that made it, and
 * comparing what one did last week to what it is doing today is the whole
 * point of keeping them.
 */
export const Route = createFileRoute("/_authenticated/flow-runs")({
  head: ({ matches }) => ({
    meta: [{ title: tradePageTitle(matches, "Flow runs") }],
  }),
  // The page keeps a copy of the loader's answer so it can refresh a running
  // flow without a full navigation. Dropping it on close means coming back
  // never draws an older list while the fresh answer is on its way.
  gcTime: 0,
  loader: () => loadFlowRuns(),
  component: FlowRunsRoute,
  errorComponent: routeErrorComponent(getFlowRunErrorMessage),
})

function FlowRunsRoute() {
  useTradePageTitle("Flow runs")
  return <FlowRunsListPage initial={Route.useLoaderData()} />
}
