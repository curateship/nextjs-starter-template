import * as React from "react"
import { ListChecksIcon, QuoteIcon } from "lucide-react"

import type { DashboardActions } from "@/components/note-library/library-dashboard"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { SearchToggle } from "@/components/shared/search-toggle"
import { Checkbox } from "@/components/ui/checkbox"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { saveNotePlan } from "@/lib/api/note/imports"
import { getLibraryErrorMessage } from "@/lib/api/note/library"
import { loadLibraryQuotes, loadPlanSteps } from "@/lib/api/note/notes"
import { plural } from "@/lib/format/plural"
import { focusRing } from "@/lib/layout/focus-ring"
import {
  formatTimecode,
  noteTitle,
  type LibraryPage,
  type LibraryQuote,
  type PlanStep,
  type PlanStepsGroup,
} from "@/lib/note/library/notes"
import { HIGHLIGHT_CLASS } from "@/lib/note/notes/colours"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The middle panel's two lists that gather across the library, from the
 * LIBRARY card's Plan steps and Quotes rows (Tyler, 20 Oct 2026: "Rows in the
 * LIBRARY card"). Each reads its list when it opens and again whenever the
 * left panel's counts move, so a tick or an Analyse elsewhere shows here.
 */

/** A list read from the server, read again when `token` changes. */
function useGathered<T>(load: () => Promise<T>, token: string) {
  const [state, setState] = React.useState<{ token: string; data: T | null; error: string | null }>({
    token: "",
    data: null,
    error: null,
  })
  const [retries, setRetries] = React.useState(0)
  const loader = React.useRef(load)
  React.useEffect(() => {
    loader.current = load
  })
  React.useEffect(() => {
    let live = true
    loader
      .current()
      .then((data) => {
        if (live) setState({ token, data, error: null })
      })
      .catch((error) => {
        if (live) setState((current) => ({ ...current, token, error: getLibraryErrorMessage(error) }))
      })
    return () => {
      live = false
    }
  }, [token, retries])
  return {
    data: state.data,
    // An error only counts for the read it came from; a later one tries again.
    error: state.token === token ? state.error : null,
    setData: (data: T) => setState((current) => ({ ...current, data })),
    retry: () => setRetries((count) => count + 1),
  }
}

/**
 * Plan steps: every note's Action plan in one list (Tyler's task 02, part 13).
 * Ticking a step saves that note's plan as its own card does. Done steps hide
 * until Show done.
 */
