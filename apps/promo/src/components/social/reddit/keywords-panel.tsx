import * as React from "react"
import {
  EllipsisVerticalIcon,
  Loader2Icon,
  MegaphoneIcon,
  PlusIcon,
  RotateCwIcon,
  SparklesIcon,
  TimerIcon,
  TimerOffIcon,
  XIcon,
} from "lucide-react"

import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
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
import { keywordChipTimeText, keywordScopeText, keywordTimerText, keywordTitle } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import type { KeywordRow } from "@/server/social/keywords"

import { Hint } from "../hint"
import { KeywordIdeasDialog } from "./keyword-ideas-dialog"

/**
 * The saved keywords as a row of chips across the top of the posts column,
 * with Add keyword at the end and the column's buttons on the right. Tyler
 * sent this design on 13 Oct 2026.
 *
 * Pressing a chip lists that keyword's posts alone; pressing it again goes
 * back to every keyword's posts in one ranked list, which is what shows when
 * no chip is chosen. Each chip carries its post count, when it last searched
 * (pressing that switches its timed searches off and on), search again, and
 * remove.
 *
 * Add keyword opens its box in a popover. It opens by itself when nothing is
 * saved, because then it is the only thing on the screen worth pressing.
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

export function KeywordsBar({
  projectId,
  keywords,
  loading,
  selectedId,
  runningIds,
  stalled,
  search,
  actions,
  onThreads,
  onSelect,
  onAdd,
  onRun,
  onSwitch,
  onDelete,
  onAddIdea,
}: {
  /** The project the keywords belong to, which the ideas are written for. */
  projectId: string
  keywords: KeywordRow[]
  loading: boolean
  /** The chosen keyword's id, or anything else for every keyword's posts. */
  selectedId: string | null
  /** Keywords with a search job waiting or running. */
  runningIds: Set<string>
  /** The browser program is not running, so a waiting search says it waits rather than spinning. */
  stalled: boolean
  /** The posts' search box, drawn first in the buttons on the right. */
  search: React.ReactNode
  /** Opens the Self-promotion threads window, from the "⋮" menu. */
  onThreads: () => void
  /** The column's own buttons, drawn after the search box and before the "⋮" menu. */
  actions: React.ReactNode
  /** A keyword's id, or null to go back to every keyword's posts. */
  onSelect: (id: string | null) => void
  onAdd: (input: {
    term: string
    sort: RedditSort
    timeWindow: RedditWindow
    subreddits: string[]
  }) => Promise<void>
  onRun: (id: string) => Promise<void>
  /** Switches the keyword's timed searches on or off. */
  onSwitch: (id: string, enabled: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
  /** Saves and searches one idea from the ideas window. Throws with why when refused. */
  onAddIdea: (idea: { term: string } | { subreddit: string }) => Promise<void>
}) {
  const [ideasOpen, setIdeasOpen] = React.useState(false)
  // Open to begin with only when nothing is saved, worked out once so the box
  // never shuts itself while somebody is still typing in it.
  const [addOpen, setAddOpen] = React.useState(() => keywords.length === 0 && !loading)

  return (
    // The chips keep at least 28rem before the buttons move to a row of
    // their own.
    <DashboardCardHeader className="flex-wrap items-start gap-x-3 gap-y-2">
      <div className="flex min-h-8 min-w-0 grow basis-[28rem] flex-wrap items-center gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Keywords</span>
        {loading && !keywords.length ? (
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Reading your keywords" />
        ) : null}
        {keywords.map((keyword) => (
          <KeywordChip
            key={keyword.id}
            keyword={keyword}
            selected={keyword.id === selectedId}
            running={runningIds.has(keyword.id)}
            stalled={stalled}
            onSelect={() => onSelect(keyword.id === selectedId ? null : keyword.id)}
            onRun={onRun}
            onSwitch={onSwitch}
            onDelete={onDelete}
          />
        ))}

        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-full border border-dashed px-3 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <PlusIcon className="size-4" aria-hidden="true" />
              Add keyword
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-3">
            <AddKeywordForm
              onAdd={async (input) => {
                await onAdd(input)
                setAddOpen(false)
              }}
              onCancel={() => setAddOpen(false)}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* A row of its own on a phone, where the search box takes what the
          two buttons leave. */}
      <div className="ml-auto flex w-full min-w-0 items-center gap-2 sm:w-auto sm:shrink-0">
        {search}
        {actions}
        {/* The column's less used tools, behind one button. Tyler, 13 Oct 2026. */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="More">
                  <EllipsisVerticalIcon />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Ideas and self-promotion threads</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => setIdeasOpen(true)}>
              <SparklesIcon />
              Ideas
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onThreads}>
              <MegaphoneIcon />
              Self-promotion threads
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <KeywordIdeasDialog
        projectId={projectId}
        open={ideasOpen}
        onClose={() => setIdeasOpen(false)}
        onAdd={onAddIdea}
      />
    </DashboardCardHeader>
  )
}

