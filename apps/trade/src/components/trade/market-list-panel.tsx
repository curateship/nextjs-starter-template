import * as React from "react"
import { Link } from "@tanstack/react-router"

import { focusRing } from "@/lib/layout/focus-ring"

import { CautionBadge } from "@/components/trade/caution-badge"
import { ErrorBanner } from "@/components/ui/error-banner"
import { LoadingRow } from "@/components/ui/loading-row"
import { TableSortButton } from "@/components/ui/table"
import { formatChange, formatCompactUsd } from "@/lib/trade/format"
import { useLiveFigures } from "@/lib/trade/live-market"
import type { MarketRow } from "@/lib/protocols/contracts"
import { compareMarketChange24h } from "@/lib/trade/market-sort"
import type { FilteredMarketCatalog } from "@/lib/trade/market-volume"
import { cn } from "@/lib/utils"

/**
 * The market rows and the All markets list.
 *
 * These used to be their own panel with Watched and All tabs, above the
 * Folders panel. The two panels are one now (decided 23 Aug 2026): Watched
 * is the first row of the Folders panel and All markets is its last, so
 * this file keeps the pieces that panel composes — the sorted list of every
 * market, the row both it and the folders draw, and the testnet strip.
 */

type SortKey = "vol" | "change"

/** Which way a column starts when you first click it: biggest first, both. */
const SORT_STARTS_DESC: Record<SortKey, boolean> = {
  vol: true,
  change: true,
}

/**
 * The one set of columns the header row and every market row are both drawn
 * with — same side padding, same gap between columns. Written once because the
 * whole point is that the two agree; two copies would drift apart the first
 * time either was touched.
 *
 * 12px each side, matching the panel header's own gutter — Tyler asked for
 * the header, its buttons and the body to share one spacing (23 Aug 2026).
 * The rows carry the padding themselves and their background runs edge to
 * edge, so the list container keeps no side padding for rows to sit inside.
 */
const ROW_COLUMNS = "gap-1 px-3"

/**
 * The width the day's-move column reserves. Set by the widest thing in it,
 * which is the "24h Change" header rather than any pill — with the column
 * fixed, the pills line up under that label without needing a width of their
 * own.
 */
const CHANGE_COLUMN = "w-[5.5rem]"

const MAX_TICKER_CHARACTERS = 9

function tickerLabel(symbol: string) {
  return symbol.length <= MAX_TICKER_CHARACTERS
    ? symbol
    : `${symbol.slice(0, MAX_TICKER_CHARACTERS - 1)}…`
}

/**
 * Every market the exchange lists, sorted, under its own sort header row.
 *
 * One section of the Folders panel, so it brings no scroll surface of its
 * own — the panel scrolls everything together. Handed rows and callbacks; it
 * neither knows nor asks which exchange a row came from.
 */
