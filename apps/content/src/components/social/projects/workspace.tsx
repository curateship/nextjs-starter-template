import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import { MediumModule } from "@/components/social/medium/medium-module"
import { AppModule } from "@/components/social/phone-apps/app-module"
import { RedditModule } from "@/components/social/reddit/reddit-module"
import { RedditPostsModule } from "@/components/social/reddit/reddit-posts-module"
import { LinkedinModule } from "@/components/social/linkedin/linkedin-module"
import { XModule } from "@/components/social/x/x-module"
import { YoutubeModule } from "@/components/social/youtube/youtube-module"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { getNetworkErrorMessage, pauseProjectCommenting, type ProjectView } from "@/lib/api/social/projects"
import { MEDIUM_COMMENT_VIEWS, MEDIUM_POST_VIEWS } from "@/lib/social/medium/options"
import { isPhoneAppNetwork, NETWORK_NAMES, type Network } from "@/lib/social/networks"
import { LINKEDIN_COMMENT_VIEWS, LINKEDIN_POST_VIEWS } from "@/lib/social/linkedin/options"
import { COMMENT_TABS, projectTabOf, sideOf, type ProjectRouteSearch, type ProjectSearch } from "@/lib/social/project-address"
import { isCommentingNetwork, type Side } from "@/lib/social/sides"
import { X_COMMENT_VIEWS, X_POST_VIEWS } from "@/lib/social/x/options"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { KeywordRow } from "@/server/social/keywords"

import { ArchiveItemPanel } from "@/components/archive/archive-item-panel"
import { ArchiveItemsPanel } from "@/components/archive/archive-items-panel"
import { type DraftVideo } from "@/components/content-app/content-layout"
import { DraftPanel } from "@/components/content-app/draft-panel"
import { usePromoGuest } from "@/components/social/guest/guest-mode"

import { CommentingPauseContext } from "@/components/social/commenting-pause"
import { ProjectColumns } from "./project-columns"
import { RightCoverProvider } from "@/components/shared/notes/page-cover"
import { ProjectHeaderLead } from "./project-header-lead"
import { ProjectColumnsPick } from "./project-columns-pick"
import { ProjectMenuButton, ProjectTopProvider, type ProjectSubChoice } from "@/components/content-app/project-top"
import { useProjectTop } from "@/components/content-app/project-top-state"
import { useProjectsLeft } from "@/components/content-app/projects-left"
import { Button } from "@/components/ui/button"
import { NetworkPanesProvider, type NetworkPane, type NetworkPanes } from "@/components/content-app/network-panes"

export type { ProjectSearch }

/** The address's tab when it is one of this side's, else none. */
function tabOf<T extends string>(tab: string | undefined, views: readonly T[]): T | undefined {
  return tab && (views as readonly string[]).includes(tab) ? (tab as T) : undefined
}

/**
 * What Voices or Accounts keeps in the address, cleared when the network's own
 * list comes back: `open` and `q` are a voice's or an account's there.
 */
const LEAVE_PANE: ProjectRouteSearch = {
  pane: undefined,
  open: undefined,
  q: undefined,
  show: undefined,
  status: undefined,
  importance: undefined,
  tag: undefined,
  reason: undefined,
}

