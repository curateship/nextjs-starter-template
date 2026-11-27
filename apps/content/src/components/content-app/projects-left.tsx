import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import { useTabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { useWidgetLayout, type WidgetStore } from "@/components/shared/widgets/use-widget-layout"
import { WidgetSettings } from "@/components/shared/widgets/widget-menus"
import type { ProjectsBlocks } from "@/components/social/projects-dashboard/projects-blocks"
import { ProjectsPagePanel } from "@/components/social/projects-dashboard/projects-page-panel"
import { widgetsShown } from "@/lib/admin-dashboard/overview-widgets"
import {
  getProjectsDashboardErrorMessage,
  loadProjectsPage,
  loadProjectsWidgets,
  saveProjectsPageSections,
  saveProjectsWidgetLayout,
  type ProjectsSections,
} from "@/lib/api/social/projects-dashboard"
import { loadMessages } from "@/lib/api/social/phone-apps"
import { loadProjectRows } from "@/lib/api/social/projects"
import { loadRedditAccounts } from "@/lib/api/social/reddit-accounts"
import { useLoad } from "@/lib/hooks/use-load"
import type { StoredPage } from "@/lib/notes/page-body"
import { PROJECTS_WIDGET_OFFER } from "@/lib/social/projects-dashboard-page"
import { sectionSearch, type ProjectsSection } from "@/lib/social/projects-dashboard-search"
import { showErrorToast } from "@/lib/toast/error-toast"

/** Overview's layout is each person's own, kept with their Projects page. */
export const PROJECTS_WIDGET_STORE: WidgetStore = {
  load: loadProjectsWidgets,
  save: saveProjectsWidgetLayout,
  message: getProjectsDashboardErrorMessage,
}

/** The name the left page's read is kept under between visits, so coming back draws it at once. */
const PAGE_READ = "promo-projects-page"

/**
 * Overview's widget count as last read, so the Dashboards block draws it at
 * once when the left panel is drawn again (moving between a project's tabs),
 * rather than "Overview" with no number until the layout is read (Tyler,
 * 27 Nov 2026: "the overview amount kept flashing").
 */
let lastOverviewCount: number | null = null

/** The name the Dashboards block's counts are kept under, so a project's page draws them at once. */
const COUNTS_READ = "content-projects-left-counts"

/** The Dashboards block's counts that come from the dashboard's lists. */
export type ProjectsLeftCounts = { projects: number; accounts: number; messages: number }

/** The counts read from the server, for a project's page, which reads no lists of its own. */
async function readCounts(): Promise<ProjectsLeftCounts> {
  const [projects, accounts, messages] = await Promise.all([loadProjectRows(), loadRedditAccounts(false), loadMessages()])
  return {
    projects: projects.length,
    accounts: accounts.accounts.filter((account) => !account.retiredAt).length,
    messages: messages.length,
  }
}

/**
 * The Projects dashboard's left panel, the same on the dashboard, on a
 * project's page and on its Research (`workspace/docs/content-app.md`, "A
 * project's own page"; Tyler, 27 Nov 2026: "When clicking on a project. I
 * dont want the left panel to change").
 *
 * It holds the person's left page with its Dashboards and Viral blocks, the
 * ⋮ with General and Widgets, and Overview's widget layout, which the ⋮'s
 * Widgets tab sets. `section` is the Dashboards row picked: a project's page
 * passes Projects, since the project was opened from that list.
 *
 * `onPickSection` is the dashboard's own move between sections. Without it,
 * as on a project's page, a row goes to that section of `/admin/projects`.
 *
 * `counts` are the dashboard's, from the lists its route read. A project's
 * page has none, so the counts are read here, starting from the dashboard's
 * last ones so the rows never flash empty.
 */
export function useProjectsLeft({
  section,
  counts,
  onPickSection,
}: {
  section: ProjectsSection
  counts?: ProjectsLeftCounts
  onPickSection?: (section: ProjectsSection) => void
}) {
  const navigate = useNavigate()
  const pageRead = useLoad(loadProjectsPage, getProjectsDashboardErrorMessage, { remember: PAGE_READ })
  const page = pageRead.data?.page ?? null
  const setPage = (next: StoredPage) => pageRead.setData((current) => (current ? { ...current, page: next } : current))

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

  const given = counts ? `${counts.projects}:${counts.accounts}:${counts.messages}` : ""
  const countsRead = useLoad<ProjectsLeftCounts>(
    () => (counts ? Promise.resolve(counts) : readCounts()),
    getProjectsDashboardErrorMessage,
    { keys: [given], remember: COUNTS_READ }
  )
  const shown = countsRead.data

  const widgets = useWidgetLayout(PROJECTS_WIDGET_STORE, null)
  const menu = useTabbedMenuState()
  const { openAt } = menu
  const manageWidgets = React.useCallback(() => openAt("widgets"), [openAt])

  const overviewCount = widgets.layout ? widgetsShown(widgets.layout) : lastOverviewCount
  React.useEffect(() => {
    if (widgets.layout) lastOverviewCount = widgetsShown(widgets.layout)
  }, [widgets.layout])

  const blocks: ProjectsBlocks = {
    section,
    onPickSection: (next) => {
      if (onPickSection) onPickSection(next)
      else void navigate({ to: "/admin/projects", search: sectionSearch(next) })
    },
    hiddenSections: sections.hidden,
    sectionOrder: sections.order,
    onSectionsChange: changeSections,
    counts: {
      overview: overviewCount,
      projects: shown?.projects ?? null,
      accounts: shown?.accounts ?? null,
      messages: shown?.messages ?? null,
      // Research's lists are read when they show, so their rows carry no count.
      vault: null,
      hooks: null,
      formats: null,
    },
  }

  const left = (
    <ProjectsPagePanel
      page={page}
      error={pageRead.error}
      onRetry={pageRead.retry}
      blocks={blocks}
      menuState={menu}
      onPageChange={setPage}
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
  )

  return {
    left,
    /** The left page's cover, which the right panel carries on behind its record. */
    coverUrl: page?.coverUrl ?? null,
    /** Overview's one layout, which the ⋮'s Widgets tab sets. */
    widgets,
    /** Opens the ⋮ at Widgets, for a widget's own Manage widgets. */
    manageWidgets,
  }
}
