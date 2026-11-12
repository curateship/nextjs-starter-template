import * as React from "react"
import { AlertTriangleIcon, ListChecksIcon, Loader2Icon, MegaphoneIcon, SparklesIcon, XIcon } from "lucide-react"

import { MenuAction } from "@/components/shared/folding-menu"
import { CrmListHeader } from "@/components/crm/crm-row"
import { PanelReopenButton } from "@/components/shared/three-panels"
import { usePromoGuest } from "@/components/social/guest/guest-mode"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { keywordChipTimeText, keywordScopeText, keywordTitle } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { KeywordRow } from "@/server/social/keywords"

import { KeywordPicker, type KeywordPickerItem } from "../keyword-picker"
import { KeywordIdeasDialog } from "./keyword-ideas-dialog"
import { ProjectBackButton } from "@/components/social/projects/project-back"

/**
 * The posts column's header: Reddit's name, then on the right the search box,
 * the keywords dropdown and the column's buttons (Tyler, 21 Oct 2026). The dropdown is the shared `KeywordPicker`
 * (Tyler, 21 Oct 2026); the chips Tyler sent on 13 Oct 2026 took two lines
 * once there were three keywords.
 *
 * Picking a keyword lists its posts alone; All keywords lists every keyword's
 * posts in one ranked list. Each keyword in the list carries its post count,
 * when it last searched, the timer, search again and Remove. Add keyword turns
 * the list into Reddit's add box, and the dropdown opens on it when nothing is
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
  searchText,
  onSearchText,
  tabs,
  tools,
  stalledJobs,
  jobs,
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
  /** The words the posts are narrowed by, in the header's search box. */
  searchText: string
  onSearchText: (text: string) => void
  /** The list's Select and its "N selected" menu, handed up by the list. */
  tools: { selected: React.ReactNode; massSelect: { on: boolean; onToggle: () => void } | null }
  /** Opens the Self-promotion threads window, from the "⋮" menu. */
  onThreads: () => void
  /**
   * The list's tabs (To look at, Replied, Skipped, Today, Sent), in the one
   * header in place of a title (Tyler, 12 Nov 2026: the project page in the
   * new design; "There should only be one middle header").
   */
  tabs: React.ReactNode
  /**
   * The browser program is not running and jobs wait: a small amber warning
   * in the header, its words on hover, opening the jobs when pressed (null
   * for a guest, who has no Jobs window). Null while all is well.
   */
  stalledJobs: { queued: number; onOpen: (() => void) | null } | null
  /** The Jobs window in the ⋮, with how many are running or waiting. Null for a guest. */
  jobs: { waiting: number; onOpen: () => void } | null
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
  // Ideas are written by the AI, which is off for a guest sent from Project.
  const guest = usePromoGuest()

  const items: KeywordPickerItem[] = keywords.map((keyword) => {
    const running = runningIds.has(keyword.id)
    const failed = keyword.lastRun?.status === "failed"
    return {
      id: keyword.id,
      label: keywordTitle(keyword),
      count: keyword.postCount,
      status: running
        ? stalled
          ? "waiting"
          : keyword.term
            ? "searching"
            : "reading"
        : failed
          ? "search failed"
          : `${keywordChipTimeText(keyword)} · ${keywordScopeText(keyword)}`,
      failed: failed ? keyword.lastRun?.error || "The last search failed" : null,
      enabled: keyword.enabled,
      running,
      stalled,
      runHint: keyword.term ? "Search Reddit for this again" : "Read the newest posts again",
      runningReason: stalled
        ? "A search is already waiting for the browser program. The Jobs page says why."
        : "Searching now",
    }
  })

  // The one middle header every list in the design has (`CrmListHeader`):
  // the tabs, the "N selected" menu, the search box, Select, and a ⋮ with
  // Jobs, Ideas and the self-promotion threads. The keyword list itself is
  // drawn under the Commenting row on the left (`KeywordPicker`).
  return (
    <>
      <CrmListHeader
        tabs={
          <>
            <PanelReopenButton side="left" label="Show the project" />
            <ProjectBackButton />
            {tabs}
          </>
        }
        end={<PanelReopenButton side="right" label="Show the post and your comment" />}
        selected={tools.selected}
        massSelect={tools.massSelect}
        search={{
          name: "reddit-post-search",
          label: "Search these posts by title, subreddit or author",
          placeholder: "Search posts",
          value: searchText,
          onChange: onSearchText,
        }}
        view={
          <>
          {stalledJobs ? <StalledJobs queued={stalledJobs.queued} onOpen={stalledJobs.onOpen} /> : null}
          <KeywordPicker
            items={items}
            loading={loading}
            selectedId={selectedId}
            onSelect={onSelect}
            onRun={onRun}
            onSwitch={onSwitch}
            menu={(item, close) => (
              <MenuAction
                destructive
                icon={<XIcon className="size-4" />}
                onClick={() => {
                  close()
                  void onDelete(item.id)
                }}
              >
                Remove {item.label} and everything it found
              </MenuAction>
            )}
            addForm={(close) => (
              <AddKeywordForm
                onAdd={async (input) => {
                  await onAdd(input)
                  close()
                }}
                onCancel={close}
              />
            )}
          />
          </>
        }
        menuLabel={guest ? "Self-promotion threads" : "Jobs, ideas and self-promotion threads"}
        menuItems={[
          ...(jobs ? [{ label: jobs.waiting ? `Jobs · ${jobs.waiting}` : "Jobs", icon: <ListChecksIcon className="size-4" />, onClick: jobs.onOpen }] : []),
          ...(guest ? [] : [{ label: "Ideas", icon: <SparklesIcon className="size-4" />, onClick: () => setIdeasOpen(true) }]),
          { label: "Self-promotion threads", icon: <MegaphoneIcon className="size-4" />, onClick: onThreads },
        ]}
      />
      <KeywordIdeasDialog
        projectId={projectId}
        open={ideasOpen && !guest}
        onClose={() => setIdeasOpen(false)}
        onAdd={onAddIdea}
      />
    </>
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

/**
 * The browser program not running, as a small amber warning in the header:
 * the triangle and how many jobs wait, the whole sentence on hover, and the
 * Jobs window on a press.
 */
function StalledJobs({ queued, onOpen }: { queued: number; onOpen: (() => void) | null }) {
  const words = `The browser program is not running, so ${queued} ${queued === 1 ? "job is" : "jobs are"} waiting and nothing is searched.${onOpen ? " Press to see the jobs." : ""}`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={words}
          aria-disabled={onOpen ? undefined : true}
          className="shrink-0 gap-1 px-2 text-amber-700 hover:text-amber-800 dark:text-amber-400"
          onClick={onOpen ?? undefined}
        >
          <AlertTriangleIcon className="size-4" aria-hidden />
          <span className="tabular-nums">{queued}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{words}</TooltipContent>
    </Tooltip>
  )
}
