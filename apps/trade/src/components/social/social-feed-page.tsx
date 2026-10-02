import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { AddCreatorDialog } from "@/components/social/add-creator-dialog"
import {
  SocialCreatorsPanel,
  type FolderActions,
} from "@/components/social/social-creators-panel"
import {
  SocialFeedPanel,
  type FeedChip,
} from "@/components/social/social-feed-panel"
import { SocialFeedCoinsPanel } from "@/components/social/social-feed-coins-panel"
import { SocialFoldersManager } from "@/components/social/social-folders-manager"
import { useTradePanelLayouts } from "@/components/trade/use-panel-layouts"
import {
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  createCreatorFolder,
  deleteCreatorFolder,
  getSocialFeedErrorMessage,
  getSocialFolderErrorMessage,
  loadSocialFeedPageData,
  loadSocialFeedViewData,
  renameCreatorFolder,
  saveCreatorFolderOrder,
  setFolderCreator,
  type SocialFeed,
} from "@/lib/api/trade/social-feed"
import {
  useBlankSpaceDoubleClick,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { showErrorToast } from "@/lib/toast/error-toast"
import { tradePanelIds, tradePanelLayoutKey } from "@/lib/trade/panel-keys"
import {
  EVERYONE_SCOPE,
  type SocialFeedScope,
  type SocialFolder,
} from "@/lib/trade/social/feed"
import {
  type TradePanelLayouts,
  useRememberedPanelLayoutInPlace,
} from "@/lib/trade/panel-layout"

/**
 * The social feed: every creator you track, one list of posts.
 *
 * Three panels across, and only three, the creator dashboard's shape with a
 * different subject: your creators in folders on the left, the feed in the
 * middle, the coins it names on the right. There is no bottom row and no
 * header row above the panels. Drag the dividers and the new sizes are
 * remembered against your account.
 *
 * **Clicking on the left or the right narrows the feed in place.** A folder,
 * a creator and a coin are the three narrowings; the chips in the feed's
 * header name whichever are in force, each with its own clear. Every
 * narrowing asks the server again, because sieving the fifty posts already on
 * screen would show three of a coin's forty-one posts.
 *
 * Below the wide-screen breakpoint the dividers are dropped and the same
 * three panels stack in the same order.
 */
const NO_RING = "focus-visible:ring-0"

export function SocialFeedPage({
  initial,
  initialPanelLayouts,
}: {
  initial: SocialFeed
  initialPanelLayouts: TradePanelLayouts
}) {
  const desktop = useWideScreen()
  const navigate = useNavigate()

  const panelLayouts = useTradePanelLayouts(initialPanelLayouts)
  const horizontalKey = tradePanelLayoutKey.socialFeedHorizontal
  const horizontalLayout = useRememberedPanelLayoutInPlace(
    tradePanelIds[horizontalKey],
    panelLayouts.layouts.current[horizontalKey],
    (layout) => panelLayouts.remember(horizontalKey, layout)
  )

  const creatorsRef = React.useRef<PanelImperativeHandle | null>(null)
  const coinsRef = React.useRef<PanelImperativeHandle | null>(null)
  const [creatorsCollapsed, setCreatorsCollapsed] = React.useState(false)
  const [coinsCollapsed, setCoinsCollapsed] = React.useState(false)

  const toggleCreatorsPanel = usePanelToggle(creatorsRef)
  const toggleCreators = React.useCallback(() => {
    toggleCreatorsPanel()
    horizontalLayout.rememberLayout()
  }, [horizontalLayout, toggleCreatorsPanel])
  const toggleCoinsPanel = usePanelToggle(coinsRef)
  const toggleCoins = React.useCallback(() => {
    toggleCoinsPanel()
    horizontalLayout.rememberLayout()
  }, [horizontalLayout, toggleCoinsPanel])
  const creatorsDoubleClick = useBlankSpaceDoubleClick(toggleCreators)
  const coinsDoubleClick = useBlankSpaceDoubleClick(toggleCoins)

  // A fresh answer from the route loader replaces what is on screen, adjusted
  // while rendering rather than in an effect, so nothing stale draws first.
  const [read, setRead] = React.useState({ from: initial, data: initial })
  if (read.from !== initial) {
    setRead({ from: initial, data: initial })
  }
  const data = read.data

  /**
   * The folders, held apart from the loader's answer because every folder
   * action hands back the fresh list and ticking a creator in or out applies
   * on the spot rather than waiting for the save.
   */
  const [heldFolders, setHeldFolders] = React.useState({
    from: data,
    folders: data.folders,
  })
  if (heldFolders.from !== data) {
    setHeldFolders({ from: data, folders: data.folders })
  }
  const folders = heldFolders.folders
  const setFolders = React.useCallback(
    (next: SocialFolder[] | ((was: SocialFolder[]) => SocialFolder[])) =>
      setHeldFolders((was) => ({
        ...was,
        folders: typeof next === "function" ? next(was.folders) : next,
      })),
    []
  )

  /**
   * The feed on screen, and the scope it answers. Scope and posts live in one
   * state on purpose: a chip must never name one narrowing while the list
   * below it still shows another.
   */
  /**
   * Which ask of the server owns the feed right now. Two quick clicks are two
   * requests, and the slower, older one can land last; only the newest ask's
   * answer may touch the screen, or the feed flips back to a scope whose chip
   * is already gone. The same counter guards an older-posts page asked under
   * a scope that has since changed. Only handlers touch it, never a render;
   * an answer that crossed a loader refresh is dropped by the `from` check in
   * the updater instead.
   */
  const viewVersion = React.useRef(0)

  const [shown, setShown] = React.useState({
    from: data,
    scope: EVERYONE_SCOPE,
    posts: data.posts,
    more: data.more,
    held: data.held,
    coins: data.coins,
  })
  if (shown.from !== data) {
    setShown({
      from: data,
      scope: EVERYONE_SCOPE,
      posts: data.posts,
      more: data.more,
      held: data.held,
      coins: data.coins,
    })
  }
  const { scope } = shown

  const [viewBusy, setViewBusy] = React.useState(false)
  const [olderBusy, setOlderBusy] = React.useState(false)
  const [folderBusy, setFolderBusy] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  const [managing, setManaging] = React.useState(false)

  const pickScope = React.useCallback(
    async (next: SocialFeedScope) => {
      const version = ++viewVersion.current
      setViewBusy(true)
      try {
        const view = await loadSocialFeedViewData(next)
        if (version !== viewVersion.current) return
        setShown((was) =>
          was.from === data ? { ...was, scope: next, ...view } : was
        )
      } catch (error) {
        if (version !== viewVersion.current) return
        showErrorToast(getSocialFeedErrorMessage(error))
      } finally {
        if (version === viewVersion.current) setViewBusy(false)
      }
    },
    [data]
  )

  const pickFolder = React.useCallback(
    (folderId: string | null) =>
      void pickScope({ folderId, creatorId: null, coin: scope.coin }),
    [pickScope, scope.coin]
  )
  const pickCreator = React.useCallback(
    (creatorId: string | null) =>
      void pickScope({ folderId: null, creatorId, coin: scope.coin }),
    [pickScope, scope.coin]
  )
  const pickCoin = React.useCallback(
    (coin: string | null) => void pickScope({ ...scope, coin }),
    [pickScope, scope]
  )

  const loadOlder = React.useCallback(async () => {
    const oldest = shown.posts[shown.posts.length - 1]
    if (!oldest || olderBusy) return
    const version = viewVersion.current
    setOlderBusy(true)
    try {
      const page = await loadSocialFeedPageData(shown.scope, oldest.postedAt)
      // A page asked under a scope that has since changed belongs to the old
      // list and must not be stitched onto the new one.
      if (version !== viewVersion.current) return
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
      showErrorToast(getSocialFeedErrorMessage(error))
    } finally {
      setOlderBusy(false)
    }
  }, [data, olderBusy, shown.posts, shown.scope])

  /**
   * Ticking a creator in or out of a folder applies on the spot; the save
   * runs behind it and a refused save puts the tick back and says why.
   */
  const toggleFolderCreator = React.useCallback(
    (folderId: string, creatorId: string, saved: boolean) => {
      const previous = folders
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
        setFolders(previous)
        showErrorToast(getSocialFolderErrorMessage(error))
      })
    },
    [folders, setFolders]
  )

  const createFolder = React.useCallback(
    async (name: string, creatorId?: string) => {
      if (folderBusy) return false
      setFolderBusy(true)
      try {
        setFolders(await createCreatorFolder({ name, creatorId }))
        return true
      } catch (error) {
        showErrorToast(getSocialFolderErrorMessage(error))
        return false
      } finally {
        setFolderBusy(false)
      }
    },
    [folderBusy, setFolders]
  )

  const renameFolder = React.useCallback(
    (folderId: string, name: string) => {
      if (folderBusy) return
      setFolderBusy(true)
      void renameCreatorFolder(folderId, name)
        .then(setFolders)
        .catch((error) => showErrorToast(getSocialFolderErrorMessage(error)))
        .finally(() => setFolderBusy(false))
    },
    [folderBusy, setFolders]
  )

  const removeFolder = React.useCallback(
    async (folderId: string) => {
      if (folderBusy) return false
      setFolderBusy(true)
      try {
        setFolders(await deleteCreatorFolder(folderId))
        // The feed must never stay narrowed to a folder that no longer
        // exists; its posts are still there, under Everyone.
        if (scope.folderId === folderId) {
          void pickScope({
            folderId: null,
            creatorId: null,
            coin: scope.coin,
          })
        }
        return true
      } catch (error) {
        showErrorToast(getSocialFolderErrorMessage(error))
        return false
      } finally {
        setFolderBusy(false)
      }
    },
    [folderBusy, pickScope, scope.coin, scope.folderId, setFolders]
  )

  /**
   * A drag or an eye press shows the new arrangement at once and puts back
   * what it had if the save is refused.
   */
  const saveFolderOrder = React.useCallback(
    (folderIds: string[], hiddenFolderIds: string[]) => {
      const previous = folders
      const hidden = new Set(hiddenFolderIds)
      setFolders((was) =>
        was.map((folder) => ({
          ...folder,
          position: folderIds.indexOf(folder.id),
          hidden: hidden.has(folder.id),
        }))
      )
      setFolderBusy(true)
      void saveCreatorFolderOrder({ folderIds, hiddenFolderIds })
        .then(setFolders)
        .catch((error) => {
          setFolders(previous)
          showErrorToast(getSocialFolderErrorMessage(error))
        })
        .finally(() => setFolderBusy(false))
    },
    [folders, setFolders]
  )

  const folderActions: FolderActions = React.useMemo(
    () => ({
      busy: folderBusy,
      toggle: toggleFolderCreator,
      create: createFolder,
    }),
    [createFolder, folderBusy, toggleFolderCreator]
  )

  // What the chips and the coins panel call the scope. Looked up by id so a
  // rename in the manage window renames the chip in the same frame.
  const pickedFolder = scope.folderId
    ? (folders.find((folder) => folder.id === scope.folderId) ?? null)
    : null
  const pickedCreator = scope.creatorId
    ? (data.creators.find((creator) => creator.id === scope.creatorId) ?? null)
    : null
  const scopeName = pickedCreator
    ? `@${pickedCreator.handle}`
    : (pickedFolder?.name ?? "Everyone")

  const chips: FeedChip[] = [
    ...(pickedFolder
      ? [
          {
            key: "folder",
            label: pickedFolder.name,
            clearLabel: `Stop narrowing to ${pickedFolder.name}`,
            onClear: () => pickFolder(null),
          },
        ]
      : []),
    ...(pickedCreator
      ? [
          {
            key: "creator",
            label: `@${pickedCreator.handle}`,
            clearLabel: `Stop narrowing to @${pickedCreator.handle}`,
            onClear: () => pickCreator(null),
          },
        ]
      : []),
    ...(scope.coin
      ? [
          {
            key: "coin",
            label: scope.coin,
            clearLabel: `Stop narrowing to ${scope.coin}`,
            onClear: () => pickCoin(null),
          },
        ]
      : []),
  ]

  const creatorsPanel = (
    <SocialCreatorsPanel
      folders={folders}
      creators={data.creators}
      scope={scope}
      onPickFolder={pickFolder}
      onPickCreator={pickCreator}
      actions={folderActions}
      onAddCreator={() => setAdding(true)}
      onManage={() => setManaging(true)}
    />
  )
  const feedPanel = (
    <SocialFeedPanel
      posts={shown.posts}
      held={shown.held}
      narrowed={scope.coin !== null}
      chips={chips}
      more={shown.more}
      busy={olderBusy || viewBusy}
      onLoadOlder={() => void loadOlder()}
    />
  )
  const coinsPanel = (
    <SocialFeedCoinsPanel
      coins={shown.coins}
      scopeName={scopeName}
      selected={scope.coin}
      onSelect={pickCoin}
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {desktop ? (
        <ResizablePanelGroup
          groupRef={horizontalLayout.groupRef}
          orientation="horizontal"
          className="min-h-0 flex-1"
          onLayoutChanged={horizontalLayout.onLayoutChanged}
        >
          <ResizablePanel
            id="creators"
            panelRef={creatorsRef}
            collapsible
            collapsedSize="0%"
            defaultSize="16%"
            minSize="14%"
            maxSize="34%"
            onResize={(size) => setCreatorsCollapsed(size.asPercentage < 0.5)}
          >
            <WorkspacePanel
              className="flex flex-col"
              collapsed={creatorsCollapsed}
              onDoubleClick={creatorsDoubleClick}
            >
              {creatorsPanel}
            </WorkspacePanel>
          </ResizablePanel>
          <ResizableHandle
            gap
            collapsed={creatorsCollapsed}
            className={NO_RING}
          />
          <ResizablePanel id="feed" defaultSize="68%" minSize="30%">
            <WorkspacePanel className="relative flex min-w-0 flex-1 flex-col">
              {feedPanel}
              {creatorsCollapsed ? (
                <PanelReopenTab
                  side="left"
                  label="Show your creators"
                  onClick={toggleCreators}
                />
              ) : null}
              {coinsCollapsed ? (
                <PanelReopenTab
                  side="right"
                  label="Show the coins this feed names"
                  onClick={toggleCoins}
                />
              ) : null}
            </WorkspacePanel>
          </ResizablePanel>
          <ResizableHandle gap collapsed={coinsCollapsed} className={NO_RING} />
          <ResizablePanel
            id="coins"
            panelRef={coinsRef}
            collapsible
            collapsedSize="0%"
            defaultSize="16%"
            minSize="16%"
            maxSize="36%"
            onResize={(size) => setCoinsCollapsed(size.asPercentage < 0.5)}
          >
            <WorkspacePanel
              className="flex flex-col"
              collapsed={coinsCollapsed}
              onDoubleClick={coinsDoubleClick}
            >
              {coinsPanel}
            </WorkspacePanel>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <ScrollArea
          className="min-h-0 flex-1"
          viewportClassName="[&>div]:block!"
        >
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <WorkspacePanel className="flex h-auto shrink-0 flex-col">
              {creatorsPanel}
            </WorkspacePanel>
            <WorkspacePanel className="flex h-[70vh] min-w-0 shrink-0 flex-col">
              {feedPanel}
            </WorkspacePanel>
            <WorkspacePanel className="flex h-auto shrink-0 flex-col">
              {coinsPanel}
            </WorkspacePanel>
          </div>
        </ScrollArea>
      )}
      <AddCreatorDialog
        open={adding}
        onOpenChange={setAdding}
        onAdded={(handle) => {
          setAdding(false)
          // Their dashboard syncs their profile on open, so the first posts
          // arrive without another press, then show up here.
          void navigate({ to: "/social/$handle", params: { handle } })
        }}
      />
      <SocialFoldersManager
        folders={folders}
        open={managing}
        onOpenChange={setManaging}
        actions={{
          busy: folderBusy,
          create: (name) => createFolder(name),
          rename: renameFolder,
          remove: removeFolder,
          saveOrder: saveFolderOrder,
        }}
      />
    </div>
  )
}
