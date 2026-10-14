import * as React from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"
import { Link } from "@tanstack/react-router"
import { AlertTriangleIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { AnswerPanel, type DraftView, type FindDetail } from "@/components/social/reddit/answer-panel"
import { FindsPanel, FindsSearch, type FindsTab } from "@/components/social/reddit/finds-panel"
import { KeywordsBar } from "@/components/social/reddit/keywords-panel"
import { Button } from "@/components/ui/button"
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
  pauseProject,
  putAccountInProject,
  takeAccountOutOfProject,
  type ProjectView,
} from "@/lib/api/social/projects"
import {
  blockRedditSubreddit,
  getBlockedErrorMessage,
  unblockRedditSubreddit,
} from "@/lib/api/social/reddit/blocked"
import {
  cancelComment,
  checkRules,
  getDraftErrorMessage,
  getPostErrorMessage,
  rewriteWords,
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
  switchKeyword,
} from "@/lib/api/social/reddit/keywords"
import {
  useBlankSpaceDoubleClick,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import { useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { EVERYTHING, PROJECTS_PANEL_LAYOUT_KEY } from "@/lib/social/reddit/options"
import {
  keywordTitle,
  postButtonWords,
  postingBlockedReason,
  postsWord,
  waitingCommentText,
} from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { FindRow, KeywordRow } from "@/server/social/keywords"

import { loadFailedPost } from "@/lib/api/social/reddit/own-posts"

import { NewPostDialog, type NewPostStart } from "./new-post-dialog"
import { ProjectDialogs, type ProjectDialog } from "./project-dialogs"
import { ProjectPanel } from "./project-panel"
import { PromoThreadsDialog } from "./promo-threads"

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
 * Since Tyler's design of 13 Oct 2026 the middle column is one card: the
 * keywords as chips across its top with the column's buttons, then the posts.
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
  initialView,
  initialKeywords,
  openPostId,
  retry,
  newPostRetryId,
}: {
  initialView: ProjectView
  initialKeywords: KeywordRow[]
  /** A post to open as the page opens, from a link. */
  openPostId: string | null
  /**
   * A failed comment's words, put back in the box for its post, with the
   * account that tried, from Try again on the Comments screen. Never sent.
   */
  retry: { findId: string; text: string; accountId: string | null } | null
  /** A failed post of your own, whose words New post opens with. */
  newPostRetryId: string | null
}) {
  const desktop = useWideScreen()
  const projectId = initialView.project.id

  const [projectCollapsed, setProjectCollapsed] = React.useState(false)
  const [answerCollapsed, setAnswerCollapsed] = React.useState(false)
  const projectPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const answerPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const layout = useRememberedPanelLayout(PROJECTS_PANEL_LAYOUT_KEY)

  const toggleProject = usePanelToggle(projectPanelRef)
  const toggleAnswer = usePanelToggle(answerPanelRef)
  const projectDoubleClick = useBlankSpaceDoubleClick(toggleProject)
  const answerDoubleClick = useBlankSpaceDoubleClick(toggleAnswer)

  const [view, setView] = React.useState(initialView)
  const [keywords, setKeywords] = React.useState(initialKeywords)
  const [keywordsLoading, setKeywordsLoading] = React.useState(false)
  const [dialog, setDialog] = React.useState<ProjectDialog>(null)
  /** The New post window: shut, or open with what it starts with. */
  const [newPost, setNewPost] = React.useState<{ start: NewPostStart | null } | null>(null)

  // A failed post's words, for Try again from the Comments screen's Failed
  // tab: read once, then New post opens with them. Nothing is sent.
  React.useEffect(() => {
    if (!newPostRetryId) return
    let live = true
    loadFailedPost(newPostRetryId).then(
      (failed) => {
        if (!live) return
        if (!failed) {
          showErrorToast("That post is not a failed one any more, so there is nothing to try again.")
          return
        }
        setNewPost({ start: failed })
      },
      () => {
        if (live) showErrorToast("That post's words could not be read. Please try again.")
      }
    )
    return () => {
      live = false
    }
  }, [newPostRetryId])

  /**
   * The account clicked on the left, whose comment Post sends. Nothing is
   * clicked to begin with, because picking one for the person is the one
   * thing this column must not do.
   */
  const [rawAccountId, setAccountId] = React.useState<string | null>(retry?.accountId ?? null)
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
  /**
   * The posts' search box, in the keywords row. Kept while the keyword or the
   * tab changes, since the words are still in the box to see and clear.
   */
  const [findSearch, setFindSearch] = React.useState("")
  /** The Self-promotion threads window, opened from the "⋮" menu in the posts column. */
  const [threadsOpen, setThreadsOpen] = React.useState(false)
  const [selectedFind, setSelectedFind] = React.useState<string | null>(openPostId)
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
              threadReading: found.threadReading,
              rules: found.rules,
              pastAnswers: found.pastAnswers,
              removals: found.removals,
              helpAccountId: found.helpAccountId,
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
    /** The jobs left at the last ask, so a finished one is noticed. */
    let lastLeft: number | null = null
    const timer = setInterval(async () => {
      try {
        const next = await loadProject(projectId)
        if (!live) return
        setView(next)
        // A job has finished, so whatever it wrote is worth reading. Not only
        // when the queue empties: a search is followed by reply reads and
        // rules reads that take minutes, and its posts, and each post's
        // replies, should show as they land.
        const left = next.jobs.queued + next.jobs.running
        const finished = left === 0 || (lastLeft !== null && left < lastLeft)
        lastLeft = left
        if (finished) {
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

  /** The project's words or picture were saved, so its header says the new ones. */
  const afterRename = React.useCallback(() => {
    void refreshView()
  }, [refreshView])

  const projectPanel = (
    <ProjectPanel
      view={view}
      selectedAccountId={account?.id ?? null}
      onSelectAccount={setAccountId}
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
    <KeywordsBar
      projectId={projectId}
      keywords={keywords}
      loading={keywordsLoading}
      selectedId={selectedKeyword}
      runningIds={runningKeywords}
      stalled={!view.jobs.programRunning}
      search={<FindsSearch value={findSearch} onChange={setFindSearch} />}
      actions={
        <Button type="button" onClick={() => setNewPost({ start: null })}>
          <PlusIcon />
          Create post
        </Button>
      }
      onThreads={() => setThreadsOpen(true)}
      onSelect={(id) => {
        setSelectedKeyword(id ?? EVERYTHING)
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
      onAddIdea={async (idea) => {
        try {
          const { id } = await saveNewKeyword(
            "term" in idea
              ? { term: idea.term, subreddits: [], sort: "relevance", timeWindow: "week", projectId }
              : { term: "", subreddits: [idea.subreddit], sort: "new", timeWindow: "week", projectId }
          )
          await refreshKeywords()
          await runKeyword(id)
          await afterQueueing()
        } catch (error) {
          showErrorToast(getRedditErrorMessage(error))
          throw error
        }
      }}
      onSwitch={async (id, enabled) => {
        try {
          await switchKeyword(id, enabled)
          await refreshKeywords()
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

  /**
   * Said above the posts while jobs wait and the browser program is not
   * running, because nothing else on this dashboard can tell a search that
   * is coming from one that never will. Tyler, 13 Oct 2026.
   */
  const stalledNotice =
    !view.jobs.programRunning && view.jobs.queued > 0 ? (
      <p className="flex shrink-0 items-start gap-2 border-b px-3 py-2 text-sm text-destructive">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          The browser program is not running, so {view.jobs.queued}{" "}
          {view.jobs.queued === 1 ? "job is" : "jobs are"} waiting and nothing is searched.{" "}
          <Link to="/admin/jobs" className="font-medium underline underline-offset-2">
            See the jobs
          </Link>
        </span>
      </p>
    ) : null

  const findsPanel = (
    <FindsPanel
      searchText={findSearch}
      everything={selectedKeyword === EVERYTHING}
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
      prefill={retry}
      handle={handle}
      postWords={postButtonWords(account)}
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
          // The read is queued, so the replies say they are coming.
          await refreshDetail(findId)
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
      onCheckRules={async (findId, text) => {
        try {
          return await checkRules({ findId, accountId: account?.id ?? null, text })
        } catch (error) {
          showErrorToast(getDraftErrorMessage(error))
          return null
        }
      }}
      onRewrite={async (findId, text, how) => {
        try {
          return await rewriteWords({ findId, accountId: account?.id ?? null, text, how })
        } catch (error) {
          showErrorToast(getDraftErrorMessage(error))
          return null
        }
      }}
      onPost={async (input) => {
        try {
          const { runAfter, undoUntil } = await sendComment({ ...input, accountId: account?.id ?? null })
          await afterQueueing()
          if (runAfter) toast.success(waitingCommentText(runAfter, handle))
          // The queue does not count a job that is not due yet, so nothing
          // would ask again once the ten seconds are up. This asks once
          // then, and the asking carries on while the comment is sent.
          if (undoUntil) {
            setTimeout(() => void afterQueueing(), new Date(undoUntil).getTime() - Date.now() + 1_000)
          }
          return { undoUntil }
        } catch (error) {
          showErrorToast(getPostErrorMessage(error))
          // A refusal may come from figures that moved since the last look.
          await afterQueueing()
          return null
        }
      }}
      onUndo={async (findId) => {
        try {
          await cancelComment(findId)
          toast.success("Taken back. Nothing was sent.")
          await afterQueueing()
          return true
        } catch (error) {
          showErrorToast(getPostErrorMessage(error))
          await afterQueueing()
          return false
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

  const dialogs = (
    <>
      <ProjectDialogs dialog={dialog} onClose={() => setDialog(null)} />
      <PromoThreadsDialog
        // Keyed by the project, so another project's threads never show.
        key={`threads-${projectId}`}
        projectId={projectId}
        open={threadsOpen}
        onClose={() => setThreadsOpen(false)}
        onOpen={setSelectedFind}
      />
      <NewPostDialog
        open={newPost !== null}
        projectId={projectId}
        accounts={view.accounts}
        start={newPost?.start ?? null}
        onClose={() => {
          setNewPost(null)
          void refreshView()
        }}
      />
    </>
  )

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
            <WorkspacePanel className="flex min-w-0 flex-[2] flex-col">
              {keywordsPanel}
              {stalledNotice}
              {findsPanel}
            </WorkspacePanel>
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
            <WorkspacePanel className="flex min-h-0 flex-1 flex-col">
              {keywordsPanel}
              {stalledNotice}
              {findsPanel}
            </WorkspacePanel>
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
