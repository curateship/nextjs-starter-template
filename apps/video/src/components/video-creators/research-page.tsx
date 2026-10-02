import * as React from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useBlankSpaceDoubleClick, usePanelToggle } from "@/lib/layout/panel-collapse"
import { useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { showErrorToast } from "@/lib/toast/error-toast"
import { AddCreatorDialog } from "@/components/video-creators/add-creator-dialog"
import {
  CreatorsPanel,
  type FolderActions,
} from "@/components/video-creators/creators-panel"
import { FeedPanel } from "@/components/video-creators/feed-panel"
import { FoldersManager } from "@/components/video-creators/folders-manager"
import { VideoPanel } from "@/components/video-creators/video-panel"
import {
  getCreatorErrorMessage,
  removeCreator,
  setCreatorWatching,
} from "@/lib/api/video/creators"
import {
  createCreatorFolder,
  deleteCreatorFolder,
  getCreatorFolderErrorMessage,
  renameCreatorFolder,
  saveCreatorFolderOrder,
  setFolderCreator,
} from "@/lib/api/video/creator-folders"
import {
  getCreatorFeedErrorMessage,
  loadCreatorFeedView,
  loadOlderCreatorPosts,
} from "@/lib/api/video/creator-feed"
import {
  EVERYONE_SCOPE,
  type CreatorFeedScope,
  type CreatorFolder,
  type CreatorPost,
  type CreatorResearchData,
  type SavedVideoStatus,
} from "@/lib/video/creators"

/**
 * The research dashboard: who you follow, what they posted, and why it worked.
 *
 * Three panels across and only three, the same shape and the same handles as
 * the editor — creators on the left, their videos in the middle, the one you
 * picked playing on the right. Drag the dividers and the sizes come back next
 * time; double-click a side panel's empty space to shut it.
 *
 * **Clicking on the left narrows the middle in place.** Picking a creator
 * beats picking a folder, which is why choosing one clears the other. Every
 * narrowing asks the server again, because sieving the fifty posts already on
 * screen would show three of a creator's forty.
 */

/** Where this browser last left the dividers. */
const LAYOUT_KEY = "video-research-horizontal"

export function ResearchPage({ initial }: { initial: CreatorResearchData }) {
  const desktop = useWideScreen()
  const layout = useRememberedPanelLayout(LAYOUT_KEY)

  const creatorsRef = React.useRef<PanelImperativeHandle>(null)
  const videoRef = React.useRef<PanelImperativeHandle>(null)
  const [creatorsCollapsed, setCreatorsCollapsed] = React.useState(false)
  const [videoCollapsed, setVideoCollapsed] = React.useState(false)
  const toggleCreators = usePanelToggle(creatorsRef)
  const toggleVideo = usePanelToggle(videoRef)
  const creatorsDoubleClick = useBlankSpaceDoubleClick(toggleCreators)
  const videoDoubleClick = useBlankSpaceDoubleClick(toggleVideo)

  // A fresh answer from the route loader replaces what is on screen, adjusted
  // while rendering rather than in an effect so nothing stale paints first.
  const [read, setRead] = React.useState({ from: initial, data: initial })
  if (read.from !== initial) setRead({ from: initial, data: initial })
  const data = read.data

  /**
   * Folders and creators are held apart from the loader's answer, because
   * every folder action hands back the fresh list and a tick applies the
   * moment it is clicked rather than waiting for the save.
   */
  const [held, setHeld] = React.useState({
    from: data,
    folders: data.folders,
    creators: data.creators,
  })
  if (held.from !== data) {
    setHeld({ from: data, folders: data.folders, creators: data.creators })
  }

  /**
   * The feed on screen and the scope it answers, in one state: the header must
   * never name one narrowing while the list below it shows another.
   */
  const [shown, setShown] = React.useState({
    from: data,
    scope: EVERYONE_SCOPE,
    posts: data.posts,
    more: data.more,
    held: data.held,
  })
  if (shown.from !== data) {
    setShown({
      from: data,
      scope: EVERYONE_SCOPE,
      posts: data.posts,
      more: data.more,
      held: data.held,
    })
  }
  const { scope } = shown

  /**
   * Which ask of the server owns the feed. Two quick clicks are two requests
   * and the slower, older one can land last; only the newest ask's answer may
   * touch the screen, or the feed flips back to a scope nobody is looking at.
   */
  const askVersion = React.useRef(0)

  const [picked, setPicked] = React.useState<CreatorPost | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [olderBusy, setOlderBusy] = React.useState(false)
  const [folderBusy, setFolderBusy] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  const [managing, setManaging] = React.useState(false)
  const [confirmingUnfollow, setConfirmingUnfollow] = React.useState(false)
  const [unfollowBusy, setUnfollowBusy] = React.useState(false)

  const pickScope = React.useCallback(
    async (next: CreatorFeedScope) => {
      const version = ++askVersion.current
      setBusy(true)
      try {
        const view = await loadCreatorFeedView(next)
        if (version !== askVersion.current) return
        setShown((was) =>
          was.from === data ? { ...was, scope: next, ...view } : was
        )
      } catch (error) {
        if (version !== askVersion.current) return
        showErrorToast(getCreatorFeedErrorMessage(error))
      } finally {
        if (version === askVersion.current) setBusy(false)
      }
    },
    [data]
  )

  const pickFolder = React.useCallback(
    (folderId: string | null) => void pickScope({ folderId, creatorId: null }),
    [pickScope]
  )
  const pickCreator = React.useCallback(
    (creatorId: string | null) => void pickScope({ folderId: null, creatorId }),
    [pickScope]
  )

  const loadOlder = React.useCallback(async () => {
    const oldest = shown.posts[shown.posts.length - 1]
    if (!oldest || olderBusy) return
    const version = askVersion.current
    setOlderBusy(true)
    try {
      const page = await loadOlderCreatorPosts(
        shown.scope,
        oldest.postedAt ?? oldest.firstSeenAt
      )
      // A page asked under a scope that has since changed belongs to the old
      // list and must not be stitched onto the new one.
      if (version !== askVersion.current) return
      setShown((was) => {
        if (was.from !== data) return was
        const known = new Set(was.posts.map((post) => post.id))
        return {
          ...was,
          posts: [
            ...was.posts,
            ...page.posts.filter((post) => !known.has(post.id)),
          ],
          more: page.more,
        }
      })
    } catch (error) {
      showErrorToast(getCreatorFeedErrorMessage(error))
    } finally {
      setOlderBusy(false)
    }
  }, [data, olderBusy, shown.posts, shown.scope])

  /** Keeps the feed's chip and the right panel saying the same thing. */
  const onSavedChange = React.useCallback(
    (
      postId: string,
      saved: { id: string; status: SavedVideoStatus } | null
    ) => {
      setShown((was) => ({
        ...was,
        posts: was.posts.map((post) =>
          post.id === postId
            ? {
                ...post,
                savedVideoId: saved?.id ?? null,
                savedStatus: saved?.status ?? null,
              }
            : post
        ),
      }))
      // Left exactly as it was when nothing moved. A fresh object every time
      // would restart the right panel's read, and that read is what calls
      // this — which is a loop.
      setPicked((was) => {
        if (!was || was.id !== postId) return was
        const id = saved?.id ?? null
        const status = saved?.status ?? null
        if (was.savedVideoId === id && was.savedStatus === status) return was
        return { ...was, savedVideoId: id, savedStatus: status }
      })
    },
    []
  )

  const setFolders = React.useCallback(
    (next: CreatorFolder[] | ((was: CreatorFolder[]) => CreatorFolder[])) =>
      setHeld((was) => ({
        ...was,
        folders: typeof next === "function" ? next(was.folders) : next,
      })),
    []
  )

  const folderActions: FolderActions = {
    busy: folderBusy,
    create: async (name, firstCreatorId) => {
      if (folderBusy) return false
      setFolderBusy(true)
      try {
        setFolders(await createCreatorFolder(name, firstCreatorId))
        return true
      } catch (error) {
        showErrorToast(getCreatorFolderErrorMessage(error))
        return false
      } finally {
        setFolderBusy(false)
      }
    },
    // The tick shows at once and the save runs behind it; a refused save puts
    // it back and says why.
    toggleCreator: (folderId, creatorId, saved) => {
      const before = held.folders
      setFolders((was) =>
        was.map((folder) =>
          folder.id === folderId
            ? {
                ...folder,
                creatorIds: saved
                  ? folder.creatorIds.includes(creatorId)
                    ? folder.creatorIds
                    : [...folder.creatorIds, creatorId]
                  : folder.creatorIds.filter((id) => id !== creatorId),
              }
            : folder
        )
      )
      void setFolderCreator({ folderId, creatorId, saved }).catch((error) => {
        setFolders(before)
        showErrorToast(getCreatorFolderErrorMessage(error))
      })
    },
  }

  const managerActions = {
    busy: folderBusy,
    rename: (folderId: string, name: string) => {
      const before = held.folders
      setFolders((was) =>
        was.map((folder) =>
          folder.id === folderId ? { ...folder, name } : folder
        )
      )
      void renameCreatorFolder(folderId, name).catch((error) => {
        setFolders(before)
        showErrorToast(getCreatorFolderErrorMessage(error))
      })
    },
    remove: async (folderId: string) => {
      if (folderBusy) return false
      setFolderBusy(true)
      try {
        setFolders(await deleteCreatorFolder(folderId))
        // The folder being looked at has gone, so the feed widens back out
        // rather than showing posts under a name that no longer exists.
        if (scope.folderId === folderId) void pickFolder(null)
        return true
      } catch (error) {
        showErrorToast(getCreatorFolderErrorMessage(error))
        return false
      } finally {
        setFolderBusy(false)
      }
    },
    saveOrder: (folderIds: string[], hiddenFolderIds: string[]) => {
      const before = held.folders
      const hidden = new Set(hiddenFolderIds)
      const order = folderIds.map((id, position) => ({
        id,
        position,
        hidden: hidden.has(id),
      }))
      setFolders((was) =>
        was.map((folder) => {
          const moved = order.find((one) => one.id === folder.id)
          return moved
            ? { ...folder, position: moved.position, hidden: moved.hidden }
            : folder
        })
      )
      void saveCreatorFolderOrder(order).catch((error) => {
        setFolders(before)
        showErrorToast(getCreatorFolderErrorMessage(error))
      })
    },
  }

  const pickedCreator =
    held.creators.find((creator) => creator.id === scope.creatorId) ?? null

  const scopeName = scope.creatorId
    ? `@${pickedCreator?.handle ?? "creator"}`
    : scope.folderId
      ? (held.folders.find((folder) => folder.id === scope.folderId)?.name ??
        "Folder")
      : "Everyone"

  async function toggleWatch(creatorId: string, watch: boolean) {
    const before = held.creators
    setHeld((was) => ({
      ...was,
      creators: was.creators.map((creator) =>
        creator.id === creatorId ? { ...creator, watch } : creator
      ),
    }))
    try {
      const fresh = await setCreatorWatching(creatorId, watch)
      setHeld((was) => ({ ...was, creators: fresh.creators }))
    } catch (error) {
      setHeld((was) => ({ ...was, creators: before }))
      showErrorToast(getCreatorErrorMessage(error))
    }
  }

  async function unfollow() {
    if (!pickedCreator) return
    setUnfollowBusy(true)
    try {
      const fresh = await removeCreator(pickedCreator.id)
      setHeld((was) => ({ ...was, ...fresh }))
      setPicked(null)
      setConfirmingUnfollow(false)
      // Their posts have gone with them, so the feed widens back out rather
      // than showing an empty list under a name that is no longer there.
      await pickScope(EVERYONE_SCOPE)
    } catch (error) {
      showErrorToast(getCreatorErrorMessage(error))
    } finally {
      setUnfollowBusy(false)
    }
  }

  const creatorsPanel = (
    <CreatorsPanel
      folders={held.folders}
      creators={held.creators}
      scope={scope}
      actions={folderActions}
      onPickFolder={pickFolder}
      onPickCreator={pickCreator}
      onAddCreator={() => setAdding(true)}
      onManage={() => setManaging(true)}
    />
  )

  const feedPanel = (
    <FeedPanel
      posts={shown.posts}
      held={shown.held}
      more={shown.more}
      scopeName={scopeName}
      busy={busy}
      olderBusy={olderBusy}
      selectedId={picked?.id ?? null}
      creator={pickedCreator}
      onPick={setPicked}
      onLoadOlder={() => void loadOlder()}
      onClearCreator={() => pickCreator(null)}
      onToggleWatch={(watch) =>
        pickedCreator && void toggleWatch(pickedCreator.id, watch)
      }
      onUnfollow={() => setConfirmingUnfollow(true)}
    />
  )

  const videoPanel = <VideoPanel post={picked} onSavedChange={onSavedChange} />

  return (
    <>
      {desktop ? (
        <ResizablePanelGroup
          key={layout.layoutKey}
          orientation="horizontal"
          className="min-h-0 flex-1"
          defaultLayout={layout.defaultLayout}
          onLayoutChanged={layout.onLayoutChanged}
        >
          <ResizablePanel
            id="creators"
            panelRef={creatorsRef}
            collapsible
            collapsedSize="0%"
            defaultSize="18%"
            minSize="14%"
            maxSize="34%"
            onResize={(size) => setCreatorsCollapsed(size.asPercentage < 0.5)}
          >
            <WorkspacePanel
              collapsed={creatorsCollapsed}
              onDoubleClick={creatorsDoubleClick}
              className="flex flex-col"
            >
              {creatorsPanel}
            </WorkspacePanel>
          </ResizablePanel>
          <ResizableHandle gap collapsed={creatorsCollapsed} />
          <ResizablePanel id="feed" defaultSize="52%" minSize="30%">
            <div className="relative h-full min-h-0">
              <WorkspacePanel className="flex flex-col">
                {feedPanel}
              </WorkspacePanel>
              {creatorsCollapsed ? (
                <PanelReopenTab
                  side="left"
                  label="Show creators"
                  onClick={toggleCreators}
                />
              ) : null}
              {videoCollapsed ? (
                <PanelReopenTab
                  side="right"
                  label="Show the video"
                  onClick={toggleVideo}
                />
              ) : null}
            </div>
          </ResizablePanel>
          <ResizableHandle gap collapsed={videoCollapsed} />
          <ResizablePanel
            id="video"
            panelRef={videoRef}
            collapsible
            collapsedSize="0%"
            defaultSize="30%"
            minSize="20%"
            maxSize="46%"
            onResize={(size) => setVideoCollapsed(size.asPercentage < 0.5)}
          >
            <WorkspacePanel
              collapsed={videoCollapsed}
              onDoubleClick={videoDoubleClick}
              className="flex flex-col"
            >
              {videoPanel}
            </WorkspacePanel>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        // Too narrow for three abreast: the same three in the same order, one
        // under the other, with the page doing the scrolling.
        <ScrollArea className="min-h-0 flex-1">
          <div
            className="flex flex-col"
            style={{ gap: "var(--shell-gutter, 0.75rem)" }}
          >
            <WorkspacePanel className="flex flex-col">
              {creatorsPanel}
            </WorkspacePanel>
            <WorkspacePanel className="flex h-[70vh] flex-col">
              {feedPanel}
            </WorkspacePanel>
            <WorkspacePanel className="flex flex-col">
              {videoPanel}
            </WorkspacePanel>
          </div>
        </ScrollArea>
      )}

      <AddCreatorDialog
        open={adding}
        onOpenChange={setAdding}
        youtubeKeyConfigured={data.youtubeKeyConfigured}
        onAdded={(creator) =>
          setHeld((was) => ({
            ...was,
            creators: [...was.creators, creator].sort((left, right) =>
              left.handle.localeCompare(right.handle)
            ),
          }))
        }
      />

      <FoldersManager
        folders={held.folders}
        open={managing}
        onOpenChange={setManaging}
        actions={managerActions}
      />

      <ConfirmDialog
        open={confirmingUnfollow && pickedCreator !== null}
        onOpenChange={(shown) => {
          if (!shown) setConfirmingUnfollow(false)
        }}
        title={`Unfollow @${pickedCreator?.handle ?? ""}?`}
        description="Their videos leave the feed. Anything you already saved and broke down stays, and so does its player."
        confirmLabel="Unfollow"
        loading={unfollowBusy}
        onConfirm={unfollow}
      />
    </>
  )
}
