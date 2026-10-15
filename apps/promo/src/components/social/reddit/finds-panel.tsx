import * as React from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BanIcon,
  ChevronsUpDownIcon,
  Loader2Icon,
  MessageSquareIcon,
  MessageSquareTextIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react"

import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { matchesFindSearch } from "@/lib/social/find-search"
import { isFindsTab, type FindsTab, type RedditView } from "@/lib/social/reddit/options"
import { emptyFindsWords, postedDateText } from "@/lib/social/wording"
import { cn } from "@/lib/utils"
import { Hint } from "@/components/social/hint"
import type { FindRow } from "@/server/social/keywords"
import { FIT_BAND_LABELS, FIT_BANDS, type FitBand } from "@/server/social/reddit/rank"

/**
 * The posts, best to answer first, grouped under three named bands.
 *
 * The order is the point of this panel. Reddit's own search answers "which
 * posts match these words", which is not "where would a comment of mine be
 * read". A post with 2,288 replies matches perfectly and buries a new comment
 * at reply 2,289, so the rows are ordered by `rank.ts` instead.
 *
 * **The score itself is never shown.** It was a column called "Worth it" until
 * Tyler asked what it meant on 5 Oct 2026, which is the answer: a bare 2.0 on
 * no scale tells a reader nothing. The same order said in words is the three
 * bands these rows group under, and each row's tooltip gives the reason.
 *
 * Drawn as a plain list rather than the dashboard table since Tyler's design
 * of 13 Oct 2026: a title, one line of where and when, and the upvotes,
 * replies and Block on the right. Tyler asked for the tick boxes and Skip back
 * the same day, so posts under To look at can still be skipped several at once.
 */

/** The tabs across the top: which stored status each of posts means, then Today and Comments. */
const TABS: Array<{ id: RedditView; label: string }> = [
  { id: "new", label: "To look at" },
  { id: "commented", label: "Replied" },
  { id: "skipped", label: "Skipped" },
  { id: "today", label: "Today" },
  { id: "comments", label: "Comments" },
]

/** Each band's dot. The band's name is always written beside it. */
const BAND_DOTS: Record<FitBand, string> = {
  strong: "bg-emerald-500",
  possible: "bg-amber-500",
  low: "bg-muted-foreground/40",
}