/** Everything one network's side keeps in the address, cleared when another row is picked. */
const LEAVE_SIDE: ProjectRouteSearch = {
  ...LEAVE_PANE,
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

type WorkspaceProps = {
  initialView: ProjectView
  initialKeywords: KeywordRow[]
  search: ProjectRouteSearch
  /** A Reddit post to open on Commenting as the page opens, from a link. */
  openPostId: string | null
  /** A failed comment's words, put back in the box for its post, with the account that tried. Never sent. */
  retry: { findId: string; text: string; accountId: string | null } | null
  /** A failed post of your own, or a Viral draft, whose words New post opens with. */
  newPostRetryId: string | null
}

/**
 * A project's page (`workspace/docs/content-app.md`, "A project's own page"):
 * the Projects dashboard's left panel, unchanged, and the project in the
 * middle and right (Tyler, 27 Nov 2026: "When clicking on a project. I dont
 * want the left panel to change ... click project > middle and right panel
 * change > middle panel first load will be it's content archive. The middle
 * panel header would have these tabs [Content] [Research] [Promote]").
 *
 * A guest sent from Project gets no left panel, since it lists every
 * project, and the page is drawn the same way otherwise.
 */
export function ProjectsWorkspace(props: WorkspaceProps) {
  const guest = usePromoGuest()
  if (guest) return <ProjectPage {...props} left={null} rightCover={props.initialView.project.imageUrl || null} />
  return <OwnerProjectPage {...props} />
}

/** The owner's page, with the Projects dashboard's left panel and Projects picked in it. */
function OwnerProjectPage(props: WorkspaceProps) {
  const { left, coverUrl } = useProjectsLeft({ section: "projects" })
  return <ProjectPage {...props} left={left} rightCover={coverUrl} />
}

/**
 * The project in the middle and right, under its tab row (`project-top.tsx`):
 *
 * - **Content**, the plain address: All content, the project's Archive, and
 *   its videos still in the editor, with Status to show Draft or Published.
 * - **Research**, `/admin/projects/<id>/research`, a route of its own.
 * - **Promote**, `?network=`: a tab per network under the row, and on the
 *   network's own header the Posts / Commenting switch ("A Posts /
 *   Commenting switch"). Tyler, 14 Oct 2026: "Project first" meaning that
 *   social networks are modules ... If I click on reddit then the middle and
 *   right panel will show reddit panels." The networks' rows of 5 Nov 2026,
 *   Posts and Commenting, are the switch's two halves.
 *
 * The tab, the network and its side are in the address (`projectTabOf`,
 * `sideOf`), so a reload, Back and every bell notice keep them.
 */
function ProjectPage({
  initialView,
  initialKeywords,
  search,
  openPostId,
  retry,
  newPostRetryId,
  left,
  rightCover,
}: WorkspaceProps & {
  /** The Projects dashboard's left panel; null on a guest's page. */
  left: React.ReactNode | null
  /** The picture the right panel carries on: the left page's cover, or a guest's project's. */
  rightCover: string | null
}) {
  const navigate = useNavigate()
  const projectId = initialView.project.id
  const [view, setView] = React.useState(initialView)

  const networks = view.project.networks
  const guest = usePromoGuest()
  const tab = projectTabOf({ ...search, post: openPostId ?? undefined, retry: retry ? "1" : undefined, newPost: newPostRetryId ?? undefined }, Boolean(guest))
  // Promote shows the networks not hidden from it; the picked one shows while hidden, and a hidden one
  // is first only when every one is.
  const shownNetworks = networks.filter((each) => !view.project.hiddenNetworks.includes(each))
  const firstShown = shownNetworks[0] ?? networks[0] ?? null
  const network = tab === "promote" ? (search.network && networks.includes(search.network) ? search.network : firstShown) : null
  const side: Side = sideOf(network, search)
  // The middle's name on a phone, and what moving to another shows the middle again for.
  const pick = React.useMemo(
    () =>
      tab === "content"
        ? { key: "content", label: "Content" }
        : network
          ? { key: `${network}:${side}`, label: NETWORK_NAMES[network] }
          : { key: "promote", label: "Promote" },
    [tab, network, side]
  )

  const setSearch = React.useCallback(
    (patch: ProjectRouteSearch, options: { replace?: boolean } = {}) =>
      void navigate({
        to: ".",
        replace: options.replace,
        search: (previous: Record<string, unknown>) => {
          // Anything but a pane's own pick leaves Voices or Accounts, as a network's own tab does.
          const leaving = previous.pane && !("pane" in patch) ? LEAVE_PANE : {}
          const next: Record<string, unknown> = { ...previous, ...leaving, ...patch }
          for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
          return next
        },
      }),
    [navigate]
  )

  // The tab's own choice, a dropdown after the project's tabs: Content's two, or on Promote the
  // network and its side in one, "Reddit · Posts" and "Reddit · Commenting" (`networkChoices`).
  // Content has none: its one dropdown, All content to Drafts, is in its lists' own headers (`ContentKindMenu`).
  const sub: ProjectSubChoice | null =
    tab === "content"
      ? null
      : network
        ? {
            label: "Which network",
            value: `${network}:${side}`,
            choices: networkChoices(view, network),
            onChange: (next: string) => {
              const [picked, pickedSide] = next.split(":") as [Network, Side]
              setSearch({ ...LEAVE_SIDE, network: picked, side: pickedSide === "commenting" ? "commenting" : undefined })
            },
          }
        : null
  const { top, dialogs, refreshView, openNetworks } = useProjectTop({ view, onView: setView, tab, sub, network })


  const framed = (node: React.ReactNode) => (
    <ProjectTopProvider value={top}>
      {/* The right panels carry on the left panel's cover, as on every three-panel dashboard. */}
      <RightCoverProvider value={rightCover}>
        <ProjectColumnsPick.Provider value={pick}>
          <NetworkPanesProvider value={panes}>{node}</NetworkPanesProvider>
        </ProjectColumnsPick.Provider>
      </RightCoverProvider>
    </ProjectTopProvider>
  )

  // Pause commenting, at the foot of the keywords dropdown of the network
  // whose Commenting shows; none for a guest.
  const commentingPause = React.useMemo(
    () =>
      network && side === "commenting" && !guest
        ? {
            networkName: NETWORK_NAMES[network],
            paused: view.project.pausedCommenting.includes(network),
            onToggle: async (paused: boolean) => {
              try {
                await pauseProjectCommenting(projectId, network, paused)
                await refreshView()
              } catch (error) {
                showErrorToast(getNetworkErrorMessage(error))
              }
            },
          }
        : null,
    [network, side, guest, view.project.pausedCommenting, projectId, refreshView]
  )

  // Voices and Accounts on the network showing; a guest has neither.
  // Drawn afresh with the page, as the network it goes to is.
  const panes: NetworkPanes | null =
    guest || !network
      ? null
      : {
          pane: search.pane ?? null,
          network,
          projectId,
          search: {
            q: search.q,
            open: search.open,
            show: search.show,
            status: search.status,
            importance: search.importance,
            tag: search.tag,
            reason: search.reason,
          },
          // The side is written down, since on a pane only `side` says which it is (`sideOf`).
          onPane: (pane: NetworkPane) =>
            setSearch({
              ...LEAVE_PANE,
              pane,
              side: side === "commenting" ? "commenting" : undefined,
              comment: undefined,
              replies: undefined,
              window: undefined,
            }),
        }

  if (tab === "content") {
    return framed(
      <ProjectArchive
        projectId={projectId}
        projectName={view.project.name}
        canManage={!guest}
        left={left}
        search={search}
        onSearch={setSearch}
        showDrafts={!guest}
      >
        {dialogs}
      </ProjectArchive>
    )
  }

  // Only YouTube has a Templates window; every other module knows the Jobs window alone.
  const jobsWindow = search.window === "jobs" ? "jobs" : undefined

  if (network && isPhoneAppNetwork(network)) {
    return framed(
      <AppModule
        // Keyed by the network, so moving between Instagram and TikTok starts
        // afresh rather than showing one's posts under the other.
        key={network}
        network={network}
        projectId={projectId}
        left={left}
        dialogs={dialogs}
        search={{ view: search.view === "comments" ? "comments" : undefined, comment: search.comment, window: jobsWindow }}
        onSearch={setSearch}
      />
    )
  }

  if (network === "youtube") {
    return framed(
      <YoutubeModule
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
    const own = { open: search.open, list: commenting ? (search.list === "failed" ? "failed" : undefined) : undefined, window: commenting ? jobsWindow : undefined, keyword: commenting ? search.keyword : undefined } as const
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
          search={{ view: search.view, list: search.list === "failed" ? "failed" : undefined, replies: search.replies, comment: search.comment, window: jobsWindow, keyword: search.keyword }}
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

  if (module) return framed(<CommentingPauseContext.Provider value={commentingPause}>{module}</CommentingPauseContext.Provider>)

  // No network yet: the middle says where to add one.
  return framed(
    <ProjectColumns
      left={left}
      middle={
        <>
          <DashboardCardHeader className="gap-2">
            <ProjectHeaderLead />
            <span className="flex-1" />
            <ProjectMenuButton />
          </DashboardCardHeader>
          <div className="grid justify-items-start gap-3 p-4 text-sm text-muted-foreground">
            {guest ? (
              <p>This project uses no network yet.</p>
            ) : (
              <>
                <p>This project uses no network yet. Add one, and its posts and comments open here.</p>
                <Button type="button" variant="outline" onClick={openNetworks}>
                  Add a network
                </Button>
              </>
            )}
          </div>
        </>
      }
      right={null}
      rightOpen={false}
      rightLabel=""
    >
      {dialogs}
    </ProjectColumns>
  )
}

/**
 * Promote's dropdown: each network Promote shows, with Posts and Commenting
 * as two choices of one network that has both (Tyler, 27 Nov 2026: "A Posts /
 * Commenting switch", then "The tabs can now be either dropdowns or filter").
 * They were the two rows of each network's card on the project's left panel.
 * Posts carries how many failed posts and drafts wait, as its row did;
 * Commenting has no count (Tyler, 14 Nov 2026: "remove it"). A paused network
 * says so. A hidden one is left out unless it is the one showing.
 */
function networkChoices(view: ProjectView, showing: Network) {
  const { networks, hiddenNetworks, pausedNetworks } = view.project
  return networks
    .filter((each) => each === showing || !hiddenNetworks.includes(each))
    .flatMap((each) => {
      const name = `${NETWORK_NAMES[each]}${pausedNetworks.includes(each) ? " (paused)" : ""}`
      const posts = view.postCounts?.[each] || undefined
      return isCommentingNetwork(each)
        ? [
            { value: `${each}:posts`, label: `${name} · Posts`, count: posts },
            { value: `${each}:commenting`, label: `${name} · Commenting` },
          ]
        : [{ value: `${each}:posts`, label: name, count: posts }]
    })
}

/**
 * Content's All content: the project's own Archive in its middle and right
 * columns (part 21), the same panels as the Archive dashboard had, for this
 * project only. A guest from Project sees and posts its items, with nothing
 * to manage (part 33). The first item opens on arrival, as on every
 * three-column dashboard.
 *
 * The Archive's filters are read from the address only beside `?archive=1`
 * (`readProjectArchiveSearch`), so a filter or a search writes it too.
 */
function ProjectArchive({
  projectId,
  projectName,
  canManage,
  left,
  search,
  onSearch,
  showDrafts,
  children,
}: {
  projectId: string
  projectName: string
  canManage: boolean
  left: React.ReactNode | null
  search: ProjectSearch
  onSearch: (patch: ProjectSearch, options?: { replace?: boolean }) => void
  /** The project's videos still in the editor, with Status to pick them; not for a guest. */
  showDrafts: boolean
  children: React.ReactNode
}) {
  const [listKey, setListKey] = React.useState(0)
  const filtered = (patch: ProjectSearch) => onSearch({ archive: "1", ...patch })
  const openId = search.open
  /** The item that opened by itself on arrival, which a phone leaves behind its name. */
  const [quietId, setQuietId] = React.useState<string | null>(null)
  /** An item pressed, which a phone shows even when it is the one already open. */
  const pickItem = (itemId: string | undefined) => {
    setQuietId(null)
    onSearch({ open: itemId })
  }
  /** The first draft, shown on the right while no Archive item is open (the right panel is never empty). */
  const [firstDraft, setFirstDraft] = React.useState<{ video: DraftVideo; open: () => void } | null>(null)
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
          onSearch={filtered}
          openId={openId}
          onOpen={pickItem}
          onShown={onShown}
          onFirstDraft={setFirstDraft}
          canManage={canManage}
          showDrafts={showDrafts}
        />
      }
      right={
        !openId && firstDraft ? (
          <DraftPanel video={firstDraft.video} onOpen={firstDraft.open} />
        ) : (
          <ArchiveItemPanel
            key={openId ?? "none"}
            itemId={openId}
            canManage={canManage}
            projects={[]}
            onChanged={() => setListKey((count) => count + 1)}
            onOpen={pickItem}
          />
        )
      }
      rightOpen={Boolean(openId) && openId !== quietId}
      onCloseRight={() => setQuietId(openId ?? null)}
      rightLabel="Show the item"
    >
      {children}
    </ProjectColumns>
  )
}
