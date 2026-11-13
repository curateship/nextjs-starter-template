import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import { useCrmFrame } from "@/components/crm/crm-frame"
import { AdminAchievementsDashboard } from "@/components/pomodoro/admin-achievements-dashboard"
import { AdminBlocksDashboard } from "@/components/pomodoro/admin-blocks-dashboard"
import { AdminCatalogDashboard } from "@/components/pomodoro/admin-catalog-dashboard"
import { AdminFollowsDashboard } from "@/components/pomodoro/admin-follows-dashboard"
import { AdminGenerationsDashboard } from "@/components/pomodoro/admin-generations-dashboard"
import { AdminGroupsDashboard } from "@/components/pomodoro/admin-groups-dashboard"
import { AdminInvitesDashboard } from "@/components/pomodoro/admin-invites-dashboard"
import { AdminProfilesDashboard } from "@/components/pomodoro/admin-profiles-dashboard"
import { AdminProjectsDashboard } from "@/components/pomodoro/admin-projects-dashboard"
import { AdminReportsDashboard } from "@/components/pomodoro/admin-reports-dashboard"
import { AdminRoomPresetsDashboard } from "@/components/pomodoro/admin-room-presets-dashboard"
import { AdminRoomRepeatsDashboard } from "@/components/pomodoro/admin-room-repeats-dashboard"
import { AdminRoomsDashboard } from "@/components/pomodoro/admin-rooms-dashboard"
import { AdminSafetyDashboard } from "@/components/pomodoro/admin-safety-dashboard"
import { AdminSessionsDashboard } from "@/components/pomodoro/admin-sessions-dashboard"
import { AdminSimulatedDashboard } from "@/components/pomodoro/admin-simulated-dashboard"
import { AdminTagsDashboard } from "@/components/pomodoro/admin-tags-dashboard"
import { AdminTaskRepeatsDashboard } from "@/components/pomodoro/admin-task-repeats-dashboard"
import { AdminTasksDashboard } from "@/components/pomodoro/admin-tasks-dashboard"
import { AdminUploadsDashboard } from "@/components/pomodoro/admin-uploads-dashboard"
import { DashboardPagePanel, type DashboardPageApi } from "@/components/pomodoro/flowfly/dashboard-page-panel"
import { FLOWFLY_APP_BLOCKS, FlowflyBlocksProvider, FlowflySectionsBlock, type FlowflyBlocks } from "@/components/pomodoro/flowfly/flowfly-blocks"
import { FlowflyTabProvider } from "@/components/pomodoro/flowfly/flowfly-context"
import { FlowflyOverviewGrid } from "@/components/pomodoro/flowfly/flowfly-overview"
import { FlowflySectionTabs } from "@/components/pomodoro/flowfly/flowfly-section-tabs"
import { RightCoverProvider } from "@/components/shared/notes/page-cover"
import { useTabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { middleGutterClassName, PanelReopenButton, ThreePanels } from "@/components/shared/three-panels"
import { useWidgetLayout, type WidgetStore } from "@/components/shared/widgets/use-widget-layout"
import { ManageWidgetsProvider, WidgetSettings } from "@/components/shared/widgets/widget-menus"
import { ErrorRow } from "@/components/ui/error-row"
import { widgetsShown } from "@/lib/admin-dashboard/overview-widgets"
import {
  getFlowflyErrorMessage,
  loadFlowflyPage,
  loadFlowflyWaiting,
  loadFlowflyWidgets,
  lockFlowflyPage,
  saveFlowflyPage,
  saveFlowflyPageSections,
  saveFlowflyWidgetLayout,
  setFlowflyPageCoverPhoto,
  type FlowflyCounts,
  type FlowflySections,
  type WaitingItem,
} from "@/lib/api/pomodoro/flowfly"
import { useLoad } from "@/lib/hooks/use-load"
import type { StoredPage } from "@/lib/notes/page-body"
import type { FlowflyTabData } from "@/lib/pomodoro/flowfly-load"
import {
  FLOWFLY_LAYOUT_KEY,
  FLOWFLY_OVERVIEW_LAYOUT_KEY,
  FLOWFLY_PLACE_KEY,
  FLOWFLY_WIDGET_OFFER,
} from "@/lib/pomodoro/flowfly-page"
import {
  FLOWFLY_SECTION_LABELS,
  FLOWFLY_TABS,
  flowflyLink,
  flowflySearchFor,
  flowflySectionOf,
  flowflyTabOf,
  type FlowflySearch,
} from "@/lib/pomodoro/flowfly-search"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** Overview's layout is each admin's own, kept with their Flowfly page. */
const WIDGETS: WidgetStore = {
  load: loadFlowflyWidgets,
  save: saveFlowflyWidgetLayout,
  message: getFlowflyErrorMessage,
}

const PAGE_API: DashboardPageApi = {
  save: saveFlowflyPage,
  lock: lockFlowflyPage,
  setCover: setFlowflyPageCoverPhoto,
  message: getFlowflyErrorMessage,
}

/** The name the left page's read is kept under between visits, so coming back draws it at once. */
const PAGE_READ = "pomodoro-flowfly-page"

/**
 * The Flowfly admin dashboard (Tyler, 13 Nov 2026: "consolidate and combine
 * all of the app's dashboard into one 3 panel dashboard", then "take all
 * seven"), laid out as Promo's Anti Detect dashboard, which copied the
 * shell's Admin dashboard and CRM.
 *
 * - **Left:** the admin's own page of blocks. Its fixed Dashboards block
 *   picks one of seven sections: Overview, Rooms, Members, Safety, Social,
 *   Tasks, Library. Its Waiting on you block lists what needs deciding. Its
 *   ⋮ holds General (cover, Lock the notes) and Widgets.
 * - **Middle:** Overview's widgets straight on the dashboard, taking the
 *   right panel's room too; or the section's lists, as tabs in one header.
 *   Each list is what used to be a page of its own under /admin/pomodoro-*,
 *   reading the same server and asking again in place.
 * - **Right:** the open row (`?open=`), or the member whose name was
 *   pressed (`?member=`). The first row opens on arrival, a new tab is an
 *   arrival, and the bare address goes back to where it was.
 */
export function FlowflyDashboard({
  search,
  counts,
  loaded,
}: {
  search: FlowflySearch
  counts: FlowflyCounts
  /** The tab whose rows the route read. While the next tab is read, it is still the last one. */
  loaded: FlowflyTabData | null
}) {
  const navigate = useNavigate({ from: "/admin/flowfly" })
  const section = flowflySectionOf(search)
  const overview = section === "overview"
  const tab = flowflyTabOf(search)

  const pageRead = useLoad(loadFlowflyPage, getFlowflyErrorMessage, { remember: PAGE_READ })
  const leftPage = pageRead.data?.page ?? null
  const setLeftPage = (next: StoredPage) => pageRead.setData((current) => (current ? { ...current, page: next } : current))

  // Hidden and dragged sections show at once and save behind; a refused save puts them back.
  const sections: FlowflySections = pageRead.data?.sections ?? { hidden: [], order: [] }
  const changeSections = (next: FlowflySections) => {
    const was = sections
    pageRead.setData((current) => (current ? { ...current, sections: next } : current))
    saveFlowflyPageSections(next).catch((failure: unknown) => {
      pageRead.setData((current) => (current ? { ...current, sections: was } : current))
      showErrorToast(getFlowflyErrorMessage(failure))
    })
  }

  // Waiting on you, read again each time the section or tab changes, so a
  // report decided on one tab is gone from the block on the next.
  const waitingRead = useLoad(loadFlowflyWaiting, getFlowflyErrorMessage, { remember: "pomodoro-flowfly-waiting" })
  const retryWaiting = waitingRead.retry
  const placeKey = `${section}|${tab ?? ""}`
  const firstPlace = React.useRef(placeKey)
  React.useEffect(() => {
    if (firstPlace.current === placeKey) return
    firstPlace.current = placeKey
    retryWaiting()
  }, [placeKey, retryWaiting])

  const widgets = useWidgetLayout(WIDGETS, null)
  const leftMenu = useTabbedMenuState()
  const { openAt: openLeftMenuAt } = leftMenu
  const manageWidgets = React.useCallback(() => openLeftMenuAt("widgets"), [openLeftMenuAt])

  const goTo = (next: FlowflySearch) => void navigate({ search: next })
  const openWaiting = (item: WaitingItem) => {
    if (item.kind === "report") goTo(flowflyLink("reports", { open: item.id }))
    else if (item.kind === "share") goTo(flowflyLink("uploads", { open: item.id }))
    else if (item.roomId) goTo(flowflyLink("rooms", { open: item.roomId }))
  }

  const blocks: FlowflyBlocks = {
    section,
    onPickSection: (next) => goTo(flowflySearchFor(next)),
    hiddenSections: sections.hidden,
    sectionOrder: sections.order,
    onSectionsChange: changeSections,
    counts: {
      overview: widgets.layout ? String(widgetsShown(widgets.layout)) : null,
      rooms: counts.rooms.toLocaleString(),
      members: counts.members.toLocaleString(),
      // What waits for an admin: reports to decide, shared files to approve.
      safety: counts.safety.toLocaleString(),
      social: counts.social.toLocaleString(),
      tasks: counts.tasks.toLocaleString(),
      library: counts.library.toLocaleString(),
    },
    waiting: waitingRead.data ? { total: waitingRead.data.total, items: waitingRead.data.items } : null,
    onOpenWaiting: openWaiting,
  }

  const { place, frame, setRightSpot } = useCrmFrame<string>(placeKey)

  // The list keeps the address it was drawn for until the next tab's rows
  // arrive, so it never asks the server with another list's sort or filters.
  const shownTab = loaded?.tab ?? null
  const [held, setHeld] = React.useState<{ tab: string | null; search: FlowflySearch }>({ tab: shownTab, search })
  if (shownTab && shownTab === tab && (held.tab !== tab || held.search !== search)) setHeld({ tab, search })
  const shownSearch = shownTab && shownTab !== tab && held.tab === shownTab ? held.search : search

  const heading =
    !overview && tab ? (
      <>
        <PanelReopenButton side="left" label="Show the page" />
        <FlowflySectionTabs
          tabs={FLOWFLY_TABS[section]}
          value={shownTab ?? tab}
          counts={{ reports: counts.safety, uploads: counts.library }}
          onPick={(next) => goTo(flowflySearchFor(section, next))}
        />
      </>
    ) : null

  let middle: React.ReactNode
  if (overview) {
    middle = widgets.layout ? (
      <FlowflyOverviewGrid
        layout={widgets.layout}
        onChange={widgets.change}
        onOpenWaiting={openWaiting}
        onOpenRoom={(roomId) => goTo(flowflyLink("rooms", { open: roomId }))}
        onOpenMember={(userId) => goTo(flowflyLink("profiles", { member: userId }))}
      />
    ) : widgets.error ? (
      <ErrorRow message={widgets.error} onRetry={widgets.retry} />
    ) : null
  } else if (loaded) {
    middle = (
      <FlowflyTabProvider key={loaded.tab} value={{ tab: loaded.tab, search: shownSearch, heading, frame }}>
        <TabList loaded={loaded} search={shownSearch} />
      </FlowflyTabProvider>
    )
  }

  const recordLabel = place?.rightLabel ?? "Record"

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The left page's cover carries on behind the record on the right. */}
      <RightCoverProvider value={leftPage?.coverUrl ?? null}>
        <ManageWidgetsProvider value={manageWidgets}>
          <ThreePanels
            // Overview is two panels, with a layout of its own.
            layoutKey={overview ? FLOWFLY_OVERVIEW_LAYOUT_KEY : FLOWFLY_LAYOUT_KEY}
            place={{
              key: FLOWFLY_PLACE_KEY,
              search,
              ids: place?.ids ?? [],
              // Until the list showing has said which rows it shows.
              ready: overview || (place !== null && shownTab === tab),
              section: placeKey,
            }}
            showMiddleFor={`${placeKey}|${place?.showMiddleFor ?? ""}`}
            showRightFor={place?.showRightFor}
            reopenInHeader={!overview}
            left={{
              label: "Page",
              showLabel: "Show the page",
              content: (
                <DashboardPagePanel
                  title="Flowfly"
                  page={leftPage}
                  error={pageRead.error}
                  onRetry={pageRead.retry}
                  api={PAGE_API}
                  appBlocks={FLOWFLY_APP_BLOCKS}
                  blocks={(children) => <FlowflyBlocksProvider value={blocks}>{children}</FlowflyBlocksProvider>}
                  sectionsBlock={<FlowflySectionsBlock />}
                  menuState={leftMenu}
                  onPageChange={setLeftPage}
                  widgets={
                    <WidgetSettings
                      offer={FLOWFLY_WIDGET_OFFER}
                      layout={widgets.layout}
                      error={widgets.error}
                      onRetry={widgets.retry}
                      onChange={widgets.change}
                    />
                  }
                />
              ),
            }}
            middle={{
              label: FLOWFLY_SECTION_LABELS[section],
              bare: overview,
              content: (
                // The container its tables measure, so their columns drop out as the middle narrows.
                <div
                  className={cn(
                    "@container flex h-full min-h-0 flex-col overflow-hidden [&_td[colspan]]:whitespace-normal",
                    "[&_td[data-column=main]]:w-full [&_td[data-column=main]]:max-w-0",
                    !overview && ["bg-card", middleGutterClassName]
                  )}
                >
                  {middle}
                </div>
              ),
            }}
            right={
              overview
                ? undefined
                : {
                    label: recordLabel,
                    showLabel: place?.rightShowLabel ?? `Show the ${recordLabel.toLowerCase()}`,
                    content: <div ref={setRightSpot} className="flex h-full min-h-0 flex-col" />,
                  }
            }
          />
        </ManageWidgetsProvider>
      </RightCoverProvider>
    </div>
  )
}

