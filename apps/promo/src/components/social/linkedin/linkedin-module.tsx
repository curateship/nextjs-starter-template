import * as React from "react"
import { Link } from "@tanstack/react-router"
import { AlertTriangleIcon, MailIcon, MoonIcon, PauseIcon } from "lucide-react"
import { toast } from "sonner"

import { usePromoGuest } from "@/components/social/guest/guest-mode"
import { ProjectColumns } from "@/components/social/projects/project-columns"
import { JobsWindow } from "@/components/social/reddit/jobs-window"
import {
  changeLinkedinHidden,
  getLinkedinErrorMessage,
  loadLinkedinComments,
  loadLinkedinFindDetail,
  loadLinkedinFinds,
  loadLinkedinModule,
  loadLinkedinPeople,
  loadLinkedinPosts,
  loadLinkedinToday,
  setLinkedinStatus,
  type LinkedinCommentView,
  type LinkedinFindDetail,
  type LinkedinFindView,
  type LinkedinModuleView,
  type LinkedinPeople,
  type LinkedinPostsTab,
  type LinkedinToday,
} from "@/lib/api/social/linkedin"
import { getProjectErrorMessage, putAccountInProject, takeAccountOutOfProject } from "@/lib/api/social/projects"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { LINKEDIN_VIEW_WORDS, LINKEDIN_VIEWS, type LinkedinView } from "@/lib/social/linkedin/options"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { XPanelFrame } from "../x/x-panel-frame"
import { LinkedinAccountPicker, type LinkedinSpeaker } from "./linkedin-account-picker"
import { LinkedinCommentPanel, LinkedinCommentsList } from "./linkedin-comments"
import { LinkedinFindPanel } from "./linkedin-find-panel"
import { LinkedinFinds, LinkedinFindSearch } from "./linkedin-finds"
import { LinkedinKeywords } from "./linkedin-keywords"
import { LinkedinPeopleTab } from "./linkedin-people"
import { LinkedinPostPanel, LinkedinPostsList } from "./linkedin-posts"
import { LinkedinTodayList } from "./linkedin-today"
import { linkedinAccountName } from "./linkedin-words"

/** How often to ask what the queue is doing, while it is doing something. */
const POLL_MS = 2_000

/** How often to look whether the browser program has started, while jobs wait for it. */
const IDLE_POLL_MS = 10_000

/** How long the search box waits after the last key before asking. */
const SEARCH_WAIT_MS = 300

/**
 * What the LinkedIn module keeps in the address: its tab (`?tab=`, none is
 * To look at), the record open in the right column (`?open=<id>`), the
 * Comments tab's Failed list (`?list=failed`), and the Jobs window.
 */
export type LinkedinSearch = {
  tab?: Exclude<LinkedinView, "new">
  open?: string
  list?: "failed"
  window?: "jobs"
}

type FindTab = "new" | "commented" | "skipped"

function isFindTab(tab: LinkedinView): tab is FindTab {
  return tab === "new" || tab === "commented" || tab === "skipped"
}

/**
 * LinkedIn as a module on a project's dashboard
 * (`workspace/tasks/LinkedIn/01-linkedin-features.md`), what fills the
 * middle and right columns when LinkedIn is picked in the project's left
 * column. Built as X's module is.
 *
 * The middle column is the keyword row (parts 10 to 17), the notices about
 * the search accounts that do LinkedIn's reading (part 3) and the accounts
 * LinkedIn is asking for a code (part 4), and seven tabs: To look at,
 * Commented and Skipped are the posts the keywords and feeds found; Today is
 * what is worth doing now (part 21); Comments is what went out and what
 * failed (parts 43 to 45); Posts is the accounts' own posts, reposts and
 * newsletter issues (parts 28 to 38); and People is connection requests and
 * profile viewers (parts 39 to 41). The right column is whatever is open.
 *
 * Every comment, post, edit, delete, connection and accept is a job a person
 * pressed for, run once in the account's own browser or on its phone, in its
 * workday. A guest sent from Project does not work LinkedIn.
 */
