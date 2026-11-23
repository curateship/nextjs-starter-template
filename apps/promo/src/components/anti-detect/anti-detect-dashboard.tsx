import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"

import { AntiDetectOverview } from "@/components/anti-detect/anti-detect-overview"
import { AntiDetectPagePanel, type AntiDetectBlocks } from "@/components/anti-detect/anti-detect-page"
import { BansSection } from "@/components/anti-detect/bans-section"
import { ProfilesSection } from "@/components/anti-detect/profiles-section"
import { ProxiesSection } from "@/components/anti-detect/proxies-section"
import { PhonesSection, phonesInView } from "@/components/anti-detect/phones-section"
import { useRackWindows, type RackBlocks } from "@/components/anti-detect/rack-blocks"
import { useCrmFrame } from "@/components/crm/crm-frame"
import { RightCoverProvider } from "@/components/shared/notes/page-cover"
import { useTabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { middleGutterClassName, ThreePanels } from "@/components/shared/three-panels"
import { useWidgetLayout, type WidgetStore } from "@/components/shared/widgets/use-widget-layout"
import { ManageWidgetsProvider, WidgetSettings } from "@/components/shared/widgets/widget-menus"
import { ErrorRow } from "@/components/ui/error-row"
import { widgetsShown } from "@/lib/admin-dashboard/overview-widgets"
import {
  ANTI_DETECT_LAYOUT_KEY,
  ANTI_DETECT_OVERVIEW_LAYOUT_KEY,
  ANTI_DETECT_PLACE_KEY,
  ANTI_DETECT_WIDGET_OFFER,
} from "@/lib/anti-detect/page"
import { projectReach, type ProjectReach } from "@/lib/anti-detect/project-reach"
import {
  ANTI_DETECT_SECTION_LABELS,
  antiDetectSectionOf,
  antiDetectSectionSearch,
  type AntiDetectSearch,
  type AntiDetectSection,
} from "@/lib/anti-detect/search"
import {
  getAntiDetectErrorMessage,
  loadAntiDetectPage,
  loadAntiDetectWidgets,
  saveAntiDetectPageSections,
  saveAntiDetectWidgetLayout,
  type AntiDetectSections,
} from "@/lib/api/anti-detect"
import type { BansPage } from "@/lib/api/bans"
import type { ProfilesPage } from "@/lib/api/browser/profiles"
import type { ProxyView } from "@/lib/api/browser/proxies"
import type { PhonesPage } from "@/lib/api/phones/phones"
import type { ProjectRow } from "@/lib/api/social/projects"
import type { RedditAccountRow } from "@/lib/api/social/reddit-accounts"
import { useLoad } from "@/lib/hooks/use-load"
import type { StoredPage } from "@/lib/notes/page-body"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** Overview's layout is each person's own, kept with their Anti Detect page. */
const WIDGETS: WidgetStore = {
  load: loadAntiDetectWidgets,
  save: saveAntiDetectWidgetLayout,
  message: getAntiDetectErrorMessage,
}

/** The name the left page's read is kept under between visits, so coming back draws it at once. */
const PAGE_READ = "promo-anti-detect-page"

/** What the route reads for every section at once, so each Dashboards row has its count from the start. */
export type AntiDetectData = {
  profiles: ProfilesPage
  proxies: ProxyView[]
  /** Every phone and every rack, with what the phones list and the rack blocks need. */
  phones: PhonesPage
  bans: BansPage
  projects: ProjectRow[]
  /** The accounts in use, which say what each project's accounts run on. */
  accounts: RedditAccountRow[]
}

/**
 * The Anti Detect dashboard (Tyler, 12 Nov 2026: "now comebine the 4
 * antidect dashboard into one 3 panel dashboard like we did here"), laid
 * out as the Projects dashboard is.
 *
 * - **Left:** the person's page of blocks. Its fixed Dashboards block picks
 *   the section: Overview, Profiles, Proxies, Racks or Bans. Its Projects
 *   block narrows every section to what one project's accounts use. Its ⋮
 *   holds General (cover, Lock blocks) and Widgets.
 * - **Middle:** Overview's widgets straight on the dashboard, taking the
 *   right panel's room too; or a section's list, each in one header and
 *   table shape.
 * - **Right:** the row picked (`?open=`). The first row opens on arrival,
 *   and the dashboard goes back to where it was. A rack's own page is still
 *   gone: Phones lists every phone, and the Racks block on the left page
 *   picks one rack's (Tyler, 12 Nov 2026: "I dont think a rack needs its own
 *   dashboard").
 */
export function AntiDetectDashboard({ data, search }: { data: AntiDetectData; search: AntiDetectSearch }) {
  const navigate = useNavigate({ from: "/admin/anti-detect" })
  const router = useRouter()
  const section = antiDetectSectionOf(search)
  const overview = section === "overview"

  const pageRead = useLoad(loadAntiDetectPage, getAntiDetectErrorMessage, { remember: PAGE_READ })
  const leftPage = pageRead.data?.page ?? null
  const setLeftPage = (next: StoredPage) => pageRead.setData((current) => (current ? { ...current, page: next } : current))

  // Hidden and dragged sections show at once and save behind; a refused save puts them back.
  const sections: AntiDetectSections = pageRead.data?.sections ?? { hidden: [], order: [] }
  const changeSections = (next: AntiDetectSections) => {
    const was = sections
    pageRead.setData((current) => (current ? { ...current, sections: next } : current))
    saveAntiDetectPageSections(next).catch((failure: unknown) => {
      pageRead.setData((current) => (current ? { ...current, sections: was } : current))
      showErrorToast(getAntiDetectErrorMessage(failure))
    })
  }

  const widgets = useWidgetLayout(WIDGETS, null)
  const leftMenu = useTabbedMenuState()
  const { openAt: openLeftMenuAt } = leftMenu
  const manageWidgets = React.useCallback(() => openLeftMenuAt("widgets"), [openLeftMenuAt])

  // A project that has since gone narrows nothing.
  const projectId = data.projects.some((project) => project.id === search.project) ? (search.project ?? "") : ""
  const reachOf = React.useCallback(
    (id: string) => projectReach(id, data.accounts, data.profiles.profiles, data.phones.phones),
    [data.accounts, data.profiles.profiles, data.phones.phones]
  )
  const reach: ProjectReach | null = React.useMemo(() => (projectId ? reachOf(projectId) : null), [projectId, reachOf])

  /** How many of a section's rows one project's accounts use, for its row in the Projects block. */
  const countFor = (shown: AntiDetectSection, id: string): number | null => {
    if (shown === "overview") return null
    if (shown === "bans") return data.bans.bans.filter((ban) => ban.project?.id === id).length
    const one = reachOf(id)
    if (shown === "profiles") return one.profiles.size
    if (shown === "proxies") return data.proxies.filter((proxy) => one.proxies.has(proxy.id)).length
    return one.phones.size
  }

  const goTo = (next: AntiDetectSearch) => void navigate({ search: next })
  const keep = projectId ? { project: projectId } : {}

  const blocks: AntiDetectBlocks = {
    section,
    onPickSection: (next) => goTo(antiDetectSectionSearch(next, keep)),
    hiddenSections: sections.hidden,
    sectionOrder: sections.order,
    onSectionsChange: changeSections,
    counts: {
      overview: widgets.layout ? widgetsShown(widgets.layout) : null,
      profiles: data.profiles.profiles.filter((profile) => !reach || reach.profiles.has(profile.id)).length,
      proxies: data.proxies.filter((proxy) => !reach || reach.proxies.has(proxy.id)).length,
      phones: phonesInView(data.phones, search.rack, reach?.phones ?? null).length,
      bans: data.bans.bans.filter((ban) => !projectId || ban.project?.id === projectId).length,
    },
    projects: [...data.projects]
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name))
      .map((project) => ({ id: project.id, name: project.name, count: countFor(section, project.id) })),
    activeProject: projectId,
    // A new project picked starts the section afresh, with nothing open.
    onProject: (id) => goTo(antiDetectSectionSearch(section, id ? { project: id } : {})),
  }

  const { place, frame, setRightSpot } = useCrmFrame<AntiDetectSection>(section)

  // The rack blocks: a rack picked shows its phones in Phones, whatever section is showing.
  const pickRack = (rack: string) =>
    goTo(rack ? { ...antiDetectSectionSearch("phones", keep), rack } : antiDetectSectionSearch("phones", keep))
  const rackWindows = useRackWindows({ page: data.phones, onPickRack: pickRack, onChanged: () => router.invalidate() })
  const rackBlocks: RackBlocks = {
    page: data.phones,
    rack: search.rack ?? "",
    onPickRack: pickRack,
    phones: phonesInView(data.phones, search.rack, reach?.phones ?? null),
    status: section === "phones" ? search.status : undefined,
    jobsOpen: section === "phones" && search.list === "jobs",
    onPhonesFilter: (patch) =>
      goTo({ ...antiDetectSectionSearch("phones", keep), ...(search.rack ? { rack: search.rack } : {}), ...patch }),
    openPhoneId: section === "phones" ? search.open : undefined,
    onOpenPhone: (phoneId) =>
      goTo({ ...antiDetectSectionSearch("phones", keep), ...(search.rack ? { rack: search.rack } : {}), open: phoneId }),
    onChanged: () => router.invalidate(),
    windows: rackWindows.windows,
  }

  let middle: React.ReactNode
  if (section === "profiles") {
    middle = <ProfilesSection key="profiles" initial={data.profiles} search={search} reach={reach} frame={frame} />
  } else if (section === "proxies") {
    middle = <ProxiesSection key="proxies" initial={data.proxies} search={search} reach={reach} frame={frame} />
  } else if (section === "phones") {
    middle = (
      <PhonesSection
        key="phones"
        initial={data.phones}
        search={search}
        projectPhones={reach?.phones ?? null}
        rackWindows={rackWindows.windows}
        frame={frame}
      />
    )
  } else if (section === "bans") {
    middle = <BansSection key="bans" page={data.bans} search={search} projectId={projectId} frame={frame} />
  } else {
    middle = widgets.layout ? (
      <AntiDetectOverview data={data} reach={reach} projectId={projectId} layout={widgets.layout} onChange={widgets.change} />
    ) : widgets.error ? (
      <ErrorRow message={widgets.error} onRetry={widgets.retry} />
    ) : null
  }

  const recordLabel = place?.rightLabel ?? "Record"

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The left page's cover carries on behind the record on the right. */}
      <RightCoverProvider value={leftPage?.coverUrl ?? null}>
        <ManageWidgetsProvider value={manageWidgets}>
          <ThreePanels
            // Overview is two panels, with a layout of its own.
            layoutKey={overview ? ANTI_DETECT_OVERVIEW_LAYOUT_KEY : ANTI_DETECT_LAYOUT_KEY}
            place={{
              key: ANTI_DETECT_PLACE_KEY,
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
                <AntiDetectPagePanel
                  page={leftPage}
                  error={pageRead.error}
                  onRetry={pageRead.retry}
                  blocks={blocks}
                  rackBlocks={rackBlocks}
                  menuState={leftMenu}
                  onPageChange={setLeftPage}
                  widgets={
                    <WidgetSettings
                      offer={ANTI_DETECT_WIDGET_OFFER}
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
              label: ANTI_DETECT_SECTION_LABELS[section],
              bare: overview,
              content: (
                // The container its tables measure, so their columns drop out as the middle narrows.
                // A list's empty line wraps, so a phone never scrolls sideways to read it. The name
                // column takes the room the others leave and cuts a long name and its chips short,
                // so a proxy's "Banned on" or a ban's "Recorded, not counted" never widens the table.
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
      {rackWindows.node}
    </div>
  )
}
