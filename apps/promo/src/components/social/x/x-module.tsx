import * as React from "react"
import { Link } from "@tanstack/react-router"
import { AlertTriangleIcon, MoonIcon, PauseIcon } from "lucide-react"

import { usePromoGuest } from "@/components/social/guest/guest-mode"
import { ProjectColumns } from "@/components/social/projects/project-columns"
import { JobsWindow } from "@/components/social/reddit/jobs-window"
import {
  changeXHidden,
  getXErrorMessage,
  loadXCommunities,
  loadXFindDetail,
  loadXFinds,
  loadXModule,
  loadXPosts,
  loadXReplies,
  loadXToday,
  setXStatus,
  type XCommunityView,
  type XFindDetail,
  type XFindView,
  type XMentionView,
  type XModuleView,
  type XPostsTab,
  type XReplyView,
  type XToday,
} from "@/lib/api/social/x"
import { getProjectErrorMessage, putAccountInProject, takeAccountOutOfProject } from "@/lib/api/social/projects"
import { useWideScreen } from "@/lib/layout/wide-screen"
import type { Side } from "@/lib/social/sides"
import { X_COMMENT_VIEWS, X_POST_VIEWS, X_VIEW_WORDS, type XView } from "@/lib/social/x/options"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { XAccountPicker } from "./x-account-picker"
import { XCommunitiesList, XCommunityPanel } from "./x-communities"
import { XFindPanel } from "./x-find-panel"
import { XFinds, XFindSearch } from "./x-finds"
import { XKeywords } from "./x-keywords"
import { XPostPanel, XPostsList } from "./x-posts"
import { XMentionPanel, XMentionsList, XRepliesList, XReplyPanel } from "./x-replies"
import { XTodayList } from "./x-today"
import { ProjectBackButton } from "@/components/social/projects/project-back"

/** How often to ask what the queue is doing, while it is doing something. */
const POLL_MS = 2_000

/** How often to look whether the browser program has started, while jobs wait for it. */
const IDLE_POLL_MS = 10_000

/** How long the search box waits after the last key before asking. */
const SEARCH_WAIT_MS = 300

/**
 * What the X module keeps in the address: its tab (`?tab=`, none is the
 * side's first tab), the record open in the right column (`?open=<id>`), the
 * Sent tab's Failed list (`?list=failed`), the Jobs window, and on the
 * Commenting the picked keyword (`?keyword=<id>`).
 */
export type XSearch = {
  tab?: XView
  open?: string
  list?: "failed"
  window?: "jobs"
  keyword?: string
}

type FindTab = "new" | "replied" | "skipped"

function isFindTab(tab: XView): tab is FindTab {
  return tab === "new" || tab === "replied" || tab === "skipped"
}

/**
 * X as a module (`workspace/tasks/X/01-x-features.md`): what fills the middle
 * and right columns when X is picked in a left column. Built as Medium's
 * module is. It draws one of two sides
 * (`workspace/tasks/Projects/commenting-dashboard.md`):
 *
 * - **posts**, on a project's dashboard: Posts, the accounts' own posts,
 *   threads, quotes and lists (parts 29 to 36); Replies, the posts naming the
 *   accounts, which is where people answer them (part 39); and Communities
 *   (part 35).
 * - **commenting**, on a network's Commenting: the keyword row (parts 9 to
 *   16), the notices about the search accounts that do all of X's reading
 *   (parts 3 to 5), then To look at, Replied and Skipped, the posts the
 *   keywords found; Today (part 20); and Sent, what went out and what failed
 *   (parts 37, 38 and 40). With no post picked, the first one opens.
 *
 * A link from one side to a tab of the other goes through `onSearch`, which
 * switches to the other row. The right column is whatever is
 * open.
 *
 * Every reply, quote, post, edit and delete is a job a person pressed for,
 * run once in the account's own browser or on its phone. A guest sent from
 * Project does not work X.
 */
