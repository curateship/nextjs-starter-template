import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"

import { useTabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { useWidgetLayout, type WidgetStore } from "@/components/shared/widgets/use-widget-layout"
import { WidgetSettings } from "@/components/shared/widgets/widget-menus"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { VIRAL_APP_BLOCKS, ViralBlocksProvider, ViralSectionsBlock, type ViralBlocks } from "@/components/viral/dashboard/dashboard-blocks"
import { DashboardPagePanel, type DashboardPageApi } from "@/components/viral/dashboard/dashboard-page-panel"
import { FolderWindows, type FolderApi } from "@/components/viral/project-folders"
import { ViralProjectDialog } from "@/components/viral/viral-project-dialog"
import { widgetsShown } from "@/lib/admin-dashboard/overview-widgets"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import {
  loadViralDashboardPage,
  loadViralPageFigures,
  loadViralWidgets,
  lockViralDashboardPage,
  saveViralDashboardPage,
  saveViralDashboardSections,
  saveViralWidgetLayout,
  setViralDashboardCover,
  type ViralSections,
} from "@/lib/api/viral/viral-dashboard"
import { viralFolderApi, type ViralFolderSummary } from "@/lib/api/viral/viral-projects"
import { useLoad } from "@/lib/hooks/use-load"
import type { StoredPage } from "@/lib/notes/page-body"
import { showErrorToast } from "@/lib/toast/error-toast"
import { VIRAL_PAGE_READ } from "@/lib/viral/dashboard-keys"
import { VIRAL_WIDGET_OFFER } from "@/lib/viral/dashboard-page"
import { viralSectionSearch, type ViralDashboardSearch, type ViralSection } from "@/lib/viral/dashboard-search"
import { ARCHIVED_PROJECTS, NO_FOLDER } from "@/lib/viral/project-folders"

const PAGE_API: DashboardPageApi = {
  save: saveViralDashboardPage,
  lock: lockViralDashboardPage,
  setCover: setViralDashboardCover,
  message: getViralErrorMessage,
}

const WIDGETS: WidgetStore = {
  load: loadViralWidgets,
  save: saveViralWidgetLayout,
  message: getViralErrorMessage,
}

const FOLDER_API: FolderApi = { ...viralFolderApi, errorMessage: getViralErrorMessage }

/**
 * The Viral dashboard's left panel: the person's page of blocks, its ⋮
 * (General, Widgets), the + that opens New project, and the folder windows.
 * The page's read is kept between visits (`VIRAL_PAGE_READ`), so coming back
 * from a project draws it at once.
 *
 * - `section` is the row the Dashboards block shows picked.
 * - `narrowed`: the project and folder the dashboard's rows are narrowed to.
 */
export function useViralLeft({
  section,
  narrowed,
}: {
  section: ViralSection
  narrowed: Pick<ViralDashboardSearch, "project" | "folder">
}) {
  const navigate = useNavigate()
  const router = useRouter()

  const pageRead = useLoad(loadViralDashboardPage, getViralErrorMessage, { remember: VIRAL_PAGE_READ })
  const leftPage = pageRead.data?.page ?? null
  const setLeftPage = (next: StoredPage) => pageRead.setData((current) => (current ? { ...current, page: next } : current))

  // Every change reads the counts, the projects and the folders again, so a
  // pill on the left never disagrees with the list beside it.
  const setPageRead = pageRead.setData
  const figuresAsked = React.useRef(0)
  const refreshFigures = React.useCallback(() => {
    const asked = ++figuresAsked.current
    loadViralPageFigures()
      .then((next) => {
        if (asked !== figuresAsked.current) return
        setPageRead((current) => (current ? { ...current, ...next } : current))
      })
      .catch(() => undefined)
  }, [setPageRead])

  const sections: ViralSections = pageRead.data?.sections ?? { hidden: [], order: [] }
  const changeSections = (next: ViralSections) => {
    const was = sections
    pageRead.setData((current) => (current ? { ...current, sections: next } : current))
    saveViralDashboardSections(next).catch((error: unknown) => {
      pageRead.setData((current) => (current ? { ...current, sections: was } : current))
      showErrorToast(getViralErrorMessage(error))
    })
  }

  const widgets = useWidgetLayout(WIDGETS, null)
  const menuState = useTabbedMenuState()
  const { openAt } = menuState
  const manageWidgets = React.useCallback(() => openAt("widgets"), [openAt])

  const [newProject, setNewProject] = React.useState(false)
  const [naming, setNaming] = React.useState<{ folder: ViralFolderSummary | null } | null>(null)
  const [deletingFolder, setDeletingFolder] = React.useState<ViralFolderSummary | null>(null)

  const goTo = (next: ViralDashboardSearch) => void navigate({ to: "/admin/viral", search: next })
  const openProjectPage = (projectId: string) => void navigate({ to: "/admin/projects/$projectId", params: { projectId } })
  const figures = pageRead.data
    ? { counts: pageRead.data.counts, projects: pageRead.data.projects, folders: pageRead.data.folders }
    : null
  const folderPick = narrowed.folder ?? ""

  const blocks: ViralBlocks = {
    section,
    // A new row keeps the project picked in the Projects block.
    onPickSection: (next: ViralSection) => goTo(viralSectionSearch(next, narrowed.project ? { project: narrowed.project } : {})),
    hiddenSections: sections.hidden,
    sectionOrder: sections.order,
    onSectionsChange: changeSections,
    counts: {
      overview: widgets.layout ? widgetsShown(widgets.layout) : null,
      projects: figures?.counts.projects ?? null,
      vault: figures?.counts.vault ?? null,
      hooks: figures?.counts.hooks ?? null,
      formats: figures?.counts.formats ?? null,
    },
    figures,
    activeProject: narrowed.project ?? "",
    // As Promo's: a project narrows the row showing; pressing it again lets it go.
    onProject: (projectId: string) => goTo({ ...viralSectionSearch(section), project: projectId || undefined }),
    activeFolder: folderPick,
    onFolder: (folder: string) => goTo({ folder: folder || undefined }),
    onNewFolder: () => setNaming({ folder: null }),
    onRenameFolder: (folder) => setNaming({ folder }),
    onDeleteFolder: (folder) => setDeletingFolder(folder),
  }

  const openFolderId = folderPick && folderPick !== NO_FOLDER && folderPick !== ARCHIVED_PROJECTS ? folderPick : null

  const left = (
    <DashboardPagePanel
      title="Viral"
      page={leftPage}
      error={pageRead.error}
      onRetry={pageRead.retry}
      api={PAGE_API}
      appBlocks={VIRAL_APP_BLOCKS}
      blocks={(children) => <ViralBlocksProvider value={blocks}>{children}</ViralBlocksProvider>}
      sectionsBlock={<ViralSectionsBlock />}
      menuState={menuState}
      onPageChange={setLeftPage}
      actions={
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="New project" onClick={() => setNewProject(true)}>
              <PlusIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>New project</TooltipContent>
        </Tooltip>
      }
      widgets={
        <WidgetSettings
          offer={VIRAL_WIDGET_OFFER}
          layout={widgets.layout}
          error={widgets.error}
          onRetry={widgets.retry}
          onChange={widgets.change}
        />
      }
    />
  )

  const windows = (
    <>
      <ViralProjectDialog
        open={newProject}
        folderId={openFolderId}
        folders={(figures?.folders.rows ?? []).map((folder) => ({ id: folder.id, name: folder.name, project_count: folder.count }))}
        onClose={() => setNewProject(false)}
        onCreated={(created) => openProjectPage(created.id)}
      />
      <FolderWindows
        api={FOLDER_API}
        naming={naming}
        onNamingChange={setNaming}
        deleting={deletingFolder}
        onDeletingChange={setDeletingFolder}
        onFoldersChanged={async (gone) => {
          // A deleted folder that the Projects row was narrowed to lets go of it.
          if (gone && narrowed.folder === gone) goTo({ folder: undefined })
          refreshFigures()
          await router.invalidate()
        }}
      />
    </>
  )

  return {
    left,
    windows,
    coverUrl: leftPage?.coverUrl ?? null,
    widgets,
    manageWidgets,
    refreshFigures,
    openNewProject: () => setNewProject(true),
  }
}