export function AllMarketsList({
  catalogs,
  marketsError,
  marketsPending,
  selectedKey,
  onSelect,
  onRetry,
}: {
  catalogs: readonly FilteredMarketCatalog[]
  /** The exchange call failed at load; shown in place of rows. */
  marketsError: string | null
  /** The list is still streaming in with the opening answer. */
  marketsPending: boolean
  selectedKey: string | null
  onSelect: (key: string) => void
  onRetry: () => void
}) {
  const [sort, setSort] = React.useState<{ key: SortKey; desc: boolean }>({
    key: "change",
    desc: true,
  })
  // Clicking the sorted column flips it; clicking another column takes over at
  // the direction that column starts in.
  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { ...current, desc: !current.desc }
        : { key, desc: SORT_STARTS_DESC[key] }
    )

  const rows = React.useMemo(
    () => catalogs.flatMap((catalog) => catalog.rows),
    [catalogs]
  )
  const hasVolumeHiddenMarkets = catalogs.some(
    (catalog) => catalog.hiddenByVolumeRows.length > 0
  )

  const visible = React.useMemo(() => {
    const direction = sort.desc ? -1 : 1
    return [...rows].sort((a, b) => {
      if (sort.key === "change") {
        return compareMarketChange24h(a, b, sort.desc)
      }
      return (a.volume24hUsd - b.volume24hUsd) * direction
    })
  }, [rows, sort])

  // Checked before the error and the empty copy: while the opening answer
  // is still streaming in, neither claim would be true yet.
  if (marketsPending) {
    return <LoadingRow label="Loading markets" className="py-4" />
  }

  if (marketsError) {
    return (
      <div className="p-3">
        <ErrorBanner message={marketsError} onRetry={onRetry} />
      </div>
    )
  }

  if (visible.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-xs text-muted-foreground">
        {/* Searching lives in the market name at the top of the chart,
            which opens the whole catalogue with its own search — one search
            box for markets rather than two that filter different lists. */}
        {hasVolumeHiddenMarkets
          ? "No markets meet your daily volume setting."
          : "The exchange is not listing any markets right now."}
      </p>
    )
  }

  return (
    <div className="flex flex-col">
      {/* The sort, drawn as the column headers it sorts — the same sort
          buttons every dashboard table uses. Each sits over the figure it
          sorts by: 24h Vol over the volume beside each symbol, 24h Change
          over the day's-move pills. The headers use the row's own columns —
          same padding, same gap — so every label sits over the values it
          names. */}
      <div
        className={cn(
          "flex shrink-0 items-center border-b text-muted-foreground",
          ROW_COLUMNS
        )}
      >
        {/* Stays at the small size on every screen — the table default steps
            up to text-sm on wide screens, which overpowers a narrow panel. The
            label-to-arrow gap is tightened for the same reason. */}
        <TableSortButton
          active={sort.key === "vol"}
          direction={sort.desc ? "desc" : "asc"}
          onClick={() => toggleSort("vol")}
          className="flex-1 gap-1 whitespace-nowrap sm:text-xs"
        >
          24h Vol
        </TableSortButton>
        <TableSortButton
          active={sort.key === "change"}
          direction={sort.desc ? "desc" : "asc"}
          onClick={() => toggleSort("change")}
          // Reversed so the label sits flush right over the pills and the
          // arrow points in toward the middle.
          className={cn(
            "shrink-0 flex-row-reverse gap-1 whitespace-nowrap sm:text-xs",
            CHANGE_COLUMN
          )}
        >
          24h Change
        </TableSortButton>
      </div>
      {visible.map((row) => (
        <MarketRowLine
          key={row.key}
          row={row}
          selected={row.key === selectedKey}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

/**
 * The practice network has no switch on screen any more — paper wallets are
 * the everyday practice path, and the rehearsal gate the switch existed for
 * has been passed (decided 9 Aug 2026, in `testnet-mode.md`). The door is
 * the address (`?network=testnet`, or any testnet market's link — a testnet
 * row in the bottom panel still works). While the page IS on testnet, this
 * row says so, always — the labelling rule outlives the switch.
 */
export function TestnetStrip() {
  return (
    <div className="flex shrink-0 items-center gap-2 border-t bg-amber-500/10 px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-amber-700 dark:text-amber-400">
        Testnet — practice network, pretend money.
      </span>
      {/* The way back, and only here.

          There is deliberately no network switch on this screen (decided
          9 Aug 2026): flipping spends the exchange's request allowance and
          paper wallets are the everyday practice path. But the door in was
          one-way — charting any testnet coin brings you here, and nothing
          on screen took you home again. This is that door, and it only
          exists on the side that needs it. */}
      <Link
        to="."
        search={{ network: "mainnet" }}
        className={cn(
          "shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-amber-700 underline underline-offset-2 hover:bg-amber-500/10 dark:text-amber-400",
          focusRing
        )}
      >
        Back to Mainnet
      </Link>
    </div>
  )
}

/**
 * One market: what it is called, what kind of thing it is, and the day's move.
 * The whole row is the one button — the star that used to sit at its left edge
 * now lives in the market header, where it is always on screen.
 */
export const MarketRowLine = React.memo(function MarketRowLine({
  row,
  selected,
  onSelect,
  className,
}: {
  row: MarketRow
  selected: boolean
  onSelect: (key: string) => void
  className?: string
}) {
  // Subscribed per row, so a tick repaints exactly the rows whose numbers
  // moved. The list's ORDER stays on the loaded snapshot on purpose — rows
  // shuffling under the pointer every second would be worse than a sort
  // that catches up on the next refetch.
  const live = useLiveFigures(row.key)
  const change24h = live?.change24h ?? row.change24h
  const volume24hUsd = live?.volume24hUsd ?? row.volume24hUsd

  return (
    <button
      type="button"
      onClick={() => onSelect(row.key)}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex h-9 min-w-0 items-center border-r-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        ROW_COLUMNS,
        selected
          ? "border-r-foreground bg-muted"
          : "border-r-transparent hover:bg-muted/50",
        className
      )}
    >
      {/* The name gives way first, and carries its full self in a title —
          a long sub-exchange symbol must not push the day's move off the
          panel. The day's volume sits beside it, quiet, under the volume sort
          heading. */}
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span
          title={row.symbol}
          className="min-w-0 truncate text-sm font-medium"
        >
          <span className="sr-only">{row.symbol}</span>
          <span aria-hidden>{tickerLabel(row.symbol)}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground/60 tabular-nums">
          {formatCompactUsd(volume24hUsd)}
        </span>
        {row.caution ? <CautionBadge caution={row.caution} /> : null}
      </span>
      {/* Just the day's move, in a soft pill of its colour — the price
          belongs to the market header. A market with no yesterday price
          shows a plain dash, not a zero in a pill. The column is fixed and the
          pill sits at its right edge, so pills of different lengths still end
          in a straight line under the header. */}
      <span className={cn("flex shrink-0 justify-end", CHANGE_COLUMN)}>
        <span
          className={cn(
            "text-xs tabular-nums",
            change24h === null
              ? "text-muted-foreground"
              : cn(
                  "rounded-full px-2 py-0.5",
                  change24h >= 0
                    ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
                    : "bg-destructive/10 text-destructive dark:bg-destructive/20"
                )
          )}
        >
          {change24h === null ? "—" : formatChange(change24h)}
        </span>
      </span>
    </button>
  )
})