export function FindsPanel({
  everything,
  keywordNames,
  hasKeywords,
  finds,
  searchText,
  loading,
  error,
  selectedId,
  tab: view,
  onTabChange,
  otherView,
  onSelect,
  onBlock,
  onSkip,
  onRetry,
}: {
  /** True when every keyword's posts are listed together rather than one keyword's. */
  everything: boolean
  /**
   * Each keyword's name by id. With several keywords mixed together, a row
   * names the keyword that found it.
   */
  keywordNames: Map<string, string>
  /** Whether any keyword is saved, so an empty list can say to add one. */
  hasKeywords: boolean
  /** Every post for the keyword, whatever its status. This panel splits them. */
  finds: FindRow[]
  /**
   * The words in the search box, which sits in the keywords row above
   * (`FindsSearch`). Narrows the rows already loaded, in the browser, so there
   * is no request per keystroke.
   */
  searchText: string
  loading: boolean
  error: string | null
  selectedId: string | null
  tab: RedditView
  onTabChange: (tab: RedditView) => void
  /** What Today and Comments show under the tabs, in place of the posts. */
  otherView: React.ReactNode
  onSelect: (findId: string) => void
  /**
   * Blocks the subreddit a row came from, across every keyword. Its stored
   * posts leave the list in the same request, apart from any already
   * commented on.
   */
  onBlock: (subreddit: string) => Promise<void>
  /** Skips the ticked posts. Any already commented on are left alone by the server. */
  onSkip: (findIds: string[]) => Promise<void>
  onRetry: () => void
}) {
  /** The subreddit whose block is on its way, so its rows' buttons wait. */
  const [blocking, setBlocking] = React.useState<string | null>(null)
  const [rawTicked, setTicked] = React.useState<Set<string>>(new Set())
  const [skipping, setSkipping] = React.useState(false)
  const nameKeywords = everything && keywordNames.size > 1
  const showsPosts = isFindsTab(view)
  // Today and Comments list no posts, so the posts' figures stay on the
  // first tab underneath them.
  const tab: FindsTab = showsPosts ? view : "new"

  /** The posts the search box lets through, whatever their status. */
  const matched = React.useMemo(
    () => finds.filter((find) => matchesFindSearch(find, searchText)),
    [finds, searchText]
  )

  // Shortlisted posts still need looking at, so they sit under the first tab
  // rather than disappearing into a fourth nobody asked for. Counted after the
  // search, so a tab's number is how many of its posts are on offer.
  const counts = React.useMemo(() => {
    const out: Record<FindsTab, number> = { new: 0, commented: 0, skipped: 0 }
    for (const find of matched) {
      if (find.status === "commented") out.commented += 1
      else if (find.status === "skipped") out.skipped += 1
      else out.new += 1
    }
    return out
  }, [matched])

  /** The tab's posts before the search, so "none match" and "none at all" stay apart. */
  const inTab = React.useMemo(
    () =>
      finds.filter((find) =>
        tab === "commented"
          ? find.status === "commented"
          : tab === "skipped"
            ? find.status === "skipped"
            : find.status !== "commented" && find.status !== "skipped"
      ),
    [finds, tab]
  )

  const shown = React.useMemo(
    () => inTab.filter((find) => matchesFindSearch(find, searchText)),
    [inTab, searchText]
  )

  /**
   * Only posts still to look at can be ticked: a skipped post is skipped
   * already, and one replied to is never skipped.
   */
  const tickable = showsPosts && tab === "new"

  /**
   * A tick only counts while its row is on screen, so "Skip 20" can never mean
   * twenty rows a refresh or a tab change took away. Worked out for this render
   * rather than pruned in an effect.
   */
  const ticked = React.useMemo(() => {
    if (!tickable) return new Set<string>()
    const alive = new Set(shown.map((find) => find.id))
    return new Set([...rawTicked].filter((id) => alive.has(id)))
  }, [tickable, shown, rawTicked])

  const allTicked = shown.length > 0 && ticked.size === shown.length

  async function skipTicked() {
    setSkipping(true)
    try {
      await onSkip([...ticked])
      setTicked(new Set())
    } finally {
      setSkipping(false)
    }
  }

  /**
   * Upvotes or replies, most first or fewest first, or null for the best-fit
   * order. Sorted by a figure, the list is one list with no band headings,
   * since the bands would cut the order up. Tyler, 13 Oct 2026.
   */
  const [sort, setSort] = React.useState<{ by: "score" | "commentCount"; most: boolean } | null>(null)

  /** Most first, then fewest first, and back again. The X beside them clears it. */
  function nextSort(by: "score" | "commentCount") {
    setSort((current) => (!current || current.by !== by ? { by, most: true } : { by, most: !current.most }))
  }

  /** The rows in band order, under a heading for each band that has any. */
  const grouped = React.useMemo((): Array<{ band: FitBand | null; rows: FindRow[] }> => {
    if (sort) {
      const sign = sort.most ? -1 : 1
      return [{ band: null, rows: [...shown].sort((a, b) => sign * (a[sort.by] - b[sort.by])) }]
    }
    const bands = new Map<FitBand, FindRow[]>()
    for (const find of shown) {
      const list = bands.get(find.fit)
      if (list) list.push(find)
      else bands.set(find.fit, [find])
    }
    return FIT_BANDS.flatMap((band) => {
      const rows = bands.get(band)
      return rows?.length ? [{ band, rows }] : []
    })
  }, [shown, sort])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The status tabs on the left; on the right the ticked posts' buttons,
          then the sort buttons, each above its own column of figures. */}
      <div className="flex shrink-0 flex-wrap items-end gap-x-4 border-b px-3">
        {/* Wraps on a phone, where five tabs are wider than the screen. */}
        <div role="tablist" aria-label="Which list" className="flex flex-wrap items-end gap-x-4">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={view === item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "-mb-px flex h-11 items-center gap-1.5 border-b-2 text-sm whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                view === item.id
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
              {/* Today and Comments count nothing here; their lists do. */}
              {isFindsTab(item.id) ? (
                <span className="font-normal text-muted-foreground tabular-nums">
                  {loading && !finds.length ? "" : counts[item.id]}
                </span>
              ) : null}
            </button>
          ))}
          {showsPosts && loading && finds.length ? (
            <Loader2Icon className="mb-3.5 size-4 animate-spin text-muted-foreground" aria-label="Reading the posts again" />
          ) : null}
        </div>
        {/* Ticking a post brings these in on the right of the tabs: tick
            them all, start over, or skip them. Tyler, 13 Oct 2026. */}
        {showsPosts ? (
        <div className="ml-auto flex h-11 items-center gap-3">
        {ticked.size ? (
          <div className="flex items-center gap-3">
            <Checkbox
              checked={allTicked ? true : "indeterminate"}
              aria-label="Tick every post listed"
              onCheckedChange={() =>
                setTicked(allTicked ? new Set() : new Set(shown.map((find) => find.id)))
              }
            />
            <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">{ticked.size} ticked</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setTicked(new Set())}>
              Clear
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={skipping} onClick={() => void skipTicked()}>
              {skipping ? <Loader2Icon className="animate-spin" /> : null}
              Skip {ticked.size}
            </Button>
          </div>
        ) : null}
          {/* The same widths as a row's upvotes, replies and Block, so each
              button sits over its own figures. */}
          <SortButton
            label="upvotes"
            className="w-14"
            icon={<ArrowUpIcon className="size-3.5" aria-hidden="true" />}
            sort={sort?.by === "score" ? (sort.most ? "most" : "fewest") : null}
            onClick={() => nextSort("score")}
          />
          <SortButton
            label="replies"
            className="w-14"
            icon={<MessageSquareIcon className="size-3.5" aria-hidden="true" />}
            sort={sort?.by === "commentCount" ? (sort.most ? "most" : "fewest") : null}
            onClick={() => nextSort("commentCount")}
          />
          {/* Over the Block column: while sorted, the way back to the bands. */}
          {sort ? (
            <Hint label="Clear sorting: back to Strong fit, Possible and Low fit">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground"
                aria-label="Clear sorting"
                onClick={() => setSort(null)}
              >
                <XIcon className="size-4" />
              </Button>
            </Hint>
          ) : (
            <span className="size-8 shrink-0" aria-hidden="true" />
          )}
        </div>
        ) : null}
      </div>

      {/* A container, so the tables in Today and Comments fold their columns
          by this column's width rather than the window's. */}
      {showsPosts ? null : <div className="@container flex min-h-0 flex-1 flex-col">{otherView}</div>}

      {showsPosts ? (
      <ScrollArea className="min-h-0 flex-1">
        {error ? (
          <div className="grid justify-items-start gap-3 p-4">
            <p className="text-sm text-muted-foreground">The posts could not be read. {error}</p>
            <Button type="button" variant="outline" onClick={onRetry}>
              <RefreshCwIcon />
              Try again
            </Button>
          </div>
        ) : loading && !finds.length ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            Reading the posts
          </p>
        ) : !shown.length ? (
          <p className="p-4 text-sm text-muted-foreground">
            {emptyFindsWords({
              loading,
              everything,
              hasKeywords,
              tab,
              searchHidAll: inTab.length > 0 && shown.length === 0,
            })}
          </p>
        ) : (
          <div className="pb-3">
            {grouped.map(({ band, rows }) => (
              <section
                key={band ?? "sorted"}
                aria-label={band ? `${FIT_BAND_LABELS[band]}, ${rows.length}` : `Sorted, ${rows.length}`}
                className={band ? undefined : "pt-1.5"}
              >
                {band ? (
                  <h3 className="flex items-center gap-2 px-3 pt-4 pb-1.5 text-xs font-medium">
                    <span className={cn("size-2 rounded-full", BAND_DOTS[band])} aria-hidden="true" />
                    {FIT_BAND_LABELS[band]}
                    <span className="font-normal text-muted-foreground tabular-nums">{rows.length}</span>
                  </h3>
                ) : null}
                {rows.map((find) => (
                  <FindLine
                    key={find.id}
                    find={find}
                    keywordName={nameKeywords ? (keywordNames.get(find.keywordId) ?? null) : null}
                    selected={find.id === selectedId}
                    tick={
                      tickable
                        ? {
                            checked: ticked.has(find.id),
                            onChange: (checked) =>
                              setTicked((current) => {
                                const next = new Set(current)
                                if (checked) next.add(find.id)
                                else next.delete(find.id)
                                return next
                              }),
                          }
                        : null
                    }
                    blocking={blocking}
                    onSelect={() => onSelect(find.id)}
                    onBlock={async () => {
                      setBlocking(find.subreddit)
                      try {
                        await onBlock(find.subreddit)
                      } finally {
                        setBlocking(null)
                      }
                    }}
                  />
                ))}
              </section>
            ))}
          </div>
        )}
      </ScrollArea>
      ) : null}
    </div>
  )
}

