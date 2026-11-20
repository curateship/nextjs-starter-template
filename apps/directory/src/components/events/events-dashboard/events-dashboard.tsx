import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"

import { useCrmFrame } from "@/components/crm/crm-frame"
import { DashboardPagePanel, type DashboardPageApi } from "@/components/directory/listings-dashboard/dashboard-page-panel"
import { EVENTS_APP_BLOCKS, EventsBlocksProvider, EventsSectionsBlock, type EventsBlocks } from "@/components/events/events-dashboard/events-blocks"
import { EventsOverview } from "@/components/events/events-dashboard/events-overview"
import type { EventsLoaded } from "@/components/events/events-dashboard/load-section"
import { NewEventDropdown } from "@/components/events/events-dashboard/new-event-dropdown"
import { FieldsSection } from "@/components/directory/listings-dashboard/sections/fields-section"
import { EventsSection as EventsRow } from "@/components/events/events-dashboard/sections/events-section"
import { FeaturedSection } from "@/components/events/events-dashboard/sections/featured-section"
import { SignUpsSection } from "@/components/events/events-dashboard/sections/signups-section"
import { RightCoverProvider } from "@/components/shared/notes/page-cover"
import { useTabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { middleGutterClassName, ThreePanels } from "@/components/shared/three-panels"
import { useWidgetLayout, type WidgetStore } from "@/components/shared/widgets/use-widget-layout"
import { ManageWidgetsProvider, WidgetSettings } from "@/components/shared/widgets/widget-menus"
import { ErrorRow } from "@/components/ui/error-row"
import { widgetsShown } from "@/lib/admin-dashboard/overview-widgets"
import {
  getEventsDashboardErrorMessage,
  loadEventsCounts,
  loadEventsDashboardPage,
  loadEventsWidgets,
  lockEventsDashboardPage,
  saveEventsDashboardPage,
  saveEventsDashboardSections,
  saveEventsWidgetLayout,
  setEventsDashboardCover,
  type EventsSections,
} from "@/lib/api/events/events-dashboard"
import { EVENTS_WIDGET_OFFER } from "@/lib/events/events-dashboard-page"
import {
  EVENTS_SECTION_LABELS,
  eventsSectionOf,
  eventsSectionSearch,
  type EventsSearch,
  type EventsSection,
} from "@/lib/events/events-dashboard-search"
import {
  EVENTS_DASHBOARD_LAYOUT_KEY,
  EVENTS_OVERVIEW_LAYOUT_KEY,
  EVENTS_PAGE_READ,
  EVENTS_PLACE_KEY,
} from "@/lib/events/events-panel-keys"
import { useLoad } from "@/lib/hooks/use-load"
import type { StoredPage } from "@/lib/notes/page-body"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const PAGE_API: DashboardPageApi = {
  save: saveEventsDashboardPage,
  lock: lockEventsDashboardPage,
  setCover: setEventsDashboardCover,
  message: getEventsDashboardErrorMessage,
}

const WIDGETS: WidgetStore = {
  load: loadEventsWidgets,
  save: saveEventsWidgetLayout,
  message: getEventsDashboardErrorMessage,
}

/**
 * Admin → Events as one three-panel dashboard (task events/37, Part 1),
 * laid out piece for piece as the Listings dashboard is.
 *
 * - **Left:** the site's page of blocks. Its fixed Dashboards block picks the
 *   row (Overview, Events, Sign-ups, Featured events, Custom fields) and
 *   counts each one.
 *   Coming up lists the next five events, and Categories narrows Events to
 *   one. Its ⋮ holds General (cover, Lock the notes) and Widgets. The + adds
 *   an event.
 * - **Middle:** Overview's widgets straight on the dashboard, taking the
 *   right panel's room too; or a row's one header and table.
 * - **Right:** the event open (`?open=`), which saves itself. The first row
 *   opens on arrival, and the dashboard goes back to where it was.
 *
 * Event submissions stays a page of its own (Tyler, 19 Nov 2026, leaving
 * "Suggested events" out of the rows).
 */
export function EventsDashboard({ loaded, search }: { loaded: EventsLoaded; search: EventsSearch }) {
  const navigate = useNavigate({ from: "/admin/events" })
  const router = useRouter()
  const section = eventsSectionOf(search)
  const overview = section === "overview"

  const pageRead = useLoad(loadEventsDashboardPage, getEventsDashboardErrorMessage, { remember: EVENTS_PAGE_READ })
  const leftPage = pageRead.data?.page ?? null
  const setLeftPage = (next: StoredPage) => pageRead.setData((current) => (current ? { ...current, page: next } : current))

  // Every change reads the counts, Coming up and the categories again, so a
  // pill on the left never disagrees with the list beside it.
  const setPageRead = pageRead.setData
  const countsAsked = React.useRef(0)
  const refreshCounts = React.useCallback(() => {
    const asked = ++countsAsked.current
    loadEventsCounts()
      .then((next) => {
        if (asked !== countsAsked.current) return
        setPageRead((current) => (current ? { ...current, ...next } : current))
      })
      .catch(() => undefined)
  }, [setPageRead])
  const onChanged = React.useCallback(async () => {
    await router.invalidate()
  }, [router])
  const firstLoad = React.useRef(loaded)
  React.useEffect(() => {
    if (loaded === firstLoad.current) return
    refreshCounts()
  }, [loaded, refreshCounts])

  const sections: EventsSections = pageRead.data?.sections ?? { hidden: [], order: [] }
  const changeSections = (next: EventsSections) => {
    const was = sections
    pageRead.setData((current) => (current ? { ...current, sections: next } : current))
    saveEventsDashboardSections(next).catch((error: unknown) => {
      pageRead.setData((current) => (current ? { ...current, sections: was } : current))
      showErrorToast(getEventsDashboardErrorMessage(error))
    })
  }

  const widgets = useWidgetLayout(WIDGETS, null)
  const leftMenu = useTabbedMenuState()
  const { openAt: openLeftMenuAt } = leftMenu
  const manageWidgets = React.useCallback(() => openLeftMenuAt("widgets"), [openLeftMenuAt])

  const goTo = (next: EventsSearch) => void navigate({ search: next })
  const counts = pageRead.data?.counts

  const blocks: EventsBlocks = {
    section,
    onPickSection: (next: EventsSection) => goTo(eventsSectionSearch(next)),
    hiddenSections: sections.hidden,
    sectionOrder: sections.order,
    onSectionsChange: changeSections,
    counts: {
      overview: widgets.layout ? widgetsShown(widgets.layout) : null,
      events: counts?.events ?? null,
      signups: counts?.signups ?? null,
      featured: counts?.featured ?? null,
      fields: counts?.fields ?? null,
    },
    coming: pageRead.data?.coming ?? null,
    // A date of a repeat opens on its own; the Events row keeps it open
    // although the row lists the main event.
    onOpenEvent: (id: string) => goTo({ open: id }),
    categories: pageRead.data?.categories ?? [],
    activeCategory: section === "events" ? (search.category ?? "") : "",
    onCategory: (categoryId: string) =>
      goTo(
        section === "events"
          ? { ...search, category: categoryId || undefined, open: undefined, page: undefined }
          : { category: categoryId || undefined }
      ),
  }

  const { place, frame, setRightSpot } = useCrmFrame<EventsSection>(section)
  const props = { search, frame, onChanged }

  let middle: React.ReactNode
  if (loaded.section !== section) {
    // The address moved on and its row is still being read.
    middle = null
  } else if (loaded.section === "events") {
    middle = <EventsRow key="events" {...props} data={loaded} />
  } else if (loaded.section === "signups") {
    middle = <SignUpsSection key="signups" {...props} data={loaded} />
  } else if (loaded.section === "featured") {
    middle = <FeaturedSection key="featured" {...props} data={loaded} />
  } else if (loaded.section === "fields") {
    middle = <FieldsSection key="fields" kind="event" {...props} data={loaded.sections} />
  } else {
    middle = widgets.layout ? (
      <EventsOverview layout={widgets.layout} onChange={widgets.change} />
    ) : widgets.error ? (
      <ErrorRow message={widgets.error} onRetry={widgets.retry} />
    ) : null
  }

  const recordLabel = place?.rightLabel || "Event"

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RightCoverProvider value={leftPage?.coverUrl ?? null}>
        <ManageWidgetsProvider value={manageWidgets}>
          <ThreePanels
            layoutKey={overview ? EVENTS_OVERVIEW_LAYOUT_KEY : EVENTS_DASHBOARD_LAYOUT_KEY}
            place={{
              key: EVENTS_PLACE_KEY,
              search,
              ids: place?.ids ?? [],
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
                <DashboardPagePanel
                  title="Events"
                  page={leftPage}
                  error={pageRead.error}
                  onRetry={pageRead.retry}
                  api={PAGE_API}
                  appBlocks={EVENTS_APP_BLOCKS}
                  blocks={(children) => <EventsBlocksProvider value={blocks}>{children}</EventsBlocksProvider>}
                  sectionsBlock={<EventsSectionsBlock />}
                  menuState={leftMenu}
                  onPageChange={setLeftPage}
                  actions={<NewEventDropdown left />}
                  widgets={
                    <WidgetSettings
                      offer={EVENTS_WIDGET_OFFER}
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
              label: EVENTS_SECTION_LABELS[section],
              bare: overview,
              content: (
                <div
                  className={cn(
                    "@container flex h-full min-h-0 flex-col overflow-hidden [&_td[colspan]]:whitespace-normal",
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
                    showLabel: place?.rightShowLabel || `Show the ${recordLabel.toLowerCase()}`,
                    content: <div ref={setRightSpot} className="flex h-full min-h-0 flex-col" />,
                  }
            }
          />
        </ManageWidgetsProvider>
      </RightCoverProvider>
    </div>
  )
}
