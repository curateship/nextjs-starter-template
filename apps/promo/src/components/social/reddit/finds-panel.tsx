import * as React from "react"
import { BanIcon, Loader2Icon } from "lucide-react"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { emptyFindsWords, postedDateText } from "@/lib/social/wording"
import { cn } from "@/lib/utils"
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
 * bands these rows group under, and the line under each title gives the reason.
 */

/** The three tabs across the top, and which stored status each one means. */
const TABS = [
  { id: "new", label: "To look at" },
  { id: "commented", label: "Replied" },
  { id: "skipped", label: "Skipped" },
] as const

export type FindsTab = (typeof TABS)[number]["id"]

export function FindsPanel({
  keywordTerm,
  finds,
  loading,
  error,
  selectedId,
  tab,
  onTabChange,
  onSelect,
  onSkip,
  onBlock,
  onRetry,
}: {
  /** The keyword these posts came from, or null when none is chosen. */
  keywordTerm: string | null
  /** Every post for the keyword, whatever its status. This panel splits them. */
  finds: FindRow[]
  loading: boolean
  error: string | null
  selectedId: string | null
  tab: FindsTab
  onTabChange: (tab: FindsTab) => void
  onSelect: (findId: string) => void
  onSkip: (findIds: string[]) => Promise<void>
  /**
   * Blocks the subreddit a row came from, across every keyword. Its stored
   * posts leave the list in the same request, apart from any already
   * commented on.
   */
  onBlock: (subreddit: string) => Promise<void>
  onRetry: () => void
}) {
  const [rawTicked, setTicked] = React.useState<Set<string>>(new Set())
  const [skipping, setSkipping] = React.useState(false)
  /** The subreddit whose block is on its way, so its rows' buttons wait. */
  const [blocking, setBlocking] = React.useState<string | null>(null)

  // Shortlisted posts still need looking at, so they sit under the first tab
  // rather than disappearing into a fourth nobody asked for.
  const counts = React.useMemo(() => {
    const out: Record<FindsTab, number> = { new: 0, commented: 0, skipped: 0 }
    for (const find of finds) {
      if (find.status === "commented") out.commented += 1
      else if (find.status === "skipped") out.skipped += 1
      else out.new += 1
    }
    return out
  }, [finds])

  const shown = React.useMemo(
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

  /**
   * A tick only counts while its row is on screen, so "Skip 20" can never mean
   * twenty rows a refresh or a tab change took away. Worked out for this render
   * rather than pruned in an effect.
   */
  const ticked = React.useMemo(() => {
    const alive = new Set(shown.map((find) => find.id))
    return new Set([...rawTicked].filter((id) => alive.has(id)))
  }, [shown, rawTicked])

  const allTicked = shown.length > 0 && ticked.size === shown.length

  /** The rows in band order, with a heading row before each band that has any. */
  const grouped = React.useMemo(() => {
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
  }, [shown])

  return (
    <DashboardTable
      // No card of its own: the panel around it is the card, and a surface
      // inside one would draw a second border a pixel in from the first.
      //
      // The toolbar's top, bottom and right padding drops from 16px to 12px,
      // so the tabs sit the same distance from all three edges and the header
      // is 56px: the column headings' top line then lands on the same pixel
      // row as the 57px headers of the panels either side (56 plus their 1px
      // border). Set here rather than in the shell's toolbar, which every
      // other table shares.
      className="min-h-0 border-0 bg-transparent shadow-none [&>div:first-child]:py-3 [&>div:first-child]:pr-3"
      fillHeight
      title={keywordTerm ? `"${keywordTerm}"` : "Posts worth answering"}
      count={shown.length}
      countsPending={loading && !finds.length}
      busy={loading && finds.length > 0}
      error={error ? { message: error, onRetry } : null}
      selectedCount={ticked.size}
      onClearSelection={() => setTicked(new Set())}
      controls={
        <div className="flex items-center gap-2">
          {ticked.size ? (
            <Button
              type="button"
              variant="outline"
              disabled={skipping}
              onClick={async () => {
                setSkipping(true)
                try {
                  await onSkip([...ticked])
                  setTicked(new Set())
                } finally {
                  setSkipping(false)
                }
              }}
            >
              {skipping ? <Loader2Icon className="animate-spin" /> : null}
              Skip {ticked.size}
            </Button>
          ) : null}
          <StatusTabs tab={tab} counts={counts} onChange={onTabChange} />
        </div>
      }
      footer={{ type: "summary", count: shown.length, label: "posts" }}
      isEmpty={!shown.length}
      emptyText={emptyFindsWords(loading, Boolean(keywordTerm), tab)}
      emptyColSpan={7}
      header={
        <TableHeader>
          <TableRow>
            <TableHead column="select">
              <Checkbox
                checked={allTicked}
                aria-label="Tick every post listed"
                onCheckedChange={(checked) =>
                  setTicked(
                    checked ? new Set(shown.map((find) => find.id)) : new Set()
                  )
                }
              />
            </TableHead>
            {/*
              The shell's own column sizes, not hand-written widths. `main` is
              `w-full min-w-80` so the title takes whatever is left, and `meta`
              is `w-px whitespace-nowrap` so each figure shrinks to its own
              content. Writing `w-36` and friends instead is what crushed the
              title column to "I b…".
            */}
            <TableHead column="main">Post</TableHead>
            <TableHead column="meta">Subreddit</TableHead>
            <TableHead column="meta">Date</TableHead>
            <TableHead column="meta" className="text-right">
              Upvotes
            </TableHead>
            <TableHead column="meta" className="text-right">
              Replies
            </TableHead>
            <TableHead column="meta">Actions</TableHead>
          </TableRow>
        </TableHeader>
      }
    >
      <>
        {grouped.map(({ band, rows }) => (
          <React.Fragment key={band}>
            <TableRow className="hover:bg-muted/50">
              <TableCell
                colSpan={7}
                className="bg-muted/50 py-1.5 text-xs font-medium"
              >
                {FIT_BAND_LABELS[band]}
                <span className="ml-2 font-normal text-muted-foreground">
                  {rows.length}
                </span>
              </TableCell>
            </TableRow>

            {rows.map((find) => (
              <TableRow
                key={find.id}
                rowAction={() => onSelect(find.id)}
                className={cn(
                  // A line down the left edge rather than a fill, so the chosen
                  // row reads as chosen at a glance without the whole row
                  // changing colour and fighting the band headings above it.
                  //
                  // Drawn inside the first cell, not as the row's border. A
                  // row's border in this table sits outside its cells, so when
                  // the chosen row scrolled up under the sticky column
                  // headings the headings covered the cells and left the black
                  // border showing beside them. Found 6 Oct 2026.
                  find.id === selectedId &&
                    "bg-muted [&>td:first-child]:shadow-[inset_2px_0_0_var(--foreground)]"
                )}
              >
                <TableCell column="select">
                  <Checkbox
                    checked={ticked.has(find.id)}
                    aria-label={`Tick ${find.title}`}
                    onClick={(event) => event.stopPropagation()}
                    onCheckedChange={(checked) =>
                      setTicked((current) => {
                        const next = new Set(current)
                        if (checked) next.add(find.id)
                        else next.delete(find.id)
                        return next
                      })
                    }
                  />
                </TableCell>
                <TableCell column="main" className="max-w-0">
                  <span className="block truncate font-medium" title={find.title}>
                    {find.title}
                  </span>
                  <span
                    className="block truncate text-xs text-muted-foreground"
                    title={find.rankReason}
                  >
                    {find.rankReason}
                  </span>
                </TableCell>
                <TableCell column="meta" className="max-w-32">
                  <span className="block truncate text-muted-foreground">
                    r/{find.subreddit}
                  </span>
                </TableCell>
                <TableCell column="meta" className="text-muted-foreground">
                  {postedDateText(find.postedAt)}
                </TableCell>
                <TableCell column="meta" className="text-right tabular-nums">
                  {find.score}
                </TableCell>
                <TableCell column="meta" className="text-right tabular-nums">
                  {find.commentCount}
                </TableCell>
                <TableCell column="actions">
                  {/* A post already replied to is never hidden, so blocking
                      from its row would do nothing to it. Not offered. */}
                  {find.status === "commented" ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={blocking !== null}
                      title={`Block r/${find.subreddit}`}
                      aria-label={`Block r/${find.subreddit}`}
                      onClick={async () => {
                        setBlocking(find.subreddit)
                        try {
                          await onBlock(find.subreddit)
                        } finally {
                          setBlocking(null)
                        }
                      }}
                    >
                      {blocking === find.subreddit ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <BanIcon className="size-4" />
                      )}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </React.Fragment>
        ))}
      </>
    </DashboardTable>
  )
}

/**
 * The three counts across the top of the panel.
 *
 * Counts rather than plain names, because the number is the thing being
 * checked: "15 to look at, 0 replied" is the state of the work.
 */
function StatusTabs({
  tab,
  counts,
  onChange,
}: {
  tab: FindsTab
  counts: Record<FindsTab, number>
  onChange: (tab: FindsTab) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
      {TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          aria-pressed={tab === item.id}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm whitespace-nowrap",
            tab === item.id
              ? "bg-card font-medium shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {item.label}
          <span className="text-muted-foreground tabular-nums">
            {counts[item.id]}
          </span>
        </button>
      ))}
    </div>
  )
}
