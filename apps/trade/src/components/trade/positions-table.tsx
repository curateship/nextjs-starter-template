import * as React from "react"
import {
  ArrowLeftRightIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import { MarketIcon } from "@/components/trade/market-icon"
import {
  TradeBadge,
  type TradeBadgeTone,
} from "@/components/trade/trade-badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  TableRow,
  TableSortButton,
  type TableSortDirection,
} from "@/components/ui/table"
import { formatDateTime, formatDuration } from "@/lib/format/format-time"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import {
  marketSymbol,
  parseMarketKey,
  type MarketRow,
} from "@/lib/protocols/contracts"
import {
  formatPrice,
  formatSignedUsd,
  formatSize,
  formatUsd,
} from "@/lib/trade/format"
import { useLiveMarks } from "@/lib/trade/live-market"
import { tradeEndingLabel, type LiveTrade } from "@/lib/trade/live-trades"
import { LOST_MONEY, MADE_MONEY, moneyTone } from "@/lib/trade/money-tone"
import {
  liquidationAway,
  positionMargin,
  positionProfit,
  positionValue,
  projectedProfit,
  type PaperOrder,
  type PaperPosition,
} from "@/lib/trade/paper"
import { cn } from "@/lib/utils"

/**
 * The three tables the bottom panel shows: what is held, what is waiting, and
 * how the trades that are finished actually went.
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

/**
 * Marks a row that lives on the exchange rather than in the practice engine.
 * Practice, testnet and real rows share these tables, and the two rules point
 * the same way: a real dollar must never be readable as a pretend one, and a
 * pretend one never as real — so a testnet exchange row says "Testnet", in
 * its own colour, never "Real".
 */
function RealBadge({ marketKey }: { marketKey: string }) {
  const testnet = parseMarketKey(marketKey)?.network === "testnet"
  return (
    <TradeBadge tone={testnet ? "testnet" : "real"}>
      {testnet ? "Testnet" : "Real"}
    </TradeBadge>
  )
}

/** Marks a row from a practice wallet, so pretend money never reads as real. */
function PracticeBadge() {
  return <TradeBadge>Practice</TradeBadge>
}

/**
 * A position's margin: the exchange's own answer for a real position, the
 * formula for a practice one. Same rule for the liquidation distance below —
 * with real money the exchange's number is the one actually enforced.
 */
function marginOf(position: PaperPosition): number {
  return position.live ? position.live.marginUsed : positionMargin(position)
}

