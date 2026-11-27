import * as React from "react"
import { ProjectMenuButton } from "@/components/content-app/project-top"
import { Loader2Icon, MegaphoneIcon, SparklesIcon, TagIcon, XIcon } from "lucide-react"

import { MenuAction, MenuLine } from "@/components/shared/folding-menu"
import { Hint } from "@/components/social/hint"
import { ListHeader } from "@/components/content-app/list-header"
import { PanelReopenButton } from "@/components/shared/three-panels"
import { usePromoGuest } from "@/components/social/guest/guest-mode"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ProjectHeaderLead } from "@/components/social/projects/project-header-lead"
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
import { cn } from "@/lib/utils"
import type { KeywordRow } from "@/server/social/keywords"

import { KeywordPicker, type KeywordPickerItem } from "../keyword-picker"
import { KeywordIdeasDialog } from "./keyword-ideas-dialog"
import { StalledJobs } from "../stalled-jobs"

/**
 * The posts column's header: the tabs, then on the right the search box,
 * Select, the keywords dropdown and the column's buttons. The dropdown is the
 * shared `KeywordPicker`, beside Select since 14 Nov 2026; the chips Tyler
 * sent on 13 Oct 2026 took two lines once there were three keywords.
 *
 * Picking a keyword lists its posts alone; All keywords lists every keyword's
 * posts in one ranked list. Each keyword in the list carries its post count,
 * when it last searched, the timer, search again and Remove. The + turns the
 * list into Reddit's add box; with nothing saved the button says Add keyword
 * and opens straight on the box.
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
  onMark,
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
  /** Names you, or ordinary words; a marked keyword rings the bell on new posts. */
  onMark: (id: string, mark: "" | "you") => Promise<void>
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
      badge:
        keyword.mark === "you" ? (
          <Hint label="Names you: rings the bell on new posts">
            <TagIcon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Names you" />
          </Hint>
        ) : undefined,
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

  // The one middle header every list in the design has (`ListHeader`):
  // the tabs, the "N selected" menu, the search box, Select, the keywords
  // dropdown (`KeywordPicker`), the jobs warning, and the project's ⋮, with
  // Jobs among General's actions and Ideas and the self-promotion threads on
  // its Commenting tab.
  return (
    <>
      <ListHeader
        tabs={
          <>
            <PanelReopenButton side="left" label="Show the Projects page" />
            <ProjectHeaderLead />
            {tabs}
          </>
        }
        // Jobs, Ideas and the self-promotion threads are a tab of the project's ⋮, so the header has one ⋮.
        end={
          <>
            <ProjectMenuButton
              jobs={jobs}
              actions={{
                title: "Commenting",
                items: [
                  ...(guest ? [] : [{ label: "Ideas", icon: <SparklesIcon className="size-4" />, onClick: () => setIdeasOpen(true) }]),
                  { label: "Self-promotion threads", icon: <MegaphoneIcon className="size-4" />, onClick: onThreads },
                ],
              }}
            />
            <PanelReopenButton side="right" label="Show the post and your comment" />
          </>
        }
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
          <KeywordPicker
            items={items}
            loading={loading}
            selectedId={selectedId}
            onSelect={onSelect}
            onRun={onRun}
            onSwitch={onSwitch}
            menu={(item, close) => {
              const keyword = keywords.find((row) => row.id === item.id)
              return (
                <>
                  {/* Words only: a watch names a subreddit, not your name. The AI is off for a guest, and so is this. */}
                  {keyword?.term && !guest ? (
                    <>
                      <p className="px-2.5 py-1.5 text-xs text-muted-foreground">What these words are</p>
                      {(["", "you"] as const).map((mark) => (
                        <MenuAction
                          key={mark || "plain"}
                          icon={<TagIcon className={cn("size-4", !mark && "opacity-0")} />}
                          onClick={() => {
                            close()
                            void onMark(item.id, mark)
                          }}
                        >
                          {mark ? "Names you, rings the bell on new posts" : "Ordinary search words"}
                          {keyword.mark === mark ? <span className="ml-auto pl-3 text-xs text-muted-foreground">Picked</span> : null}
                        </MenuAction>
                      ))}
                      <MenuLine />
                    </>
                  ) : null}
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
                </>
              )
            }}
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
          {stalledJobs ? <StalledJobs queued={stalledJobs.queued} onOpen={stalledJobs.onOpen} /> : null}
          </>
        }
        menuLabel="More for these posts"
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
