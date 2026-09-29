import * as React from "react"
import { toast } from "sonner"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { SocialFiguresPanel } from "@/components/social/social-figures-panel"
import { SocialMarketsPanel } from "@/components/social/social-markets-panel"
import { SocialPostsPanel } from "@/components/social/social-posts-panel"
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
  getSocialErrorMessage,
  loadSocialPosts,
  loadSocialDashboardData,
  refreshCreatorFromX,
  type SocialDashboard,
} from "@/lib/api/trade/social"
import {
  useBlankSpaceDoubleClick,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { plural } from "@/lib/format/plural"
import { showErrorToast } from "@/lib/toast/error-toast"
import { tradePanelIds, tradePanelLayoutKey } from "@/lib/trade/panel-keys"
import {
  type TradePanelLayouts,
  useRememberedPanelLayoutInPlace,
} from "@/lib/trade/panel-layout"

/**
 * One creator's dashboard.
 *
 * Three panels across, and only three: their figures on the left, their posts
 * in the middle, the markets they name on the right. There is no bottom row
 * because nothing on this screen earns one, which is Tyler's call rather than
 * an oversight — every other workspace in this app has four.
 *
 * **Nothing here lists the other creators, and there is no header row above the
 * panels.** Listing them is navigation and belongs on the list screen. The one
 * name that does belong here is this creator's, and it is the left panel's own
 * title rather than a fourth surface above the three. Tyler asked for that on
 * 29 Sep 2026, along with taking the two buttons off the top: Add posts moved
 * into the posts panel's header as Sync profile, and adding another creator
 * went with the list screen it belongs to.
 *
 * **Both side panels open at their narrowest**, and the posts take everything
 * left over. A figure and its caption need one column; a post needs as much
 * width as it can get, because a narrow middle panel wraps every post into
 * five lines. Tyler asked for this on 29 Sep 2026. Drag them wider and the
 * new sizes are remembered against your account.
 *
 * Below the wide-screen breakpoint the dividers are dropped and the same three
 * panels stack in the same order.
 */
const NO_RING = "focus-visible:ring-0"

export function SocialDashboardPage({
  initial,
  initialPanelLayouts,
}: {
  initial: SocialDashboard
  initialPanelLayouts: TradePanelLayouts
}) {
  const desktop = useWideScreen()

  const panelLayouts = useTradePanelLayouts(initialPanelLayouts)
  const horizontalKey = tradePanelLayoutKey.socialHorizontal
  const horizontalLayout = useRememberedPanelLayoutInPlace(
    tradePanelIds[horizontalKey],
    panelLayouts.layouts.current[horizontalKey],
    (layout) => panelLayouts.remember(horizontalKey, layout)
  )

  const figuresRef = React.useRef<PanelImperativeHandle | null>(null)
  const marketsRef = React.useRef<PanelImperativeHandle | null>(null)
  const [figuresCollapsed, setFiguresCollapsed] = React.useState(false)
  const [marketsCollapsed, setMarketsCollapsed] = React.useState(false)

  const toggleFiguresPanel = usePanelToggle(figuresRef)
  const toggleFigures = React.useCallback(() => {
    toggleFiguresPanel()
    horizontalLayout.rememberLayout()
  }, [horizontalLayout, toggleFiguresPanel])
  const toggleMarketsPanel = usePanelToggle(marketsRef)
  const toggleMarkets = React.useCallback(() => {
    toggleMarketsPanel()
    horizontalLayout.rememberLayout()
  }, [horizontalLayout, toggleMarketsPanel])
  const figuresDoubleClick = useBlankSpaceDoubleClick(toggleFigures)
  const marketsDoubleClick = useBlankSpaceDoubleClick(toggleMarkets)

  // A fresh answer from the route loader replaces what is on screen, adjusted
  // while rendering rather than in an effect — the alternative draws the old
  // creator for one frame, which on this page means somebody else's posts.
  const [read, setRead] = React.useState({ from: initial, data: initial })
  if (read.from !== initial) {
    setRead({ from: initial, data: initial })
  }
  const data = read.data

  const [olderBusy, setOlderBusy] = React.useState(false)
  const [syncing, setSyncing] = React.useState(false)

  /**
   * The posts on screen, and the coin they are narrowed to.
   *
   * **Picking a coin asks the server again.** Sieving the page already loaded
   * would show three of a coin's forty-one posts, because only the newest
   * fifty are here. The whole list belongs to one answer, so a new question
   * replaces all of it.
   */
  const [shown, setShown] = React.useState({
    from: data,
    posts: data.posts,
    more: data.more,
    market: null as string | null,
  })
  if (shown.from !== data) {
    setShown({
      from: data,
      posts: data.posts,
      more: data.more,
      market: null,
    })
  }
  const { posts, more, market } = shown

  const creatorId = data.creator.id
  const pickMarket = React.useCallback(
    async (next: string | null) => {
      setOlderBusy(true)
      try {
        const page = await loadSocialPosts(creatorId, null, next)
        setShown((was) => ({
          ...was,
          posts: page.posts,
          more: page.more,
          market: next,
        }))
      } catch (error) {
        showErrorToast(getSocialErrorMessage(error))
      } finally {
        setOlderBusy(false)
      }
    },
    [creatorId]
  )

  const loadOlder = React.useCallback(async () => {
    const oldest = posts[posts.length - 1]
    if (!oldest || olderBusy) return
    setOlderBusy(true)
    try {
      const page = await loadSocialPosts(creatorId, oldest.postedAt, market)
      setShown((was) => {
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
      showErrorToast(getSocialErrorMessage(error))
    } finally {
      setOlderBusy(false)
    }
  }, [creatorId, market, olderBusy, posts])

  const refresh = React.useCallback(async () => {
    try {
      const fresh = await loadSocialDashboardData(data.creator.handle)
      setRead((was) => ({ from: was.from, data: fresh }))
    } catch (error) {
      showErrorToast(getSocialErrorMessage(error))
    }
  }, [data.creator.handle])

  const handle = data.creator.handle

  /**
   * The button: read the creator's X page and say what came back.
   *
   * It speaks either way, because a button that looks like it did nothing is
   * worse than one that says "nothing new".
   */
  const sync = React.useCallback(async () => {
    setSyncing(true)
    try {
      const answer = await refreshCreatorFromX(handle, true)
      if (answer.changed) await refresh()
      toast.success(
        answer.added === 0
          ? "Nothing new on their profile."
          : `${answer.added} new ${plural(answer.added, "post", "posts")}.`
      )
    } catch (error) {
      showErrorToast(getSocialErrorMessage(error))
    } finally {
      setSyncing(false)
    }
  }, [handle, refresh])

  /**
   * The same read once when the screen opens, after it has already drawn from
   * what the app knows. `instant-first.md` is the rule: nothing waits on a
   * request to somebody else's server. The server leaves a creator alone for
   * five minutes between these, so flicking between creators is not a request
   * each time. The button is not held back that way.
   *
   * This one says nothing, because nobody asked it to run. A read that fails
   * leaves the numbers already on screen, which are the last ones that worked.
   */
  React.useEffect(() => {
    let live = true
    void (async () => {
      try {
        const answer = await refreshCreatorFromX(handle, false)
        if (live && answer.changed) await refresh()
      } catch {
        // Silent on purpose. The screen has its answer.
      }
    })()
    return () => {
      live = false
    }
  }, [handle, refresh])

  const figuresPanel = <SocialFiguresPanel creator={data.creator} />
  const postsPanel = (
    <SocialPostsPanel
      posts={posts}
      total={data.postsHeld}
      filter={market}
      onClearFilter={() => void pickMarket(null)}
      more={more}
      busy={olderBusy}
      onLoadOlder={() => void loadOlder()}
      onSync={() => void sync()}
      syncing={syncing}
    />
  )
  const marketsPanel = (
    <SocialMarketsPanel
      markets={data.markets}
      selected={market}
      onSelect={(next) => void pickMarket(next)}
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
            id="figures"
            panelRef={figuresRef}
            collapsible
            collapsedSize="0%"
            defaultSize="14%"
            minSize="14%"
            maxSize="34%"
            onResize={(size) => setFiguresCollapsed(size.asPercentage < 0.5)}
          >
            <WorkspacePanel
              className="flex flex-col"
              collapsed={figuresCollapsed}
              onDoubleClick={figuresDoubleClick}
            >
              {figuresPanel}
            </WorkspacePanel>
          </ResizablePanel>
          <ResizableHandle
            gap
            collapsed={figuresCollapsed}
            className={NO_RING}
          />
          <ResizablePanel id="posts" defaultSize="70%" minSize="30%">
            <WorkspacePanel className="relative flex min-w-0 flex-1 flex-col">
              {postsPanel}
              {figuresCollapsed ? (
                <PanelReopenTab
                  side="left"
                  label="Show this creator's figures"
                  onClick={toggleFigures}
                />
              ) : null}
              {marketsCollapsed ? (
                <PanelReopenTab
                  side="right"
                  label="Show the markets they name"
                  onClick={toggleMarkets}
                />
              ) : null}
            </WorkspacePanel>
          </ResizablePanel>
          <ResizableHandle
            gap
            collapsed={marketsCollapsed}
            className={NO_RING}
          />
          <ResizablePanel
            id="markets"
            panelRef={marketsRef}
            collapsible
            collapsedSize="0%"
            defaultSize="16%"
            minSize="16%"
            maxSize="36%"
            onResize={(size) => setMarketsCollapsed(size.asPercentage < 0.5)}
          >
            <WorkspacePanel
              className="flex flex-col"
              collapsed={marketsCollapsed}
              onDoubleClick={marketsDoubleClick}
            >
              {marketsPanel}
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
              {figuresPanel}
            </WorkspacePanel>
            <WorkspacePanel className="flex h-[70vh] min-w-0 shrink-0 flex-col">
              {postsPanel}
            </WorkspacePanel>
            <WorkspacePanel className="flex h-auto shrink-0 flex-col">
              {marketsPanel}
            </WorkspacePanel>
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
