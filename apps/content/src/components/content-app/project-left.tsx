import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import type { ContentProjectBlocks, ProjectPick } from "@/components/content-app/project-blocks"
import { useTabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { useWidgetLayout, type WidgetStore } from "@/components/shared/widgets/use-widget-layout"
import { WidgetSettings } from "@/components/shared/widgets/widget-menus"
import { PROJECTS_WIDGET_STORE } from "@/components/social/projects-dashboard/projects-dashboard"
import { usePromoGuest } from "@/components/social/guest/guest-mode"
import { ProjectDialogs, type ProjectDialog } from "@/components/social/projects/project-dialogs"
import { ProjectPanel } from "@/components/social/projects/project-panel"
import {
  arrangeNetworks,
  getNetworkErrorMessage,
  getProjectErrorMessage,
  loadProject,
  loadProjectRows,
  pauseProject,
  pauseProjectNetwork,
  setProjectNetwork,
  type ProjectView,
} from "@/lib/api/social/projects"
import type { Network } from "@/lib/social/networks"
import { widgetsShown } from "@/lib/admin-dashboard/overview-widgets"
import { useLoad } from "@/lib/hooks/use-load"
import { PROJECTS_WIDGET_OFFER } from "@/lib/social/projects-dashboard-page"
import type { Side } from "@/lib/social/sides"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * A project's left panel and its windows, the same on the project's page and
 * on its Research (`workspace/docs/content-app.md`, "A project's own page"). A
 * row opens its place: Content and a network on the project's page, a
 * Research row on `/admin/projects/<id>/research`, and a video in the editor
 * on the whole screen. Dashboards' Overview row opens the page's home.
 *
 * It also holds the Overview's widget layout and the ⋮'s open tab, so the
 * ⋮'s Widgets tab and the Overview's widgets show one layout, and a widget's
 * Manage widgets opens the ⋮ at Widgets (Tyler, 27 Nov 2026: "THe widgets is
 * also in the wrong location as it should go into the 3 dot dropdown on the
 * left panel").
 */
export function useProjectLeft({
  view,
  onView,
  pick,
  network,
  side,
  onNetworkPicked,
  onContentPicked,
}: {
  view: ProjectView
  onView: (view: ProjectView) => void
  /** The row whose panels fill the middle and right. */
  pick: ProjectPick
  network: Network | null
  side: Side
  /**
   * On the project's page, a network row changes the address in place, so the
   * page keeps what else it holds. Elsewhere the press leaves for the page.
   */
  onNetworkPicked?: (network: Network, side: Side) => void
  /** The same for Content, which the project's page shows in place, a guest's page too. */
  onContentPicked?: () => void
}) {
  const navigate = useNavigate()
  const guest = Boolean(usePromoGuest())
  const projectId = view.project.id
  const [dialog, setDialog] = React.useState<ProjectDialog>(null)
  const [partsKey, setPartsKey] = React.useState(0)
  // A guest has no ⋮ and no Overview, and the layout is an admin's, so a guest's page never asks for it.
  const widgets = useWidgetLayout(guest ? GUEST_WIDGET_STORE : PROJECTS_WIDGET_STORE, null)
  const menu = useTabbedMenuState()
  const { openAt } = menu
  const manageWidgets = React.useCallback(() => openAt("widgets"), [openAt])
  // How many projects there are, for the Dashboards block's Projects row.
  const projects = useLoad(() => (guest ? Promise.resolve([]) : loadProjectRows()), getProjectErrorMessage, {
    keys: [guest],
    remember: "content-project-left-projects",
  })

  const refreshView = React.useCallback(async () => {
    try {
      onView(await loadProject(projectId))
    } catch (error) {
      showErrorToast(getProjectErrorMessage(error))
    }
  }, [onView, projectId])

  const openNetwork = React.useCallback(
    (picked: Network, pickedSide: Side) => {
      if (onNetworkPicked) onNetworkPicked(picked, pickedSide)
      else
        void navigate({
          to: "/admin/projects/$projectId",
          params: { projectId },
          search: { network: picked, side: pickedSide === "commenting" ? "commenting" : undefined },
        })
    },
    [navigate, onNetworkPicked, projectId]
  )

  async function changeNetwork(changed: Network, use: boolean) {
    try {
      await setProjectNetwork(projectId, changed, use)
      await refreshView()
      // The network just added is the one wanted next.
      if (use) openNetwork(changed, "posts")
      else if (changed === network) content.onOverview()
    } catch (error) {
      showErrorToast(getNetworkErrorMessage(error))
    }
  }

  const content: ContentProjectBlocks = {
    projectId,
    guest,
    pick,
    contentCount: view.project.archiveCount,
    // The page's address with no row named.
    onOverview: () => void navigate({ to: "/admin/projects/$projectId", params: { projectId }, search: {} }),
    overviewCount: widgets.layout ? widgetsShown(widgets.layout) : null,
    projectsCount: projects.data ? projects.data.length : null,
    onProjects: () => void navigate({ to: "/admin/projects" }),
    onViral: (section) => void navigate({ to: "/admin/projects", search: { section } }),
    onContent: () => {
      if (onContentPicked) onContentPicked()
      else void navigate({ to: "/admin/projects/$projectId", params: { projectId }, search: { archive: "1" } })
    },
    onResearch: (section, social) =>
      void navigate({
        to: "/admin/projects/$projectId/research",
        params: { projectId },
        search: { view: section === "videos" ? undefined : section, social: social ?? undefined },
      }),
    onVideo: (videoId) =>
      void navigate({ to: "/admin/video-editor/$projectId", params: { projectId }, search: { video: videoId } }),
    onVideoCreated: (videoId, panel) => {
      setPartsKey((count) => count + 1)
      void navigate({ to: "/admin/video-editor/$projectId", params: { projectId }, search: { video: videoId, panel } })
    },
  }

  const left = (
    <ProjectPanel
      view={view}
      selectedNetwork={network}
      selectedSide={side}
      content={content}
      contentReloadKey={partsKey}
      menuState={menu}
      widgets={
        <WidgetSettings
          offer={PROJECTS_WIDGET_OFFER}
          layout={widgets.layout}
          error={widgets.error}
          onRetry={widgets.retry}
          onChange={widgets.change}
        />
      }
      onSelect={(picked, pickedSide) => {
        if (pick.kind !== "network" || picked !== network || pickedSide !== side) openNetwork(picked, pickedSide)
      }}
      onAddNetwork={(added) => changeNetwork(added, true)}
      onArrangeNetworks={async (arranged) => {
        // Drawn at once, then saved; a refusal puts back what is stored.
        onView({ ...view, project: { ...view.project, networks: arranged.order, hiddenNetworks: arranged.hidden } })
        try {
          await arrangeNetworks(projectId, arranged)
        } catch (error) {
          showErrorToast(getNetworkErrorMessage(error))
          await refreshView()
        }
      }}
      onRemoveNetwork={(removed) => changeNetwork(removed, false)}
      onToggleNetworkPause={async (changed, paused) => {
        try {
          await pauseProjectNetwork(projectId, changed, paused)
          await refreshView()
        } catch (error) {
          showErrorToast(getNetworkErrorMessage(error))
        }
      }}
      onNewProject={() => setDialog({ kind: "new" })}
      onDeleteProject={() => setDialog({ kind: "delete", project: view.project })}
      onTogglePause={async () => {
        try {
          await pauseProject(projectId, !view.project.pausedAt)
          await refreshView()
        } catch (error) {
          showErrorToast(getProjectErrorMessage(error))
        }
      }}
      onSaved={() => void refreshView()}
    />
  )

  return {
    left,
    dialogs: <ProjectDialogs dialog={dialog} onClose={() => setDialog(null)} />,
    refreshView,
    /** The Overview's one layout, which the ⋮'s Widgets tab sets. */
    widgets,
    /** Opens the ⋮ at Widgets, for a widget's own Manage widgets. */
    manageWidgets,
  }
}

/** A guest's page's stand-in for the layout: one empty row, never read from or saved to the server. */
const GUEST_WIDGET_STORE: WidgetStore = {
  load: async () => ({ top: { columns: 1, spots: [null] }, bottom: { columns: 0, spots: [] } }),
  save: async (layout) => layout,
  message: () => "",
}
