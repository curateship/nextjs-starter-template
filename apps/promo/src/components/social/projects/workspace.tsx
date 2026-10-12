import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import type { PanelImperativeHandle } from "react-resizable-panels"
import { toast } from "sonner"

import { AnswerPanel, type DraftView, type FindDetail } from "@/components/social/reddit/answer-panel"
import { FindsPanel, type FindsTab } from "@/components/social/reddit/finds-panel"
import { KeywordsPanel } from "@/components/social/reddit/keywords-panel"
import {
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import {
  getProjectErrorMessage,
  loadProject,
  putAccountInProject,
  takeAccountOutOfProject,
  type ProjectSummary,
  type ProjectView,
} from "@/lib/api/social/projects"
import {
  blockRedditSubreddit,
  getBlockedErrorMessage,
  unblockRedditSubreddit,
} from "@/lib/api/social/reddit/blocked"
import {
  cancelComment,
  getDraftErrorMessage,
  getPostErrorMessage,
  sendComment,
  writeDrafts,
} from "@/lib/api/social/reddit/drafts"
import {
  getRedditErrorMessage,
  loadFind,
  loadFinds,
  loadKeywords,
  readSubredditRules,
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
  EVERYTHING,
  PROJECTS_MIDDLE_LAYOUT_KEY,
  PROJECTS_PANEL_LAYOUT_KEY,
} from "@/lib/social/reddit/options"
import {
  keywordTitle,
  postingBlockedReason,
  postsWord,
  waitingCommentText,
} from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { FindRow, KeywordRow } from "@/server/social/keywords"

import { ProjectDialogs, type ProjectDialog } from "./project-dialogs"
import { ProjectPanel } from "./project-panel"

/**
 * The Projects dashboard: one project's description and accounts, its
 * keywords and the posts they found, and the post being answered.
 *
 * Tyler, 12 Oct 2026: "Left panel holds project discription, under it shows
 * all the accounts under this project. Clicking on the account opens up in the
 * middle panel to search for keywords and showing all the posts and the right
 * col shows the post and comment box".
 *
 * Three columns in one row, the Reddit dashboard's layout carried over whole:
 * the sides collapse all the way to nothing and leave a tab on the middle
 * column's edge to bring them back, double-clicking a side's blank space shuts
 * it, the dividers drag, the arrangement is remembered, and below 1280px the
 * columns stack because three columns on a phone is three unreadable columns.
 * The middle column holds the keywords above the posts, split by a divider of
 * its own that is remembered too.
 *
 * Keywords belong to the project, so the middle column is the same whichever
 * account is clicked. The account only changes who comments: Post sends from
 * it, every rule that guards Post follows it, and with none clicked Post says
 * to pick one. Nothing here picks an account for the person or posts by
 * itself.
 *
 * Browser work never happens inside a request. A search takes tens of seconds,
 * so pressing Search writes a job and this asks what the queue is doing until
 * it empties.
 */

/** How often to ask what the queue is doing, while it is doing something. */
const POLL_MS = 2_000

/**
 * The most posts one list reads, the endpoint's own ceiling. Everything gathers
 * every keyword's posts, so the endpoint's default of 100 would cut it short
 * after a few days, with the tab counts quietly short with it.
 */
const FINDS_LIMIT = 500

export function ProjectsWorkspace({
  projects,
  initialView,
  initialKeywords,
}: {
  projects: ProjectSummary[]
  initialView: ProjectView
  initialKeywords: KeywordRow[]
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const desktop = useWideScreen()
  const projectId = initialView.project.id

  const [projectCollapsed, setProjectCollapsed] = React.useState(false)
  const [answerCollapsed, setAnswerCollapsed] = React.useState(false)
  const projectPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const answerPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const layout = useRememberedPanelLayout(PROJECTS_PANEL_LAYOUT_KEY)
  const middleLayout = useRememberedPanelLayout(PROJECTS_MIDDLE_LAYOUT_KEY)

  const toggleProject = usePanelToggle(projectPanelRef)
  const toggleAnswer = usePanelToggle(answerPanelRef)
  const projectDoubleClick = useBlankSpaceDoubleClick(toggleProject)
  const answerDoubleClick = useBlankSpaceDoubleClick(toggleAnswer)

  const [view, setView] = React.useState(initialView)
  const [keywords, setKeywords] = React.useState(initialKeywords)
  const [keywordsLoading, setKeywordsLoading] = React.useState(false)
  const [dialog, setDialog] = React.useState<ProjectDialog>(null)

  /**
   * The account clicked on the left, whose comment Post sends. Nothing is
   * clicked to begin with, because picking one for the person is the one
   * thing this column must not do.
   */
  const [rawAccountId, setAccountId] = React.useState<string | null>(null)
  const account = view.accounts.find((row) => row.id === rawAccountId) ?? null

  /**
   * A keyword's id, or `EVERYTHING`: every keyword's posts in one ranked
   * order. Everything is chosen whenever nothing else is, because the morning
   * question is what to answer, not what one saved search found.
   */
  const [selectedKeyword, setSelectedKeyword] = React.useState<string>(EVERYTHING)

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

  // Still reading is worked out from what is on screen against what was asked
  // for, rather than switched on. Rows belonging to a different list are
  // simply not shown.
  const findsReady = findsState.keywordId === selectedKeyword
  const findsLoading = !findsReady
  const finds = findsReady ? findsState.rows : []
  const findsError = findsReady ? findsState.error : null

  const detailReady = Boolean(selectedFind && detailState.findId === selectedFind)
  const detailLoading = Boolean(selectedFind) && !detailReady
  const detail = detailReady ? detailState.detail : null
  const drafts = detailReady ? detailState.drafts : []

  const working = view.jobs.queued + view.jobs.running > 0

  const refreshView = React.useCallback(async () => {
    try {
      setView(await loadProject(projectId))
    } catch (error) {
      showErrorToast(getProjectErrorMessage(error))
    }
  }, [projectId])

  const refreshKeywords = React.useCallback(async () => {
    setKeywordsLoading(true)
    try {
      setKeywords(await loadKeywords(projectId))
    } catch (error) {
      showErrorToast(getRedditErrorMessage(error))
    } finally {
      setKeywordsLoading(false)
    }
  }, [projectId])

  /**
   * Reads the posts for a keyword, or for every keyword in the project when
   * Everything is chosen.
   *
   * Every `setState` lands in a callback the fetch calls back into, never in
   * the body of an effect, which is the rule this app follows: an effect may
   * set state from an external system's answer and not before it.
   */
  const refreshFinds = React.useCallback(
    (keywordId: string): Promise<void> =>
      loadFinds({
        projectId,
        keywordId: keywordId === EVERYTHING ? undefined : keywordId,
        status: "all",
        limit: FINDS_LIMIT,
      }).then(
        (rows) => setFindsState({ keywordId, rows, error: null }),
        (error: unknown) =>
          setFindsState({
            keywordId,
            rows: [],
            error: getRedditErrorMessage(error),
          })
      ),
    [projectId]
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
              linkUrl: found.linkUrl,
              linkPage: found.linkPage,
              linkReadAt: found.linkReadAt,
              linkError: found.linkError,
              thread: found.thread,
              threadReadAt: found.threadReadAt,
              rules: found.rules,
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
    // Listed only because the React Compiler would not keep the memo without it.
    [setDetailState]
  )

  // The first list, and every later one when the chosen keyword changes. The
  // guard is what keeps every `setState` inside the fetch's own callback.
  React.useEffect(() => {
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
        const next = await loadProject(projectId)
        if (!live) return
        setView(next)
        // The work has finished, so whatever it wrote is worth reading.
        if (next.jobs.queued + next.jobs.running === 0) {
          await refreshKeywords()
          await refreshFinds(selectedKeyword)
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
    projectId,
    refreshKeywords,
    refreshFinds,
    refreshDetail,
    selectedKeyword,
    selectedFind,
  ])

  async function afterQueueing() {
    try {
      setView(await loadProject(projectId))
    } catch {
      // The job is written either way; the asking above will catch up.
    }
  }

  // Named by the queue rather than guessed. A job that reads one post's
  // replies belongs to no keyword, so reading replies never makes every
  // keyword card claim it is searching.
  const runningKeywords = React.useMemo(
    () => new Set(view.jobs.searchingKeywordIds),
    [view.jobs.searchingKeywordIds]
  )

  /** The picker's new name, read again so it says what was typed. */
  const afterRename = React.useCallback(() => {
    void router.invalidate()
  }, [router])

  const projectPanel = (
    <ProjectPanel
      projects={projects}
      view={view}
      selectedAccountId={account?.id ?? null}
      onSelectProject={(next) =>
        void navigate({ to: "/admin/projects/$projectId", params: { projectId: next } })
      }
      onSelectAccount={setAccountId}
      onNewProject={() => setDialog({ kind: "new" })}
      onDeleteProject={() => setDialog({ kind: "delete", project: view.project })}
      onAddAccount={async (accountId) => {
        try {
          await putAccountInProject(projectId, accountId)
          await refreshView()
        } catch (error) {
          showErrorToast(getProjectErrorMessage(error))
        }
      }}
      onRemoveAccount={async (accountId) => {
        try {
          await takeAccountOutOfProject(accountId)
          if (accountId === rawAccountId) setAccountId(null)
          await refreshView()
        } catch (error) {
          showErrorToast(getProjectErrorMessage(error))
        }
      }}
      onSaved={afterRename}
    />
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
          const { id } = await saveNewKeyword({ ...input, projectId })
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
          // The open post goes with its keyword, wherever it is listed.
          if (finds.some((row) => row.id === selectedFind && row.keywordId === id)) {
            setSelectedFind(null)
          }
          if (selectedKeyword === id) {
            setSelectedKeyword(EVERYTHING)
            setSelectedFind(null)
          } else if (selectedKeyword === EVERYTHING) {
            // Everything stays chosen, so nothing else re-reads it, and the
            // removed keyword's posts would stay listed.
            await refreshFinds(EVERYTHING)
          }
          await refreshKeywords()
        } catch (error) {
          showErrorToast(getRedditErrorMessage(error))
        }
      }}
    />
  )

  const chosenKeyword = keywords.find((row) => row.id === selectedKeyword)

  const keywordNames = React.useMemo(
    () => new Map(keywords.map((row) => [row.id, keywordTitle(row)])),
    [keywords]
  )

  /** Re-reads the list and the keyword counts after a block or an unblock. */
  async function afterBlockChange() {
    await refreshFinds(selectedKeyword)
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
      keyword={chosenKeyword ?? null}
      keywordNames={keywordNames}
      hasKeywords={keywords.length > 0}
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
      onRetry={() => void refreshFinds(selectedKeyword)}
      onBlock={blockSubreddit}
      onSkip={async (findIds) => {
        try {
          if (findIds.includes(selectedFind ?? "")) setSelectedFind(null)
          const answer = await setFindsStatus(findIds, "skipped")
          await refreshFinds(selectedKeyword)
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

  const handle = account?.handle || null

  const answerPanel = (
    <AnswerPanel
      find={detail}
      handle={handle}
      drafts={drafts}
      loading={detailLoading}
      working={working}
      disabledReason={postingBlockedReason(account, detail)}
      postingState={account?.posting ?? null}
      voiceName={account?.voice?.name ?? null}
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
      onReadRules={async (findId: string) => {
        try {
          await readSubredditRules(findId)
          await afterQueueing()
          // The read is queued, so the line says it is coming.
          await refreshDetail(findId)
        } catch (error) {
          showErrorToast(getRedditErrorMessage(error))
        }
      }}
      onDraft={async (findId: string) => {
        try {
          const written = await writeDrafts({ findId, accountId: account?.id ?? null })
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
          const { runAfter } = await sendComment({ ...input, accountId: account?.id ?? null })
          await afterQueueing()
          if (runAfter) toast.success(waitingCommentText(runAfter, handle))
        } catch (error) {
          showErrorToast(getPostErrorMessage(error))
          // A refusal may come from figures that moved since the last look.
          await afterQueueing()
        }
      }}
      onCancelWaiting={async (findId: string) => {
        try {
          await cancelComment(findId)
          toast.success("Cancelled. Nothing was sent.")
        } catch (error) {
          showErrorToast(getPostErrorMessage(error))
        }
        await afterQueueing()
      }}
      onSkip={async (findId: string) => {
        try {
          // Closed before the request, not after: the post is leaving this tab
          // either way, and waiting would leave it on screen for a moment
          // after it had gone from the list.
          setSelectedFind(null)
          await setFindsStatus([findId], "skipped")
          await refreshFinds(selectedKeyword)
          await refreshKeywords()
        } catch (error) {
          showErrorToast(getRedditErrorMessage(error))
        }
      }}
    />
  )

  const dialogs = <ProjectDialogs dialog={dialog} onClose={() => setDialog(null)} />

  if (!desktop) {
    // Under 1280px the columns are dropped, exactly as the editors do it. The
    // post takes the screen once one is picked, and the project, its
    // keywords and its posts are what show until then, one above the next.
    // The arrow on the post's header is the way back.
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {selectedFind ? (
          <WorkspacePanel className="flex min-w-0 flex-1 flex-col">{answerPanel}</WorkspacePanel>
        ) : (
          <>
            <WorkspacePanel className="flex min-w-0 flex-1 flex-col">{projectPanel}</WorkspacePanel>
            <WorkspacePanel className="flex min-w-0 flex-1 flex-col">{keywordsPanel}</WorkspacePanel>
            <WorkspacePanel className="flex min-w-0 flex-[2] flex-col">{findsPanel}</WorkspacePanel>
          </>
        )}
        {dialogs}
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
          id="project"
          panelRef={projectPanelRef}
          collapsible
          collapsedSize="0%"
          // Opens at its narrowest, so the posts get the room. Tyler, 6 Oct
          // 2026: each side panel's default is its minimum width.
          defaultSize="18%"
          minSize="18%"
          maxSize="32%"
          onResize={(size) => setProjectCollapsed(size.asPercentage < 0.5)}
        >
          <WorkspacePanel
            className="flex flex-col"
            collapsed={projectCollapsed}
            onDoubleClick={projectDoubleClick}
          >
            {projectPanel}
          </WorkspacePanel>
        </ResizablePanel>

        <ResizableHandle gap collapsed={projectCollapsed} />

        <ResizablePanel id="middle" defaultSize="58%" minSize="30%">
          <div className="relative flex h-full min-h-0 flex-col">
            <ResizablePanelGroup
              key={middleLayout.layoutKey}
              orientation="vertical"
              className="min-h-0 flex-1"
              defaultLayout={middleLayout.defaultLayout}
              onLayoutChanged={middleLayout.onLayoutChanged}
            >
              <ResizablePanel id="keywords" defaultSize="38%" minSize="20%" maxSize="70%">
                <WorkspacePanel className="flex flex-col">{keywordsPanel}</WorkspacePanel>
              </ResizablePanel>
              <ResizableHandle gap />
              <ResizablePanel id="finds" defaultSize="62%" minSize="30%">
                <WorkspacePanel className="flex flex-col">{findsPanel}</WorkspacePanel>
              </ResizablePanel>
            </ResizablePanelGroup>
            {projectCollapsed ? (
              <PanelReopenTab
                side="left"
                label="Show the project and its accounts"
                onClick={toggleProject}
              />
            ) : null}
            {answerCollapsed ? (
              <PanelReopenTab
                side="right"
                label="Show the post and your comment"
                onClick={toggleAnswer}
              />
            ) : null}
          </div>
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
      {dialogs}
    </div>
  )
}
