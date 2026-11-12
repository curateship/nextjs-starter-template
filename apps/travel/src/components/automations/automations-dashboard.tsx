import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { HandIcon, WorkflowIcon, type LucideIcon } from "lucide-react"

import { RefreshAutomationCounts } from "@/components/automations/automation-blocks"
import { AutomationPagePanel } from "@/components/automations/automation-page-panel"
import { NewAutomationDropdown } from "@/components/automations/new-automation-dropdown"
import { Button } from "@/components/ui/button"
import { PlusIcon } from "lucide-react"
import { AutomationWaitingTab } from "@/components/automations/automation-waiting-tab"
import { AutomationsTab, type OpenCanvas } from "@/components/automations/automations-tab"
import { useCrmFrame } from "@/components/crm/crm-frame"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { RightCoverProvider } from "@/components/shared/notes/page-cover"
import { middleGutterClassName, MiddleHeading, PanelReopenButton, ThreePanels } from "@/components/shared/three-panels"
import {
  getAutomationPageErrorMessage,
  loadAutomationPage,
  loadAutomationSectionCounts,
  type AutomationSectionCounts,
} from "@/lib/api/automations/automation-page"
import type { AutomationRunsPage } from "@/lib/api/automations/automation-runs"
import type { AutomationsPage } from "@/lib/api/automations/automations"
import {
  AUTOMATION_TAB_LABELS,
  AUTOMATION_TABS,
  automationTabOf,
  automationTabSearch,
  flowSearch,
  type AutomationTab,
  type AutomationsSearch,
} from "@/lib/automations/automations-search"
import { rememberedLoad, useLoad } from "@/lib/hooks/use-load"
import { panelLayoutKey } from "@/lib/layout/panel-layout"
import type { StoredPage } from "@/lib/notes/page-body"
import { cn } from "@/lib/utils"

/** What the route's loader read, for the section showing. */
export type AutomationsLoaded =
  | { tab: "automations"; page: AutomationsPage; canvas: OpenCanvas | null }
  | { tab: "waiting"; runs: AutomationRunsPage }

const SECTION_ICONS: Record<AutomationTab, LucideIcon> = {
  automations: WorkflowIcon,
  waiting: HandIcon,
}

/** The name the left page's read is kept under between visits. */
const AUTOMATION_PAGE_READ = "automation-page"

/**
 * The Automations dashboard, in the Admin 3 panel design (Tyler, 9 Nov 2026:
 * "We have to turn the automation dashboard into the 3 panel design pattern.
 * The dashboard block can have: Automations, Runs and Waiting on you"; Runs
 * went to each flow's own Runs tab the same day).
 *
 * - **Left:** the site's page of blocks. Its fixed Dashboards block picks
 *   the section and counts each one. Its ⋮ holds the cover photo and the
 *   lock.
 * - **Middle:** the section's one header and table, or an open flow's canvas.
 * - **Right:** the open run, or the step picked on a canvas. The Automations
 *   table and a canvas with no step picked have no right panel.
 *
 * The frame stays while the section changes (`crm-frame.tsx`), so the left
 * page and anything typed there carry on across a switch.
 */