function liquidationAwayOf(position: PaperPosition, mark: number): number | null {
  if (!position.live) return liquidationAway(position, mark)
  const liq = position.live.liquidationPx
  if (liq === null || !(mark > 0)) return null
  return Math.abs(mark - liq) / mark
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

type TradeColumn =
  | "market" | "wallet" | "side" | "opened" | "held"
  | "entry" | "exit" | "size" | "pnl" | "ending"

const TRADE_COLUMNS: ColumnSpec<TradeColumn>[] = [
  { key: "market", label: "Market" },
  { key: "wallet", label: "Wallet" },
  { key: "side", label: "Side" },
  { key: "opened", label: "Opened" },
  { key: "held", label: "Ran for" },
  { key: "entry", label: "In at" },
  { key: "exit", label: "Out at" },
  { key: "size", label: "Size" },
  { key: "pnl", label: "Made / lost" },
  { key: "ending", label: "How it ended" },
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
 * The row a table shows before it can show rows: still reading, or the read
 * failed with nothing to fall back on.
 *
 * Inside the table's own frame, under the real header, so nothing moves when
 * the rows land — and never the empty state's words. "Nothing here" and "I
 * could not find out" are different answers, and only one is safe to act on.
 * The empty state stays for the one case that has actually been checked.
 */
function TableStateRow({
  span,
  loading,
  loadingLabel,
  onRetry,
  children,
}: {
  /** Every column, including the actions one, so the row spans the frame. */
  span: number
  loading: boolean
  loadingLabel: string
  onRetry: () => void
  /** The failed wording — what exactly is not known right now. */
  children: React.ReactNode
}) {
  return (
    <tr className="border-t">
      <td colSpan={span}>
        {loading ? (
          <LoadingRow label={loadingLabel} className="py-6 text-xs" />
        ) : (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {children}{" "}
            <button type="button" className="underline" onClick={onRetry}>
              Try again
            </button>
          </p>
        )}
      </td>
    </tr>
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
  const symbol = marketSymbol(marketKey)
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
    <TradeBadge tone={long ? "made" : "lost"}>
      {long ? "Long" : "Short"} {position.leverage}×
    </TradeBadge>
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
  /** The smart order working this position, or null for an ordinary one. */
  busy: boolean
  onSelectMarket: (marketKey: string) => void
  onEdit: (position: PaperPosition) => void
  onFlip: (position: PaperPosition) => void
  onClose: (position: PaperPosition) => void
}) {
  const margin = marginOf(position)
  const profit = positionProfit(position, mark)
  // Against the margin actually put up, not the whole value: that is what was
  // risked, so it is what the percentage is worth measuring against.
  const profitShare = margin > 0 ? (profit / margin) * 100 : 0
  const away = liquidationAwayOf(position, mark)

  return (
    <TableRow
      // The whole row charts its market, which is what its name already did —
      // one action, a target the width of the panel instead of six characters.
      // The buttons at the end keep their own clicks; see `column="actions"`.
      rowAction={() => onSelectMarket(position.marketKey)}
      className="border-t hover:bg-muted/40"
    >
      <MarketCell
        marketKey={position.marketKey}
        market={market}
        badge={
          <>
            <SideBadge position={position} />
            {position.live ? <RealBadge marketKey={position.marketKey} /> : null}
          </>
        }
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
          {/* The target is always the good end and the stop the bad one, so
              these two say which colour they mean rather than asking a helper
              with a made-up figure. */}
          <span className={MADE_MONEY}>
            {position.tpPx === null
              ? "—"
              : formatSignedUsd(projectedProfit(position, position.tpPx))}
          </span>
          <span className="text-muted-foreground">/</span>
          <span className={LOST_MONEY}>
            {position.slPx === null
              ? "—"
              : formatSignedUsd(projectedProfit(position, position.slPx))}
          </span>
        </span>
      </Cell>
      <Cell className="text-muted-foreground">
        {/* A real position's running fees are the exchange's to know; a dash
            is honest where a $0.00 would be a lie. */}
        {position.live ? "—" : `-${formatUsd(position.feesPaid)}`}
      </Cell>
      <Cell>
        <span className={cn("font-medium", moneyTone(profit))}>
          {formatSignedUsd(profit)}
        </span>{" "}
        {/* The dollars are the answer; the percentage only says whether they
            were a lot for the money that was in — the same pairing the Journal
            uses two tables down. */}
        <span className="text-xs text-muted-foreground">
          {profitShare >= 0 ? "+" : ""}
          {profitShare.toFixed(2)}%
        </span>
      </Cell>
      <td data-column="actions" className="px-3 py-2 text-left whitespace-nowrap">
        <span className="flex items-center gap-0.5">
          {/* Turning a real position around in one go is not built yet, so
              the button is not offered rather than offered and refused. */}
          {position.live ? null : (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={busy}
              aria-label={`Turn the ${marketSymbol(position.marketKey)} position around`}
              onClick={() => onFlip(position)}
            >
              <ArrowLeftRightIcon className="size-4" />
            </Button>
          )}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Change the ${marketSymbol(position.marketKey)} stop and target`}
            onClick={() => onEdit(position)}
          >
            <SettingsIcon className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={busy}
            aria-label={`Close the ${marketSymbol(position.marketKey)} position`}
            onClick={() => onClose(position)}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </span>
      </td>
    </TableRow>
  )
}

export function PositionsTable({
  positions,
  markets,
  walletName,
  busy,
  settled,
  failed,
  onRetry,
  onSelectMarket,
  onEdit,
  onFlip,
  onClose,
}: {
  positions: readonly PaperPosition[]
  markets: ReadonlyMap<string, MarketRow>
  walletName: (walletId: string) => string
  busy: boolean
  /**
   * Both halves of the read have landed — see `settled` on `Trading`.
   *
   * Not `loading`: that turns false when EITHER half lands, and this table
   * draws practice rows and real ones together. Half an answer in hand is not
   * an answer, and "nothing here" is a claim about money.
   */
  settled: boolean
  /** The first read failed and there is nothing to fall back on. */
  failed: boolean
  onRetry: () => void
  onSelectMarket: (marketKey: string) => void
  onEdit: (position: PaperPosition) => void
  onFlip: (position: PaperPosition) => void
  onClose: (position: PaperPosition) => void
}) {
  const [confirming, setConfirming] = React.useState<PaperPosition | null>(null)
  // Money columns start biggest-first, which is the order anybody scanning a
  // list of positions actually wants.
  const { sort, direction, toggleSort } = useTableSort<PositionColumn>(
    "unrealized",
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
        return marketSymbol(position.marketKey)
      case "wallet":
        return walletName(position.walletId)
      case "value":
        return positionValue(position, mark)
      case "margin":
        return marginOf(position)
      case "liquidation":
        return liquidationAwayOf(position, mark) ?? Number.POSITIVE_INFINITY
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

  // Empty is only claimed once a read has landed; before that the frame shows
  // it is still reading, and a failed first read says so instead.
  if (positions.length === 0 && settled && !failed) {
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
          {rows.length === 0 ? (
            <TableStateRow
              span={POSITION_COLUMNS.length + 1}
              loading={!settled}
              loadingLabel="Reading what you are holding"
              onRetry={onRetry}
            >
              The positions could not be read, so it is not known whether you
              are holding anything.
            </TableStateRow>
          ) : (
            rows.map((position) => (
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
            ))
          )}
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
            ? `Close the ${marketSymbol(confirming.marketKey)} position in ${walletName(confirming.walletId)}?`
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
  settled,
  failed,
  onRetry,
  onSelectMarket,
  onCancel,
}: {
  orders: readonly PaperOrder[]
  markets: ReadonlyMap<string, MarketRow>
  walletName: (walletId: string) => string
  busy: boolean
  /**
   * Both halves of the read have landed — see `settled` on `Trading`.
   *
   * Not `loading`: that turns false when EITHER half lands, and this table
   * draws practice rows and real ones together. Half an answer in hand is not
   * an answer, and "nothing here" is a claim about money.
   */
  settled: boolean
  /** The first read failed and there is nothing to fall back on. */
  failed: boolean
  onRetry: () => void
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
        return marketSymbol(order.marketKey)
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

  if (orders.length === 0 && settled && !failed) {
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
        {rows.length === 0 ? (
          <TableStateRow
            span={ORDER_COLUMNS.length + 1}
            loading={!settled}
            loadingLabel="Reading your open orders"
            onRetry={onRetry}
          >
            The orders could not be read, so it is not known whether anything
            is waiting to fill.
          </TableStateRow>
        ) : (
        rows.map((order) => (
          <TableRow
            key={order.id}
            // The whole row charts its market, same as a position's row — one
            // action the width of the panel. Cancel keeps its own click.
            rowAction={() => onSelectMarket(order.marketKey)}
            className="border-t hover:bg-muted/40"
          >
            <MarketCell
              marketKey={order.marketKey}
              market={markets.get(order.marketKey) ?? null}
              onSelect={() => onSelectMarket(order.marketKey)}
              badge={
                <>
                  {order.reduceOnly ? (
                    <TradeBadge>Reduce only</TradeBadge>
                  ) : null}
                  {order.live ? <RealBadge marketKey={order.marketKey} /> : null}
                </>
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
            <Cell>{formatSize(order.sz)}</Cell>
            <Cell>{formatUsd(order.px * order.sz)}</Cell>
            <Cell className="text-muted-foreground">
              {/* A real order rides the account's leverage setting, which is
                  not the order's to say — a dash beats a made-up number. */}
              {order.live ? "—" : `${order.leverage}×`}
            </Cell>
            {/* Named so a click on a DISABLED cancel — whose button lets the
                click fall through — does not read as a click on the row. */}
            <td data-column="actions" className="px-3 py-2 text-left whitespace-nowrap">
              <span className="flex items-center gap-0.5">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Cancel the ${marketSymbol(order.marketKey)} order`}
                  onClick={() => onCancel(order)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </span>
            </td>
          </TableRow>
        ))
        )}
      </tbody>
    </table>
  )
}

