import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { HistoryIcon, PlusIcon, WorkflowIcon, type LucideIcon } from "lucide-react"

import { useCrmFrame } from "@/components/crm/crm-frame"
import { RightCoverProvider } from "@/components/shared/notes/page-cover"
import { middleGutterClassName, MiddleHeading, PanelReopenButton, ThreePanels } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { getFlowPageErrorMessage, loadFlowPage, setFlowPageSections, type FlowPage } from "@/lib/api/video/flow-page"
import type { FlowDetail, FlowListItem, FlowRunDetail, FlowRunListItem } from "@/lib/api/video/flow"
import { useLoad } from "@/lib/hooks/use-load"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { FLOW_LAYOUT_KEYS, FLOW_TAB_LABELS, flowTabOf, type FlowSearch, type FlowTab } from "@/lib/video/flow/flow-search"
import type { FlowKind } from "@/lib/video/flow/node-kinds"

import { FlowBuilder } from "./flow-builder"
import { NewFlowDropdown } from "./flow-dropdowns"
import { FlowPagePanel } from "./flow-page-panel"
import { FlowsTab } from "./flows-tab"
import { RunStepsPage } from "./run-steps"
import { RunsTab } from "./runs-tab"

/** What the route's loader read, for the section and the middle showing. */
export type FlowLoaded = {
  tab: FlowTab
  flows: FlowListItem[]
  runCount: number
  runs: FlowRunListItem[] | null
  /** The flow open in the builder. */
  editing: FlowDetail | null
  prices: Record<FlowKind, number> | null
  /** The run open on its steps page. */
  run: FlowRunDetail | null
  /** The address named a flow or run that no longer exists. */
  gone: boolean
}

const SECTION_ICONS: Record<FlowTab, LucideIcon> = { flows: WorkflowIcon, runs: HistoryIcon }

/** The name the left page's read is kept under between visits. */
const FLOW_PAGE_READ = "video-flow-page"

/**
 * The Flow dashboard (workspace/docs/flow.md), its panels as Admin → Pages
 * has them (Tyler, 14 Nov 2026: "Look at how admin > pages handles its
 * panels").
 *
 * - **Left:** the person's page of "/" blocks under its cover, with the fixed
 *   Dashboards block picking Flows or Runs and counting each. Its ⋮ holds
 *   the cover photo and the lock.
 * - **Middle:** the section's table. Edit flow flips it to the builder (the
 *   node kinds, then the canvas) and a run to its steps page, in place.
 * - **Right:** the picked flow or run from a table's cog, the picked node or
 *   the flow's own settings in the builder, or the picked step of a run.
 *
 * The frame stays while the section changes (`crm-frame.tsx`).
 */
