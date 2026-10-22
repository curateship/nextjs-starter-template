import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { LayersIcon } from "lucide-react"
import { toast } from "sonner"

import { MediumModule, type MediumSearch } from "@/components/social/medium/medium-module"
import { AppModule } from "@/components/social/phone-apps/app-module"
import { RedditModule, type RedditSearch } from "@/components/social/reddit/reddit-module"
import { XModule } from "@/components/social/x/x-module"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import {
  getNetworkErrorMessage,
  getProjectErrorMessage,
  loadProject,
  pauseProject,
  pauseProjectNetwork,
  setProjectNetwork,
  type ProjectView,
} from "@/lib/api/social/projects"
import { MEDIUM_VIEWS, type MediumView } from "@/lib/social/medium/options"
import { NETWORK_NAMES, type Network } from "@/lib/social/networks"
import { X_VIEWS, type XView } from "@/lib/social/x/options"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { KeywordRow } from "@/server/social/keywords"

import { ProjectColumns } from "./project-columns"
import { ProjectDialogs, type ProjectDialog } from "./project-dialogs"
import { ProjectPanel } from "./project-panel"

/** What a project's page keeps in its address: the picked network, and that network's own. */
export type ProjectSearch = RedditSearch &
  Omit<MediumSearch, "list" | "window" | "tab"> & { network?: Network; tab?: Exclude<MediumView | XView, "new"> }

/** The address's tab when it is one of this module's, else none. */
function tabOf<T extends string>(tab: string | undefined, views: readonly T[]): Exclude<T, "new"> | undefined {
  return tab && tab !== "new" && (views as readonly string[]).includes(tab) ? (tab as Exclude<T, "new">) : undefined
}

/**
 * A project's dashboard: the project and its networks on the left, and the
 * picked network's panels in the middle and on the right.
 *
 * Tyler, 14 Oct 2026: "Project first" meaning that social networks are
 * modules so that means we don't have reddit on its own route that sit in the
 * sidebar. What we'd do is add a project a select what social network this
 * project will use. If I select reddit and Instagram then there will be a
 * section on the left panel. If I click on reddit then the middle and right
 * panel will show reddit panels."
 *
 * The picked network is in the address (`?network=`), so a reload keeps it.
 * With none named, the project's first network is the one shown. Reddit's
 * module is `RedditModule`; Instagram and TikTok share `AppModule`.
 */