export function LinkedinModule({
  projectId,
  left,
  dialogs,
  search,
  onSearch,
  onProjectChanged,
}: {
  projectId: string
  left: React.ReactNode
  dialogs: React.ReactNode
  search: LinkedinSearch
  onSearch: (patch: LinkedinSearch) => void
  /** Reads the project again, so the left column's LinkedIn count follows. */
  onProjectChanged: () => Promise<void>
}) {
  const desktop = useWideScreen()
  const guest = usePromoGuest()
  const tab: LinkedinView = search.tab && (LINKEDIN_VIEWS as readonly string[]).includes(search.tab) ? search.tab : "new"
  const open = search.open ?? null
  const commentsList = search.list === "failed" ? "failed" : "sent"

  const [view, setView] = React.useState<LinkedinModuleView | null>(null)
  const [viewError, setViewError] = React.useState<string | null>(null)
  const [keywordId, setKeywordId] = React.useState<string | null>(null)
  const [speaker, setSpeaker] = React.useState<LinkedinSpeaker | null>(null)
  const [typed, setTyped] = React.useState("")
  const [words, setWords] = React.useState("")
  const [list, setList] = React.useState<{
    /** Which tab, keyword, search and list these rows are for. Another key means they are on their way. */
    key: string
    error: string | null
    finds: LinkedinFindView[]
    comments: LinkedinCommentView[]
    posts: LinkedinPostsTab | null
    people: LinkedinPeople | null
    today: LinkedinToday | null
  }>({ key: "", error: null, finds: [], comments: [], posts: null, people: null, today: null })
  const [detail, setDetail] = React.useState<{ key: string; find: LinkedinFindDetail | null }>({ key: "", find: null })

  // The search box asks once the typing stops.
  React.useEffect(() => {
    const timer = setTimeout(() => setWords(typed.trim()), SEARCH_WAIT_MS)
    return () => clearTimeout(timer)
  }, [typed])

  const listKey = `${tab}|${keywordId ?? ""}|${words}|${commentsList}`

  const refreshView = React.useCallback(
    (): Promise<void> =>
      guest
        ? Promise.resolve()
        : loadLinkedinModule(projectId).then(
            (next) => {
              setView(next)
              setViewError(null)
            },
            (failure: unknown) => setViewError(getLinkedinErrorMessage(failure))
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
        keep({ error: null, finds: await loadLinkedinFinds({ projectId, keywordId, tab, search: words || undefined }) })
      } else if (tab === "today") {
        keep({ error: null, today: await loadLinkedinToday(projectId) })
      } else if (tab === "comments") {
        keep({ error: null, comments: await loadLinkedinComments(projectId, commentsList) })
      } else if (tab === "posts") {
        keep({ error: null, posts: await loadLinkedinPosts(projectId) })
      } else {
        keep({ error: null, people: await loadLinkedinPeople(projectId) })
      }
    } catch (failure) {
      keep({ error: getLinkedinErrorMessage(failure) })
    }
  }, [guest, keywordId, listKey, projectId, commentsList, tab, words])

  const findOpen = isFindTab(tab) || tab === "today" ? open : null
  const speakerId = speaker?.accountId ?? null
  // What you said before is the picked account's, so the post is read again for it.
  const detailKey = `${findOpen ?? ""}|${speakerId ?? ""}`
  // The post whose read last failed, so the poll says so once, not every two seconds.
  const failedDetail = React.useRef<string | null>(null)
  const refreshDetail = React.useCallback(
    (): Promise<void> =>
      !findOpen || guest
        ? Promise.resolve()
        : loadLinkedinFindDetail(findOpen, speakerId).then(
            (find) => {
              failedDetail.current = null
              setDetail({ key: detailKey, find })
            },
            (failure: unknown) => {
              setDetail({ key: detailKey, find: null })
              if (failedDetail.current !== findOpen) showErrorToast(getLinkedinErrorMessage(failure))
              failedDetail.current = findOpen
            }
          ),
    [guest, findOpen, speakerId, detailKey]
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

  const account = view?.accounts.find((row) => row.id === speakerId) ?? null
  // A page the account no longer runs, or a throwaway's, is never kept picked.
  const asPageId = account?.important && account.pages.some((page) => page.pageId === speaker?.asPageId) ? (speaker?.asPageId ?? "") : ""
  const counts = view?.counts

  function openRecord(id: string | null, nextTab: LinkedinView = tab) {
    onSearch({ tab: nextTab === "new" ? undefined : nextTab, open: id ?? undefined })
  }

  async function skip(findIds: string[]) {
    try {
      if (findIds.includes(open ?? "")) openRecord(null)
      const answer = await setLinkedinStatus(findIds, "skipped")
      await refreshAll()
      if (answer.skipped.length) showErrorToast(`${answer.completed.length} skipped. ${answer.skipped.length} were left alone because they have been commented on.`)
    } catch (failure) {
      showErrorToast(getLinkedinErrorMessage(failure))
    }
  }

  const accountPicker = view ? (
    <LinkedinAccountPicker
      accounts={view.accounts}
      freeAccounts={view.freeAccounts}
      selected={account ? { accountId: account.id, asPageId } : null}
      label="Comment as"
      onSelect={setSpeaker}
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
          if (removed === speakerId) setSpeaker(null)
          await refreshView()
        } catch (failure) {
          showErrorToast(getProjectErrorMessage(failure))
        }
      }}
    />
  ) : null

  const tabs = (
    <div role="tablist" aria-label="Which list" className="flex shrink-0 flex-wrap items-end gap-x-4 border-b px-3">
      {LINKEDIN_VIEWS.map((item) => {
        const count =
          item === "new"
            ? counts?.toLook
            : item === "commented"
              ? counts?.commented
              : item === "skipped"
                ? counts?.skipped
                : item === "comments"
                  ? counts?.failed
                    ? counts.failed
                    : counts?.toAnswer
                  : item === "people"
                    ? counts?.invites
                    : null
        return (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => onSearch({ tab: item === "new" ? undefined : item, open: undefined, list: undefined })}
            className={cn(
              "-mb-px flex h-11 items-center gap-1.5 border-b-2 text-sm whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              tab === item ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {LINKEDIN_VIEW_WORDS[item]}
            {count ? (
              <span className={cn("font-normal tabular-nums", item === "comments" && counts?.failed ? "text-destructive" : "text-muted-foreground")}>{count}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )

  const notices = view ? (
    <>
      {view.paused ? (
        <p className="flex shrink-0 items-start gap-2 border-b px-3 py-2 text-sm">
          <PauseIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          LinkedIn is paused on this project. Nothing is sent or warmed up until it is resumed in the left column.
        </p>
      ) : null}
      {view.accounts
        .filter((row) => row.codeAsked)
        .map((row) => (
          <p key={row.id} className="flex shrink-0 items-start gap-2 border-b px-3 py-2 text-sm">
            <MailIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              LinkedIn emailed {row.handle ? linkedinAccountName(row.handle) : `the account in ${row.runsIn ?? "its browser"}`} a code and waits for it.{" "}
              {row.onPhone ? (
                "Type it into the LinkedIn app through the phone's screen window on the Phones dashboard."
              ) : (
                <>
                  Paste it in the account&apos;s settings on the{" "}
                  <Link to="/admin/accounts" search={{ platform: "linkedin" }} className="font-medium underline underline-offset-2">
                    Accounts dashboard
                  </Link>{" "}
                  within 15 minutes.
                </>
              )}
            </span>
          </p>
        ))}
      {!view.searchers.length ? (
        <p className="flex shrink-0 items-start gap-2 border-b px-3 py-2 text-sm text-destructive">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            There is no LinkedIn search account, so nothing on LinkedIn is read. Add one under LinkedIn in{" "}
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
                  The search account {searcher.slug ? `in/${searcher.slug}` : searcher.profileName} rests today. {searcher.stoppedReason}
                </span>
              </p>
            ))}
          <p className="shrink-0 border-b px-3 py-1.5 text-xs text-muted-foreground">
            {view.searchers
              .map((searcher) => `${searcher.slug ? `in/${searcher.slug}` : searcher.profileName}: ${searcher.viewsToday} of ${searcher.viewsPerDay} views today`)
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
  const back = desktop ? undefined : () => openRecord(null)

  let middleBody: React.ReactNode
  let right: React.ReactNode
  if (isFindTab(tab)) {
    middleBody = (
      <LinkedinFinds
        tab={tab}
        finds={list.key.startsWith(`${tab}|`) ? list.finds : []}
        loading={listLoading}
        error={list.error}
        selectedId={open}
        everything={keywordId === null}
        hasKeywords={Boolean(view?.keywords.length)}
        hasSearcher={view ? view.searchers.length > 0 : true}
        searched={Boolean(words)}
        onSelect={(id) => openRecord(id)}
        onSkip={skip}
        onHide={async (findId) => {
          try {
            const hidden = await changeLinkedinHidden({ change: "hide", findId })
            if (findId === open) openRecord(null)
            await refreshAll()
            if (hidden) toast.success(`${hidden.name} hidden. ${hidden.hiddenPosts} ${hidden.hiddenPosts === 1 ? "post" : "posts"} left every list.`)
          } catch (failure) {
            showErrorToast(getLinkedinErrorMessage(failure))
          }
        }}
        onRetry={() => void refreshList()}
      />
    )
  } else if (tab === "today") {
    middleBody = (
      <LinkedinTodayList
        today={list.today}
        loading={listLoading}
        error={list.error}
        onOpenPost={(findId) => openRecord(findId, "new")}
        onOpenAnswer={(under) =>
          "postRowId" in under
            ? onSearch({ tab: "posts", open: under.postRowId, list: undefined })
            : onSearch({ tab: "comments", open: under.commentRowId, list: undefined })
        }
        onOpenPeople={() => onSearch({ tab: "people", open: undefined, list: undefined })}
        onRetry={() => void refreshList()}
      />
    )
  } else if (tab === "comments") {
    middleBody = (
      <LinkedinCommentsList
        list={commentsList}
        rows={listLoading ? [] : list.comments}
        loading={listLoading}
        error={list.error}
        selectedId={open}
        onList={(next) => onSearch({ list: next === "failed" ? "failed" : undefined, open: undefined })}
        onSelect={(id) => openRecord(id)}
        onRetry={() => void refreshList()}
        onChanged={refreshAll}
      />
    )
    const row = list.comments.find((item) => item.id === open) ?? null
    right = (
      <LinkedinCommentPanel
        key={row?.id ?? "none"}
        projectId={projectId}
        row={row}
        accounts={view?.accounts ?? []}
        onBack={back}
        onClose={() => openRecord(null)}
        onChanged={refreshAll}
      />
    )
  } else if (tab === "posts") {
    middleBody = (
      <LinkedinPostsList
        projectId={projectId}
        accounts={view?.accounts ?? []}
        data={list.posts}
        loading={listLoading}
        error={list.error}
        selectedId={open}
        onSelect={(id) => openRecord(id)}
        onRetry={() => void refreshList()}
        onChanged={refreshAll}
      />
    )
    const post = list.posts?.posts.find((item) => item.id === open) ?? null
    right = (
      <LinkedinPostPanel
        projectId={projectId}
        post={post}
        accounts={view?.accounts ?? []}
        groups={view?.groups ?? []}
        sources={list.posts?.sources ?? []}
        onBack={back}
        onClose={() => openRecord(null)}
        onChanged={refreshAll}
      />
    )
  } else {
    middleBody = (
      <LinkedinPeopleTab projectId={projectId} data={list.people} loading={listLoading} error={list.error} onRetry={() => void refreshList()} onChanged={refreshAll} />
    )
    right = (
      <XPanelFrame title="People" onBack={back}>
        <p className="p-4 text-sm text-muted-foreground">Everything on the People tab happens in the middle column: accept requests, and connect with people who viewed a profile.</p>
      </XPanelFrame>
    )
  }
  if (isFindTab(tab) || tab === "today") {
    right = (
      <LinkedinFindPanel
        key={findOpen ?? "none"}
        projectId={projectId}
        find={detail.key === detailKey ? detail.find : null}
        loading={findOpen !== null && detail.key !== detailKey}
        account={account}
        asPageId={asPageId}
        accountPicker={accountPicker}
        onBack={back}
        onSkip={async (findId) => {
          await skip([findId])
        }}
        onRepost={(postRowId) => onSearch({ tab: "posts", open: postRowId, list: undefined })}
        onChanged={refreshAll}
      />
    )
  }

  const middle = guest ? (
    <p className="p-4 text-sm text-muted-foreground">LinkedIn is worked by the project&apos;s owner. Open Reddit, Instagram or TikTok in the left column.</p>
  ) : (
    <>
      <LinkedinKeywords
        view={view}
        failed={Boolean(viewError)}
        projectId={projectId}
        selectedId={keywordId}
        search={isFindTab(tab) ? <LinkedinFindSearch value={typed} onChange={setTyped} /> : null}
        onSelect={(next) => {
          setKeywordId(next)
          if (!isFindTab(tab)) onSearch({ tab: undefined, open: undefined, list: undefined })
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
      rightLabel="Show the right column"
    >
      {dialogs}
      <JobsWindow
        open={search.window === "jobs" && !guest}
        onClose={() => {
          onSearch({ window: undefined })
          void refreshAll()
        }}
      />
    </ProjectColumns>
  )
}
