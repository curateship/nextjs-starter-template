import * as React from "react"
import { BanIcon, ExternalLinkIcon, MessageSquareTextIcon, SkipForwardIcon } from "lucide-react"

import { CrmGroupRow, CrmTable, CrmTableRow, MainCell, useFolds } from "@/components/crm/crm-table"
import { CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { ViewMenu } from "@/components/shared/view-menu"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { TableCell } from "@/components/ui/table"
import { matchesFindSearch } from "@/lib/social/find-search"
import { isFindsTab, type FindsTab, type RedditView } from "@/lib/social/reddit/options"
import { emptyFindsWords, postedDateText } from "@/lib/social/wording"
import { usePromoGuest } from "@/components/social/guest/guest-mode"
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

/** The tabs across the top: which stored status each of posts means, then Today and Sent, the comments that went out. */
const TABS: Array<{ id: RedditView; label: string }> = [
  { id: "new", label: "To look at" },
  { id: "commented", label: "Replied" },
  { id: "skipped", label: "Skipped" },
  { id: "today", label: "Today" },
  { id: "comments", label: "Sent" },
]

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
  header,
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
  /**
   * The middle's one header, handed this list's tabs to draw in it (Tyler,
   * 12 Nov 2026: the project page in the new design).
   */
  header: (tabs: React.ReactNode, tools: FindsHeaderTools) => React.ReactNode
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
  const [massSelect, setMassSelect] = React.useState(false)

  /**
   * A tick only counts while its row is on screen, so "Skip 20" can never mean
   * twenty rows a refresh or a tab change took away. Worked out for this render
   * rather than pruned in an effect.
   */
  const ticked = React.useMemo(() => {
    if (!tickable || !massSelect) return new Set<string>()
    const alive = new Set(shown.map((find) => find.id))
    return new Set([...rawTicked].filter((id) => alive.has(id)))
  }, [tickable, massSelect, shown, rawTicked])

  async function skip(ids: string[]) {
    setSkipping(true)
    try {
      await onSkip(ids)
      setTicked(new Set())
    } finally {
      setSkipping(false)
    }
  }
  const guest = usePromoGuest()
  async function block(subreddit: string) {
    setBlocking(subreddit)
    try {
      await onBlock(subreddit)
    } finally {
      setBlocking(null)
    }
  }

  /**
   * Upvotes or replies, most first or fewest first, from their column
   * headings, or the best-fit order under Post. Sorted by a figure, the list
   * is one list with no fit groups, since they would cut the order up (Tyler,
   * 13 Oct 2026).
   */
  const [sort, setSort] = React.useState<{ by: "score" | "commentCount"; most: boolean } | null>(null)
  const toggleSort = (column: Column) => {
    if (column === "post" || column === "where") return setSort(null)
    const by = column === "upvotes" ? "score" : "commentCount"
    setSort((current) => (!current || current.by !== by ? { by, most: true } : { by, most: !current.most }))
  }
  const folds = useFolds()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)

  /** The rows in fit order, under a heading for each group that has any. */
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
  const ids = grouped.flatMap((group) => (group.band && folds.folded(FIT_BAND_LABELS[group.band]) ? [] : group.rows)).map((find) => find.id)

  /** What a post can do, from its right-click menu: Skip, Block its subreddit, Open on Reddit. */
  const actionsFor = (find: FindRow): RowMenuItem[] => [
    ...(tab === "new" ? [{ label: "Skip", icon: <SkipForwardIcon className="size-4" />, onSelect: () => void skip([find.id]) }] : []),
    { label: "Open on Reddit", icon: <ExternalLinkIcon className="size-4" />, onSelect: () => openOnReddit(find.url) },
    // A post already replied to is never hidden, and blocking hides a subreddit from every project, so it is the owner's alone.
    ...(find.status === "commented" || guest || blocking
      ? []
      : [{ label: `Block r/${find.subreddit}`, icon: <BanIcon className="size-4" />, destructive: true, onSelect: () => void block(find.subreddit) }]),
  ]

  const tools: FindsHeaderTools = {
    selected:
      massSelect && ticked.size ? (
        <SelectedMenu
          count={ticked.size}
          busy={skipping}
          onClear={() => setTicked(new Set())}
          pages={{}}
          main={(menu) => (
            <SelectedMenuRow
              onClick={() => {
                menu.close()
                void skip([...ticked])
              }}
            >
              <SkipForwardIcon className="size-4 text-muted-foreground" />
              Skip
            </SelectedMenuRow>
          )}
        />
      ) : null,
    massSelect: tickable
      ? {
          on: massSelect,
          onToggle: () => {
            setTicked(new Set())
            setMassSelect(!massSelect)
          },
        }
      : null,
  }

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      {header(
        <>
          <span className="hidden @3xl:contents">
            {/* Drawn once the first read is in, so the line lands once under "To look at 26" rather
                than under "To look at" and then sliding wider (Tyler, 12 Nov 2026: "this border and
                tab here loads twice"). */}
            {loading && !finds.length ? (
              <span className="flex-1" />
            ) : (
              <DashboardTabs
                value={view}
                onValueChange={(next) => onTabChange(next as RedditView)}
                tabs={TABS.map((item) => ({
                  value: item.id,
                  label: item.label,
                  // Today and Sent count nothing here; their lists do.
                  count: isFindsTab(item.id) ? counts[item.id] : undefined,
                }))}
              />
            )}
          </span>
          <span className="shrink-0 @3xl:hidden">
            <ViewMenu
              value={view}
              onValueChange={(next) => onTabChange(next as RedditView)}
              choices={TABS.map((item) => ({ value: item.id, label: item.label, count: isFindsTab(item.id) ? counts[item.id] : undefined }))}
              label="Which list"
            />
          </span>
        </>,
        tools
      )}

      {/* A container, so the tables in Today and Comments fold their columns
          by this column's width rather than the window's. */}
      {showsPosts ? null : <div className="@container flex min-h-0 flex-1 flex-col">{otherView}</div>}

      {!showsPosts ? null : error ? (
        <div className="px-6 py-3">
          <ErrorRow message={`The posts could not be read. ${error}`} onRetry={onRetry} />
        </div>
      ) : loading && !finds.length ? (
        <div className="px-6 py-3">
          <LoadingRow label="Reading the posts" />
        </div>
      ) : (
        <CrmTable<Column>
          columns={[
            { key: "post", label: "Post", column: "main", className: "min-w-40" },
            { key: "where", label: "Where", column: "preview", className: "hidden md:hidden @2xl:table-cell", sortable: false },
            { key: "upvotes", label: "Upvotes", column: "meta", className: "hidden md:hidden @lg:table-cell" },
            { key: "replies", label: "Replies", column: "meta", className: "hidden md:hidden @lg:table-cell" },
          ]}
          sort={!sort ? "post" : sort.by === "score" ? "upvotes" : "replies"}
          direction={!sort ? "asc" : sort.most ? "desc" : "asc"}
          onSort={toggleSort}
          actions={false}
          select={
            massSelect && tickable
              ? {
                  noun: "posts",
                  disabled: ids.length === 0,
                  checked: ticked.size === 0 ? false : ticked.size === ids.length ? true : "indeterminate",
                  onToggle: () => setTicked(ticked.size === ids.length ? new Set() : new Set(ids)),
                }
              : null
          }
          empty={
            shown.length
              ? null
              : emptyFindsWords({ loading, everything, hasKeywords, tab, searchHidAll: inTab.length > 0 && shown.length === 0 })
          }
        >
          {grouped.map((group) => {
            const label = group.band ? FIT_BAND_LABELS[group.band] : null
            return (
              <React.Fragment key={label ?? "sorted"}>
                {label ? (
                  <CrmGroupRow label={label} count={group.rows.length} folded={folds.folded(label)} onToggle={() => folds.toggle(label)} />
                ) : null}
                {label && folds.folded(label)
                  ? null
                  : group.rows.map((find) => {
                      const where = [`r/${find.subreddit}`, find.postedAt ? postedDateText(find.postedAt) : null, find.place, nameKeywords ? keywordNames.get(find.keywordId) : null]
                        .filter(Boolean)
                        .join(" · ")
                      return (
                        <CrmTableRow
                          key={find.id}
                          open={find.id === selectedId}
                          label={find.title}
                          tick={{
                            shown: massSelect && tickable,
                            ticked: ticked.has(find.id),
                            onToggle: () =>
                              setTicked((current) => {
                                const next = new Set(current)
                                if (next.has(find.id)) next.delete(find.id)
                                else next.add(find.id)
                                return next
                              }),
                          }}
                          onOpen={() => onSelect(find.id)}
                          onRightClick={(x, y) => setRightClick({ id: find.id, x, y })}
                        >
                          <MainCell name={find.title}>
                            {/* A quiet mark that the replies are already read, so the post can be answered at once. */}
                            {find.threadRead ? (
                              <MessageSquareTextIcon className="size-3.5 shrink-0 text-muted-foreground" role="img" aria-label="Replies read, ready to answer" />
                            ) : null}
                          </MainCell>
                          <TableCell column="preview" className="hidden max-w-56 md:hidden @2xl:table-cell">
                            <span className="block truncate text-muted-foreground">{where}</span>
                          </TableCell>
                          <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @lg:table-cell">
                            {find.score}
                          </TableCell>
                          <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @lg:table-cell">
                            {find.commentCount}
                          </TableCell>
                        </CrmTableRow>
                      )
                    })}
              </React.Fragment>
            )
          })}
        </CrmTable>
      )}
      {rightClick ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={tickable ? { on: massSelect, onToggle: () => tools.massSelect?.onToggle() } : null}
          items={(() => {
            const find = shown.find((each) => each.id === rightClick.id)
            return find ? actionsFor(find) : []
          })()}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )
}

type Column = "post" | "where" | "upvotes" | "replies"

/** The list's Select and "N selected" menu, which the middle's one header draws. */
export type FindsHeaderTools = {
  selected: React.ReactNode
  massSelect: { on: boolean; onToggle: () => void } | null
}

/** Only an address on Reddit is ever opened from a stored value. */
function openOnReddit(url: string) {
  if (url.startsWith("https://www.reddit.com/")) window.open(url, "_blank", "noopener,noreferrer")
}
