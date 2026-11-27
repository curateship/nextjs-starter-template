import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import type { ProjectSubChoice, ProjectTab, ProjectTopValue } from "@/components/content-app/project-top"
import { useTabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { usePromoGuest } from "@/components/social/guest/guest-mode"
import { ProjectDialogs, type ProjectDialog } from "@/components/social/projects/project-dialogs"
import { ProjectMenu } from "@/components/social/projects/project-menu"
import {
  arrangeNetworks,
  getNetworkErrorMessage,
  getProjectErrorMessage,
  loadProject,
  pauseProject,
  pauseProjectNetwork,
  setProjectNetwork,
  type ProjectView,
} from "@/lib/api/social/projects"
import type { Network } from "@/lib/social/networks"
import type { ProjectRouteSearch } from "@/lib/social/project-address"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The project's tab row and its ⋮, the same on the project's page and on its
 * Research (`workspace/docs/content-app.md`, "A project's own page"). It holds
 * what the old left panel of the project did: the ⋮'s General, Description
 * and Networks, the New project and Delete windows, and the moves between
 * Content, Research and Promote.
 *
 * `sub` is the tab's own choice, a dropdown after the tabs, which the page
 * fills: Research's lists or Promote's network. Content has none.
 */
export function useProjectTop({
  view,
  onView,
  tab,
  sub,
  network,
}: {
  view: ProjectView
  onView: (view: ProjectView) => void
  tab: ProjectTab
  sub: ProjectSubChoice | null
  /** The network showing on Promote, so taking it off moves to the next one. */
  network: Network | null
}) {
  const navigate = useNavigate()
  const guest = Boolean(usePromoGuest())
  const project = view.project
  const projectId = project.id
  const [dialog, setDialog] = React.useState<ProjectDialog>(null)
  const menuState = useTabbedMenuState()

  const refreshView = React.useCallback(async () => {
    try {
      onView(await loadProject(projectId))
    } catch (error) {
      showErrorToast(getProjectErrorMessage(error))
    }
  }, [onView, projectId])

  // Each move starts the tab afresh. From Research it goes back to the project's page; elsewhere it stays
  // on the page it is on, which for a guest is the guest's own address (`/guest/promo/<id>`).
  const goTo = React.useCallback(
    (search: ProjectRouteSearch) => {
      if (tab === "research") void navigate({ to: "/admin/projects/$projectId", params: { projectId }, search })
      else void navigate({ to: ".", search })
    },
    [navigate, projectId, tab]
  )

  /**
   * Promote on one network, or on the first one Promote shows when none is
   * named (a hidden one only when every one is). With no network yet there
   * is none to name.
   */
  const openPromote = (picked: Network | null, networks: Network[] = project.networks) => {
    const first = picked ?? networks.find((each) => !project.hiddenNetworks.includes(each)) ?? networks[0] ?? null
    goTo(first ? { network: first } : { promote: "1" })
  }

  const onTab = (next: ProjectTab) => {
    if (next === tab) return
    if (next === "research") void navigate({ to: "/admin/projects/$projectId/research", params: { projectId } })
    else if (next === "promote") openPromote(null)
    // The plain address is Content. A guest's plain address is Promote, so a guest's Content says so.
    else goTo(guest ? { archive: "1" } : {})
  }

  async function changeNetwork(changed: Network, use: boolean) {
    try {
      await setProjectNetwork(projectId, changed, use)
      await refreshView()
      // The network just added is the one wanted next; one taken off while it shows gives way to the next.
      if (use) openPromote(changed)
      else if (changed === network) openPromote(null, project.networks.filter((each) => each !== changed))
    } catch (error) {
      showErrorToast(getNetworkErrorMessage(error))
    }
  }

  const top: ProjectTopValue = {
    projectId,
    guest,
    tab,
    onTab,
    sub,
    menu: ({ extraTabs, actions, select, jobs }) => (
      <ProjectMenu
        extraTabs={extraTabs}
        actions={actions}
        select={select ?? null}
        jobs={jobs ?? null}
        key={projectId}
        project={project}
        guest={guest}
        menuState={menuState}
        onSaved={() => void refreshView()}
        onNewProject={() => setDialog({ kind: "new" })}
        onDeleteProject={() => setDialog({ kind: "delete", project })}
        onTogglePause={async () => {
          try {
            await pauseProject(projectId, !project.pausedAt)
            await refreshView()
          } catch (error) {
            showErrorToast(getProjectErrorMessage(error))
          }
        }}
        onAddNetwork={(added) => changeNetwork(added, true)}
        onRemoveNetwork={(removed) => changeNetwork(removed, false)}
        onArrangeNetworks={async (arranged) => {
          // Drawn at once, then saved; a refusal puts back what is stored.
          onView({ ...view, project: { ...project, networks: arranged.order, hiddenNetworks: arranged.hidden } })
          try {
            await arrangeNetworks(projectId, arranged)
          } catch (error) {
            showErrorToast(getNetworkErrorMessage(error))
            await refreshView()
          }
        }}
        onToggleNetworkPause={async (changed, paused) => {
          try {
            await pauseProjectNetwork(projectId, changed, paused)
            await refreshView()
          } catch (error) {
            showErrorToast(getNetworkErrorMessage(error))
          }
        }}
      />
    ),
  }

  return {
    top,
    dialogs: <ProjectDialogs dialog={dialog} onClose={() => setDialog(null)} />,
    refreshView,
    /** Opens the ⋮ at Networks, for Promote's line when the project has none. */
    openNetworks: () => menuState.openAt("networks"),
  }
}