export function PlanStepsPanel({
  page,
  actions,
  openId,
  onOpenedChanged,
}: {
  page: LibraryPage
  actions: DashboardActions
  openId: string | undefined
  /** The open note's plan changed here, so the right panel reads it again. */
  onOpenedChanged: () => void
}) {
  const { data, error, setData, retry } = useGathered(
    () => loadPlanSteps(page.library.id),
    `${page.library.id}:${page.counts.openSteps}:${page.counts.all}`
  )
  const [showDone, setShowDone] = React.useState(false)
  // One save at a time, each with the plan as it stands, so the last tick is the one kept.
  const queue = React.useRef<Promise<unknown>>(Promise.resolve())

  function tick(group: PlanStepsGroup, index: number, done: boolean) {
    if (!data) return
    const steps: PlanStep[] = group.steps.map((step, at) => (at === index ? { ...step, done } : step))
    const before = data
    setData(data.map((each) => (each.noteId === group.noteId ? { ...each, steps } : each)))
    queue.current = queue.current.then(async () => {
      try {
        await saveNotePlan(group.noteId, steps)
        await actions.refreshPage()
        if (group.noteId === openId) onOpenedChanged()
      } catch (failure) {
        setData(before)
        showErrorToast(getLibraryErrorMessage(failure))
      }
    })
  }

  const open = (data ?? []).reduce((sum, group) => sum + group.steps.filter((step) => !step.done).length, 0)
  const shown = (data ?? [])
    .map((group) => ({ group, rows: group.steps.map((step, index) => ({ step, index })).filter(({ step }) => showDone || !step.done) }))
    .filter(({ rows }) => rows.length > 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardTitleHeader
        icon={<ListChecksIcon className="size-4" />}
        title="Plan steps"
        meta={`${open.toLocaleString()} open`}
        action={
          <DashboardToolbarButton type="button" variant="ghost" aria-pressed={showDone} onClick={() => setShowDone(!showDone)}>
            {showDone ? "Hide done" : "Show done"}
          </DashboardToolbarButton>
        }
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        {error ? (
          <ErrorRow message={error} onRetry={retry} />
        ) : data === null ? (
          <LoadingRow label="Loading the plan steps" />
        ) : shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {data.length
              ? "Every step is ticked. Show done brings them back."
              : "No plans yet. Analyse a video or a post and its Action plan shows here."}
          </p>
        ) : (
          <div className="grid gap-4 p-4">
            {shown.map(({ group, rows }) => (
              <section key={group.noteId} className="grid gap-1.5">
                <button
                  type="button"
                  onClick={() => actions.openNote(group.noteId)}
                  className={cn(
                    "justify-self-start rounded-sm text-left text-sm font-medium hover:underline",
                    group.noteId === openId && "underline",
                    focusRing
                  )}
                >
                  {noteTitle(group.title)}
                </button>
                <ul className="grid gap-1">
                  {rows.map(({ step, index }) => {
                    const id = `plan-step-${group.noteId}-${index}`
                    return (
                      <li key={index} className="flex items-start gap-2">
                        <Checkbox
                          id={id}
                          className="mt-0.5"
                          checked={step.done}
                          onCheckedChange={(checked) => tick(group, index, checked === true)}
                        />
                        <label htmlFor={id} className={cn("text-sm", step.done && "text-muted-foreground line-through")}>
                          {step.text}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

/**
 * Quotes: every quote in the library, then the transcript lines marked
 * yellow, newest note first (Tyler's task 02, part 14). The search box reads
 * the words and the author. Clicking one opens its note, at its moment.
 */
export function QuotesPanel({
  page,
  onOpen,
}: {
  page: LibraryPage
  onOpen: (quote: LibraryQuote) => void
}) {
  const { data, error, retry } = useGathered(
    () => loadLibraryQuotes(page.library.id),
    `${page.library.id}:${page.counts.quotes}:${page.counts.all}`
  )
  const [query, setQuery] = React.useState("")
  const words = query.trim().toLowerCase()
  const shown = (data ?? []).filter(
    (quote) => !words || quote.text.toLowerCase().includes(words) || (quote.authorName ?? "").toLowerCase().includes(words)
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardTitleHeader
        icon={<QuoteIcon className="size-4" />}
        title="Quotes"
        meta={`${shown.length.toLocaleString()} ${plural(shown.length, "quote")}`}
        action={
          <SearchToggle name="quote-search" label="Search quotes" placeholder="Search quotes" value={query} onChange={setQuery} />
        }
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        {error ? (
          <ErrorRow message={error} onRetry={retry} />
        ) : data === null ? (
          <LoadingRow label="Loading the quotes" />
        ) : shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {data.length
              ? "No quote matches that."
              : "No quotes yet. Analyse a video or a post and its best lines show here."}
          </p>
        ) : (
          <ul className="grid gap-2 p-4">
            {shown.map((quote, index) => (
              <li key={`${quote.noteId}-${index}`}>
                <button
                  type="button"
                  onClick={() => onOpen(quote)}
                  className={cn("grid w-full gap-1 rounded-md border bg-background px-3 py-2 text-left hover:bg-muted", focusRing)}
                >
                  <span className={cn("text-sm", quote.kind === "highlight" && HIGHLIGHT_CLASS.yellow)}>
                    “{quote.text}”
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[quote.authorName, noteTitle(quote.title), quote.startMs !== null ? formatTimecode(quote.startMs) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}
