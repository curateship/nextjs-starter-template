import * as React from "react"
import { AlertTriangleIcon, PauseIcon } from "lucide-react"
import { toast } from "sonner"

import { usePromoGuest } from "@/components/social/guest/guest-mode"
import { ProjectColumns } from "@/components/social/projects/project-columns"
import { JobsWindow } from "@/components/social/reddit/jobs-window"
import {
  changeMediumHidden,
  getMediumErrorMessage,
  loadMediumArticles,
  loadMediumFindDetail,
  loadMediumFinds,
  loadMediumModule,
  loadMediumPublications,
  loadMediumResponses,
  loadMediumToday,
  setMediumStatus,
  type ListItemView,
  type MediumArticleView,
  type MediumFindDetail,
  type MediumFindView,
  type MediumModuleView,
  type MediumPublicationView,
  type MediumResponseView,
  type MediumToday,
} from "@/lib/api/social/medium"
import { getProjectErrorMessage, putAccountInProject, takeAccountOutOfProject } from "@/lib/api/social/projects"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { MEDIUM_VIEW_WORDS, MEDIUM_VIEWS, type MediumView } from "@/lib/social/medium/options"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { MediumAccountPicker } from "./medium-account-picker"
import { MediumArticlePanel, MediumArticlesList } from "./medium-articles"
import { MediumKeywords } from "./medium-keywords"
import { MediumPublicationPanel, MediumPublicationsList } from "./medium-publications"
import { MediumResponsePanel, MediumResponsesList } from "./medium-responses"
import { MediumStories, MediumStorySearch } from "./medium-stories"
import { MediumStoryPanel } from "./medium-story-panel"
import { MediumTodayList } from "./medium-today"

/** How often to ask what the queue is doing, while it is doing something. */
const POLL_MS = 2_000

/** How long the search box waits after the last key before asking. */
const SEARCH_WAIT_MS = 300

/**
 * What the Medium module keeps in the address: its tab (`?tab=`, none is To
 * look at), the record open in the right column (`?open=<id>`), the
 * Responses tab's Failed list (`?list=failed`), and the Jobs window.
 */
export type MediumSearch = {
  tab?: Exclude<MediumView, "new">
  open?: string
  list?: "failed" | "posts"
  window?: "jobs"
}

type StoryTab = "new" | "replied" | "skipped"

function isStoryTab(tab: MediumView): tab is StoryTab {
  return tab === "new" || tab === "replied" || tab === "skipped"
}

/**
 * Medium as a module on a project's dashboard
 * (`workspace/tasks/Medium/01-medium-features.md`), what fills the middle and
 * right columns when Medium is picked in the project's left column.
 *
 * The middle column is the keyword row (part 6) and seven tabs: To look at,
 * Replied and Skipped are the stories the keywords found; Today is what is
 * worth doing now (part 15); Responses is what went out and what failed
 * (parts 35 to 38); Articles is the account's own writing and its Medium
 * lists (parts 26 to 34 and 40); Publications is the group blogs that suit
 * the project (parts 32 and 33). The right column is whatever is open: a
 * story and the response to it, a sent response, an article, or a
 * publication.
 *
 * Every response, article, edit and delete is a job a person pressed for,
 * run once in the account's own browser. A guest sent from Project does not
 * work Medium (feature 50 was not picked).
 */
