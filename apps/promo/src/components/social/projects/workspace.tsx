import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { LayersIcon } from "lucide-react"

import { KeywordListSlotContext } from "@/components/social/keyword-list-slot"
import { MediumModule } from "@/components/social/medium/medium-module"
import { AppModule } from "@/components/social/phone-apps/app-module"
import { RedditModule } from "@/components/social/reddit/reddit-module"
import { RedditPostsModule } from "@/components/social/reddit/reddit-posts-module"
import { LinkedinModule } from "@/components/social/linkedin/linkedin-module"
import { XModule } from "@/components/social/x/x-module"
import { DashboardCardHeader, dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import {
  getNetworkErrorMessage,
  getProjectErrorMessage,
  loadProject,
  pauseProject,
  pauseProjectCommenting,
  pauseProjectNetwork,
  setProjectNetwork,
  type ProjectView,
} from "@/lib/api/social/projects"
import { MEDIUM_COMMENT_VIEWS, MEDIUM_POST_VIEWS } from "@/lib/social/medium/options"
import { NETWORK_NAMES, type Network } from "@/lib/social/networks"
import { LINKEDIN_COMMENT_VIEWS, LINKEDIN_POST_VIEWS } from "@/lib/social/linkedin/options"
import { COMMENT_TABS, sideOf, type ProjectRouteSearch, type ProjectSearch } from "@/lib/social/project-address"
import type { Side } from "@/lib/social/sides"
import { X_COMMENT_VIEWS, X_POST_VIEWS } from "@/lib/social/x/options"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { KeywordRow } from "@/server/social/keywords"

import { ArchiveItemPanel } from "@/components/archive/archive-item-panel"
import { ArchiveItemsPanel } from "@/components/archive/archive-items-panel"
import { usePromoGuest } from "@/components/social/guest/guest-mode"

import { ProjectColumns } from "./project-columns"
import { RightCoverProvider } from "@/components/shared/notes/page-cover"
import { ProjectBackButton, ProjectBackProvider } from "./project-back"
import { ProjectColumnsPick } from "./project-columns-pick"
import { ProjectDialogs, type ProjectDialog } from "./project-dialogs"
import { ProjectPanel } from "./project-panel"

export type { ProjectSearch }

/** The address's tab when it is one of this side's, else none. */
function tabOf<T extends string>(tab: string | undefined, views: readonly T[]): T | undefined {
  return tab && (views as readonly string[]).includes(tab) ? (tab as T) : undefined
}

/** Everything one network's side keeps in the address, cleared when another row is picked. */
const LEAVE_SIDE: ProjectRouteSearch = {
  side: undefined,
  view: undefined,
  comment: undefined,
  replies: undefined,
  window: undefined,
  list: undefined,
  tab: undefined,
  open: undefined,
  keyword: undefined,
  post: undefined,
  retry: undefined,
  newPost: undefined,
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
 * Tyler, 5 Nov 2026: "I think its better that commenting lives within its
 * project. Make each network have its own card and inside that cade have 2
 * rows, one for posts and one for commenting"
 * (`workspace/tasks/Projects/commenting-dashboard.md`). So the left column
 * holds a card per network, Posts opens your own posts on it and Commenting
 * opens the posts its keywords found, with the keywords listed under that
 * row. Instagram and TikTok have Posts alone. A link from one row's panels to
 * a tab of the other row, such as a quote post's reply, switches the row.
 *
 * The picked network and row are in the address (`?network=`,
 * `?side=commenting`), so a reload keeps them; `sideOf` reads the row. With
 * no network named, the project's first network's Posts are shown.
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
  search: ProjectRouteSearch
  /** A Reddit post to open on Commenting as the page opens, from a link. */
  openPostId: string | null
  /** A failed comment's words, put back in the box for its post, with the account that tried. Never sent. */
  retry: { findId: string; text: string; accountId: string | null } | null
  /** A failed post of your own, or a Viral draft, whose words New post opens with. */
  newPostRetryId: string | null
}) {
  const navigate = useNavigate()
  const projectId = initialView.project.id
  const [view, setView] = React.useState(initialView)
  const [dialog, setDialog] = React.useState<ProjectDialog>(null)
  const [keywordSlot, setKeywordSlot] = React.useState<HTMLDivElement | null>(null)
  const slot = React.useMemo(() => ({ element: keywordSlot }), [keywordSlot])

  const networks = view.project.networks
  const archive = search.archive === "1"
  const network = archive ? null : search.network && networks.includes(search.network) ? search.network : (networks[0] ?? null)
  const side: Side = archive ? "posts" : sideOf(network, search)
  const guest = usePromoGuest()
  // What the left column picked, which a phone shows in the middle column.
  const pick = React.useMemo(
    () =>
      archive
        ? { key: "archive", label: "Archive" }
        : network
          ? { key: `${network}:${side}`, label: NETWORK_NAMES[network] }
          : { key: "", label: "Networks" },
    [archive, network, side]
  )
  // The arrow back to the Projects dashboard, which every network's middle header draws first; none for a guest.
  const framed = (node: React.ReactNode) => (
    <ProjectBackProvider value={guest ? null : projectId}>
      {/* The right panels carry on the left panel's cover, as on every three-panel dashboard. */}
      <RightCoverProvider value={view.project.imageUrl || null}>
        <ProjectColumnsPick.Provider value={pick}>{node}</ProjectColumnsPick.Provider>
      </RightCoverProvider>
    </ProjectBackProvider>
  )

  const setSearch = React.useCallback(
    (patch: ProjectRouteSearch, options: { replace?: boolean } = {}) =>
      void navigate({
        to: ".",
        replace: options.replace,
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
        setSearch({ ...LEAVE_SIDE, network: changed })
      } else {
        if (changed === network) setSearch({ ...LEAVE_SIDE, network: undefined })
      }
    } catch (error) {
      showErrorToast(getNetworkErrorMessage(error))
    }
  }

  const left = (
    <ProjectPanel
      view={view}
      selectedNetwork={network}
      selectedSide={side}
      keywordSlot={setKeywordSlot}
      onSelect={(picked, pickedSide) => {
        if (picked !== network || pickedSide !== side || archive) {
          setSearch({ ...LEAVE_ARCHIVE, ...LEAVE_SIDE, network: picked, side: pickedSide === "commenting" ? "commenting" : undefined })
        }
      }}
      archiveSelected={archive}
      onSelectArchive={() => {
        if (!archive) setSearch({ ...LEAVE_SIDE, archive: "1", network: undefined })
      }}
      onAddNetwork={(added) => changeNetwork(added, true)}
      onRemoveNetwork={(removed) => changeNetwork(removed, false)}
      onToggleNetworkPause={async (changed, paused) => {
        try {
          await pauseProjectNetwork(projectId, changed, paused)
          await refreshView()
        } catch (error) {
          showErrorToast(getNetworkErrorMessage(error))
        }
      }}
      onToggleCommentingPause={async (changed, paused) => {
        try {
          await pauseProjectCommenting(projectId, changed, paused)
          await refreshView()
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
        } catch (error) {
          showErrorToast(getProjectErrorMessage(error))
        }
      }}
      onSaved={() => void refreshView()}
    />
  )

  const dialogs = <ProjectDialogs dialog={dialog} onClose={() => setDialog(null)} />

  if (archive) {
    return framed(
      <ProjectArchive projectId={projectId} projectName={view.project.name} canManage={!guest} left={left} search={search} onSearch={setSearch}>
        {dialogs}
      </ProjectArchive>
    )
  }

  if (network === "instagram" || network === "tiktok") {
    return framed(
      <AppModule
        // Keyed by the network, so moving between Instagram and TikTok starts
        // afresh rather than showing one's posts under the other.
        key={network}
        network={network}
        projectId={projectId}
        left={left}
        dialogs={dialogs}
        search={{ view: search.view === "comments" ? "comments" : undefined, comment: search.comment, window: search.window }}
        onSearch={setSearch}
      />
    )
  }

  /**
   * A module's address change, keeping the row it is on: a tab of the other
   * row switches to that row, as a quote post's reply does from X's Posts.
   */
  function moduleSearch(on: "medium" | "x" | "linkedin") {
    return (patch: { tab?: ProjectSearch["tab"]; open?: string; list?: "failed"; window?: "jobs"; keyword?: string }) => {
      const toSide: Side = patch.tab ? (COMMENT_TABS[on].includes(patch.tab) ? "commenting" : "posts") : side
      setSearch({
        ...patch,
        ...(toSide === side ? {} : { keyword: undefined, window: undefined }),
        tab: patch.tab === "new" ? undefined : patch.tab,
        side: toSide === "commenting" ? "commenting" : undefined,
      })
    }
  }

  let module: React.ReactNode = null
  if (network === "medium" || network === "x" || network === "linkedin") {
    const shared = {
      side,
      projectId,
      left,
      dialogs,
      onSearch: moduleSearch(network),
      onProjectChanged: refreshView,
    }
    const commenting = side === "commenting"
    const own = { open: search.open, list: commenting ? (search.list === "failed" ? "failed" : undefined) : undefined, window: commenting ? search.window : undefined, keyword: commenting ? search.keyword : undefined } as const
    module =
      network === "medium" ? (
        <MediumModule {...shared} search={{ ...own, tab: tabOf(search.tab, commenting ? MEDIUM_COMMENT_VIEWS : MEDIUM_POST_VIEWS) }} />
      ) : network === "x" ? (
        <XModule {...shared} search={{ ...own, tab: tabOf(search.tab, commenting ? X_COMMENT_VIEWS : X_POST_VIEWS) }} />
      ) : (
        <LinkedinModule {...shared} search={{ ...own, tab: tabOf(search.tab, commenting ? LINKEDIN_COMMENT_VIEWS : LINKEDIN_POST_VIEWS) }} />
      )
  } else if (network === "reddit") {
    module =
      side === "commenting" ? (
        <RedditModule
          view={view}
          onView={setView}
          initialKeywords={initialKeywords}
          left={left}
          dialogs={dialogs}
          search={{ view: search.view, list: search.list === "failed" ? "failed" : undefined, replies: search.replies, comment: search.comment, window: search.window, keyword: search.keyword }}
          onSearch={(patch) => {
            // Sent's own list is "sent" or "failed"; only Failed is written down.
            const { list, ...rest } = patch
            setSearch({ ...rest, ...("list" in patch ? { list: list === "failed" ? "failed" : undefined } : {}), side: "commenting" })
          }}
          openPostId={openPostId}
          retry={retry}
        />
      ) : (
        <RedditPostsModule
          view={view}
          left={left}
          dialogs={dialogs}
          search={{ list: search.list === "failed" ? "failed" : undefined }}
          onSearch={(patch) => setSearch({ ...patch, view: undefined })}
          newPostRetryId={newPostRetryId}
          onProjectChanged={refreshView}
        />
      )
  }

  if (module) {
    // On Commenting, each network's keyword header draws its keywords as a
    // list under the Commenting row of the left column (part 11).
    return framed(side === "commenting" ? <KeywordListSlotContext.Provider value={slot}>{module}</KeywordListSlotContext.Provider> : module)
  }

  // No network yet: the middle and right columns say where to start.
  return framed(
    <ProjectColumns
      left={left}
      middle={
        <>
          <DashboardCardHeader className="gap-2">
            <ProjectBackButton />
            <LayersIcon className="size-4 text-muted-foreground" aria-hidden />
            <h2 className={dashboardCardHeadingClassName}>No network yet</h2>
          </DashboardCardHeader>
          <p className="p-4 text-sm text-muted-foreground">
            This project uses no network yet. Press Add network in the left column, and your
            posts on that network open here.
          </p>
        </>
      }
      right={<p className="p-4 text-sm text-muted-foreground">A post of your own opens here once a network is added.</p>}
      rightOpen={false}
      rightLabel="Show the right column"
    >
      {dialogs}
    </ProjectColumns>
  )
}

