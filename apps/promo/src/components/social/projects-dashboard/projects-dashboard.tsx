import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import { useCrmFrame } from "@/components/crm/crm-frame"
import { RightCoverProvider } from "@/components/shared/notes/page-cover"
import { useTabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { middleGutterClassName, ThreePanels } from "@/components/shared/three-panels"
import { useWidgetLayout, type WidgetStore } from "@/components/shared/widgets/use-widget-layout"
import { ManageWidgetsProvider, WidgetSettings } from "@/components/shared/widgets/widget-menus"
import { AccountsSection } from "@/components/social/projects-dashboard/accounts-section"
import { ArchiveSection } from "@/components/social/projects-dashboard/archive-section"
import { MessagesSection } from "@/components/social/projects-dashboard/messages-section"
import type { ProjectsBlocks } from "@/components/social/projects-dashboard/projects-blocks"
import { ProjectsOverview } from "@/components/social/projects-dashboard/projects-overview"
import { ProjectsPagePanel } from "@/components/social/projects-dashboard/projects-page-panel"
import { ProjectsSectionList } from "@/components/social/projects-dashboard/projects-section"
import { VoicesSection } from "@/components/social/projects-dashboard/voices-section"
import { ErrorRow } from "@/components/ui/error-row"
import { widgetsShown } from "@/lib/admin-dashboard/overview-widgets"
import type { ArchiveProjectRow } from "@/lib/api/archive/items"
import type { SavedView } from "@/lib/api/saved-views"
import type { InboxRow } from "@/lib/api/social/phone-apps"
import {
  getProjectsDashboardErrorMessage,
  loadProjectsPage,
  loadProjectsWidgets,
  saveProjectsPageSections,
  saveProjectsWidgetLayout,
  type ProjectsSections,
} from "@/lib/api/social/projects-dashboard"
import type { ProjectRow } from "@/lib/api/social/projects"
import type { RedditAccountsPage } from "@/lib/api/social/reddit-accounts"
import type { VoiceView } from "@/lib/api/social/voices"
import { useLoad } from "@/lib/hooks/use-load"
import type { StoredPage } from "@/lib/notes/page-body"
import { PROJECTS_WIDGET_OFFER } from "@/lib/social/projects-dashboard-page"
import {
  PROJECTS_SECTION_LABELS,
  sectionOf,
  sectionSearch,
  type ProjectsSearch,
  type ProjectsSection,
} from "@/lib/social/projects-dashboard-search"
import {
  PROJECTS_DASHBOARD_LAYOUT_KEY,
  PROJECTS_OVERVIEW_LAYOUT_KEY,
  PROJECTS_PLACE_KEY,
} from "@/lib/social/panel-keys"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** Overview's layout is each person's own, kept with their Projects page. */
const WIDGETS: WidgetStore = {
  load: loadProjectsWidgets,
  save: saveProjectsWidgetLayout,
  message: getProjectsDashboardErrorMessage,
}

/** The name the left page's read is kept under between visits, so coming back draws it at once. */
const PAGE_READ = "promo-projects-page"

/** What the route reads for every section at once, so each Dashboards row has its count from the start. */
export type ProjectsDashboardData = {
  projects: ProjectRow[]
  voices: VoiceView[]
  accounts: RedditAccountsPage
  messages: InboxRow[]
  archive: ArchiveProjectRow[]
  /** The picked project's saved Archive views; empty with no project picked. */
  archiveViews: SavedView[]
}

/**
 * The Projects dashboard (Tyler, 12 Nov 2026: "We need to consolidate
 * projects, voices, accounts, archive and messages into one cohesive 3 panel
 * design"). Laid out as the Admin dashboard, the CRM and Travel's Trips
 * dashboard are.
 *
 * - **Left:** the person's page of blocks. Its fixed Dashboards block picks
 *   the section. Its Projects block narrows the sections to one project. Its
 *   ⋮ holds General (cover, Lock blocks) and Widgets.
 * - **Middle:** Overview's widgets straight on the dashboard, taking the
 *   right panel's room too; or a section's list, each in one header and
 *   table shape.
 * - **Right:** the row picked (`?open=`). The first row opens on arrival,
 *   and the dashboard goes back to where it was.
 *
 * The frame stays while the section changes (`useCrmFrame`), so the left
 * page, its ⋮ and anything typed there carry on across a switch. A project's
 * own page, where its posting and commenting happen, is still
 * `/admin/projects/<id>`, opened from the project's Open project.
 */
export function ProjectsDashboard({ data, search }: { data: ProjectsDashboardData; search: ProjectsSearch }) {
  const navigate = useNavigate({ from: "/admin/projects" })
  const section = sectionOf(search)
  const overview = section === "overview"
  const projectId = search.project ?? ""

  const pageRead = useLoad(loadProjectsPage, getProjectsDashboardErrorMessage, { remember: PAGE_READ })
  const leftPage = pageRead.data?.page ?? null
  const setLeftPage = (next: StoredPage) => pageRead.setData((current) => (current ? { ...current, page: next } : current))

  // Hidden and dragged sections show at once and save behind; a refused save puts them back.
  const sections: ProjectsSections = pageRead.data?.sections ?? { hidden: [], order: [] }
  const changeSections = (next: ProjectsSections) => {
    const was = sections
    pageRead.setData((current) => (current ? { ...current, sections: next } : current))
    saveProjectsPageSections(next).catch((error: unknown) => {
      pageRead.setData((current) => (current ? { ...current, sections: was } : current))
      showErrorToast(getProjectsDashboardErrorMessage(error))
    })
  }

  const widgets = useWidgetLayout(WIDGETS, null)
  const leftMenu = useTabbedMenuState()
  const { openAt: openLeftMenuAt } = leftMenu
  const manageWidgets = React.useCallback(() => openLeftMenuAt("widgets"), [openLeftMenuAt])

  // A project that has since gone narrows nothing.
  const narrowedTo = data.projects.some((project) => project.id === projectId) ? projectId : ""
  const inProject = (id: string | null | undefined) => !narrowedTo || id === narrowedTo
  const accountsInUse = data.accounts.accounts.filter((account) => !account.retiredAt)

  /** How many of a section's rows are one project's, for its row in the Projects block. */
  const countFor = (sectionShown: ProjectsSection, id: string): number | null => {
    switch (sectionShown) {
      case "projects":
        return data.projects.find((project) => project.id === id)?.accountCount ?? 0
      case "accounts":
        return accountsInUse.filter((account) => account.project?.id === id).length
      case "archive":
        return data.archive.find((project) => project.id === id)?.items ?? 0
      case "messages":
        return data.messages.filter((row) => row.account.projectId === id).length
      default:
        return null
    }
  }

  const goTo = (next: ProjectsSearch) => void navigate({ search: next })
  const keep = narrowedTo ? { project: narrowedTo } : {}

  const blocks: ProjectsBlocks = {
    section,
    onPickSection: (next: ProjectsSection) => goTo(sectionSearch(next, keep)),
    hiddenSections: sections.hidden,
    sectionOrder: sections.order,
    onSectionsChange: changeSections,
    counts: {
      overview: widgets.layout ? widgetsShown(widgets.layout) : null,
      projects: narrowedTo ? 1 : data.projects.length,
      voices: data.voices.length,
      accounts: accountsInUse.filter((account) => inProject(account.project?.id)).length,
      archive: data.archive.filter((project) => inProject(project.id)).reduce((sum, project) => sum + project.items, 0),
      messages: data.messages.filter((row) => inProject(row.account.projectId)).length,
    },
    projects: [...data.projects]
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name))
      .map((project) => ({ id: project.id, name: project.name, count: countFor(section, project.id) })),
    activeProject: narrowedTo,
    // A new project picked starts the section afresh, with nothing open.
    onProject: (id: string) => goTo(sectionSearch(section, id ? { project: id } : {})),
  }

  const { place, frame, setRightSpot } = useCrmFrame<ProjectsSection>(section)

  let middle: React.ReactNode
  if (section === "projects") {
    middle = <ProjectsSectionList key="projects" projects={data.projects} search={search} projectId={narrowedTo} frame={frame} />
  } else if (section === "voices") {
    middle = <VoicesSection key="voices" voices={data.voices} search={search} frame={frame} />
  } else if (section === "accounts") {
    middle = <AccountsSection key="accounts" initial={data.accounts} projects={data.projects} search={search} projectId={narrowedTo} frame={frame} />
  } else if (section === "archive") {
    middle = <ArchiveSection key="archive" projects={data.archive} views={data.archiveViews} search={search} projectId={narrowedTo} frame={frame} />
  } else if (section === "messages") {
    middle = <MessagesSection key="messages" initial={data.messages} search={search} projectId={narrowedTo} frame={frame} />
  } else {
    middle = widgets.layout ? (
      <ProjectsOverview data={data} projectId={narrowedTo} layout={widgets.layout} onChange={widgets.change} />
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
            layoutKey={overview ? PROJECTS_OVERVIEW_LAYOUT_KEY : PROJECTS_DASHBOARD_LAYOUT_KEY}
            place={{
              key: PROJECTS_PLACE_KEY,
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
                <ProjectsPagePanel
                  page={leftPage}
                  error={pageRead.error}
                  onRetry={pageRead.retry}
                  blocks={blocks}
                  menuState={leftMenu}
                  onPageChange={setLeftPage}
                  widgets={
                    <WidgetSettings
                      offer={PROJECTS_WIDGET_OFFER}
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
              label: PROJECTS_SECTION_LABELS[section],
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