/** One post: its title, where and when, then upvotes, replies and Block. */
function FindLine({
  find,
  keywordName,
  selected,
  tick,
  blocking,
  onSelect,
  onBlock,
}: {
  find: FindRow
  /** The keyword that found it, said only when several are listed together. */
  keywordName: string | null
  selected: boolean
  /** The row's tick box, or null on a tab whose posts cannot be skipped. */
  tick: { checked: boolean; onChange: (checked: boolean) => void } | null
  /** The subreddit whose block is on its way, if any. */
  blocking: string | null
  onSelect: () => void
  onBlock: () => Promise<void>
}) {
  const where = [`r/${find.subreddit}`, find.postedAt ? postedDateText(find.postedAt) : null, find.place, keywordName]
    .filter(Boolean)
    .join(" · ")

  return (
    <div
      className={cn(
        "group flex min-w-0 items-center gap-3 px-3 py-2.5 hover:bg-muted/50",
        // A line down the left edge as well as the fill, so the open post
        // reads as chosen at a glance.
        selected && "bg-muted shadow-[inset_2px_0_0_var(--foreground)] hover:bg-muted"
      )}
    >
      {tick ? (
        <Checkbox
          checked={tick.checked}
          aria-label={`Tick ${find.title}`}
          onCheckedChange={(checked) => tick.onChange(checked === true)}
        />
      ) : null}
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected || undefined}
        className="grid min-w-0 flex-1 gap-0.5 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="truncate text-sm">{find.title}</span>
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <span className="truncate">{where}</span>
          {/* A quiet mark that the replies are already read, so the post can
              be answered with no Read the replies press. */}
          {find.threadRead ? (
            <MessageSquareTextIcon className="size-3.5 shrink-0" role="img" aria-label="Replies read, ready to answer" />
          ) : null}
        </span>
      </button>
      <Hint label="Upvotes">
        <span className="flex w-14 shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <ArrowUpIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="sr-only">Upvotes </span>
          {find.score}
        </span>
      </Hint>
      <Hint label="Replies">
        <span className="flex w-14 shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <MessageSquareIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="sr-only">Replies </span>
          {find.commentCount}
        </span>
      </Hint>
      {/* A post already replied to is never hidden, so blocking from its row
          would do nothing to it. Not offered, and the space is kept so the
          figures stay in line. */}
      {find.status === "commented" ? (
        <span className="size-8 shrink-0" aria-hidden="true" />
      ) : (
        <Hint label={`Block r/${find.subreddit}: its posts leave every list`}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground"
            disabled={blocking !== null}
            aria-label={`Block r/${find.subreddit}`}
            onClick={() => void onBlock()}
          >
            {blocking === find.subreddit ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <BanIcon className="size-4" />
            )}
          </Button>
        </Hint>
      )}
    </div>
  )
}

