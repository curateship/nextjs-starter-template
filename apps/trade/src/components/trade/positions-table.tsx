import * as React from "react"
import {
  ArrowLeftRightIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import { MarketIcon } from "@/components/trade/market-icon"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TableSortButton, type TableSortDirection } from "@/components/ui/table"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { parseMarketKey, type MarketRow } from "@/lib/protocols/contracts"
import {
  formatPrice,
  formatSignedUsd,
  formatUsd,
} from "@/lib/trade/format"
import { useLiveMarks } from "@/lib/trade/live-market"
import {
  liquidationAway,
  positionMargin,
  positionProfit,
  positionValue,
  projectedProfit,
  type PaperJournalEntry,
  type PaperOrder,
  type PaperPosition,
  PAPER_FILL_REASON_LABELS,
} from "@/lib/trade/paper"
import { cn } from "@/lib/utils"

/**
 * The three tables the bottom panel shows: what is held, what is waiting, and
 * everything that has already happened.
 *
 * Every column sorts, through the same `useTableSort` and `TableSortButton`
 * every other table in the app uses, so a column here behaves exactly like a
 * column anywhere else.
 *
 * What these do *not* take from the shell's dashboard tables is mass
 * selection. A dashboard table lists records that sit still; these are a live
 * readout where a row can close itself between the tick you tick it and the
 * button you press. Every action here is on the one row it sits in, and the
 * single bulk action — Close all — lives in the tab bar where it cannot be
 * mistaken for one.
 *
 * Prices are read once for the whole table rather than per row, so the column
 * you sorted by and the figure printed in the row are always the same number.
 */

/** How the market's own symbol reads: "xyz:AAPL" is an AAPL on the xyz venue. */
function symbolOf(marketKey: string): string {
  return parseMarketKey(marketKey)?.marketId ?? marketKey
}

/** Green when it made money, red when it lost, muted at nothing. */
function toneOf(value: number): string {
  if (value > 0) return "text-emerald-600 dark:text-emerald-400"
  if (value < 0) return "text-red-600 dark:text-red-400"
  return "text-muted-foreground"
}

function HeaderCell({
  children,
  sort,
}: {
  children: React.ReactNode
  /** Omitted on the actions column, which is the one thing never sorted. */
  sort?: { active: boolean; direction: TableSortDirection; onClick: () => void }
}) {
  return (
    <th
      scope="col"
      className="px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground"
    >
      {sort ? (
        <TableSortButton
          active={sort.active}
          direction={sort.direction}
          onClick={sort.onClick}
          // The shared button stands 32px tall for a dashboard's roomy header.
          // This header is a trading readout packed into a panel, so it keeps
          // the row exactly as tall as its text — the same control, just not
          // padding the row out.
          className="h-auto text-xs sm:text-xs"
        >
          {children}
        </TableSortButton>
      ) : (
        children
      )}
    </th>
  )
}

type ColumnSpec<Key extends string> = { key: Key; label: string }

type PositionColumn =
  | "market" | "wallet" | "value" | "margin"
  | "liquidation" | "projected" | "fees" | "unrealized"

const POSITION_COLUMNS: ColumnSpec<PositionColumn>[] = [
  { key: "market", label: "Market" },
  { key: "wallet", label: "Wallet" },
  { key: "value", label: "Value" },
  { key: "margin", label: "Margin" },
  { key: "liquidation", label: "Liquidation" },
  { key: "projected", label: "Projected P / L" },
  { key: "fees", label: "Fees" },
  { key: "unrealized", label: "Unrealized P&L" },
]

type OrderColumn =
  | "market" | "wallet" | "side" | "price" | "size" | "value" | "leverage"

const ORDER_COLUMNS: ColumnSpec<OrderColumn>[] = [
  { key: "market", label: "Market" },
  { key: "wallet", label: "Wallet" },
  { key: "side", label: "Side" },
  { key: "price", label: "Price" },
  { key: "size", label: "Size" },
  { key: "value", label: "Value" },
  { key: "leverage", label: "Leverage" },
]

type JournalColumn =
  | "market" | "wallet" | "when" | "side" | "price" | "size" | "fee" | "banked" | "why"

const JOURNAL_COLUMNS: ColumnSpec<JournalColumn>[] = [
  { key: "market", label: "Market" },
  { key: "wallet", label: "Wallet" },
  { key: "when", label: "When" },
  { key: "side", label: "Side" },
  { key: "price", label: "Price" },
  { key: "size", label: "Size" },
  { key: "fee", label: "Fee" },
  { key: "banked", label: "Banked" },
  { key: "why", label: "Why" },
]

