import * as React from "react"
import { Link } from "@tanstack/react-router"

import { focusRing } from "@/lib/layout/focus-ring"

import { CautionBadge } from "@/components/trade/caution-badge"

import { formatChange, formatCompactUsd } from "@/lib/trade/format"
import {
  MADE_MONEY_SURFACE,
  LOST_MONEY_SURFACE,
  WARNING_SURFACE,
} from "@/lib/trade/money-tone"
import { useLiveFigures } from "@/lib/trade/live-market"
import type { MarketRow } from "@/lib/protocols/contracts"
import { cn } from "@/lib/utils"

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
 * The practice network has no switch on screen any more — paper wallets are
 * the everyday practice path, and the rehearsal gate the switch existed for
 * has been passed (decided 9 Aug 2026, in `testnet-mode.md`). The door is
 * the address (`?network=testnet`, or any testnet market's link — a testnet
 * row in the bottom panel still works). While the page IS on testnet, this
 * row says so, always — the labelling rule outlives the switch.
 */
export function TestnetStrip() {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-t px-3 py-1.5",
        WARNING_SURFACE
      )}
    >
      <span className="min-w-0 flex-1 truncate text-xs font-medium">
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
          "shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium underline underline-offset-2 hover:opacity-80",
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
        "flex h-9 min-w-0 items-center border-r-2 text-left",
        ROW_COLUMNS,
        focusRing,
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
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
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
                  change24h >= 0 ? MADE_MONEY_SURFACE : LOST_MONEY_SURFACE
                )
          )}
        >
          {change24h === null ? "—" : formatChange(change24h)}
        </span>
      </span>
    </button>
  )
})