export function MediumModule({
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
  search: MediumSearch
  onSearch: (patch: MediumSearch) => void
  /** Reads the project again, so the left column's Medium count follows. */
  onProjectChanged: () => Promise<void>
}) {
  const desktop = useWideScreen()
  const guest = usePromoGuest()
  const tab: MediumView = search.tab && (MEDIUM_VIEWS as readonly string[]).includes(search.tab) ? search.tab : "new"
  const open = search.open ?? null
  const responsesList = search.list === "failed" ? "failed" : "sent"

  const [view, setView] = React.useState<MediumModuleView | null>(null)
  const [viewError, setViewError] = React.useState<string | null>(null)
  const [keywordId, setKeywordId] = React.useState<string | null>(null)
  const [accountId, setAccountId] = React.useState<string | null>(null)
  const [typed, setTyped] = React.useState("")
  const [words, setWords] = React.useState("")
  const [list, setList] = React.useState<{
    /** Which tab, keyword, search and list these rows are for. Another key means they are on their way. */
    key: string
    error: string | null
    finds: MediumFindView[]
    responses: MediumResponseView[]
    articles: MediumArticleView[]
    listItems: ListItemView[]
    publications: MediumPublicationView[]
    today: MediumToday | null
  }>({ key: "", error: null, finds: [], responses: [], articles: [], listItems: [], publications: [], today: null })
  const [detail, setDetail] = React.useState<{ id: string; find: MediumFindDetail | null }>({ id: "", find: null })

  // The search box asks once the typing stops.
  React.useEffect(() => {
    const timer = setTimeout(() => setWords(typed.trim()), SEARCH_WAIT_MS)
    return () => clearTimeout(timer)
  }, [typed])

  const listKey = `${tab}|${keywordId ?? ""}|${words}|${responsesList}`

  const refreshView = React.useCallback(
    (): Promise<void> =>
      guest
        ? Promise.resolve()
        : loadMediumModule(projectId).then(
            (next) => {
              setView(next)
              setViewError(null)
            },
            (failure: unknown) => setViewError(getMediumErrorMessage(failure))
          ),
    [guest, projectId]
  )

  // The newest list asked for. A slower answer to an older ask is dropped, so
  // typing "a" then "ab" never ends on the "a" stories.
  const latestList = React.useRef("")
  const refreshList = React.useCallback(async () => {
    if (guest) return
    const key = listKey
    latestList.current = key
    const keep = <T,>(patch: T) => {
      if (latestList.current === key) setList((current) => ({ ...current, ...patch, key }))
    }
    try {
      if (isStoryTab(tab)) {
        const finds = await loadMediumFinds({ projectId, keywordId, tab, search: words || undefined })
        keep({ error: null, finds })
      } else if (tab === "today") {
        const today = await loadMediumToday(projectId)
        keep({ error: null, today })
      } else if (tab === "responses") {
        const responses = await loadMediumResponses(projectId, responsesList)
        keep({ error: null, responses })
      } else if (tab === "articles") {
        const { articles, list: listItems } = await loadMediumArticles(projectId)
        keep({ error: null, articles, listItems })
      } else {
        const publications = await loadMediumPublications(projectId)
        keep({ error: null, publications })
      }
    } catch (failure) {
      keep({ error: getMediumErrorMessage(failure) })
    }
  }, [guest, keywordId, listKey, projectId, responsesList, tab, words])

  const storyOpen = isStoryTab(tab) || tab === "today" ? open : null
  // The story whose read last failed, so the poll says so once, not every two seconds.
  const failedDetail = React.useRef<string | null>(null)
  const refreshDetail = React.useCallback(
    (): Promise<void> =>
      !storyOpen || guest
        ? Promise.resolve()
        : loadMediumFindDetail(storyOpen).then(
            (find) => {
              failedDetail.current = null
              setDetail({ id: storyOpen, find })
            },
            (failure: unknown) => {
              setDetail({ id: storyOpen, find: null })
              if (failedDetail.current !== storyOpen) showErrorToast(getMediumErrorMessage(failure))
              failedDetail.current = storyOpen
            }
          ),
    [guest, storyOpen]
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
  // so the module asks while the queue has something in it.
  const working = view ? view.jobs.queued + view.jobs.running > 0 : false
  React.useEffect(() => {
    if (!working) return
    const timer = setInterval(() => void Promise.all([refreshView(), refreshList(), refreshDetail()]), POLL_MS)
    return () => clearInterval(timer)
  }, [refreshDetail, refreshList, refreshView, working])

  const account = view?.accounts.find((row) => row.id === accountId) ?? null
  const counts = view?.counts

  function openRecord(id: string | null, nextTab: MediumView = tab) {
    onSearch({ tab: nextTab === "new" ? undefined : nextTab, open: id ?? undefined })
  }

  async function skip(findIds: string[]) {
    try {
      if (findIds.includes(open ?? "")) openRecord(null)
      const answer = await setMediumStatus(findIds, "skipped")
      await refreshAll()
      if (answer.skipped.length) showErrorToast(`${answer.completed.length} skipped. ${answer.skipped.length} were left alone because they have been responded to.`)
    } catch (failure) {
      showErrorToast(getMediumErrorMessage(failure))
    }
  }

  const accountPicker = view ? (
    <MediumAccountPicker
      accounts={view.accounts}
      freeAccounts={view.freeAccounts}
      selectedId={account?.id ?? null}
      label="Respond as"
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
      onSignInQueued={() => void refreshView()}
    />
  ) : null

  const tabs = (
    <div role="tablist" aria-label="Which list" className="flex shrink-0 flex-wrap items-end gap-x-4 border-b px-3">
      {MEDIUM_VIEWS.map((item) => {
        const count =
          item === "new" ? counts?.toLook : item === "replied" ? counts?.replied : item === "skipped" ? counts?.skipped : item === "responses" ? (counts?.failed ? counts.failed : counts?.toAnswer) : null
        return (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => {
              onSearch({ tab: item === "new" ? undefined : item, open: undefined, list: undefined })
            }}
            className={cn(
              "-mb-px flex h-11 items-center gap-1.5 border-b-2 text-sm whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              tab === item ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {MEDIUM_VIEW_WORDS[item]}
            {count ? <span className={cn("font-normal tabular-nums", item === "responses" && counts?.failed ? "text-destructive" : "text-muted-foreground")}>{count}</span> : null}
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
          Medium is paused on this project. Nothing is sent or warmed up until it is resumed in the left column.
        </p>
      ) : null}
      {!view.readerPicked ? (
        <p className="flex shrink-0 items-start gap-2 border-b px-3 py-2 text-sm text-destructive">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          There is no reader browser, so nothing is searched or read. Pick one in Settings → Behaviour.
        </p>
      ) : null}
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
  if (isStoryTab(tab)) {
    middleBody = (
      <MediumStories
        tab={tab}
        finds={list.key.startsWith(`${tab}|`) ? list.finds : []}
        loading={listLoading}
        error={list.error}
        selectedId={open}
        everything={keywordId === null}
        hasKeywords={Boolean(view?.keywords.length)}
        readerPicked={view?.readerPicked ?? true}
        searched={Boolean(words)}
        onSelect={(id) => openRecord(id)}
        onSkip={skip}
        onHide={async (findId, kind) => {
          try {
            const hidden = await changeMediumHidden({ change: "hide", findId, kind })
            if (findId === open) openRecord(null)
            await refreshAll()
            if (hidden) toast.success(`${hidden.name} hidden. ${hidden.hiddenStories} ${hidden.hiddenStories === 1 ? "story" : "stories"} left every list.`)
          } catch (failure) {
            showErrorToast(getMediumErrorMessage(failure))
          }
        }}
        onRetry={() => void refreshList()}
      />
    )
  } else if (tab === "today") {
    middleBody = (
      <MediumTodayList
        today={list.today}
        loading={listLoading}
        error={list.error}
        onOpenStory={(findId) => openRecord(findId, "new")}
        onOpenAnswer={(under) =>
          "responseId" in under ? onSearch({ tab: "responses", open: under.responseId, list: undefined }) : onSearch({ tab: "articles", open: under.articleId })
        }
        onRetry={() => void refreshList()}
      />
    )
  } else if (tab === "responses") {
    middleBody = (
      <MediumResponsesList
        list={responsesList}
        rows={listLoading ? [] : list.responses}
        loading={listLoading}
        error={list.error}
        selectedId={open}
        onList={(next) => onSearch({ list: next === "failed" ? "failed" : undefined, open: undefined })}
        onSelect={(id) => openRecord(id)}
        onRetry={() => void refreshList()}
        onChanged={refreshAll}
      />
    )
    const row = list.responses.find((item) => item.id === open) ?? null
    right = <MediumResponsePanel key={row?.id ?? "none"} projectId={projectId} row={row} onBack={back} onClose={() => openRecord(null)} onChanged={refreshAll} />
  } else if (tab === "articles") {
    middleBody = (
      <MediumArticlesList
        projectId={projectId}
        accounts={view?.accounts ?? []}
        articles={list.articles}
        list={list.listItems}
        loading={listLoading}
        error={list.error}
        selectedId={open}
        onSelect={(id) => openRecord(id)}
        onRetry={() => void refreshList()}
        onChanged={refreshAll}
      />
    )
    const article = list.articles.find((item) => item.id === open) ?? null
    right = (
      <MediumArticlePanel
        projectId={projectId}
        article={article}
        accounts={view?.accounts ?? []}
        publications={view?.publications ?? []}
        onBack={back}
        onClose={() => openRecord(null)}
        onChanged={refreshAll}
      />
    )
  } else {
    middleBody = (
      <MediumPublicationsList
        projectId={projectId}
        rows={list.publications}
        loading={listLoading}
        error={list.error}
        selectedId={open}
        onSelect={(id) => openRecord(id)}
        onRetry={() => void refreshList()}
        onChanged={refreshAll}
      />
    )
    const publication = list.publications.find((item) => item.id === open) ?? null
    right = <MediumPublicationPanel key={publication?.id ?? "none"} publication={publication} onBack={back} onClose={() => openRecord(null)} onChanged={refreshAll} />
  }
  if (isStoryTab(tab) || tab === "today") {
    right = (
      <MediumStoryPanel
        key={storyOpen ?? "none"}
        projectId={projectId}
        find={detail.id === storyOpen ? detail.find : null}
        loading={storyOpen !== null && detail.id !== storyOpen}
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
    <p className="p-4 text-sm text-muted-foreground">Medium is worked by the project&apos;s owner. Open Reddit, Instagram or TikTok in the left column.</p>
  ) : (
    <>
      <MediumKeywords
        view={view}
        failed={Boolean(viewError)}
        projectId={projectId}
        selectedId={keywordId}
        search={isStoryTab(tab) ? <MediumStorySearch value={typed} onChange={setTyped} /> : null}
        onSelect={(next) => {
          setKeywordId(next)
          if (!isStoryTab(tab)) onSearch({ tab: undefined, open: undefined, list: undefined })
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
