import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"

import { useCrmFrame } from "@/components/crm/crm-frame"
import { ClaimSettingsTab } from "@/components/directory/listings-dashboard/claim-settings-tab"
import { DashboardPagePanel, type DashboardPageApi } from "@/components/directory/listings-dashboard/dashboard-page-panel"
import {
  LISTINGS_APP_BLOCKS,
  ListingsBlocksProvider,
  ListingsSectionsBlock,
  type ListingsBlocks,
} from "@/components/directory/listings-dashboard/listings-blocks"
import { ListingsOverview } from "@/components/directory/listings-dashboard/listings-overview"
import type { ListingsLoaded } from "@/components/directory/listings-dashboard/load-section"
import { NewListingDropdown } from "@/components/directory/listings-dashboard/new-listing-dropdown"
import { useRememberedFilters } from "@/components/directory/listings-dashboard/section-parts"
import { CategoriesSection } from "@/components/directory/listings-dashboard/sections/categories-section"
import { ChangesSection } from "@/components/directory/listings-dashboard/sections/changes-section"
import { ClaimsSection } from "@/components/directory/listings-dashboard/sections/claims-section"
import { FieldsSection } from "@/components/directory/listings-dashboard/sections/fields-section"
import { GuidesSection } from "@/components/directory/listings-dashboard/sections/guides-section"
import { ListingsSection as ListingsRow } from "@/components/directory/listings-dashboard/sections/listings-section"
import { OutreachSection } from "@/components/directory/listings-dashboard/sections/outreach-section"
import { PlacementsSection } from "@/components/directory/listings-dashboard/sections/placements-section"
import { PlansSection } from "@/components/directory/listings-dashboard/sections/plans-section"
import { ReportsSection } from "@/components/directory/listings-dashboard/sections/reports-section"
import { SavedSection } from "@/components/directory/listings-dashboard/sections/saved-section"
import { SubmissionsSection } from "@/components/directory/listings-dashboard/sections/submissions-section"
import { RightCoverProvider } from "@/components/shared/notes/page-cover"
import { useTabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { middleGutterClassName, ThreePanels } from "@/components/shared/three-panels"
import { useWidgetLayout, type WidgetStore } from "@/components/shared/widgets/use-widget-layout"
import { ManageWidgetsProvider, WidgetSettings } from "@/components/shared/widgets/widget-menus"
import { ErrorRow } from "@/components/ui/error-row"
import { widgetsShown } from "@/lib/admin-dashboard/overview-widgets"
import { loadCategories } from "@/lib/api/directory/categories"
import {
  getListingsDashboardErrorMessage,
  loadListingsCounts,
  loadListingsDashboardPage,
  loadListingsWidgets,
  lockListingsDashboardPage,
  saveListingsDashboardPage,
  saveListingsDashboardSections,
  saveListingsWidgetLayout,
  setListingsDashboardCover,
  type ListingsSections,
  type NeedsYouRow,
} from "@/lib/api/directory/listings-dashboard"
import { LISTINGS_WIDGET_OFFER } from "@/lib/directory/listings-dashboard-page"
import {
  LISTINGS_SECTION_LABELS,
  sectionOf,
  sectionSearch,
  type ListingsSearch,
  type ListingsSection,
} from "@/lib/directory/listings-dashboard-search"
import {
  LISTINGS_DASHBOARD_LAYOUT_KEY,
  LISTINGS_OVERVIEW_LAYOUT_KEY,
  LISTINGS_PAGE_READ,
  LISTINGS_PLACE_KEY,
} from "@/lib/directory/listings-panel-keys"
import { useLoad } from "@/lib/hooks/use-load"
import type { StoredPage } from "@/lib/notes/page-body"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const PAGE_API: DashboardPageApi = {
  save: saveListingsDashboardPage,
  lock: lockListingsDashboardPage,
  setCover: setListingsDashboardCover,
  message: getListingsDashboardErrorMessage,
}

/** Overview's layout is the site's own, kept with its Listings page. */
const WIDGETS: WidgetStore = {
  load: loadListingsWidgets,
  save: saveListingsWidgetLayout,
  message: getListingsDashboardErrorMessage,
}

/**
 * The Listings dashboard (Tyler, 18 Nov 2026: "Cosolidate listings into one
 * 3 panel dashboard. Match design pattern of the shell 1 to 1"). Every
 * Listings page that stood on its own (Listings, Categories, Custom fields,
 * Guides, Submissions, Claims and owner changes, Reports, Featured, Saves and
 * Outreach) is a row of one dashboard, laid out as the shell's Admin, CRM and
 * Automations dashboards are.
 *
 * - **Left:** the site's page of blocks. Its fixed Dashboards block picks
 *   the row and counts each one. Needs you lists the oldest waiting records,
 *   and Categories narrows Listings to one category. Its ⋮ holds General
 *   (cover, Lock the notes), Widgets (Overview's spots) and Claims (what the
 *   site says about claiming). The + adds a listing.
 * - **Middle:** Overview's widgets straight on the dashboard, taking the
 *   right panel's room too; or a row's one header and table.
 * - **Right:** the record open (`?open=`), in the shell's record frame. The
 *   first row opens on arrival, and the dashboard goes back to where it was.
 *
 * The frame stays while the row changes (`useCrmFrame`), so the left page,
 * its ⋮ and anything typed there carry on across a switch.
 */
export function ListingsDashboard({ loaded, search }: { loaded: ListingsLoaded; search: ListingsSearch }) {
  const navigate = useNavigate({ from: "/admin/listings" })
  const router = useRouter()
  const section = sectionOf(search)
  const overview = section === "overview"

  const pageRead = useLoad(loadListingsDashboardPage, getListingsDashboardErrorMessage, { remember: LISTINGS_PAGE_READ })
  const leftPage = pageRead.data?.page ?? null
  const setLeftPage = (next: StoredPage) => pageRead.setData((current) => (current ? { ...current, page: next } : current))

  // Every change reads the counts and Needs you again, so a pill on the left
  // never disagrees with the list beside it. Only the newest answer counts.
  const setPageRead = pageRead.setData
  const countsAsked = React.useRef(0)
  const refreshCounts = React.useCallback(() => {
    const asked = ++countsAsked.current
    loadListingsCounts()
      .then((next) => {
        if (asked !== countsAsked.current) return
        setPageRead((current) => (current ? { ...current, ...next } : current))
      })
      .catch(() => undefined)
  }, [setPageRead])
  const categoryRead = useLoad(loadCategories, getListingsDashboardErrorMessage, { remember: "directory-listings-categories" })
  const refreshCategories = categoryRead.retry
  // The counts come with the section read again, in the effect below.
  const onChanged = React.useCallback(async () => {
    await router.invalidate()
  }, [router])
  // A section read again (a filter, a page, a change) brings the counts with it.
  const firstLoad = React.useRef(loaded)
  React.useEffect(() => {
    if (loaded === firstLoad.current) return
    refreshCounts()
    if (loaded.section === "categories" || loaded.section === "listings") refreshCategories()
  }, [loaded, refreshCounts, refreshCategories])

  // Hidden and dragged rows show at once and save behind; a refused save puts them back.
  const sections: ListingsSections = pageRead.data?.sections ?? { hidden: [], order: [] }
  const changeSections = (next: ListingsSections) => {
    const was = sections
    pageRead.setData((current) => (current ? { ...current, sections: next } : current))
    saveListingsDashboardSections(next).catch((error: unknown) => {
      pageRead.setData((current) => (current ? { ...current, sections: was } : current))
      showErrorToast(getListingsDashboardErrorMessage(error))
    })
  }

  const widgets = useWidgetLayout(WIDGETS, null)
  const leftMenu = useTabbedMenuState()
  const { openAt: openLeftMenuAt } = leftMenu
  const manageWidgets = React.useCallback(() => openLeftMenuAt("widgets"), [openLeftMenuAt])

  // Each row keeps its own filters (Tyler's polish pick, 18 Nov 2026), and
  // the Dashboards block opens a row with them.
  const filters = useRememberedFilters()
  const { remember } = filters
  React.useEffect(() => {
    if (section !== "overview") remember(section, search)
  }, [remember, search, section])

  const goTo = (next: ListingsSearch) => void navigate({ search: next })
  const counts = pageRead.data?.counts
  // Every category, empty ones last at 0, so "Show all" really is all of them.
  const categoriesShown = [...(categoryRead.data ?? [])].sort((a, b) => b.listingCount - a.listingCount || a.name.localeCompare(b.name))

  const blocks: ListingsBlocks = {
    section,
    onPickSection: (next: ListingsSection) => goTo(sectionSearch(next, next === "overview" ? {} : filters.recall(next))),
    hiddenSections: sections.hidden,
    sectionOrder: sections.order,
    onSectionsChange: changeSections,
    counts: {
      overview: widgets.layout ? widgetsShown(widgets.layout) : null,
      listings: counts?.listings ?? null,
      categories: counts?.categories ?? null,
      fields: counts?.fields ?? null,
      guides: counts?.guides ?? null,
      submissions: counts?.submissions ?? null,
      claims: counts?.claims ?? null,
      changes: counts?.changes ?? null,
      reports: counts?.reports ?? null,
      plans: counts?.plans ?? null,
      placements: counts?.placements ?? null,
      saved: counts?.saved ?? null,
      outreach: counts?.outreach ?? null,
    },
    needs: pageRead.data?.needs ?? null,
    onOpenNeed: (row: NeedsYouRow) => goTo(sectionSearch(row.section, { open: row.id })),
    categories: categoriesShown.map((category) => ({ id: category.id, name: category.name, count: category.listingCount })),
    activeCategory: section === "listings" ? (search.category ?? "") : "",
    // On Listings it narrows in place and keeps the other filters; elsewhere
    // it opens Listings narrowed (the Admin 3 panel design, "Left blocks that
    // point at a section").
    onCategory: (categoryId: string) =>
      goTo(
        section === "listings"
          ? { ...search, category: categoryId || undefined, open: undefined, page: undefined }
          : sectionSearch("listings", { ...filters.recall("listings"), category: categoryId || undefined })
      ),
  }

  const { place, frame, setRightSpot } = useCrmFrame<ListingsSection>(section)
  const props = { search, frame, onChanged }

  let middle: React.ReactNode
  if (loaded.section !== section) {
    // The address moved on and its row is still being read.
    middle = null
  } else if (loaded.section === "listings") {
    middle = <ListingsRow key="listings" {...props} data={loaded} />
  } else if (loaded.section === "categories") {
    middle = <CategoriesSection key="categories" {...props} data={loaded.categories} />
  } else if (loaded.section === "fields") {
    middle = <FieldsSection key="fields" {...props} data={loaded.sections} />
  } else if (loaded.section === "guides") {
    middle = <GuidesSection key="guides" {...props} data={loaded.page} />
  } else if (loaded.section === "submissions") {
    middle = <SubmissionsSection key="submissions" {...props} data={loaded.page} />
  } else if (loaded.section === "claims") {
    middle = <ClaimsSection key="claims" {...props} data={loaded.screen} />
  } else if (loaded.section === "changes") {
    middle = <ChangesSection key="changes" {...props} data={loaded.screen} />
  } else if (loaded.section === "reports") {
    middle = <ReportsSection key="reports" {...props} data={loaded.page} />
  } else if (loaded.section === "plans") {
    middle = <PlansSection key="plans" {...props} data={loaded} />
  } else if (loaded.section === "placements") {
    middle = <PlacementsSection key="placements" {...props} data={loaded.featured} />
  } else if (loaded.section === "saved") {
    middle = <SavedSection key="saved" {...props} data={loaded.saves} />
  } else if (loaded.section === "outreach") {
    middle = <OutreachSection key="outreach" {...props} data={loaded.outreach} />
  } else {
    middle = widgets.layout ? (
      <ListingsOverview layout={widgets.layout} onChange={widgets.change} />
    ) : widgets.error ? (
      <ErrorRow message={widgets.error} onRetry={widgets.retry} />
    ) : null
  }

  const recordLabel = place?.rightLabel || "Record"

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The left page's cover carries on behind the record on the right. */}
      <RightCoverProvider value={leftPage?.coverUrl ?? null}>
        <ManageWidgetsProvider value={manageWidgets}>
          <ThreePanels
            // Overview is two panels, with a layout of its own.
            layoutKey={overview ? LISTINGS_OVERVIEW_LAYOUT_KEY : LISTINGS_DASHBOARD_LAYOUT_KEY}
            place={{
              key: LISTINGS_PLACE_KEY,
              search,
              ids: place?.ids ?? [],
              // Until the row showing has said which records it shows.
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
                  title="Listings"
                  page={leftPage}
                  error={pageRead.error}
                  onRetry={pageRead.retry}
                  api={PAGE_API}
                  appBlocks={LISTINGS_APP_BLOCKS}
                  blocks={(children) => <ListingsBlocksProvider value={blocks}>{children}</ListingsBlocksProvider>}
                  sectionsBlock={<ListingsSectionsBlock />}
                  menuState={leftMenu}
                  onPageChange={setLeftPage}
                  actions={<NewListingDropdown left />}
                  widgets={
                    <WidgetSettings
                      offer={LISTINGS_WIDGET_OFFER}
                      layout={widgets.layout}
                      error={widgets.error}
                      onRetry={widgets.retry}
                      onChange={widgets.change}
                    />
                  }
                  extraTabs={[{ value: "claims", label: "Claims", content: <ClaimSettingsTab /> }]}
                />
              ),
            }}
            middle={{
              label: LISTINGS_SECTION_LABELS[section],
              bare: overview,
              content: (
                // The container its tables measure, so their columns drop out as the middle narrows.
                // A list's empty line wraps, so a phone never scrolls sideways to read it.
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
