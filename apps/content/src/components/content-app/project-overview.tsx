import * as React from "react"

import { DashboardCardHeader, dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { ThreePanels } from "@/components/shared/three-panels"
import type { useWidgetLayout } from "@/components/shared/widgets/use-widget-layout"
import { ManageWidgetsProvider } from "@/components/shared/widgets/widget-menus"
import type { ProjectsDashboardData } from "@/components/social/projects-dashboard/projects-dashboard"
import { ProjectsOverview } from "@/components/social/projects-dashboard/projects-overview"
import { ErrorRow } from "@/components/ui/error-row"
import { loadArchiveProjects } from "@/lib/api/archive/items"
import { loadMessages } from "@/lib/api/social/phone-apps"
import { getProjectErrorMessage, loadProjectRows } from "@/lib/api/social/projects"
import { loadRedditAccounts } from "@/lib/api/social/reddit-accounts"
import { useLoad } from "@/lib/hooks/use-load"

/**
 * Overview, a project's page's home (`workspace/docs/projects-dashboard.md`,
 * "Overview on a project's page"; Tyler, 27 Nov 2026: "Just make the home the
 * overview"):
 *
 * - **The widgets** are the Projects dashboard's Overview, in the person's
 *   one layout, for this project alone.
 * - **The middle takes the right column's room**, as Overview has no right
 *   panel, with widths of its own so the three-column widths stay as they
 *   were.
 * - **The header** says Overview alone: no arrow back (Tyler, 27 Nov 2026:
 *   "We also dont need the back button") and no ⋮. The rows and spots are
 *   the left panel's ⋮, at Widgets, which a widget's own Manage widgets
 *   opens. A change shows on the Projects dashboard as well.
 */
export function ProjectOverviewColumns({
  projectId,
  left,
  widgets,
  onManageWidgets,
  children,
}: {
  projectId: string
  left: React.ReactNode
  /** The layout the left panel's ⋮ sets (`useProjectLeft`). */
  widgets: ReturnType<typeof useWidgetLayout>
  /** Opens the left panel's ⋮ at Widgets. */
  onManageWidgets: () => void
  children?: React.ReactNode
}) {
  const data = useLoad(
    async (): Promise<ProjectsDashboardData> => {
      const [projects, accounts, messages, archive] = await Promise.all([
        loadProjectRows(),
        loadRedditAccounts(false),
        loadMessages(),
        loadArchiveProjects(),
      ])
      return { projects, accounts, messages, archive, research: null }
    },
    getProjectErrorMessage,
    { remember: "content-project-overview" }
  )

  const middle = (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardCardHeader className="gap-2">
        <h2 className={dashboardCardHeadingClassName}>Overview</h2>
      </DashboardCardHeader>
      <div className="flex min-h-0 flex-1 flex-col">
        {data.error ? (
          <ErrorRow message={data.error} onRetry={data.retry} className="p-4" />
        ) : widgets.error ? (
          <ErrorRow message={widgets.error} onRetry={widgets.retry} className="p-4" />
        ) : data.data && widgets.layout ? (
          <ProjectsOverview data={data.data} projectId={projectId} layout={widgets.layout} onChange={widgets.change} />
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Reading the project's widgets…</p>
        )}
      </div>
    </div>
  )

  return (
    <ManageWidgetsProvider value={onManageWidgets}>
      <ThreePanels
        // Two panels, with widths of their own, so the three-column widths stay as they were.
        layoutKey={CONTENT_PROJECT_OVERVIEW_LAYOUT_KEY}
        place={{ key: `content-project-overview-${projectId}`, search: {}, ids: [], ready: true, section: "overview" }}
        left={{ label: "Project", showLabel: "Show the project", content: left }}
        middle={{ label: "Overview", bare: true, content: middle }}
      >
        {children}
      </ThreePanels>
    </ManageWidgetsProvider>
  )
}

/** Where a project's Overview keeps the widths dragged in this browser. */
const CONTENT_PROJECT_OVERVIEW_LAYOUT_KEY = "content-project-overview-horizontal-1"