export function AutomationsDashboard({
  loaded,
  search,
}: {
  loaded: AutomationsLoaded
  search: AutomationsSearch
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const tab = automationTabOf(search)

  // The left page and the counts, read once and kept between visits.
  const [counts, setCounts] = React.useState<AutomationSectionCounts | null>(
    () => rememberedLoad<Awaited<ReturnType<typeof loadAutomationPage>>>(AUTOMATION_PAGE_READ)?.counts ?? null
  )
  const pageRead = useLoad(loadAutomationPage, getAutomationPageErrorMessage, {
    remember: AUTOMATION_PAGE_READ,
    onLoad: (read) => setCounts(read.counts),
  })
  const page = pageRead.data?.page ?? null
  const setPage = (next: StoredPage) => pageRead.setData((current) => (current ? { ...current, page: next } : current))
  // Each fresh read of the section reads the counts again too, so a pill on
  // the left never disagrees with the list beside it. The first is skipped:
  // the page's own read brought them. An open canvas asks for them itself
  // after a run (`RefreshAutomationCounts`).
  const setPageRead = pageRead.setData
  const countsAsked = React.useRef(0)
  const refreshCounts = React.useCallback(() => {
    const asked = ++countsAsked.current
    loadAutomationSectionCounts()
      .then((next) => {
        // Only the newest answer counts, so a slow one never undoes a later one.
        if (asked !== countsAsked.current) return
        setCounts(next)
        setPageRead((current) => (current ? { ...current, counts: next } : current))
      })
      .catch(() => undefined)
  }, [setPageRead])
  const firstLoad = React.useRef(loaded)
  React.useEffect(() => {
    if (loaded !== firstLoad.current) refreshCounts()
  }, [loaded, refreshCounts])

  const goTo = (next: AutomationsSearch) => void navigate({ to: "/admin/automations", search: next })
  // The sections the Dashboards block leaves out, and their order, kept with
  // the site's look and saved as the rest of Settings is, as Admin's are.
  const { config, onConfigChange } = useShellRuntime()
  const hiddenSections = (config.styling.hiddenAutomationSections ?? []).filter(
    (section): section is AutomationTab => (AUTOMATION_TABS as readonly string[]).includes(section)
  )
  const blocks = {
    tab: loaded.tab,
    onPickTab: (next: AutomationTab) => goTo(automationTabSearch(next)),
    // From an open canvas, its own section's row goes back to the table with
    // the same line picked.
    onRepickTab: (next: AutomationTab) => {
      if (next === "automations" && (search.full || search.template)) {
        goTo({ tab: "automations", open: search.open, q: search.q, sort: search.sort, direction: search.direction })
      }
    },
    counts,
    hiddenSections,
    onHiddenSectionsChange: (hidden: AutomationTab[]) =>
      onConfigChange({ ...config, styling: { ...config.styling, hiddenAutomationSections: hidden } }),
    sectionOrder: config.styling.automationSectionOrder,
    onSectionOrderChange: (order: string[]) =>
      onConfigChange({ ...config, styling: { ...config.styling, automationSectionOrder: order } }),
  }

  const { place, frame, setRightSpot } = useCrmFrame<AutomationTab>(loaded.tab)
  // An open flow draws its own two panels in the middle: the step list, then
  // the canvas.
  const bareMiddle = place?.bare ?? false
  const hasRight = place?.hasRight ?? (loaded.tab !== "automations")
  const recordLabel = place?.rightLabel || "Run"
  const recordShowLabel = place?.rightShowLabel || "Show the run"
  const heading = <MiddleHeading icon={SECTION_ICONS[loaded.tab]} label={AUTOMATION_TAB_LABELS[loaded.tab]} />
  const headingEnd = hasRight ? <PanelReopenButton side="right" label={recordShowLabel} /> : null
  const openFlow = (automationId: string) => goTo(flowSearch(automationId))

  let middle: React.ReactNode
  if (loaded.tab === "automations") {
    middle = (
      <AutomationsTab
        key="automations"
        page={loaded.page}
        canvas={loaded.canvas}
        search={search}
        heading={heading}
        headingEnd={headingEnd}
        frame={frame}
      />
    )
  } else {
    middle = (
      <AutomationWaitingTab
        key="waiting"
        page={loaded.runs}
        search={search}
        heading={heading}
        headingEnd={headingEnd}
        frame={frame}
        onOpenFlow={openFlow}
      />
    )
  }

  return (
    // The left page's cover carries on behind the record on the right.
    <RefreshAutomationCounts.Provider value={refreshCounts}>
    <RightCoverProvider value={page?.coverUrl ?? null}>
      <ThreePanels
        layoutKey={hasRight ? panelLayoutKey.automations : panelLayoutKey.automationsTwo}
        place={{
          key: panelLayoutKey.automationsPlace,
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
            <AutomationPagePanel
              page={page}
              error={pageRead.error}
              onRetry={pageRead.retry}
              blocks={blocks}
              onPageChange={setPage}
              actions={
                <NewAutomationDropdown
                  align="start"
                  templates={loaded.tab === "automations" ? loaded.page.templates : undefined}
                  // The new flow opens on its canvas, where it is built.
                  onCreated={async (automationId) => {
                    await router.invalidate()
                    openFlow(automationId)
                  }}
                  trigger={
                    <Button type="button" variant="ghost" size="icon" aria-label="New automation" className="shrink-0">
                      <PlusIcon className="size-4" />
                    </Button>
                  }
                />
              }
            />
          ),
        }}
        middle={{
          label: AUTOMATION_TAB_LABELS[loaded.tab],
          bare: bareMiddle,
          content: (
            // The container its tables measure, so their columns drop out as
            // the middle narrows.
            <div
              className={cn(
                "@container flex h-full min-h-0 flex-col overflow-hidden",
                !bareMiddle && "bg-card",
                middleGutterClassName
              )}
            >
              {middle}
            </div>
          ),
        }}
        right={
          hasRight
            ? {
                label: recordLabel,
                showLabel: recordShowLabel,
                content: <div ref={setRightSpot} className="flex h-full min-h-0 flex-col" />,
              }
            : undefined
        }
      />
    </RightCoverProvider>
    </RefreshAutomationCounts.Provider>
  )
}
