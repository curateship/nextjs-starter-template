import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import { useCrmFrame } from "@/components/crm/crm-frame"
import { RightCoverProvider } from "@/components/shared/notes/page-cover"
import { useTabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { middleGutterClassName, ThreePanels } from "@/components/shared/three-panels"
import { useWidgetLayout, type WidgetStore } from "@/components/shared/widgets/use-widget-layout"
import { ManageWidgetsProvider, WidgetSettings } from "@/components/shared/widgets/widget-menus"
import { NoSignalLine } from "@/components/travel/no-signal-line"
import { PlacesSection } from "@/components/travel/places-section"
import type { TripsBlocks } from "@/components/travel/trips-blocks"
import { TripsOverview } from "@/components/travel/trips-overview"
import { TripsPagePanel } from "@/components/travel/trips-page-panel"
import { TripsTableSection } from "@/components/travel/trips-table-section"
import { useTravelOffline } from "@/components/travel/use-travel-offline"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import type { TripsPage } from "@/lib/api/travel/trips"
import {
  loadTripsPage,
  loadTripsWidgets,
  saveTripsPageSections,
  saveTripsWidgetLayout,
  type TripsSections,
} from "@/lib/api/travel/trips-dashboard"
import { useLoad } from "@/lib/hooks/use-load"
import { useListSearchNavigate } from "@/lib/nav/list-search"
import type { StoredPage } from "@/lib/notes/page-body"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { TRIPS_DASHBOARD_LAYOUT_KEY, TRIPS_OVERVIEW_LAYOUT_KEY, TRIPS_PLACE_KEY } from "@/lib/travel/panel-keys"
import { tabOf } from "@/lib/travel/trips-lists"
import { sectionOf, sectionSearch, type TripsSearch, type TripsSection } from "@/lib/travel/trips-search"
import { TRIPS_WIDGET_OFFER } from "@/lib/travel/trips-widgets"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** Overview's layout is each person's own, kept with their Trips page, as Trade keeps one per account. */
const WIDGETS: WidgetStore = {
  load: loadTripsWidgets,
  save: saveTripsWidgetLayout,
  message: getTravelErrorMessage,
}

/** The name the left page's read is kept under between visits, so coming back draws it at once. */
const PAGE_READ = "trips-page"

/**
 * The Trips dashboard (Tyler, 12 Nov 2026: "We need to consolidate and
 * reorganize the trips dashboard. It needs to be one cohesive 3 panel
 * design. The left panel can have the dashboard block that list Overview
 * widgets, trips, places"). Laid out as the Admin dashboard and the CRM are.
 *
 * - **Left:** the person's page of blocks. Its fixed Dashboards block picks
 *   the section: Overview, Trips or Places. Its Tags block narrows Trips. Its
 *   ⋮ holds General (cover, Lock blocks) and Widgets.
 * - **Middle:** Overview's widgets straight on the dashboard, taking the
 *   right panel's room too; or the Trips table; or the Places list. Each list
 *   has one header and table shape.
 * - **Right:** the trip or place picked (`?open=`). The first row opens on
 *   arrival, and the dashboard goes back to where it was.
 *
 * The frame stays while the section changes (`useCrmFrame`), so the left
 * page, its ⋮ and anything typed there carry on across a switch.
 */
export function TripsDashboard({ page, search }: { page: TripsPage; search: TripsSearch }) {
  const navigate = useNavigate({ from: "/trips/" })
  const setListSearch = useListSearchNavigate()
  const readOnly = useTravelOffline()
  const section = sectionOf(search)
  const overview = section === "overview"

  const pageRead = useLoad(loadTripsPage, getTravelErrorMessage, { remember: PAGE_READ })
  const leftPage = pageRead.data?.page ?? null
  const setLeftPage = (next: StoredPage) => pageRead.setData((current) => (current ? { ...current, page: next } : current))

  // Hidden and dragged sections show at once and save behind; a refused save puts them back.
  const sections: TripsSections = pageRead.data?.sections ?? { hidden: [], order: [] }
  const changeSections = (next: TripsSections) => {
    const was = sections
    pageRead.setData((current) => (current ? { ...current, sections: next } : current))
    saveTripsPageSections(next).catch((error: unknown) => {
      pageRead.setData((current) => (current ? { ...current, sections: was } : current))
      showErrorToast(getTravelErrorMessage(error))
    })
  }

  const widgets = useWidgetLayout(WIDGETS, null)
  const leftMenu = useTabbedMenuState()
  const { openAt: openLeftMenuAt } = leftMenu
  const manageWidgets = React.useCallback(() => openLeftMenuAt("widgets"), [openLeftMenuAt])

  // Read with the page, then kept in step by Places as it adds and deletes.
  const savedCount = pageRead.data?.savedCount ?? null
  const { setData: setPageRead } = pageRead
  const setSavedCount = React.useCallback(
    (next: number) => setPageRead((current) => (current && current.savedCount !== next ? { ...current, savedCount: next } : current)),
    [setPageRead]
  )

  const goTo = (next: TripsSearch) => void navigate({ search: next })
  const tagCounts = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const trip of page.trips) {
      if (tabOf(trip) === "bin") continue
      for (const tag of trip.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([tag, count]) => ({ tag, count }))
  }, [page.trips])

  const blocks: TripsBlocks = {
    section,
    onPickSection: (next: TripsSection) => goTo(sectionSearch(next)),
    hiddenSections: sections.hidden,
    sectionOrder: sections.order,
    onSectionsChange: changeSections,
    counts: {
      trips: page.trips.filter((trip) => tabOf(trip) === "upcoming").length,
      places: savedCount,
    },
    tags: tagCounts,
    activeTag: section === "trips" ? (search.tag ?? "") : "",
    // On Trips the table narrows in place; anywhere else Trips opens on that tag.
    onTag: (tag: string) =>
      section === "trips" ? setListSearch({ tag: tag || undefined }) : goTo(sectionSearch("trips", { tag: tag || undefined })),
  }

  const { place, frame, setRightSpot } = useCrmFrame<TripsSection>(section)

  let middle: React.ReactNode
  if (section === "trips") {
    middle = <TripsTableSection key="trips" trips={page.trips} search={search} frame={frame} />
  } else if (section === "places") {
    middle = <PlacesSection key="places" trips={page.trips} search={search} frame={frame} onSavedCount={setSavedCount} />
  } else {
    middle = widgets.layout ? (
      <TripsOverview trips={page.trips} layout={widgets.layout} onChange={widgets.change} />
    ) : widgets.error ? (
      <ErrorRow message={widgets.error} onRetry={widgets.retry} />
    ) : (
      <LoadingRow label="Loading the Overview…" />
    )
  }

  const recordLabel = place?.rightLabel ?? (section === "places" ? "Place" : "Trip")

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {readOnly ? <NoSignalLine /> : null}
      {/* The left page's cover carries on behind the record on the right. */}
      <RightCoverProvider value={leftPage?.coverUrl ?? null}>
        <ManageWidgetsProvider value={manageWidgets}>
          <ThreePanels
            // Overview is two panels, with a layout of its own.
            layoutKey={overview ? TRIPS_OVERVIEW_LAYOUT_KEY : TRIPS_DASHBOARD_LAYOUT_KEY}
            place={{
              key: TRIPS_PLACE_KEY,
              search,
              ids: place?.ids ?? [],
              // Until the section showing has said which rows it shows.
              ready: overview || place !== null,
              section,
            }}
            showMiddleFor={`${section}|${place?.showMiddleFor ?? ""}`}
            showRightFor={place?.showRightFor}
            reopenInHeader={!overview}
            left={{
              label: "Page",
              showLabel: "Show the page",
              content: (
                <TripsPagePanel
                  page={leftPage}
                  error={pageRead.error}
                  onRetry={pageRead.retry}
                  blocks={blocks}
                  menuState={leftMenu}
                  onPageChange={setLeftPage}
                  widgets={
                    <WidgetSettings
                      offer={TRIPS_WIDGET_OFFER}
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
              label: section === "places" ? "Places" : section === "trips" ? "Trips" : "Overview",
              bare: overview,
              content: (
                // The container its tables measure, so their columns drop out as the middle narrows.
                <div className={cn("@container flex h-full min-h-0 flex-col overflow-hidden", !overview && ["bg-card", middleGutterClassName])}>
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