/** Orders one list of rows by one of its columns, smallest or largest first. */
function sortRows<Row>(
  rows: readonly Row[],
  direction: TableSortDirection,
  valueOf: (row: Row) => number | string
): Row[] {
  const sign = direction === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    const left = valueOf(a)
    const right = valueOf(b)
    if (typeof left === "string" || typeof right === "string") {
      return sign * String(left).localeCompare(String(right))
    }
    return sign * (left - right)
  })
}

function Cell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <td
      className={cn(
        "px-3 py-2 text-left text-xs tabular-nums whitespace-nowrap",
        className
      )}
    >
      {children}
    </td>
  )
}

function EmptyTable({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-6 text-center text-xs text-muted-foreground">
      {children}
    </p>
  )
}

/**
 * The market cell every table starts with: art, symbol, and what it is.
 *
 * The name is the way back to the chart, rather than a button in the actions
 * column — the row is about that market, so its name is the obvious thing to
 * press, and it saves inventing an icon for "show me this one".
 */
function MarketCell({
  marketKey,
  market,
  badge,
  onSelect,
}: {
  marketKey: string
  market: MarketRow | null
  badge?: React.ReactNode
  onSelect?: () => void
}) {
  const symbol = symbolOf(marketKey)
  return (
    <td className="px-3 py-2 text-left whitespace-nowrap">
      <span className="flex items-center gap-2">
        <MarketIcon symbol={symbol} iconUrl={market?.iconUrl ?? null} />
        {onSelect ? (
          <button
            type="button"
            onClick={onSelect}
            className="rounded-sm text-xs font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {symbol}
          </button>
        ) : (
          <span className="text-xs font-medium">{symbol}</span>
        )}
        {badge}
      </span>
    </td>
  )
}

/** Which wallet the row belongs to. */
function WalletCell({ wallet }: { wallet: string }) {
  return (
    <td className="px-3 py-2 text-left text-xs whitespace-nowrap text-muted-foreground">
      <span className="block max-w-32 truncate" title={wallet}>
        {wallet}
      </span>
    </td>
  )
}

/** "Long 5×" — direction and leverage, the two things that set the risk. */
function SideBadge({ position }: { position: PaperPosition }) {
  const long = position.szi > 0
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        long
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "bg-red-500/10 text-red-700 dark:text-red-400"
      )}
    >
      {long ? "Long" : "Short"} {position.leverage}×
    </span>
  )
}

/**
 * One position's row. Its price arrives as a prop rather than being watched
 * here, so the column the table was sorted by and the figure printed in the
 * row are always worked out from the same number.
 */