export function XModule({
  side,
  projectId,
  left,
  dialogs,
  search,
  onSearch,
  onProjectChanged,
}: {
  side: Side
  projectId: string
  left: React.ReactNode
  dialogs: React.ReactNode
  search: XSearch
  onSearch: (patch: XSearch) => void
  /** Reads the project again, so the left column's X count follows. */
  onProjectChanged: () => Promise<void>
}) {
  const desktop = useWideScreen()
  const guest = usePromoGuest()
  const views: readonly XView[] = side === "commenting" ? X_COMMENT_VIEWS : X_POST_VIEWS
  const firstTab = views[0]
  const tab: XView = search.tab && views.includes(search.tab) ? search.tab : firstTab
  // Commenting leaves To look at out of the address. Your posts always name
  // their tab, so an old address with an open record and no tab can only be
  // a post found by search, and the project's page sends it to Commenting.
  const dropTab = (item: string) => side === "commenting" && item === firstTab
  const open = search.open ?? null
  const repliesList = search.list === "failed" ? "failed" : "sent"

  const [view, setView] = React.useState<XModuleView | null>(null)
  const [viewError, setViewError] = React.useState<string | null>(null)
  const keywordId = search.keyword ?? null
  const [accountId, setAccountId] = React.useState<string | null>(null)
  const [typed, setTyped] = React.useState("")
  const [words, setWords] = React.useState("")
  const [list, setList] = React.useState<{
    /** Which tab, keyword, search and list these rows are for. Another key means they are on their way. */
    key: string
    error: string | null
    finds: XFindView[]
    replies: XReplyView[]
    mentions: XMentionView[]
    posts: XPostsTab | null
    communities: XCommunityView[]
    today: XToday | null
  }>({ key: "", error: null, finds: [], replies: [], mentions: [], posts: null, communities: [], today: null })
  const [detail, setDetail] = React.useState<{ id: string; find: XFindDetail | null }>({ id: "", find: null })

  // The search box asks once the typing stops.
  React.useEffect(() => {
    const timer = setTimeout(() => setWords(typed.trim()), SEARCH_WAIT_MS)
    return () => clearTimeout(timer)
  }, [typed])

  const listKey = `${tab}|${keywordId ?? ""}|${words}|${repliesList}`

  const refreshView = React.useCallback(
    (): Promise<void> =>
      guest
        ? Promise.resolve()
        : loadXModule(projectId).then(
            (next) => {
              setView(next)
              setViewError(null)
            },
            (failure: unknown) => setViewError(getXErrorMessage(failure))
          ),
    [guest, projectId]
  )

  // The newest list asked for. A slower answer to an older ask is dropped, so
  // typing "a" then "ab" never ends on the "a" posts.
  const latestList = React.useRef("")
  const refreshList = React.useCallback(async () => {
    if (guest) return
    const key = listKey
    latestList.current = key
    const keep = <T,>(patch: T) => {
      if (latestList.current === key) setList((current) => ({ ...current, ...patch, key }))
    }
    try {
      if (isFindTab(tab)) {
        const finds = await loadXFinds({ projectId, keywordId, tab, search: words || undefined })
        keep({ error: null, finds })
      } else if (tab === "today") {
        keep({ error: null, today: await loadXToday(projectId) })
      } else if (tab === "replies") {
        const { replies } = await loadXReplies(projectId, repliesList)
        keep({ error: null, replies })
      } else if (tab === "mentions") {
        const { mentions } = await loadXReplies(projectId, "sent")
        keep({ error: null, mentions })
      } else if (tab === "posts") {
        keep({ error: null, posts: await loadXPosts(projectId) })
      } else {
        keep({ error: null, communities: await loadXCommunities(projectId) })
      }
    } catch (failure) {
      keep({ error: getXErrorMessage(failure) })
    }
  }, [guest, keywordId, listKey, projectId, repliesList, tab, words])

  // With no post picked, the first one in the list opens, so the right column
  // is never empty (part 14). Worked out here rather than written to the
  // address, so a narrow screen stays on the list nobody pressed.
  const firstFind = isFindTab(tab) && list.key === listKey ? (list.finds[0]?.id ?? null) : null
  const findOpen = isFindTab(tab) ? (open ?? firstFind) : tab === "today" ? open : null
  // The post whose read last failed, so the poll says so once, not every two seconds.
  const failedDetail = React.useRef<string | null>(null)
  const refreshDetail = React.useCallback(
    (): Promise<void> =>
      !findOpen || guest
        ? Promise.resolve()
        : loadXFindDetail(findOpen).then(
            (find) => {
              failedDetail.current = null
              setDetail({ id: findOpen, find })
            },
            (failure: unknown) => {
              setDetail({ id: findOpen, find: null })
              if (failedDetail.current !== findOpen) showErrorToast(getXErrorMessage(failure))
              failedDetail.current = findOpen
            }
          ),
    [guest, findOpen]
  )

  React.useEffect(() => {
    void refreshView()
  }, [refreshView])
  React.useEffect(() => {
    void refreshList()
  }, [refreshList])
  React.useEffect(() => {
    void refreshDetail()
  }, [refreshDetail])

  const refreshAll = React.useCallback(async () => {
    await Promise.all([refreshView(), refreshList(), refreshDetail(), onProjectChanged()])
  }, [onProjectChanged, refreshDetail, refreshList, refreshView])

  // A browser takes seconds to minutes and finishes without telling anybody,
  // so the module asks while the queue has something in it. With the browser
  // program stopped nothing can change, so it only looks every ten seconds
  // whether the program has started, and goes back to every two once it has.
  const working = view ? view.jobs.queued + view.jobs.running > 0 : false
  const programRunning = view?.jobs.programRunning ?? false
  React.useEffect(() => {
    if (!working) return
    const timer = programRunning
      ? setInterval(() => void Promise.all([refreshView(), refreshList(), refreshDetail()]), POLL_MS)
      : setInterval(() => void refreshView(), IDLE_POLL_MS)
    return () => clearInterval(timer)
  }, [programRunning, refreshDetail, refreshList, refreshView, working])

  const account = view?.accounts.find((row) => row.id === accountId) ?? null
  const counts = view?.counts

  function openRecord(id: string | null, nextTab: XView = tab) {
    onSearch({ tab: dropTab(nextTab) ? undefined : nextTab, open: id ?? undefined })
  }

  async function skip(findIds: string[]) {
    try {
      if (findIds.includes(open ?? "")) openRecord(null)
      const answer = await setXStatus(findIds, "skipped")
      await refreshAll()
      if (answer.skipped.length) showErrorToast(`${answer.completed.length} skipped. ${answer.skipped.length} were left alone because they have been replied to.`)
    } catch (failure) {
      showErrorToast(getXErrorMessage(failure))
    }
  }

  const accountPicker = view ? (
    <XAccountPicker
      accounts={view.accounts}
      freeAccounts={view.freeAccounts}
      selectedId={account?.id ?? null}
      label="Comment as"
      onSelect={setAccountId}
      onAdd={async (added) => {
        try {
          await putAccountInProject(projectId, added)
          await refreshView()
        } catch (failure) {
          showErrorToast(getProjectErrorMessage(failure))
        }
      }}
      onRemove={async (removed) => {
        try {
          await takeAccountOutOfProject(removed)
          if (removed === accountId) setAccountId(null)
          await refreshView()
        } catch (failure) {
          showErrorToast(getProjectErrorMessage(failure))
        }
      }}
    />
  ) : null

  const tabs = (
    // The arrow back to the Projects dashboard first, then the tabs (Tyler, 12 Nov 2026: "put the arrow back again").
    <div className="flex shrink-0 items-end gap-x-2 border-b px-3">
      {/* On Commenting the keyword header above has the arrow, so only Posts draws it here. */}
      {side === "posts" ? (
        <span className="flex h-11 items-center">
          <ProjectBackButton />
        </span>
      ) : null}
      <div role="tablist" aria-label="Which list" className="flex flex-wrap items-end gap-x-4">
      {views.map((item) => {
        const count =
          item === "new"
            ? counts?.toLook
            : item === "replied"
              ? counts?.replied
              : item === "skipped"
                ? counts?.skipped
                : item === "replies"
                  ? counts?.failed
                    ? counts.failed
                    : counts?.toAnswer
                  : null
        return (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => onSearch({ tab: dropTab(item) ? undefined : item, open: undefined, list: undefined })}
            className={cn(
              "-mb-px flex h-11 items-center gap-1.5 border-b-2 text-sm whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              tab === item ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {X_VIEW_WORDS[item]}
            {count ? <span className={cn("font-normal tabular-nums", item === "replies" && counts?.failed ? "text-destructive" : "text-muted-foreground")}>{count}</span> : null}
          </button>
        )
      })}
      </div>
    </div>
  )

  const notices = view ? (
    <>
      {view.paused ? (
        <p className="flex shrink-0 items-start gap-2 border-b px-3 py-2 text-sm">
          <PauseIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          X is paused on this project. Nothing is sent or warmed up until it is resumed in the left column.
        </p>
      ) : null}
      {!view.searchers.length ? (
        <p className="flex shrink-0 items-start gap-2 border-b px-3 py-2 text-sm text-destructive">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            There is no X search account, so nothing on X is read. Add one under X in{" "}
            <Link to="/admin/settings/$tab" params={{ tab: "behaviour" }} className="font-medium underline underline-offset-2">
              Settings → Behaviour
            </Link>
            .
          </span>
        </p>
      ) : (
        <>
          {view.searchers
            .filter((searcher) => searcher.stoppedReason)
            .map((searcher) => (
              <p key={searcher.id} className="flex shrink-0 items-start gap-2 border-b px-3 py-2 text-sm">
                <MoonIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  The search account {searcher.handle ? `@${searcher.handle}` : searcher.profileName} rests today. {searcher.stoppedReason}
                </span>
              </p>
            ))}
          <p className="shrink-0 border-b px-3 py-1.5 text-xs text-muted-foreground">
            {view.searchers
              .map((searcher) => `${searcher.handle ? `@${searcher.handle}` : searcher.profileName}: ${searcher.viewsToday} of ${searcher.viewsPerDay} views today`)
              .join(" · ")}
          </p>
        </>
      )}
      {!view.jobs.programRunning && view.jobs.queued > 0 ? (
        <p className="flex shrink-0 items-start gap-2 border-b px-3 py-2 text-sm text-destructive">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            The browser program is not running, so {view.jobs.queued} {view.jobs.queued === 1 ? "job is" : "jobs are"} waiting and nothing is searched or sent.{" "}
            <button type="button" className="font-medium underline underline-offset-2" onClick={() => onSearch({ window: "jobs" })}>
              See the jobs
            </button>
          </span>
        </p>
      ) : null}
    </>
  ) : null

  // Rows for another tab, keyword or search are on their way, not these.
  const listLoading = list.key !== listKey
  // A phone's way back from a post picked by a press; one that opened by
  // itself has nothing to close, so its column name is the way back.
  const back = desktop || !open ? undefined : () => openRecord(null)

  let middleBody: React.ReactNode
  let right: React.ReactNode
  if (isFindTab(tab)) {
    middleBody = (
      <XFinds
        tab={tab}
        finds={list.key.startsWith(`${tab}|`) ? list.finds : []}
        loading={listLoading}
        error={list.error}
        selectedId={findOpen}
        everything={keywordId === null}
        hasKeywords={Boolean(view?.keywords.length)}
        hasSearcher={view ? view.searchers.length > 0 : true}
        searched={Boolean(words)}
        onSelect={(id) => openRecord(id)}
        onSkip={skip}
        onHide={async (findId) => {
          try {
            await changeXHidden({ change: "hide", findId })
            if (findId === open) openRecord(null)
            await refreshAll()
          } catch (failure) {
            showErrorToast(getXErrorMessage(failure))
          }
        }}
        onRetry={() => void refreshList()}
      />
    )
  } else if (tab === "today") {
    middleBody = (
      <XTodayList
        today={list.today}
        loading={listLoading}
        error={list.error}
        onOpenPost={(findId) => openRecord(findId, "new")}
        onOpenAnswer={(under) =>
          "postRowId" in under
            ? onSearch({ tab: "posts", open: under.postRowId, list: undefined })
            : "replyId" in under
              ? onSearch({ tab: "replies", open: under.replyId, list: undefined })
              : onSearch({ tab: "mentions", open: under.mentionId, list: undefined })
        }
        onRetry={() => void refreshList()}
      />
    )
  } else if (tab === "replies") {
    middleBody = (
      <XRepliesList
        list={repliesList}
        rows={listLoading ? [] : list.replies}
        loading={listLoading}
        error={list.error}
        selectedId={open}
        onList={(next) => onSearch({ list: next === "failed" ? "failed" : undefined, open: undefined })}
        onSelect={(id) => openRecord(id)}
        onRetry={() => void refreshList()}
        onChanged={refreshAll}
      />
    )
    const row = list.replies.find((item) => item.id === open) ?? null
    right = <XReplyPanel key={row?.id ?? "none"} projectId={projectId} row={row} onBack={back} onClose={() => openRecord(null)} onChanged={refreshAll} />
  } else if (tab === "mentions") {
    middleBody = (
      <XMentionsList
        mentions={listLoading ? [] : list.mentions}
        loading={listLoading}
        error={list.error}
        selectedId={open}
        onSelect={(id) => openRecord(id)}
        onRetry={() => void refreshList()}
      />
    )
    const mention = list.mentions.find((item) => item.id === open) ?? null
    right = mention ? (
      <XMentionPanel key={mention.id} projectId={projectId} mention={mention} onBack={back} onChanged={refreshAll} />
    ) : (
      <p className="p-4 text-sm text-muted-foreground">Click a reply to read it and answer it here.</p>
    )
  } else if (tab === "posts") {
    middleBody = (
      <XPostsList
        projectId={projectId}
        accounts={view?.accounts ?? []}
        data={list.posts}
        loading={listLoading}
        error={list.error}
        selectedId={open}
        onSelect={(id) => openRecord(id)}
        onOpenQuote={(quote) => onSearch({ tab: "replies", open: quote.id, list: quote.status === "failed" ? "failed" : undefined })}
        onRetry={() => void refreshList()}
        onChanged={refreshAll}
      />
    )
    const post = list.posts?.posts.find((item) => item.id === open) ?? null
    right = (
      <XPostPanel
        projectId={projectId}
        post={post}
        accounts={view?.accounts ?? []}
        communities={view?.communities ?? []}
        sources={list.posts?.sources ?? []}
        onBack={back}
        onClose={() => openRecord(null)}
        onChanged={refreshAll}
      />
    )
  } else {
    middleBody = (
      <XCommunitiesList
        projectId={projectId}
        rows={list.communities}
        loading={listLoading}
        error={list.error}
        selectedId={open}
        onSelect={(id) => openRecord(id)}
        onRetry={() => void refreshList()}
        onChanged={refreshAll}
      />
    )
    const community = list.communities.find((item) => item.id === open) ?? null
    right = <XCommunityPanel key={community?.id ?? "none"} community={community} onBack={back} onClose={() => openRecord(null)} onChanged={refreshAll} />
  }
  if (isFindTab(tab) || tab === "today") {
    right = (
      <XFindPanel
        key={findOpen ?? "none"}
        projectId={projectId}
        find={detail.id === findOpen ? detail.find : null}
        loading={findOpen !== null && detail.id !== findOpen}
        account={account}
        accountPicker={accountPicker}
        onBack={back}
        onSkip={async (findId) => {
          await skip([findId])
        }}
        onChanged={refreshAll}
      />
    )
  }

  const middle = guest ? (
    <p className="p-4 text-sm text-muted-foreground">X is worked by the project&apos;s owner. Open Reddit, Instagram or TikTok in the left column.</p>
  ) : side === "posts" ? (
    <>
      {viewError ? <p className="border-b px-3 py-2 text-sm text-destructive">{viewError}</p> : null}
      {view?.paused ? (
        <p className="flex shrink-0 items-start gap-2 border-b px-3 py-2 text-sm">
          <PauseIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          X is paused on this project. Nothing is sent or warmed up until it is resumed in the left column.
        </p>
      ) : null}
      {tabs}
      <div className="flex min-h-0 flex-1 flex-col">{middleBody}</div>
    </>
  ) : (
    <>
      <XKeywords
        view={view}
        failed={Boolean(viewError)}
        projectId={projectId}
        selectedId={keywordId}
        search={isFindTab(tab) ? <XFindSearch value={typed} onChange={setTyped} /> : null}
        onSelect={(next) => {
          onSearch({ keyword: next ?? undefined, open: undefined, ...(isFindTab(tab) ? {} : { tab: undefined, list: undefined }) })
        }}
        onChanged={refreshAll}
        onOpenJobs={() => onSearch({ window: "jobs" })}
      />
      {viewError ? <p className="border-b px-3 py-2 text-sm text-destructive">{viewError}</p> : null}
      {notices}
      {tabs}
      <div className="flex min-h-0 flex-1 flex-col">{middleBody}</div>
    </>
  )

  return (
    <ProjectColumns
      left={left}
      middle={middle}
      right={guest ? <p className="p-4 text-sm text-muted-foreground">Nothing to show here.</p> : right}
      rightOpen={Boolean(open)}
      onCloseRight={() => openRecord(null)}
      rightLabel="Show the right column"
    >
      {dialogs}
      {side === "commenting" ? (
        <JobsWindow
          open={search.window === "jobs" && !guest}
          onClose={() => {
            onSearch({ window: undefined })
            void refreshAll()
          }}
        />
      ) : null}
    </ProjectColumns>
  )
}