/**
 * One keyword: its name and post count choose it, the time says when it last
 * searched and switches its timer, and the two icons search again and remove.
 */
function KeywordChip({
  keyword,
  selected,
  running,
  stalled,
  onSelect,
  onRun,
  onSwitch,
  onDelete,
}: {
  keyword: KeywordRow
  selected: boolean
  running: boolean
  /** No browser program is running, so a search waiting here waits rather than runs. */
  stalled: boolean
  onSelect: () => void
  onRun: (id: string) => Promise<void>
  onSwitch: (id: string, enabled: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)
  const name = keywordTitle(keyword)
  const failed = keyword.lastRun?.status === "failed"

  async function act(work: () => Promise<void>) {
    setBusy(true)
    try {
      await work()
    } finally {
      setBusy(false)
    }
  }

  const iconButton =
    "flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"

  return (
    <div
      className={cn(
        "flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-full border bg-background pr-1 pl-3 text-sm",
        selected && "bg-muted"
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${name}, ${keywordScopeText(keyword)}`}
        onClick={onSelect}
        className="flex min-w-0 items-center gap-1.5 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="truncate font-medium">{name}</span>
        <span className="text-muted-foreground tabular-nums">{keyword.postCount}</span>
      </button>
      {/* When it last searched, or what it is doing now. A failed search says
          why on hover, since the chip has no room for the reason. */}
      <Hint label={failed && !running ? keyword.lastRun?.error || "The last search failed" : null}>
        <span
          // "just now" can become "1 minute ago" between the server drawing the
          // page and the browser taking it over. Not worth a warning.
          suppressHydrationWarning
          className={cn(
            "shrink-0 text-xs whitespace-nowrap",
            failed && !running ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {running
            ? stalled
              ? "· waiting"
              : keyword.term
                ? "· searching"
                : "· reading"
            : failed
              ? "· search failed"
              : `· ${keywordChipTimeText(keyword)}`}
        </span>
      </Hint>
      {/* The timer: whether it searches by itself every few hours. Its own
          icon beside the arrow since Tyler asked on 13 Oct 2026. */}
      <Hint
        label={
          keyword.enabled
            ? "Searches by itself every few hours. Press to stop that."
            : "Only searches when you press it. Press to search by itself every few hours."
        }
      >
        <button
          type="button"
          className={iconButton}
          aria-pressed={keyword.enabled}
          aria-label={
            keyword.enabled
              ? `${keywordTimerText(keyword)}. Searches by itself every few hours. Press to stop that.`
              : `${keywordTimerText(keyword)}. Press to search by itself every few hours.`
          }
          disabled={busy}
          onClick={() => void act(() => onSwitch(keyword.id, !keyword.enabled))}
        >
          {keyword.enabled ? (
            <TimerIcon className="size-3.5" aria-hidden="true" />
          ) : (
            <TimerOffIcon className="size-3.5" aria-hidden="true" />
          )}
        </button>
      </Hint>
      {/* Off while its search waits or runs, and the reason says which. */}
      <DisabledReason
        disabled={running}
        reason={
          stalled
            ? "A search is already waiting for the browser program. The Jobs page says why."
            : "Searching now"
        }
        className="rounded-full"
      >
        <Hint label={running ? null : keyword.term ? "Search Reddit for this again" : "Read the newest posts again"}>
          <button
            type="button"
            className={iconButton}
            aria-label={keyword.term ? `Search Reddit for ${name} again` : `Read ${name}'s newest posts again`}
            disabled={busy || running}
            onClick={() => void act(() => onRun(keyword.id))}
          >
            {busy || (running && !stalled) ? (
              <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCwIcon className="size-3.5" aria-hidden="true" />
            )}
          </button>
        </Hint>
      </DisabledReason>
      <Hint label="Remove this keyword and everything it found">
        <button
          type="button"
          className={iconButton}
          aria-label={`Remove ${name}`}
          disabled={busy}
          onClick={() => void act(() => onDelete(keyword.id))}
        >
          <XIcon className="size-3.5" aria-hidden="true" />
        </button>
      </Hint>
    </div>
  )
}

/** The words, the subreddits, Reddit's order and how far back. */
function AddKeywordForm({
  onAdd,
  onCancel,
}: {
  onAdd: (input: { term: string; sort: RedditSort; timeWindow: RedditWindow; subreddits: string[] }) => Promise<void>
  onCancel: () => void
}) {
  const [term, setTerm] = React.useState("")
  const [subreddits, setSubreddits] = React.useState("")
  const [sort, setSort] = React.useState<RedditSort>("relevance")
  const [timeWindow, setTimeWindow] = React.useState<RedditWindow>("week")
  const [adding, setAdding] = React.useState(false)
  const [tried, setTried] = React.useState(false)

  /** The subreddits as typed, split on commas. */
  const listed = subreddits
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
  /** No words and one subreddit is a watch, which lists that subreddit's new posts. */
  const watch = !term.trim() && listed.length === 1
  const empty = !term.trim() && !listed.length

  async function add(event: React.FormEvent) {
    event.preventDefault()
    if (adding) return
    if (empty) {
      setTried(true)
      showErrorToast("Type some words, or name one subreddit to watch.")
      return
    }
    setAdding(true)
    try {
      await onAdd({ term: term.trim(), sort, timeWindow, subreddits: listed })
    } finally {
      setAdding(false)
    }
  }

  return (
    <form onSubmit={add} className="grid gap-4">
      <div className="grid gap-2">
        <FieldLabel
          htmlFor="promo-keyword-term"
          hint="Leave it empty and name one subreddit to watch that subreddit's new posts instead."
        >
          What to search Reddit for
        </FieldLabel>
        <Input
          id="promo-keyword-term"
          value={term}
          autoFocus
          aria-invalid={(tried && empty) || undefined}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="project management tool"
          maxLength={200}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="promo-keyword-subs">Only these subreddits</Label>
        <Input
          id="promo-keyword-subs"
          value={subreddits}
          onChange={(event) => setSubreddits(event.target.value)}
          placeholder="Leave empty to search all of Reddit"
        />
      </div>

      {/* A watch reads the subreddit's newest posts, so Reddit's order and
          how far back mean nothing to it and are not offered. */}
      {watch ? (
        <p className="text-xs text-muted-foreground">
          No words, one subreddit: this watches r/
          {listed[0].replace(/^(https?:\/\/(www\.)?reddit\.com)?\/?r\//i, "")}&apos;s new posts, newest first.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="promo-keyword-sort">Reddit&apos;s order</Label>
            <Select value={sort} onValueChange={(value) => setSort(value as RedditSort)}>
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
            <Label htmlFor="promo-keyword-window">How far back</Label>
            <Select value={timeWindow} onValueChange={(value) => setTimeWindow(value as RedditWindow)}>
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
      )}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" disabled={adding} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={adding}>
          {adding ? <Loader2Icon className="animate-spin" /> : null}
          {watch ? "Watch it" : "Add and search"}
        </Button>
      </div>
    </form>
  )
}
