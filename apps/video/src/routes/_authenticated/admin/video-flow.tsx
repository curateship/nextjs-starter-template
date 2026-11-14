import { createFileRoute } from "@tanstack/react-router"

import { FlowDashboard, type FlowLoaded } from "@/components/video-flow/flow-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getFlow,
  getFlowErrorMessage,
  getFlowRun,
  listFlowRuns,
  listFlows,
  loadFlowKindPrices,
} from "@/lib/api/video/flow"
import { FLOW_NOT_FOUND_MESSAGE, FLOW_RUN_NOT_FOUND_MESSAGE } from "@/lib/video/flow/flows"
import { flowTabOf, readFlowSearch } from "@/lib/video/flow/flow-search"

/**
 * The Flow dashboard (workspace/docs/flow.md; Tyler, 14 Nov 2026: "I want to
 * create a new 3 panel canvas dashboard called flow"). Its panels copy
 * Admin → Pages: the left panel picks Flows or Runs, the middle is the
 * table, and Edit flow or a run flips the middle to the builder or the
 * run's steps page in place.
 */
export const Route = createFileRoute("/_authenticated/admin/video-flow")({
  // The builder keeps its own canvas state. Never draw it again from a
  // cached answer after somebody leaves, or a saved node could look lost.
  gcTime: 0,
  validateSearch: readFlowSearch,
  // Only what changes what is read. The picked row, node and step are the
  // screen's own.
  loaderDeps: ({ search }) => ({ tab: search.tab, edit: search.edit, run: search.run }),
  loader: ({ deps }) => loadFlowDashboard(deps),
  component: VideoFlowRoute,
  errorComponent: routeErrorComponent(getFlowErrorMessage),
})

/**
 * A flow or run the address names that is gone (deleted, or a place
 * remembered from before it was deleted) reads as nothing, and the dashboard
 * drops it from the address and shows the table, rather than the page
 * failing with "Flow not found". Any other failure still fails the page.
 */
function unlessGone<T>(read: Promise<T>): Promise<T | "gone"> {
  return read.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : ""
    if (message === FLOW_NOT_FOUND_MESSAGE || message === FLOW_RUN_NOT_FOUND_MESSAGE) return "gone" as const
    throw error
  })
}

async function loadFlowDashboard(deps: { tab?: "runs"; edit?: string; run?: string }): Promise<FlowLoaded> {
  const tab = flowTabOf({ tab: deps.tab })
  const editing = tab === "flows" && deps.edit ? unlessGone(getFlow(deps.edit)) : Promise.resolve(null)
  const opened = tab === "runs" && deps.run ? unlessGone(getFlowRun(deps.run)) : Promise.resolve(null)
  const [list, runs, flow, prices, run] = await Promise.all([
    listFlows(),
    tab === "runs" && deps.run ? opened.then((read) => (read === "gone" ? listFlowRuns() : null)) : tab === "runs" ? listFlowRuns() : Promise.resolve(null),
    editing,
    tab === "flows" && deps.edit ? loadFlowKindPrices() : Promise.resolve(null),
    opened,
  ])
  return {
    tab,
    flows: list.flows,
    runCount: list.runCount,
    runs,
    editing: flow === "gone" ? null : flow,
    prices,
    run: run === "gone" ? null : run,
    gone: flow === "gone" || run === "gone",
  }
}

function VideoFlowRoute() {
  return <FlowDashboard loaded={Route.useLoaderData()} search={Route.useSearch()} />
}