export function ProjectsWorkspace({
  initialView,
  initialKeywords,
  search,
  openPostId,
  retry,
  newPostRetryId,
}: {
  initialView: ProjectView
  initialKeywords: KeywordRow[]
  search: ProjectSearch
  /** A post to open as the page opens, from a link. */
  openPostId: string | null
  /**
   * A failed comment's words, put back in the box for its post, with the
   * account that tried, from Try again on the Comments tab. Never sent.
   */
  retry: { findId: string; text: string; accountId: string | null } | null
  /** A failed post of your own, whose words New post opens with. */
  newPostRetryId: string | null
}) {
  const navigate = useNavigate()
  const projectId = initialView.project.id
  const [view, setView] = React.useState(initialView)
  const [dialog, setDialog] = React.useState<ProjectDialog>(null)

  const networks = view.project.networks
  const network = search.network && networks.includes(search.network) ? search.network : (networks[0] ?? null)

  const setSearch = React.useCallback(
    (patch: ProjectSearch) =>
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...previous, ...patch }
          for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
          return next
        },
      }),
    [navigate]
  )

  const refreshView = React.useCallback(async () => {
    try {
      setView(await loadProject(projectId))
    } catch (error) {
      showErrorToast(getProjectErrorMessage(error))
    }
  }, [projectId])

  async function changeNetwork(changed: Network, use: boolean) {
    try {
      await setProjectNetwork(projectId, changed, use)
      await refreshView()
      if (use) {
        // The network just added is the one wanted next.
        setSearch({ network: changed, view: undefined, list: undefined, replies: undefined, comment: undefined, window: undefined, tab: undefined, open: undefined })
        toast.success(`${NETWORK_NAMES[changed]} added.`)
      } else {
        if (changed === network) setSearch({ network: undefined, view: undefined, list: undefined, replies: undefined, comment: undefined, window: undefined, tab: undefined, open: undefined })
        toast.success(`${NETWORK_NAMES[changed]} taken off ${view.project.name}.`)
      }
    } catch (error) {
      showErrorToast(getNetworkErrorMessage(error))
    }
  }

  const left = (
    <ProjectPanel
      view={view}
      selectedNetwork={network}
      onSelectNetwork={(picked) => {
        if (picked !== network) {
          setSearch({ network: picked, view: undefined, list: undefined, replies: undefined, comment: undefined, window: undefined, tab: undefined, open: undefined })
        }
      }}
      onAddNetwork={(added) => changeNetwork(added, true)}
      onRemoveNetwork={(removed) => changeNetwork(removed, false)}
      onToggleNetworkPause={async (changed, paused) => {
        try {
          await pauseProjectNetwork(projectId, changed, paused)
          await refreshView()
          toast.success(
            paused
              ? `${NETWORK_NAMES[changed]} paused on ${view.project.name}. Its accounts do not post or warm up; the rest of the project runs.`
              : `${NETWORK_NAMES[changed]} resumed on ${view.project.name}.`
          )
        } catch (error) {
          showErrorToast(getNetworkErrorMessage(error))
        }
      }}
      onNewProject={() => setDialog({ kind: "new" })}
      onDeleteProject={() => setDialog({ kind: "delete", project: view.project })}
      onTogglePause={async () => {
        const pausing = !view.project.pausedAt
        try {
          await pauseProject(projectId, pausing)
          await refreshView()
          toast.success(
            pausing
              ? `${view.project.name} paused. None of its accounts posts, warms up or takes readings.`
              : `${view.project.name} resumed.`
          )
        } catch (error) {
          showErrorToast(getProjectErrorMessage(error))
        }
      }}
      onSaved={() => void refreshView()}
    />
  )

  const dialogs = <ProjectDialogs dialog={dialog} onClose={() => setDialog(null)} />

  if (network === "instagram" || network === "tiktok") {
    return (
      <AppModule
        // Keyed by the network, so moving between Instagram and TikTok starts
        // afresh rather than showing one's posts under the other.
        key={network}
        network={network}
        projectId={projectId}
        left={left}
        dialogs={dialogs}
        search={search}
        onSearch={setSearch}
      />
    )
  }

  if (network === "medium") {
    return (
      <MediumModule
        projectId={projectId}
        left={left}
        dialogs={dialogs}
        search={{ tab: tabOf(search.tab, MEDIUM_VIEWS), open: search.open, list: search.list === "failed" ? "failed" : undefined, window: search.window }}
        onSearch={setSearch}
        onProjectChanged={refreshView}
      />
    )
  }

  if (network === "x") {
    return (
      <XModule
        projectId={projectId}
        left={left}
        dialogs={dialogs}
        search={{ tab: tabOf(search.tab, X_VIEWS), open: search.open, list: search.list === "failed" ? "failed" : undefined, window: search.window }}
        onSearch={setSearch}
        onProjectChanged={refreshView}
      />
    )
  }

  if (network === "reddit") {
    return (
      <RedditModule
        view={view}
        onView={setView}
        initialKeywords={initialKeywords}
        left={left}
        dialogs={dialogs}
        search={search}
        onSearch={setSearch}
        openPostId={openPostId}
        retry={retry}
        newPostRetryId={newPostRetryId}
      />
    )
  }

  // No network yet: the middle and right columns say where to start.
  return (
    <ProjectColumns
      left={left}
      middle={
        <>
          <DashboardCardTitleHeader icon={<LayersIcon className="size-4" />} title="No network yet" />
          <p className="p-4 text-sm text-muted-foreground">
            This project uses no network yet. Press Add network in the left column, and that
            network&apos;s keywords and posts open here.
          </p>
        </>
      }
      right={<p className="p-4 text-sm text-muted-foreground">A post and its comment box open here once a network is added.</p>}
      rightOpen={false}
      rightLabel="Show the right column"
    >
      {dialogs}
    </ProjectColumns>
  )
}