/** The list for the tab whose rows were read: each was a page of its own before 13 Nov 2026. */
function TabList({ loaded, search }: { loaded: FlowflyTabData; search: FlowflySearch }) {
  switch (loaded.tab) {
    case "rooms":
      return <AdminRoomsDashboard initial={loaded.data.list} initialPageSize={loaded.data.pageSize} />
    case "weekly":
      return <AdminRoomRepeatsDashboard initial={loaded.data.list} initialPageSize={loaded.data.pageSize} />
    case "invites":
      return <AdminInvitesDashboard initial={loaded.data.list} initialPageSize={loaded.data.pageSize} />
    case "presets":
      return <AdminRoomPresetsDashboard initial={loaded.data.presets} catalog={loaded.data.catalog} />
    case "profiles":
      return <AdminProfilesDashboard initial={loaded.data.list} initialPageSize={loaded.data.pageSize} />
    case "badges":
      return <AdminAchievementsDashboard initial={loaded.data.list} initialPageSize={loaded.data.pageSize} />
    case "madeup":
      return <AdminSimulatedDashboard initial={loaded.data} />
    case "reports":
      return <AdminReportsDashboard initial={loaded.data.list} initialPageSize={loaded.data.pageSize} />
    case "bans":
      return <AdminSafetyDashboard key={loaded.data.list.tab} initial={loaded.data.list} initialPageSize={loaded.data.pageSize} />
    case "blocks":
      return <AdminBlocksDashboard key={loaded.data.list.tab} initial={loaded.data.list} initialPageSize={loaded.data.pageSize} />
    case "groups":
      return <AdminGroupsDashboard initial={loaded.data.list} initialPageSize={loaded.data.pageSize} />
    case "follows":
    case "cheers":
      return <AdminFollowsDashboard initial={loaded.data.list} initialPageSize={loaded.data.pageSize} which={loaded.tab} />
    case "tasks":
      return <AdminTasksDashboard initial={loaded.data.list} initialPageSize={loaded.data.pageSize} />
    case "sessions":
      return <AdminSessionsDashboard initial={loaded.data.list} initialPageSize={loaded.data.pageSize} />
    case "repeats":
      return <AdminTaskRepeatsDashboard initial={loaded.data.list} initialPageSize={loaded.data.pageSize} />
    case "projects":
      return <AdminProjectsDashboard initial={loaded.data.list} initialPageSize={loaded.data.pageSize} />
    case "tags":
      return <AdminTagsDashboard initial={loaded.data.list} initialPageSize={loaded.data.pageSize} />
    case "backgrounds":
    case "sounds":
      return (
        <AdminCatalogDashboard
          kind={loaded.tab === "sounds" ? "sound" : "theme"}
          search={search as never}
          initial={loaded.data.list}
          initialPageSize={loaded.data.pageSize}
          initialTags={loaded.data.tags}
        />
      )
    case "uploads":
      return <AdminUploadsDashboard initial={loaded.data.list} initialPageSize={loaded.data.pageSize} />
    case "generations":
      return <AdminGenerationsDashboard initial={loaded.data.list} initialPageSize={loaded.data.pageSize} />
  }
}
