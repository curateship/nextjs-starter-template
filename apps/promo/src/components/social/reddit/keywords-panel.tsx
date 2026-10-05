import * as React from "react"
import { Loader2Icon, PlusIcon, SearchIcon, XIcon } from "lucide-react"

import { CardTop } from "@/components/shared/feed-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  REDDIT_SORTS,
  REDDIT_WINDOWS,
  type RedditSort,
  type RedditWindow,
} from "@/lib/social/reddit/options"
import { keywordScopeText } from "@/lib/social/wording"
import { cn } from "@/lib/utils"
import type { KeywordRow } from "@/server/social/keywords"

/**
 * The saved keywords, with the box that adds one at the bottom.
 *
 * The form is at the bottom rather than the top because the list is what a
 * person comes here to use: a saved keyword is pressed many times and added
 * once. For the same reason it starts shut, as a dashed Add keyword button,
 * and the list gets the panel.
 *
 * It starts open only when there are no keywords at all, because then the form
 * is the only thing on the screen worth pressing and making somebody press a
 * button to reach it is a wasted click.
 */

/** Plain words for each of Reddit's sorts, with the measured one first. */
const SORT_LABELS: Record<RedditSort, string> = {
  relevance: "Best match",
  new: "Newest",
  top: "Most upvoted",
  comments: "Most replied to",
}

const WINDOW_LABELS: Record<RedditWindow, string> = {
  hour: "Past hour",
  day: "Past day",
  week: "Past week",
  month: "Past month",
  year: "Past year",
  all: "Any time",
}

export function KeywordsPanel({
  keywords,
  loading,
  selectedId,
  runningIds,
  onSelect,
  onAdd,
  onRun,
  onDelete,
}: {
  keywords: KeywordRow[]
  loading: boolean
  selectedId: string | null
  /** Keywords with a search job waiting or running. */
  runningIds: Set<string>
  onSelect: (id: string) => void
  onAdd: (input: {
    term: string
    sort: RedditSort
    timeWindow: RedditWindow
    subreddits: string[]
  }) => Promise<void>
  onRun: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [term, setTerm] = React.useState("")
  const [subreddits, setSubreddits] = React.useState("")
  const [sort, setSort] = React.useState<RedditSort>("relevance")
  const [timeWindow, setTimeWindow] = React.useState<RedditWindow>("week")
  const [adding, setAdding] = React.useState(false)

  /**
   * Whether the form is showing.
   *
   * Open to begin with only when nothing is saved. Worked out once, when this
   * panel first draws, rather than followed for the life of the screen: a form
   * that shut itself the moment the first keyword was added would take the
   * fields away while somebody was still looking at them.
   */
  const [open, setOpen] = React.useState(() => keywords.length === 0)

  function clear() {
    setTerm("")
    setSubreddits("")
    setSort("relevance")
    setTimeWindow("week")
  }

  function cancel() {
    clear()
    setOpen(false)
  }

  async function add(event: React.FormEvent) {
    event.preventDefault()
    if (!term.trim() || adding) return
    setAdding(true)
    try {
      await onAdd({
        term: term.trim(),
        sort,
        timeWindow,
        subreddits: subreddits
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
      })
      clear()
      // Shut on the way out. The keyword is now a card in the list above, which
      // is the answer to "did that work".
      setOpen(false)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CardTop
        icon={SearchIcon}
        title="Keywords"
        meta={keywords.length ? `${keywords.length} saved` : undefined}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-2 p-3">
          {loading && !keywords.length ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Reading your keywords
            </p>
          ) : !keywords.length ? (
            <p className="py-6 text-sm text-muted-foreground">
              No keywords yet. Fill in the box below and it searches straight
              away.
            </p>
          ) : (
            keywords.map((keyword) => (
              <KeywordCard
                key={keyword.id}
                keyword={keyword}
                selected={keyword.id === selectedId}
                running={runningIds.has(keyword.id)}
                onSelect={onSelect}
                onRun={onRun}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {open ? (
        <form onSubmit={add} className="grid gap-3 border-t p-3">
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="promo-keyword-term">
            What to search Reddit for
          </label>
          <Input
            id="promo-keyword-term"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="project management tool"
            maxLength={200}
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="promo-keyword-subs">
            Only these subreddits
          </label>
          <Input
            id="promo-keyword-subs"
            value={subreddits}
            onChange={(event) => setSubreddits(event.target.value)}
            placeholder="Leave empty to search all of Reddit"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="grid min-w-0 gap-2">
            <label className="text-sm font-medium" htmlFor="promo-keyword-sort">
              Reddit's order
            </label>
            <Select
              value={sort}
              onValueChange={(value) => setSort(value as RedditSort)}
            >
              <SelectTrigger id="promo-keyword-sort" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REDDIT_SORTS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {SORT_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid min-w-0 gap-2">
            <label className="text-sm font-medium" htmlFor="promo-keyword-window">
              How far back
            </label>
            <Select
              value={timeWindow}
              onValueChange={(value) => setTimeWindow(value as RedditWindow)}
            >
              <SelectTrigger id="promo-keyword-window" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REDDIT_WINDOWS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {WINDOW_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" className="flex-1" disabled={!term.trim() || adding}>
            {adding ? <Loader2Icon className="animate-spin" /> : null}
            Add and search
          </Button>
          {/*
            Never disabled. It used to switch off while the fields were empty,
            on the reasoning that there was nothing to cancel — which read as a
            broken button, because what a person means by Cancel is "put this
            away", not "undo my typing".
          */}
          <Button type="button" variant="outline" disabled={adding} onClick={cancel}>
            Cancel
          </Button>
        </div>
        </form>
      ) : (
        <div className="border-t p-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-12 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed text-sm font-medium text-muted-foreground hover:border-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <PlusIcon className="size-4" />
            Add keyword
          </button>
        </div>
      )}
    </div>
  )
}

function KeywordCard({
  keyword,
  selected,
  running,
  onSelect,
  onRun,
  onDelete,
}: {
  keyword: KeywordRow
  selected: boolean
  running: boolean
  onSelect: (id: string) => void
  onRun: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border p-3",
        selected && "bg-muted"
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(keyword.id)}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-sm font-medium">{keyword.term}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {running
            ? "Searching Reddit"
            : keyword.lastRun?.status === "failed"
              ? keyword.lastRun.error || "The last search failed"
              : keywordScopeText(keyword)}
        </span>
      </button>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        title="Search Reddit for this again"
        disabled={busy || running}
        onClick={async () => {
          setBusy(true)
          try {
            await onRun(keyword.id)
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy || running ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <SearchIcon />
        )}
      </Button>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        title="Remove this keyword and everything it found"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await onDelete(keyword.id)
          } finally {
            setBusy(false)
          }
        }}
      >
        <XIcon />
      </Button>
    </div>
  )
}
