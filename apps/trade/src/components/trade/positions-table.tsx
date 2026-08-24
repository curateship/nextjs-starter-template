import * as React from "react"
import {
  ArrowLeftRightIcon,
  GaugeIcon,
  InfoIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import {
  ClosePositionDialog,
  type PartCloseAsk,
} from "@/components/trade/close-position-dialog"
import { MarketIcon } from "@/components/trade/market-icon"
import { TradeBadge, type TradeBadgeTone } from "@/components/trade/trade-badge"
import { TradeTable, type ColumnSpec } from "@/components/trade/trade-table"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { TableRow, type TableSortDirection } from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatDateTime, formatDuration } from "@/lib/format/format-time"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import {
  marketSymbol,
  parseMarketKey,
  type MarketRow,
} from "@/lib/protocols/contracts"
import {
  formatFeeUsd,
  formatPrice,
  formatSignedUsd,
  formatSize,
  formatUsd,
} from "@/lib/trade/format"
import { useLiveMarks } from "@/lib/trade/live-market"
import {
  tradeEndingLabel,
  type LiveFill,
  type LiveTrade,
} from "@/lib/trade/live-trades"
import { liquidationAwayOf, marginOf } from "@/lib/trade/margin-health"
import { positionFees, type PositionFees } from "@/lib/trade/position-fees"
import { LOST_MONEY, MADE_MONEY, moneyTone } from "@/lib/trade/money-tone"
import {
  positionProfit,
  positionValue,
  projectedProfit,
  type TradeOrder,
  type TradePosition,
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
 * The positions and orders tables do *not* take mass selection from the
 * shell's dashboard tables. They are a live readout where a row can close
 * itself between the tick you tick it and the button you press, so every
 * action there is on the one row it sits in, and the single bulk action —
 * Close all — lives in the tab bar where it cannot be mistaken for one. The
 * Journal is different: its rows are finished trades that sit still, so it
 * alone has checkboxes and a Remove button over the ticked rows.
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

function targetsProfit(position: TradePosition): number | null {
  if (position.targets.length === 0) return null
  return position.targets.reduce((sum, target) => {
    const sz = target.sz ?? Math.abs(position.szi)
    return (
      sum +
      projectedProfit(
        { szi: Math.sign(position.szi) * sz, entryPx: position.entryPx },
        target.px
      )
    )
  }, 0)
}

/**
 * The one info mark, used where a figure needs a sentence a cell has no room
 * for. Same shape as the wallet card's, so the two read as one thing.
 */
function InfoMark({
  label,
  children,
}: {
  /** What the mark itself is called, for a screen reader and the keyboard. */
  label: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <InfoIcon className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{children}</TooltipContent>
    </Tooltip>
  )
}

type PositionColumn =
  | "market"
  | "wallet"
  | "value"
  | "margin"
  | "liquidation"
  | "projected"
  | "fees"
  | "unrealized"

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
  "market" | "wallet" | "side" | "price" | "size" | "value" | "leverage"

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
  | "market"
  | "wallet"
  | "side"
  | "opened"
  | "held"
  | "entry"
  | "exit"
  | "size"
  | "pnl"
  | "ending"

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
        "px-3 py-2 text-left text-xs whitespace-nowrap tabular-nums",
        className
      )}
    >
      {children}
    </td>
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
function SideBadge({ position }: { position: TradePosition }) {
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
  fees,
  wallet,
  busy,
  onSelectMarket,
  onAdd,
  onMargin,
  onEdit,
  onFlip,
  onClose,
}: {
  position: TradePosition
  market: MarketRow | null
  /** Today's price, read once for the whole table so the sort agrees with it. */
  mark: number
  /** What it has cost in fees, or null on a real one with nothing swept. */
  fees: PositionFees | null
  wallet: string
  /** The smart order working this position, or null for an ordinary one. */
  busy: boolean
  onSelectMarket: (marketKey: string) => void
  onAdd: (position: TradePosition) => void
  /** Null on an exchange that allows neither change — the button is hidden. */
  onMargin: ((position: TradePosition) => void) | null
  onEdit: (position: TradePosition) => void
  onFlip: (position: TradePosition) => void
  onClose: (position: TradePosition) => void
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
            {position.live ? (
              <RealBadge marketKey={position.marketKey} />
            ) : null}
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
            {targetsProfit(position) === null
              ? "—"
              : `${position.targets.length > 1 ? `${position.targets.length} · ` : ""}${formatSignedUsd(targetsProfit(position) ?? 0)}`}
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
        {/* The practice engine charges its own fees and knows the total
            exactly. A real position's total is added up here from the fills
            the exchange reported, and a dash still means nobody has answered:
            no fill swept is not the same as no fee charged. */}
        {!position.live ? (
          formatFeeUsd(position.feesPaid)
        ) : fees === null ? (
          <span>—</span>
        ) : (
          <span className="inline-flex items-center gap-1">
            {formatFeeUsd(fees.paid)}
            {fees.whole ? null : (
              <InfoMark
                label={`Why the ${marketSymbol(position.marketKey)} fee total is short`}
              >
                Only part of this position&rsquo;s fees. The fills on hand go
                back to {formatDateTime(new Date(fees.countedFrom))}, which is
                after this position opened, so the real total is bigger.
              </InfoMark>
            )}
          </span>
        )}
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
      <td
        data-column="actions"
        className="px-3 py-2 text-left whitespace-nowrap"
      >
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
          {/* Buying more of what this row holds. It charts the coin, switches
              to the row's wallet and opens the order window at today's price —
              the five steps that used to stand between a dip and $250 more, and
              the wallet step is where the mistake went to another wallet. */}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={busy}
            aria-label={`Add to the ${marketSymbol(position.marketKey)} position`}
            onClick={() => onAdd(position)}
          >
            <PlusIcon className="size-4" />
          </Button>
          {/* Leverage and the cash behind the position. Only where the
              exchange really allows one of the two, so a button is never
              offered and then refused. */}
          {onMargin ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={busy}
              aria-label={`Change the ${marketSymbol(position.marketKey)} leverage and margin`}
              onClick={() => onMargin(position)}
            >
              <GaugeIcon className="size-4" />
            </Button>
          ) : null}
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
  fills,
  walletName,
  busy,
  settled,
  failed,
  onRetry,
  onSelectMarket,
  onAdd,
  onMargin,
  onEdit,
  onFlip,
  onClose,
  onClosePart,
}: {
  positions: readonly TradePosition[]
  markets: ReadonlyMap<string, MarketRow>
  /**
   * Every execution on hand, which is what a real position's fee total is
   * added up from — see `positionFees`.
   */
  fills: readonly LiveFill[]
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
  /** Buy more of this one: charts it, switches wallet, opens the order window. */
  onAdd: (position: TradePosition) => void
  /**
   * Change its leverage or the cash behind it. Null where the exchange allows
   * neither, and while the list of what it allows is still on its way — a
   * button that appeared a moment later would be worse than one that waited.
   */
  onMargin: ((position: TradePosition) => void) | null
  onEdit: (position: TradePosition) => void
  onFlip: (position: TradePosition) => void
  /** Sells the whole thing, at whatever the market costs right now. */
  onClose: (position: TradePosition) => void
  /** Sells a piece of it, with a limit that follows the price. */
  onClosePart: (position: TradePosition, ask: PartCloseAsk) => void
}) {
  const [confirming, setConfirming] = React.useState<TradePosition | null>(null)
  // Money columns start biggest-first, which is the order anybody scanning a
  // list of positions actually wants.
  const { sort, direction, toggleSort } = useTableSort<PositionColumn>(
    "unrealized",
    "desc",
    (column) => (column === "market" || column === "wallet" ? "asc" : "desc")
  )

  const marks = useLiveMarks(positions.map((one) => one.marketKey))
  const markOf = (position: TradePosition) =>
    marks.get(position.marketKey) ??
    markets.get(position.marketKey)?.price ??
    position.entryPx

  // Worked out once per position rather than per row render, because each one
  // walks that coin's fills and this panel redraws on every price tick.
  const feesById = React.useMemo(() => {
    const byId = new Map<string, PositionFees | null>()
    for (const one of positions) byId.set(one.id, positionFees(fills, one))
    return byId
  }, [positions, fills])
  const feesOf = (position: TradePosition) => feesById.get(position.id) ?? null

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
        return targetsProfit(position) ?? Number.NEGATIVE_INFINITY
      case "fees":
        // The figure the row prints, so the order and the number agree. A
        // real position with nothing swept has no figure at all and sorts to
        // the end, the way a missing liquidation price already does.
        return position.live
          ? (feesOf(position)?.paid ?? Number.POSITIVE_INFINITY)
          : position.feesPaid
      default:
        return positionProfit(position, mark)
    }
  })

  return (
    <>
      <TradeTable
        columns={POSITION_COLUMNS}
        rows={rows}
        loading={!settled}
        failed={failed}
        loadingLabel="Reading what you are holding"
        failedWords="The positions could not be read, so it is not known whether you are holding anything."
        emptyWords="No open positions here. A coin a ladder or grid is running shows in the Smart orders panel instead."
        onRetry={onRetry}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        headerInfo={(key) =>
          key === "fees" ? (
            <InfoMark label="Where the fee totals come from">
              Added up by this app from the fills the exchange has reported, not
              a total the exchange states itself. A practice position&rsquo;s
              figure is the engine&rsquo;s own. A dash means nothing has been
              reported yet, which is not the same as nothing charged.
            </InfoMark>
          ) : undefined
        }
        renderRow={(position) => (
          <PositionRow
            key={position.id}
            position={position}
            market={markets.get(position.marketKey) ?? null}
            mark={markOf(position)}
            fees={feesOf(position)}
            wallet={walletName(position.walletId)}
            busy={busy}
            onSelectMarket={onSelectMarket}
            onAdd={onAdd}
            onMargin={onMargin}
            onEdit={onEdit}
            onFlip={onFlip}
            onClose={setConfirming}
          />
        )}
      />

      {/* Both the market and the wallet in the title, because this table
          lists several wallets and the rows only differ by one small column. */}
      <ClosePositionDialog
        position={confirming}
        mark={confirming ? markOf(confirming) : 0}
        walletName={confirming ? walletName(confirming.walletId) : ""}
        busy={busy}
        onCloseAll={onClose}
        onClosePart={onClosePart}
        onDismiss={() => setConfirming(null)}
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
  orders: readonly TradeOrder[]
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
  onCancel: (order: TradeOrder) => void
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

  return (
    <TradeTable
      columns={ORDER_COLUMNS}
      rows={rows}
      loading={!settled}
      failed={failed}
      loadingLabel="Reading your open orders"
      failedWords="The orders could not be read, so it is not known whether anything is waiting to fill."
      emptyWords="No open orders. Orders waiting to fill show up here."
      onRetry={onRetry}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      renderRow={(order) => (
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
                {order.reduceOnly ? <TradeBadge>Reduce only</TradeBadge> : null}
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
          <td
            data-column="actions"
            className="px-3 py-2 text-left whitespace-nowrap"
          >
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
      )}
    />
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
  ticked,
  onTickTrade,
  onTickVisible,
  tickAllState,
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
  /** The trades ticked for a mass remove, by trade id. */
  ticked: ReadonlySet<string>
  onTickTrade: (id: string) => void
  /** The header checkbox: every listed row on, or every listed row off. */
  onTickVisible: (ids: string[]) => void
  tickAllState: (ids: string[]) => boolean | "indeterminate"
}) {
  const { sort, direction, toggleSort } = useTableSort<TradeColumn>(
    "opened",
    "desc",
    (column) =>
      ["market", "wallet", "side", "ending"].includes(column) ? "asc" : "desc"
  )

  // Memoised: this table can hold thousands of rows, and the panel around
  // it re-renders on every poll and every price tick of a held market.
  const rows = React.useMemo(
    () =>
      sortRows(trades, direction, (trade) => {
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
      }),
    [trades, direction, sort, walletName]
  )

  const listedIds = rows.map((trade) => trade.id)

  return (
    <TradeTable
      columns={TRADE_COLUMNS}
      rows={rows}
      loading={!settled}
      failed={failed}
      loadingLabel="Reading your finished trades"
      failedWords="The journal could not be read, so it is not known how past trades went."
      emptyWords="No finished trades yet. Once a position is closed it lands here, with what it made and what ended it."
      onRetry={onRetry}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      leadingHeader={
        <Checkbox
          checked={tickAllState(listedIds)}
          onCheckedChange={() => onTickVisible(listedIds)}
          aria-label="Select every finished trade"
        />
      }
      renderRow={(trade) => (
        <TableRow
          key={trade.id}
          rowAction={() => onSelectTrade(trade)}
          data-state={trade.id === selectedId ? "selected" : undefined}
          className="border-t"
        >
          {/* Marked as the select column so ticking a row never also fires
                the row action and draws the trade on the chart. */}
          <td data-column="select" className="w-8 px-3 py-2">
            <Checkbox
              checked={ticked.has(trade.id)}
              onCheckedChange={() => onTickTrade(trade.id)}
              aria-label={`Select the ${marketSymbol(trade.marketKey)} trade`}
            />
          </td>
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
      )}
      footer={
        settled && trades.length > 0 && onLoadOlder ? (
          <tfoot>
            <tr className="border-t">
              <td
                colSpan={TRADE_COLUMNS.length + 2}
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
        ) : null
      }
    />
  )
}