export function FlowDashboard({ loaded, search }: { loaded: FlowLoaded; search: FlowSearch }) {
  const navigate = useNavigate()
  const router = useRouter()
  const tab = flowTabOf(search)
  const goTo = (next: FlowSearch) => void navigate({ to: "/admin/video-flow", search: next })

  // A flow or run the address named is gone: take it off the address, so the
  // table shows and the dashboard stops going back to it.
  const gone = loaded.gone
  const keptTab = search.tab
  const keptQuery = search.q
  React.useEffect(() => {
    if (!gone) return
    void navigate({
      to: "/admin/video-flow",
      search: { ...(keptTab ? { tab: keptTab } : {}), ...(keptQuery ? { q: keptQuery } : {}) },
      replace: true,
    })
  }, [gone, navigate, keptTab, keptQuery])

  // The left page, read once and kept between visits.
  const pageRead = useLoad(loadFlowPage, getFlowPageErrorMessage, { remember: FLOW_PAGE_READ })
  const page = pageRead.data ?? null
  const setPage = (next: FlowPage) => pageRead.setData(next)
  const changeSections = (change: { hiddenSections?: FlowTab[]; sectionOrder?: FlowTab[] }) => {
    if (page) setPage({ ...page, ...change })
    void setFlowPageSections(change).catch((error: unknown) => {
      showErrorToast(getFlowPageErrorMessage(error))
      pageRead.retry()
    })
  }
  const blocks = {
    tab: loaded.tab,
    onPickTab: (next: FlowTab) => goTo(next === "runs" ? { tab: "runs" } : {}),
    // From the builder or a run's steps page, the row showing goes back to
    // its table with the same row picked.
    onRepickTab: (next: FlowTab) => {
      if (next === "flows" && search.edit) goTo({ open: search.edit })
      if (next === "runs" && search.run) goTo({ tab: "runs" })
    },
    counts: { flows: loaded.flows.length, runs: loaded.runCount },
    hiddenSections: page?.hiddenSections ?? [],
    onHiddenSectionsChange: (hidden: FlowTab[]) => changeSections({ hiddenSections: hidden }),
    sectionOrder: page?.sectionOrder ?? [],
    onSectionOrderChange: (order: FlowTab[]) => changeSections({ sectionOrder: order }),
  }

  const { place, frame, setRightSpot } = useCrmFrame<FlowTab>(loaded.tab)
  const bareMiddle = place?.bare ?? false
  // Both tables and both pages have a right panel; until the middle says
  // what it holds, keep its place.
  const hasRight = place?.hasRight ?? true
  const rightLabel = place?.rightLabel || "Flow"
  const rightShowLabel = place?.rightShowLabel || "Show the flow"
  const heading = <MiddleHeading icon={SECTION_ICONS[loaded.tab]} label={FLOW_TAB_LABELS[loaded.tab]} />
  const headingEnd = hasRight ? <PanelReopenButton side="right" label={rightShowLabel} /> : null

  let middle: React.ReactNode
  if (loaded.tab === "flows" && loaded.editing) {
    middle = (
      <FlowBuilder
        key={`builder:${loaded.editing.id}`}
        flow={loaded.editing}
        prices={loaded.prices}
        search={search}
        headingEnd={headingEnd}
        frame={frame}
      />
    )
  } else if (loaded.tab === "flows") {
    middle = <FlowsTab key="flows" flows={loaded.flows} search={search} heading={heading} headingEnd={headingEnd} frame={frame} />
  } else if (loaded.run) {
    middle = <RunStepsPage key={`run:${loaded.run.id}`} initial={loaded.run} search={search} headingEnd={headingEnd} frame={frame} />
  } else {
    middle = <RunsTab key="runs" runs={loaded.runs ?? []} search={search} heading={heading} headingEnd={headingEnd} frame={frame} />
  }

  return (
    // The left page's cover carries on behind the record on the right.
    <RightCoverProvider value={page?.coverUrl ?? null}>
    <ThreePanels
      layoutKey={hasRight ? FLOW_LAYOUT_KEYS.three : FLOW_LAYOUT_KEYS.two}
      place={{
        key: FLOW_LAYOUT_KEYS.place,
        search,
        ids: place?.ids ?? [],
        ready: place !== null,
        section: tab,
      }}
      showMiddleFor={`${loaded.tab}|${place?.showMiddleFor ?? ""}`}
      showRightFor={place?.showRightFor}
      reopenInHeader
      left={{
        label: "Page",
        showLabel: "Show the page",
        content: (
          <FlowPagePanel
            page={page}
            error={pageRead.error}
            onRetry={pageRead.retry}
            blocks={blocks}
            onPageChange={setPage}
            actions={
              <NewFlowDropdown
                align="start"
                onCreated={async (flowId) => {
                  await router.invalidate()
                  goTo({ edit: flowId })
                }}
                trigger={
                  <Button type="button" variant="ghost" size="icon" aria-label="New flow" className="shrink-0">
                    <PlusIcon className="size-4" />
                  </Button>
                }
              />
            }
          />
        ),
      }}
      middle={{
        label: FLOW_TAB_LABELS[loaded.tab],
        bare: bareMiddle,
        content: (
          // The container its tables measure, so their columns drop out as
          // the middle narrows.
          <div className={cn("@container flex h-full min-h-0 flex-col overflow-hidden", !bareMiddle && "bg-card", middleGutterClassName)}>
            {middle}
          </div>
        ),
      }}
      right={
        hasRight
          ? {
              label: rightLabel,
              showLabel: rightShowLabel,
              content: <div ref={setRightSpot} className="flex h-full min-h-0 flex-col" />,
            }
          : undefined
      }
    />
    </RightCoverProvider>
  )
}