function PositionRow({
  position,
  market,
  mark,
  wallet,
  busy,
  onSelectMarket,
  onEdit,
  onFlip,
  onClose,
}: {
  position: PaperPosition
  market: MarketRow | null
  /** Today's price, read once for the whole table so the sort agrees with it. */
  mark: number
  wallet: string
  busy: boolean
  onSelectMarket: (marketKey: string) => void
  onEdit: (position: PaperPosition) => void
  onFlip: (position: PaperPosition) => void
  onClose: (position: PaperPosition) => void
}) {
  const margin = positionMargin(position)
  const profit = positionProfit(position, mark)
  // Against the margin actually put up, not the whole value: that is what was
  // risked, so it is what the percentage is worth measuring against.
  const profitShare = margin > 0 ? (profit / margin) * 100 : 0
  const away = liquidationAway(position, mark)

  return (
    <tr className="border-t border-foreground/5 hover:bg-muted/40">
      <MarketCell
        marketKey={position.marketKey}
        market={market}
        badge={<SideBadge position={position} />}
        onSelect={() => onSelectMarket(position.marketKey)}
      />
      <WalletCell wallet={wallet} />
      <Cell>{formatUsd(positionValue(position, mark))}</Cell>
      <Cell>{formatUsd(margin)}</Cell>
      <Cell>
        {away === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span
            className={cn(
              away <= 0.1
                ? "text-red-600 dark:text-red-400"
                : away <= 0.25
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground"
            )}
          >
            {Math.round(away * 100)}% away
          </span>
        )}
      </Cell>
      <Cell>
        <span className="flex items-center gap-1">
          <span className={toneOf(1)}>
            {position.tpPx === null
              ? "—"
              : formatSignedUsd(projectedProfit(position, position.tpPx))}
          </span>
          <span className="text-muted-foreground">/</span>
          <span className={toneOf(-1)}>
            {position.slPx === null
              ? "—"
              : formatSignedUsd(projectedProfit(position, position.slPx))}
          </span>
        </span>
      </Cell>
      <Cell className="text-muted-foreground">
        -{formatUsd(position.feesPaid)}
      </Cell>
      <Cell>
        <span className={cn("font-medium", toneOf(profit))}>
          {formatSignedUsd(profit)}
        </span>{" "}
        <span className={cn("text-[10px]", toneOf(profit))}>
          {profitShare >= 0 ? "+" : ""}
          {profitShare.toFixed(2)}%
        </span>
      </Cell>
      <td className="px-3 py-2 text-left whitespace-nowrap">
        <span className="flex items-center gap-0.5">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={busy}
            aria-label={`Turn the ${symbolOf(position.marketKey)} position around`}
            onClick={() => onFlip(position)}
          >
            <ArrowLeftRightIcon className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Change the ${symbolOf(position.marketKey)} stop and target`}
            onClick={() => onEdit(position)}
          >
            <SettingsIcon className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={busy}
            aria-label={`Close the ${symbolOf(position.marketKey)} position`}
            onClick={() => onClose(position)}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </span>
      </td>
    </tr>
  )
}

export function PositionsTable({
  positions,
  markets,
  walletName,
  busy,
  onSelectMarket,
  onEdit,
  onFlip,
  onClose,
}: {
  positions: readonly PaperPosition[]
  markets: ReadonlyMap<string, MarketRow>
  walletName: (walletId: string) => string
  busy: boolean
  onSelectMarket: (marketKey: string) => void
  onEdit: (position: PaperPosition) => void
  onFlip: (position: PaperPosition) => void
  onClose: (position: PaperPosition) => void
}) {
  const [confirming, setConfirming] = React.useState<PaperPosition | null>(null)
  // Money columns start biggest-first, which is the order anybody scanning a
  // list of positions actually wants.
  const { sort, direction, toggleSort } = useTableSort<PositionColumn>(
    "value",
    "desc",
    (column) => (column === "market" || column === "wallet" ? "asc" : "desc")
  )

  const marks = useLiveMarks(positions.map((one) => one.marketKey))
  const markOf = (position: PaperPosition) =>
    marks.get(position.marketKey) ??
    markets.get(position.marketKey)?.price ??
    position.entryPx

  const rows = sortRows(positions, direction, (position) => {
    const mark = markOf(position)
    switch (sort) {
      case "market":
        return symbolOf(position.marketKey)
      case "wallet":
        return walletName(position.walletId)
      case "value":
        return positionValue(position, mark)
      case "margin":
        return positionMargin(position)
      case "liquidation":
        return liquidationAway(position, mark) ?? Number.POSITIVE_INFINITY
      case "projected":
        return position.tpPx === null
          ? Number.NEGATIVE_INFINITY
          : projectedProfit(position, position.tpPx)
      case "fees":
        return position.feesPaid
      default:
        return positionProfit(position, mark)
    }
  })

  if (positions.length === 0) {
    return <EmptyTable>No open positions. Anything you are holding shows up here.</EmptyTable>
  }

  return (
    <>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-muted/50">
            {POSITION_COLUMNS.map(({ key, label }) => (
              <HeaderCell
                key={key}
                sort={{
                  active: sort === key,
                  direction,
                  onClick: () => toggleSort(key),
                }}
              >
                {label}
              </HeaderCell>
            ))}
            <HeaderCell>
              <span className="sr-only">Actions</span>
            </HeaderCell>
          </tr>
        </thead>
        <tbody>
          {rows.map((position) => (
            <PositionRow
              key={position.id}
              position={position}
              market={markets.get(position.marketKey) ?? null}
              mark={markOf(position)}
              wallet={walletName(position.walletId)}
              busy={busy}
              onSelectMarket={onSelectMarket}
              onEdit={onEdit}
              onFlip={onFlip}
              onClose={setConfirming}
            />
          ))}
        </tbody>
      </table>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
        // Both the market and the wallet, because this table lists several
        // wallets and the rows only differ by one small column.
        title={
          confirming
            ? `Close the ${symbolOf(confirming.marketKey)} position in ${walletName(confirming.walletId)}?`
            : "Close this position?"
        }
        description="It is sold at whatever the market costs right now, and whatever it has made or lost is banked. This cannot be undone."
        confirmLabel="Close position"
        onConfirm={() => {
          if (confirming) onClose(confirming)
          setConfirming(null)
        }}
      />
    </>
  )
}

export function OpenOrdersTable({
  orders,
  markets,
  walletName,
  busy,
  onSelectMarket,
  onCancel,
}: {
  orders: readonly PaperOrder[]
  markets: ReadonlyMap<string, MarketRow>
  walletName: (walletId: string) => string
  busy: boolean
  onSelectMarket: (marketKey: string) => void
  onCancel: (order: PaperOrder) => void
}) {
  const { sort, direction, toggleSort } = useTableSort<OrderColumn>(
    "price",
    "desc",
    (column) =>
      column === "market" || column === "wallet" || column === "side"
        ? "asc"
        : "desc"
  )

  const rows = sortRows(orders, direction, (order) => {
    switch (sort) {
      case "market":
        return symbolOf(order.marketKey)
      case "wallet":
        return walletName(order.walletId)
      case "side":
        return order.side
      case "size":
        return order.sz
      case "value":
        return order.px * order.sz
      case "leverage":
        return order.leverage
      default:
        return order.px
    }
  })

  if (orders.length === 0) {
    return <EmptyTable>No open orders. Orders waiting to fill show up here.</EmptyTable>
  }

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-muted/50">
          {ORDER_COLUMNS.map(({ key, label }) => (
            <HeaderCell
              key={key}
              sort={{
                active: sort === key,
                direction,
                onClick: () => toggleSort(key),
              }}
            >
              {label}
            </HeaderCell>
          ))}
          <HeaderCell>
            <span className="sr-only">Actions</span>
          </HeaderCell>
        </tr>
      </thead>
      <tbody>
        {rows.map((order) => (
          <tr
            key={order.id}
            className="border-t border-foreground/5 hover:bg-muted/40"
          >
            <MarketCell
              marketKey={order.marketKey}
              market={markets.get(order.marketKey) ?? null}
              onSelect={() => onSelectMarket(order.marketKey)}
              badge={
                order.reduceOnly ? (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    Reduce only
                  </span>
                ) : undefined
              }
            />
            <WalletCell wallet={walletName(order.walletId)} />
            <Cell
              className={
                order.side === "buy"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }
            >
              {order.side === "buy" ? "Buy" : "Sell"}
            </Cell>
            <Cell>{formatPrice(order.px)}</Cell>
            <Cell>{order.sz}</Cell>
            <Cell>{formatUsd(order.px * order.sz)}</Cell>
            <Cell className="text-muted-foreground">{order.leverage}×</Cell>
            <td className="px-3 py-2 text-left whitespace-nowrap">
              <span className="flex items-center gap-0.5">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Cancel the ${symbolOf(order.marketKey)} order`}
                  onClick={() => onCancel(order)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function JournalTable({
  journal,
  markets,
  walletName,
  onSelectMarket,
}: {
  journal: readonly PaperJournalEntry[]
  markets: ReadonlyMap<string, MarketRow>
  walletName: (walletId: string) => string
  onSelectMarket: (marketKey: string) => void
}) {
  const { sort, direction, toggleSort } = useTableSort<JournalColumn>(
    "when",
    "desc",
    (column) =>
      ["market", "wallet", "side", "why"].includes(column) ? "asc" : "desc"
  )

  const rows = sortRows(journal, direction, (entry) => {
    switch (sort) {
      case "market":
        return symbolOf(entry.marketKey)
      case "wallet":
        return walletName(entry.walletId)
      case "side":
        return entry.side
      case "price":
        return entry.px
      case "size":
        return entry.sz
      case "fee":
        return entry.fee
      case "banked":
        return entry.closedPnl
      case "why":
        return PAPER_FILL_REASON_LABELS[entry.reason]
      default:
        return entry.fillTime
    }
  })

  if (journal.length === 0) {
    return (
      <EmptyTable>
        Nothing has happened yet. Every fill lands here, with what it cost and
        why it happened.
      </EmptyTable>
    )
  }

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-muted/50">
          {JOURNAL_COLUMNS.map(({ key, label }) => (
            <HeaderCell
              key={key}
              sort={{
                active: sort === key,
                direction,
                onClick: () => toggleSort(key),
              }}
            >
              {label}
            </HeaderCell>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((entry) => (
          <tr
            key={entry.id}
            className="border-t border-foreground/5 hover:bg-muted/40"
          >
            <MarketCell
              marketKey={entry.marketKey}
              market={markets.get(entry.marketKey) ?? null}
              onSelect={() => onSelectMarket(entry.marketKey)}
            />
            <WalletCell wallet={walletName(entry.walletId)} />
            <Cell className="text-muted-foreground">
              {new Date(entry.fillTime).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Cell>
            <Cell
              className={
                entry.side === "buy"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }
            >
              {entry.side === "buy" ? "Buy" : "Sell"}
            </Cell>
            <Cell>{formatPrice(entry.px)}</Cell>
            <Cell>{entry.sz}</Cell>
            <Cell className="text-muted-foreground">
              -{formatUsd(entry.fee)}
            </Cell>
            <Cell className={toneOf(entry.closedPnl)}>
              {entry.closedPnl === 0 ? "—" : formatSignedUsd(entry.closedPnl)}
            </Cell>
            <td className="px-3 py-2 text-left text-xs whitespace-nowrap text-muted-foreground">
              {PAPER_FILL_REASON_LABELS[entry.reason]}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
