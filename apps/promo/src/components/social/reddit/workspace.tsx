import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import type { PanelImperativeHandle } from "react-resizable-panels"
import { toast } from "sonner"

import {
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { loadBrowserStatus, type BrowserStatus } from "@/lib/api/social/account"
import {
  blockRedditSubreddit,
  getBlockedErrorMessage,
  unblockRedditSubreddit,
} from "@/lib/api/social/reddit/blocked"
import {
  getDraftErrorMessage,
  sendComment,
  writeDrafts,
} from "@/lib/api/social/reddit/drafts"
import {
  getRedditErrorMessage,
  loadFind,
  loadFinds,
  loadKeywords,
  readThread,
  removeKeyword,
  runKeyword,
  saveNewKeyword,
  setFindsStatus,
} from "@/lib/api/social/reddit/keywords"
import {
  useBlankSpaceDoubleClick,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import { useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import { useWideScreen } from "@/lib/layout/wide-screen"
import {
  REDDIT_PANEL_LAYOUT_KEY,
} from "@/lib/social/reddit/options"
import { postingBlockedReason, postsWord } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { FindRow, KeywordRow } from "@/server/social/keywords"

import { AnswerPanel, type DraftView, type FindDetail } from "./answer-panel"
import { FindsPanel, type FindsTab } from "./finds-panel"
import { KeywordsPanel } from "./keywords-panel"

/**
 * The Reddit screen: find a post, read it, write the comment, send it.
 *
 * Three panels in one row, built from the same parts as the Automation Canvas
 * and the CRM rather than a second system: the sides collapse all the way to
 * nothing and leave a tab on the middle panel's edge to bring them back,
 * double-clicking a panel's blank space shuts it, the dividers drag, the
 * arrangement is remembered, and below 1280px the panels are dropped because
 * three columns on a phone is three unreadable columns.
 *
 * There is no bottom panel. The post and the comment are one piece of work and
 * live in one panel, the way the CRM reads a conversation and writes the reply
 * in one.
 *
 * Browser work never happens inside a request. A search takes tens of seconds,
 * so pressing Search writes a job and this asks what the queue is doing until
 * it empties.
 */

/** How often to ask what the queue is doing, while it is doing something. */
const POLL_MS = 2_000

export function RedditWorkspace({
  initialKeywords,
  initialStatus,
}: {
  initialKeywords: KeywordRow[]
  initialStatus: BrowserStatus
}) {
  const router = useRouter()
  const desktop = useWideScreen()

  const [keywordsCollapsed, setKeywordsCollapsed] = React.useState(false)
  const [answerCollapsed, setAnswerCollapsed] = React.useState(false)
  const keywordsPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const answerPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const layout = useRememberedPanelLayout(REDDIT_PANEL_LAYOUT_KEY)

  const toggleKeywords = usePanelToggle(keywordsPanelRef)
  const toggleAnswer = usePanelToggle(answerPanelRef)
  const keywordsDoubleClick = useBlankSpaceDoubleClick(toggleKeywords)
  const answerDoubleClick = useBlankSpaceDoubleClick(toggleAnswer)

  const [keywords, setKeywords] = React.useState(initialKeywords)
  const [status, setStatus] = React.useState(initialStatus)
  const [keywordsLoading, setKeywordsLoading] = React.useState(false)

  const [selectedKeyword, setSelectedKeyword] = React.useState<string | null>(
    initialKeywords[0]?.id ?? null
  )

  /**
   * The posts, and which keyword they belong to.
   *
   * Kept together so "still reading" can be worked out for this render rather
   * than switched on inside an effect: the rows on screen belong to a keyword,
   * and if that is not the chosen one then the chosen one's rows are still
   * coming. One piece of state, no flag to get out of step with it.
   */
  const [findsState, setFindsState] = React.useState<{
    keywordId: string | null
    rows: FindRow[]
    error: string | null
  }>({ keywordId: null, rows: [], error: null })

  const [tab, setTab] = React.useState<FindsTab>("new")
  const [selectedFind, setSelectedFind] = React.useState<string | null>(null)
  const [detailState, setDetailState] = React.useState<{
    findId: string | null
    detail: FindDetail | null
    drafts: DraftView[]
  }>({ findId: null, detail: null, drafts: [] })

  // Nothing chosen is not the same as still reading, and neither switches any
  // state on: both are worked out from what is on screen against what was
  // asked for. Rows belonging to a different keyword are simply not shown.
  const findsReady = Boolean(
    selectedKeyword && findsState.keywordId === selectedKeyword
  )
  const findsLoading = Boolean(selectedKeyword) && !findsReady
  const finds = findsReady ? findsState.rows : []
  const findsError = findsReady ? findsState.error : null

  const detailReady = Boolean(selectedFind && detailState.findId === selectedFind)
  const detailLoading = Boolean(selectedFind) && !detailReady
  const detail = detailReady ? detailState.detail : null
  const drafts = detailReady ? detailState.drafts : []

  const working = status.jobs.queued + status.jobs.running > 0

  const refreshKeywords = React.useCallback(async () => {
    setKeywordsLoading(true)
    try {
      setKeywords(await loadKeywords())
    } catch (error) {
      showErrorToast(getRedditErrorMessage(error))
    } finally {
      setKeywordsLoading(false)
    }
  }, [])

  /**
   * Reads the posts for a keyword.
   *
   * Every `setState` lands in a callback the fetch calls back into, never in
   * the body of an effect, which is the rule this app follows: an effect may
   * set state from an external system's answer and not before it.
   */
  const refreshFinds = React.useCallback(
    (keywordId: string): Promise<void> =>
      loadFinds({ keywordId, status: "all" }).then(
        (rows) => setFindsState({ keywordId, rows, error: null }),
        (error: unknown) =>
          setFindsState({
            keywordId,
            rows: [],
            error: getRedditErrorMessage(error),
          })
      ),
    []
  )

  const refreshDetail = React.useCallback(
    (findId: string): Promise<void> =>
      loadFind(findId).then(
        (found) => {
          if (!found) {
            setDetailState({ findId, detail: null, drafts: [] })
            return
          }
          setDetailState({
            findId,
            detail: {
              id: found.id,
              url: found.url,
              subreddit: found.subreddit,
              title: found.title,
              author: found.author,
              score: found.score,
              commentCount: found.commentCount,
              postedAt: found.postedAt,
              body: found.body,
              thread: found.thread,
              threadReadAt: found.threadReadAt,
            },
            drafts: found.drafts,
          })
        },
        (error: unknown) => {
          showErrorToast(getRedditErrorMessage(error))
          // Marked read even though it failed, so the panel shows its error
          // state instead of spinning on a read that is not coming.
          setDetailState({ findId, detail: null, drafts: [] })
        }
      ),
    []
  )

  // The first list, and every later one when the chosen keyword changes. The
  // guard is what keeps every `setState` inside the fetch's own callback.
  React.useEffect(() => {
    if (!selectedKeyword) return
    void refreshFinds(selectedKeyword)
  }, [refreshFinds, selectedKeyword])

  React.useEffect(() => {
    if (!selectedFind) return
    void refreshDetail(selectedFind)
  }, [refreshDetail, selectedFind])

  /**
   * Asks what the queue is doing, only while it has something in it.
   *
   * A browser job takes tens of seconds and finishes without telling anybody,
   * so the screen has to ask. When the queue empties the asking stops, which
   * is why this watches `working` rather than running a timer all day.
   */
  React.useEffect(() => {
    if (!working) return
    let live = true
    const timer = setInterval(async () => {
      try {
        const next = await loadBrowserStatus()
        if (!live) return
        setStatus(next)
        // The work has finished, so whatever it wrote is worth reading.
        if (next.jobs.queued + next.jobs.running === 0) {
          await refreshKeywords()
          if (selectedKeyword) await refreshFinds(selectedKeyword)
          if (selectedFind) await refreshDetail(selectedFind)
        }
      } catch {
        // A failed ask is not worth a toast: the next one is two seconds away
        // and the figures on screen are still the last true ones.
      }
    }, POLL_MS)

    return () => {
      live = false
      clearInterval(timer)
    }
  }, [
    working,
    refreshKeywords,
    refreshFinds,
    refreshDetail,
    selectedKeyword,
    selectedFind,
  ])

  async function afterQueueing() {
    try {
      setStatus(await loadBrowserStatus())
    } catch {
      // The job is written either way; the asking above will catch up.
    }
  }

  // Named by the queue rather than guessed. A job that reads one post's
  // replies belongs to no keyword, so reading replies no longer makes every
  // keyword card claim it is searching.
  const runningKeywords = React.useMemo(
    () => new Set(status.jobs.searchingKeywordIds),
    [status.jobs.searchingKeywordIds]
  )

  const keywordsPanel = (
    <KeywordsPanel
      keywords={keywords}
      loading={keywordsLoading}
      selectedId={selectedKeyword}
      runningIds={runningKeywords}
      onSelect={(id) => {
        setSelectedKeyword(id)
        setSelectedFind(null)
      }}
      onAdd={async (input) => {
        try {
          const { id } = await saveNewKeyword(input)
          await refreshKeywords()
          setSelectedKeyword(id)
          setSelectedFind(null)
          await runKeyword(id)
          await afterQueueing()
        } catch (error) {
          showErrorToast(getRedditErrorMessage(error))
        }
      }}
      onRun={async (id) => {
        try {
          await runKeyword(id)
          await afterQueueing()
        } catch (error) {
          showErrorToast(getRedditErrorMessage(error))
        }
      }}
      onDelete={async (id) => {
        try {
          await removeKeyword(id)
          if (selectedKeyword === id) {
            setSelectedKeyword(null)
            setSelectedFind(null)
          }
          await refreshKeywords()
          await router.invalidate()
        } catch (error) {
          showErrorToast(getRedditErrorMessage(error))
        }
      }}
    />
  )

  const chosenKeyword = keywords.find((row) => row.id === selectedKeyword)

  /** Re-reads the list and the keyword counts after a block or an unblock. */
  async function afterBlockChange() {
    if (selectedKeyword) await refreshFinds(selectedKeyword)
    await refreshKeywords()
  }

  async function blockSubreddit(subreddit: string) {
    try {
      const answer = await blockRedditSubreddit(subreddit)
      // The open post is leaving the list with the rest of its subreddit,
      // unless it has been replied to, which is never hidden.
      const open = finds.find((row) => row.id === selectedFind)
      if (
        open &&
        open.subreddit.toLowerCase() === answer.subreddit.toLowerCase() &&
        open.status !== "commented"
      ) {
        setSelectedFind(null)
      }
      await afterBlockChange()
      toast.success(
        `r/${answer.subreddit} blocked. ${postsWord(answer.hidden)} hidden.`,
        {
          action: {
            label: "Undo",
            onClick: () => void unblockSubreddit(answer.subreddit),
          },
        }
      )
    } catch (error) {
      showErrorToast(getBlockedErrorMessage(error))
    }
  }

  async function unblockSubreddit(subreddit: string) {
    try {
      const answer = await unblockRedditSubreddit(subreddit)
      await afterBlockChange()
      toast.success(`r/${answer.subreddit} unblocked. ${postsWord(answer.restored)} back.`)
    } catch (error) {
      showErrorToast(getBlockedErrorMessage(error))
    }
  }

  const findsPanel = (
    <FindsPanel
      keywordTerm={chosenKeyword?.term ?? null}
      tab={tab}
      onTabChange={(next) => {
        setTab(next)
        // The open post may not be in the tab being switched to, and a panel
        // showing a post the list no longer lists is the kind of mismatch
        // nobody can explain afterwards.
        setSelectedFind(null)
      }}
      finds={finds}
      loading={findsLoading}
      error={findsError}
      selectedId={selectedFind}
      onSelect={setSelectedFind}
      onRetry={() => {
        if (selectedKeyword) void refreshFinds(selectedKeyword)
      }}
      onBlock={blockSubreddit}
      onSkip={async (findIds) => {
        try {
          if (findIds.includes(selectedFind ?? "")) setSelectedFind(null)
          const answer = await setFindsStatus(findIds, "skipped")
          if (selectedKeyword) await refreshFinds(selectedKeyword)
          await refreshKeywords()
          if (answer.skipped.length) {
            showErrorToast(
              `${answer.completed.length} skipped. ${answer.skipped.length} were left alone because they have already been commented on.`
            )
          }
        } catch (error) {
          showErrorToast(getRedditErrorMessage(error))
        }
      }}
    />
  )

  const answerPanel = (
    <AnswerPanel
      find={detail}
      handle={status.handle}
      drafts={drafts}
      loading={detailLoading}
      working={working}
      disabledReason={postingBlockedReason(status, detail)}
      voiceName={status.voice?.name ?? null}
      // Only the narrow layout, where the post covers the list. Clears the
      // chosen post and nothing else, so the keyword and the tab stay put.
      onBack={desktop ? undefined : () => setSelectedFind(null)}
      onRead={async (findId: string) => {
        try {
          await readThread(findId)
          await afterQueueing()
        } catch (error) {
          showErrorToast(getRedditErrorMessage(error))
        }
      }}
      onDraft={async (findId: string) => {
        try {
          const written = await writeDrafts({ findId })
          // A draft is born unsent. The endpoint does not say so because there
          // is nothing else it could be.
          setDetailState((current) => ({
            ...current,
            drafts: [
              ...written.map((draft) => ({ ...draft, status: "draft" })),
              ...current.drafts,
            ],
          }))
        } catch (error) {
          showErrorToast(getDraftErrorMessage(error))
        }
      }}
      onPost={async (input) => {
        try {
          await sendComment(input)
          await afterQueueing()
        } catch (error) {
          showErrorToast(getDraftErrorMessage(error))
        }
      }}
      onSkip={async (findId: string) => {
        try {
          // Closed before the request, not after: the post is leaving this tab
          // either way, and waiting would leave it on screen for a moment
          // after it had gone from the list.
          setSelectedFind(null)
          await setFindsStatus([findId], "skipped")
          if (selectedKeyword) await refreshFinds(selectedKeyword)
          await refreshKeywords()
        } catch (error) {
          showErrorToast(getRedditErrorMessage(error))
        }
      }}
    />
  )

  if (!desktop) {
    // Under 1280px the panels are dropped, exactly as the editors do it. The
    // post takes the screen once one is picked, and the list is what shows
    // until then. Keywords stay above the list, where they are the way in.
    // The arrow on the post's header is the way back to the list.
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <WorkspacePanel className="flex min-w-0 flex-1 flex-col">
          {selectedFind ? answerPanel : keywordsPanel}
        </WorkspacePanel>
        {selectedFind ? null : (
          <WorkspacePanel className="flex min-w-0 flex-1 flex-col">
            {findsPanel}
          </WorkspacePanel>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ResizablePanelGroup
        key={layout.layoutKey}
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={layout.defaultLayout}
        onLayoutChanged={layout.onLayoutChanged}
      >
        <ResizablePanel
          id="keywords"
          panelRef={keywordsPanelRef}
          collapsible
          collapsedSize="0%"
          // Opens at its narrowest, so the posts get the room. Tyler, 6 Oct
          // 2026: each side panel's default is its minimum width.
          defaultSize="15%"
          minSize="15%"
          maxSize="32%"
          onResize={(size) => setKeywordsCollapsed(size.asPercentage < 0.5)}
        >
          <WorkspacePanel
            className="flex flex-col"
            collapsed={keywordsCollapsed}
            onDoubleClick={keywordsDoubleClick}
          >
            {keywordsPanel}
          </WorkspacePanel>
        </ResizablePanel>

        <ResizableHandle gap collapsed={keywordsCollapsed} />

        <ResizablePanel id="finds" defaultSize="61%" minSize="30%">
          <WorkspacePanel className="relative flex flex-col">
            {findsPanel}
            {keywordsCollapsed ? (
              <PanelReopenTab
                side="left"
                label="Show the keywords"
                onClick={toggleKeywords}
              />
            ) : null}
            {answerCollapsed ? (
              <PanelReopenTab
                side="right"
                label="Show the post and your comment"
                onClick={toggleAnswer}
              />
            ) : null}
          </WorkspacePanel>
        </ResizablePanel>

        <ResizableHandle gap collapsed={answerCollapsed} />

        <ResizablePanel
          id="answer"
          panelRef={answerPanelRef}
          collapsible
          collapsedSize="0%"
          defaultSize="24%"
          minSize="24%"
          maxSize="50%"
          onResize={(size) => setAnswerCollapsed(size.asPercentage < 0.5)}
        >
          <WorkspacePanel
            className="flex flex-col"
            collapsed={answerCollapsed}
            onDoubleClick={answerDoubleClick}
          >
            {answerPanel}
          </WorkspacePanel>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