/**
 * The box that narrows the posts by title, subreddit or author. It sits in the
 * keywords row at the top of the column, with the column's other buttons, and
 * the words stay while the keyword or the tab changes, since they are still in
 * the box for anyone to see and clear.
 */
export function FindsSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <DashboardToolbarSearch
      name="reddit-post-search"
      aria-label="Search these posts by title, subreddit or author"
      placeholder="Search posts"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      inputClassName="sm:w-40 lg:w-40"
    />
  )
}

/**
 * A sort button over a column of figures: its icon, and an arrow while it
 * sorts. Pressing it switches between most first and fewest first.
 */
function SortButton({
  label,
  className,
  icon,
  sort,
  onClick,
}: {
  label: string
  className: string
  icon: React.ReactNode
  sort: "most" | "fewest" | null
  onClick: () => void
}) {
  const next = sort === "most" ? `Sort by ${label}, fewest first` : `Sort by ${label}, most first`
  return (
    <Hint label={next}>
      <button
        type="button"
        aria-label={next}
        aria-pressed={sort !== null}
        onClick={onClick}
        className={cn(
          "flex h-7 shrink-0 items-center gap-0.5 rounded-md text-xs hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          sort ? "text-foreground" : "text-muted-foreground",
          className
        )}
      >
        {icon}
        {sort === "most" ? (
          <ArrowDownIcon className="size-3" aria-hidden="true" />
        ) : sort === "fewest" ? (
          <ArrowUpIcon className="size-3" aria-hidden="true" />
        ) : (
          <ChevronsUpDownIcon className="size-3 opacity-50" aria-hidden="true" />
        )}
      </button>
    </Hint>
  )
}