/** Every Archive key, cleared when a network is picked instead. */
const LEAVE_ARCHIVE: ProjectSearch = { archive: undefined, kind: undefined, q: undefined, posted: undefined, sort: undefined, group: undefined, bin: undefined }

/**
 * The project's own Archive in its middle and right columns (part 21): the
 * same panels as the Archive dashboard, for this project only. A guest from
 * Project sees and posts its items, with nothing to manage (part 33). The
 * first item opens on arrival, as on every three-column dashboard.
 */
function ProjectArchive({
  projectId,
  projectName,
  canManage,
  left,
  search,
  onSearch,
  children,
}: {
  projectId: string
  projectName: string
  canManage: boolean
  left: React.ReactNode
  search: ProjectSearch
  onSearch: (patch: ProjectSearch, options?: { replace?: boolean }) => void
  children: React.ReactNode
}) {
  const [listKey, setListKey] = React.useState(0)
  const openId = search.open
  /** The item that opened by itself on arrival, which a phone leaves behind its name. */
  const [quietId, setQuietId] = React.useState<string | null>(null)
  /** An item pressed, which a phone shows even when it is the one already open. */
  const pickItem = (itemId: string | undefined) => {
    setQuietId(null)
    onSearch({ open: itemId })
  }
  const onShown = React.useCallback(
    (ids: string[]) => {
      // Opened by itself, so it replaces the address: Back still leaves the page.
      if (!openId && ids[0]) {
        setQuietId(ids[0])
        onSearch({ open: ids[0] }, { replace: true })
      }
    },
    [onSearch, openId]
  )
  return (
    <ProjectColumns
      left={left}
      middle={
        <ArchiveItemsPanel
          key={`${projectId}:${listKey}`}
          projectId={projectId}
          projectName={projectName}
          search={search}
          onSearch={(patch) => onSearch(patch)}
          openId={openId}
          onOpen={pickItem}
          onShown={onShown}
          canManage={canManage}
        />
      }
      right={
        <ArchiveItemPanel
          key={openId ?? "none"}
          itemId={openId}
          canManage={canManage}
          projects={[]}
          onChanged={() => setListKey((count) => count + 1)}
          onOpen={pickItem}
        />
      }
      rightOpen={Boolean(openId) && openId !== quietId}
      onCloseRight={() => setQuietId(openId ?? null)}
      rightLabel="Show the item"
    >
      {children}
    </ProjectColumns>
  )
}