/**
 * What colour a trade's ending is written in.
 *
 * **The money decides, not the word.** A stop is not a loss: a stop that
 * follows the price up is how a good trade is meant to end, and it can close
 * well above what the trade paid. Painting every "Stopped out" red would call
 * those failures, and a column of red beside a column of green profits is a
 * table nobody would trust. Only the exchange taking the trade away is red
 * whatever it made — that is a thing that happened TO the account.
 */
function endingTone(trade: LiveTrade): TradeBadgeTone {
  if (trade.ending === "liquidated") return "alarm"
  if (trade.ending === "closed") return "neutral"
  if (trade.pnl > 0) return "made"
  if (trade.pnl < 0) return "lost"
  return "neutral"
}

/**
 * Finished trades, one row each — the Journal.
 *
 * Every other table here is a readout of right now; this one is the only place
 * a whole trade is a single row, which is why it can say what a fill never
 * can: how long it ran, what it made in the end, and what stopped it.
 *
 * Practice and real sit in one list, each row badged. They are the same
 * question — "how did that go" — and two lists would mean reading the same
 * columns twice to answer it.
 *
 * Pressing a row draws it on the chart rather than opening anything. The
 * market's name still goes to its chart on its own, the way it does in the
 * three tables above.
 */
export function TradesTable({
  trades,
  markets,
  walletName,
  selectedId,
  busy,
  settled,
  failed,
  onRetry,
  onSelectTrade,
  onSelectMarket,
  onRemove,
  onLoadOlder,
  olderBusy = false,
  olderDone = false,
}: {
  trades: readonly LiveTrade[]
  markets: ReadonlyMap<string, MarketRow>
  walletName: (walletId: string) => string
  /** The trade drawn on the chart right now, or null. */
  selectedId: string | null
  busy: boolean
  /**
   * Both halves of the read have landed — see `settled` on `Trading`.
   *
   * Not `loading`: that turns false when EITHER half lands, and this table
   * draws practice rows and real ones together. Half an answer in hand is not
   * an answer, and "nothing here" is a claim about money.
   */
  settled: boolean
  /** The first read failed and there is nothing to fall back on. */
  failed: boolean
  onRetry: () => void
  onSelectTrade: (trade: LiveTrade) => void
  onSelectMarket: (marketKey: string) => void
  onRemove: (trade: LiveTrade) => void
  onLoadOlder?: () => void
  olderBusy?: boolean
  olderDone?: boolean
}) {
  const { sort, direction, toggleSort } = useTableSort<TradeColumn>(
    "opened",
    "desc",
    (column) =>
      ["market", "wallet", "side", "ending"].includes(column) ? "asc" : "desc"
  )

  const rows = sortRows(trades, direction, (trade) => {
    switch (sort) {
      case "market":
        return marketSymbol(trade.marketKey)
      case "wallet":
        return walletName(trade.walletId)
      case "side":
        return trade.direction
      case "held":
        return trade.heldMs
      case "entry":
        return trade.entryPx
      case "exit":
        return trade.exitPx
      case "size":
        return trade.sz
      case "pnl":
        return trade.pnl
      case "ending":
        return tradeEndingLabel(trade)
      default:
        return trade.openedAt
    }
  })

  if (trades.length === 0 && settled && !failed) {
    return (
      <EmptyTable>
        No finished trades yet. Once a position is closed it lands here, with
        what it made and what ended it.
      </EmptyTable>
    )
  }

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-muted/50">
          {TRADE_COLUMNS.map(({ key, label }) => (
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
        {rows.length === 0 ? (
          <TableStateRow
            span={TRADE_COLUMNS.length + 1}
            loading={!settled}
            loadingLabel="Reading your finished trades"
            onRetry={onRetry}
          >
            The journal could not be read, so it is not known how past trades
            went.
          </TableStateRow>
        ) : (
        rows.map((trade) => (
          <TableRow
            key={trade.id}
            rowAction={() => onSelectTrade(trade)}
            data-state={trade.id === selectedId ? "selected" : undefined}
            className="border-t"
          >
            <MarketCell
              marketKey={trade.marketKey}
              market={markets.get(trade.marketKey) ?? null}
              onSelect={() => onSelectMarket(trade.marketKey)}
              badge={
                trade.live ? (
                  <RealBadge marketKey={trade.marketKey} />
                ) : (
                  <PracticeBadge />
                )
              }
            />
            <WalletCell wallet={walletName(trade.walletId)} />
            <Cell>
              <TradeBadge tone={trade.direction === "long" ? "made" : "lost"}>
                {trade.direction === "long" ? "Long" : "Short"}
              </TradeBadge>
            </Cell>
            <Cell className="text-muted-foreground">
              {formatDateTime(new Date(trade.openedAt))}
            </Cell>
            <Cell className="text-muted-foreground">
              {formatDuration(trade.heldMs)}
            </Cell>
            <Cell>{formatPrice(trade.entryPx)}</Cell>
            <Cell>{formatPrice(trade.exitPx)}</Cell>
            <Cell>{formatSize(trade.sz)}</Cell>
            <Cell className={moneyTone(trade.pnl)}>
              {formatSignedUsd(trade.pnl)}
              {/* The dollars are the answer; the percentage is only there to
                  say whether they were a lot for the money that was in. */}
              <span className="ml-1.5 text-muted-foreground">
                {trade.returnPct >= 0 ? "+" : ""}
                {trade.returnPct.toFixed(1)}%
              </span>
            </Cell>
            <Cell>
              <TradeBadge tone={endingTone(trade)}>
                {tradeEndingLabel(trade)}
                {trade.stopPx !== null ? ` at ${formatPrice(trade.stopPx)}` : ""}
              </TradeBadge>
            </Cell>
            {/* Marked as the actions column so a press on the bin — or on the
                blank around a greyed-out one — never also fires the row and
                draws the trade you were trying to be rid of. */}
            <td
              data-column="actions"
              className="px-3 py-2 text-left whitespace-nowrap"
            >
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={busy}
                aria-label={`Remove the ${marketSymbol(trade.marketKey)} trade from the Journal`}
                onClick={() => onRemove(trade)}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </td>
          </TableRow>
        ))
        )}
      </tbody>
      {settled && trades.length > 0 && onLoadOlder ? (
        <tfoot>
          <tr className="border-t">
            <td
              colSpan={TRADE_COLUMNS.length + 1}
              className="px-5 py-3 text-center"
            >
              {olderDone ? (
                <span className="text-sm text-muted-foreground">
                  That is everything
                </span>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={olderBusy}
                  onClick={onLoadOlder}
                >
                  {olderBusy ? "Reading older trades…" : "Show older"}
                </Button>
              )}
            </td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  )
}
