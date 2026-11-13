import type * as React from "react"

import { DashboardPagePanel, type DashboardPageApi } from "@/components/dashboard-page/dashboard-page-panel"
import {
  PROJECTS_APP_BLOCKS,
  ProjectsBlocksProvider,
  ProjectsSectionsBlock,
  type ProjectsBlocks,
} from "@/components/social/projects-dashboard/projects-blocks"
import type { TabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import {
  getProjectsDashboardErrorMessage,
  lockProjectsPage,
  saveProjectsPage,
  setProjectsPageCoverPhoto,
} from "@/lib/api/social/projects-dashboard"
import type { StoredPage } from "@/lib/notes/page-body"

const API: DashboardPageApi = {
  save: saveProjectsPage,
  lock: lockProjectsPage,
  setCover: setProjectsPageCoverPhoto,
  message: getProjectsDashboardErrorMessage,
}

/**
 * The Projects dashboard's left panel (Tyler, 12 Nov 2026): the shared
 * `DashboardPagePanel` titled Projects, with the Dashboards block and the
 * Projects block. A new page starts with both.
 */
export function ProjectsPagePanel({
  blocks,
  ...rest
}: {
  page: StoredPage | null
  error: string | null
  onRetry: () => void
  blocks: ProjectsBlocks
  widgets: React.ReactNode
  menuState: TabbedMenuState
  onPageChange: (page: StoredPage) => void
}) {
  return (
    <DashboardPagePanel
      {...rest}
      title="Projects"
      api={API}
      appBlocks={PROJECTS_APP_BLOCKS}
      blocks={(children) => <ProjectsBlocksProvider value={blocks}>{children}</ProjectsBlocksProvider>}
      sectionsBlock={<ProjectsSectionsBlock />}
    />
  )
}
