import * as React from "react"
import {
  ArrowLeftRightIcon,
  GaugeIcon,
  InfoIcon,
  PlayIcon,
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
import { overrodeNote } from "@/lib/trade/trading-rules"
import {
  tradeEndingLabel,
  type LiveFill,
  type LiveTrade,
  type RemovableTradeHistory,
  type UnmatchedTradeHistory,
} from "@/lib/trade/live-trades"
import { liquidationAwayOf, marginOf } from "@/lib/trade/margin-health"
import { positionFees, type PositionFees } from "@/lib/trade/position-fees"
import { ifStoppedChange } from "@/lib/trade/if-stopped"
import { positionStopPx } from "@/lib/trade/position-stop"
import {
  LOST_MONEY,
  MADE_MONEY,
  WARNING,
  moneyTone,
} from "@/lib/trade/money-tone"
import {
  positionProfit,
  positionValue,
  projectedProfit,
  type TradeOrder,
  type TradePosition,
} from "@/lib/trade/paper"
import type { SmartOrder } from "@/lib/trade/smart-plan"
import { cn } from "@/lib/utils"
import { panelSectionBarClassName } from "@/lib/layout/panel-section-bar"

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

/** Marks a testnet exchange row. Mainnet rows do not need a "Real" chip. */
function TestnetBadge({ marketKey }: { marketKey: string }) {
  if (parseMarketKey(marketKey)?.network !== "testnet") return null
  return <TradeBadge tone="testnet">Testnet</TradeBadge>
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
  | "ifStopped"
  | "fees"
  | "unrealized"

const POSITION_COLUMNS: ColumnSpec<PositionColumn>[] = [
  { key: "market", label: "Market" },
  { key: "wallet", label: "Wallet" },
  { key: "value", label: "Value" },
  { key: "margin", label: "Margin" },
  { key: "liquidation", label: "Liquidation" },
  { key: "projected", label: "Projected P / L" },
  { key: "ifStopped", label: "If stopped" },
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
  // The row's own ticker where the list has the row: a Solana key carries
  // the mint address, and only the market knows it is called JUP.
  const symbol = market?.symbol ?? marketSymbol(marketKey)
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

/**
 * "Long 5×" — direction and leverage, the two things that set the risk. A
 * coin that is simply owned has neither, so its badge says how many are
 * held instead: "Owned 1,125.37".
 */
function SideBadge({ position }: { position: TradePosition }) {
  if (position.owned) {
    return <TradeBadge tone="made">Owned {formatSize(position.szi)}</TradeBadge>
  }
  const long = position.szi > 0
  return (
    <TradeBadge tone={long ? "made" : "lost"}>
      {long ? "Long" : "Short"} {position.leverage}×
    </TradeBadge>
  )
}

/** A visible warning with the same sentence available on hover and focus. */
function MissingStopBadge({ marketKey }: { marketKey: string }) {
  const symbol = marketSymbol(marketKey)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${symbol} has no stop`}
          className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={(event) => event.stopPropagation()}
        >
          <TradeBadge tone="lost">No stop</TradeBadge>
        </button>
      </TooltipTrigger>
      <TooltipContent>This position has no stop.</TooltipContent>
    </Tooltip>
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
  stopPx,
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
  /**
   * Where the stop sits, from the position or its running grid, or null when
   * there is none. Undefined until a settled read has actually looked.
   */
  stopPx: number | null | undefined
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
  // Only a settled read that found nothing is a missing stop; a read still on
  // its way is not an answer either way. An owned coin cannot carry a stop
  // until its venue takes orders, so it is not warned about one.
  const missingStop = stopPx === null && !position.owned
  // The two blanks an owned coin may carry: no price from the feed, and no
  // record of what it cost. Each prints as a dash rather than a zero.
  const unpriced = position.owned?.priced === false
  const entryUnknown = position.owned?.entryKnown === false
  const ifStopped =
    stopPx === null || stopPx === undefined
      ? null
      : ifStoppedChange({ szi: position.szi, mark, stopPx })

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
              <TestnetBadge marketKey={position.marketKey} />
            ) : null}
            {missingStop ? (
              <MissingStopBadge marketKey={position.marketKey} />
            ) : null}
          </>
        }
        onSelect={() => onSelectMarket(position.marketKey)}
      />
      <WalletCell wallet={wallet} />
      <Cell>
        {unpriced ? (
          <span className="text-muted-foreground">Unpriced</span>
        ) : (
          formatUsd(positionValue(position, mark))
        )}
      </Cell>
      <Cell>
        {position.owned ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          formatUsd(margin)
        )}
      </Cell>
      <Cell>
        {away === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span
            className={cn(
              away <= 0.1
                ? LOST_MONEY
                : away <= 0.25
                  ? WARNING
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
      <Cell>
        {/* From today's price, not the entry: what firing the stop now would
            do to the money. A stop already on the good side of the price
            banks a gain, and says so in the same column. */}
        {ifStopped === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={cn("font-medium", moneyTone(ifStopped))}>
            {formatSignedUsd(ifStopped)}
          </span>
        )}
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
        {entryUnknown || unpriced ? (
          // No entry price to measure from, or no price to measure to.
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            <span className={cn("font-medium", moneyTone(profit))}>
              {formatSignedUsd(profit)}
            </span>{" "}
            {/* The dollars are the answer; the percentage only says whether
                they were a lot for the money that was in — the same pairing
                the Journal uses two tables down. */}
            <span className="text-xs text-muted-foreground">
              {profitShare >= 0 ? "+" : ""}
              {profitShare.toFixed(2)}%
            </span>
          </>
        )}
      </Cell>
      <td
        data-column="actions"
        className="px-3 py-2 text-left whitespace-nowrap"
      >
        {/* An owned coin's venue takes no orders yet, so nothing here could
            act on it. No buttons beats buttons that are refused. */}
        {position.owned ? null : (
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
        )}
      </td>
    </TableRow>
  )
}

export function PositionsTable({
  positions,
  markets,
  fills,
  smartOrders,
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
  /** The same settled plans the poll carries, for grid-owned stops. */
  smartOrders: readonly SmartOrder[]
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
  // list of positions actually wants. If stopped starts with the biggest loss
  // first, because that column exists to find the trade that hurts most.
  const { sort, direction, toggleSort } = useTableSort<PositionColumn>(
    "unrealized",
    "desc",
    (column) =>
      column === "market" || column === "wallet" || column === "ifStopped"
        ? "asc"
        : "desc"
  )

  const marks = useLiveMarks(positions.map((one) => one.marketKey))
  const markOf = React.useCallback(
    (position: TradePosition) =>
      marks.get(position.marketKey) ??
      markets.get(position.marketKey)?.price ??
      position.entryPx,
    [marks, markets]
  )

  // Worked out once per position rather than per row render, because each one
  // walks that coin's fills and this panel redraws on every price tick.
  const feesById = React.useMemo(() => {
    const byId = new Map<string, PositionFees | null>()
    for (const one of positions) byId.set(one.id, positionFees(fills, one))
    return byId
  }, [positions, fills])
  const feesOf = React.useCallback(
    (position: TradePosition) => feesById.get(position.id) ?? null,
    [feesById]
  )

  // Undefined until both halves of the read are in: "no stop" is a claim
  // about money, and half a read cannot make it.
  const stopPxById = React.useMemo(() => {
    const byId = new Map<string, number | null>()
    if (!settled || failed) return byId
    for (const one of positions) {
      byId.set(one.id, positionStopPx(one, smartOrders))
    }
    return byId
  }, [positions, smartOrders, settled, failed])
  const stopPxOf = React.useCallback(
    (position: TradePosition) => stopPxById.get(position.id),
    [stopPxById]
  )

  const rows = React.useMemo(
    () =>
      sortRows(positions, direction, (position) => {
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
          case "ifStopped": {
            // Biggest loss first means smallest number first, so a row with
            // no stop sorts to the end the way a missing liquidation does.
            const stopPx = stopPxOf(position)
            return stopPx === null || stopPx === undefined
              ? Number.POSITIVE_INFINITY
              : ifStoppedChange({ szi: position.szi, mark, stopPx })
          }
          case "fees":
            // The figure the row prints, so the order and the number agree. A
            // real position with nothing swept has no figure at all and sorts
            // to the end, the way a missing liquidation price already does.
            return position.live
              ? (feesOf(position)?.paid ?? Number.POSITIVE_INFINITY)
              : position.feesPaid
          default:
            return positionProfit(position, mark)
        }
      }),
    [positions, direction, sort, markOf, walletName, feesOf, stopPxOf]
  )

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
            stopPx={stopPxOf(position)}
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
  onResume,
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
  /**
   * Starts a paused watched price working again — see `paused` on
   * `TradeOrder`. Only a watched row can be paused, so only that row shows the
   * button. Resolves once the server has answered, so the button can settle.
   */
  onResume: (order: TradeOrder) => Promise<boolean>
}) {
  const { sort, direction, toggleSort } = useTableSort<OrderColumn>(
    "price",
    "desc",
    (column) =>
      column === "market" || column === "wallet" || column === "side"
        ? "asc"
        : "desc"
  )

  const rows = React.useMemo(
    () =>
      sortRows(orders, direction, (order) => {
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
      }),
    [orders, direction, sort, walletName]
  )

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
                {order.live ? (
                  <TestnetBadge marketKey={order.marketKey} />
                ) : null}
                {order.paused ? (
                  <span className={cn("text-xs", WARNING)}>Paused</span>
                ) : null}
              </>
            }
          />
          <WalletCell wallet={walletName(order.walletId)} />
          <Cell className={order.side === "buy" ? MADE_MONEY : LOST_MONEY}>
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
              {order.paused ? (
                <ResumeOrderButton order={order} onResume={onResume} />
              ) : null}
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
 * Resume for a paused watched price, beside its cancel. Holds itself down
 * while the server answers so a second press cannot send a second resume.
 */
function ResumeOrderButton({
  order,
  onResume,
}: {
  order: TradeOrder
  onResume: (order: TradeOrder) => Promise<boolean>
}) {
  const [resuming, setResuming] = React.useState(false)
  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      disabled={resuming}
      aria-label={`Resume the ${marketSymbol(order.marketKey)} order`}
      onClick={() => {
        setResuming(true)
        void onResume(order).finally(() => setResuming(false))
      }}
    >
      <PlayIcon className="size-3" />
      {resuming ? "Resuming" : "Resume"}
    </Button>
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
  unmatchedHistory = [],
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
  /** Saved fills that cannot be paired into a finished trade. */
  unmatchedHistory?: readonly UnmatchedTradeHistory[]
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
  onRemove: (trade: RemovableTradeHistory) => void
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
  const rows = React.useMemo(() => {
    const journalRows: Array<
      | { kind: "finished"; id: string; trade: LiveTrade }
      | { kind: "unmatched"; id: string; history: UnmatchedTradeHistory }
    > = [
      ...trades.map((trade) => ({
        kind: "finished" as const,
        id: trade.id,
        trade,
      })),
      ...unmatchedHistory.map((history) => ({
        kind: "unmatched" as const,
        id: history.id,
        history,
      })),
    ]
    return sortRows(journalRows, direction, (row) => {
      const trade = row.kind === "finished" ? row.trade : null
      const history = row.kind === "unmatched" ? row.history : null
      const marketKey = trade?.marketKey ?? history!.marketKey
      const walletId = trade?.walletId ?? history!.walletId
      const position = history?.position ?? null
      const direction = position
        ? position.szi > 0
          ? "long"
          : "short"
        : "unknown"
      switch (sort) {
        case "market":
          return marketSymbol(marketKey)
        case "wallet":
          return walletName(walletId)
        case "side":
          return trade?.direction ?? direction
        case "held":
          return trade?.heldMs ?? 0
        case "entry":
          return trade?.entryPx ?? position?.entryPx ?? 0
        case "exit":
          return trade?.exitPx ?? 0
        case "size":
          return trade?.sz ?? Math.abs(position?.szi ?? 0)
        case "pnl":
          return trade?.pnl ?? 0
        case "ending":
          return trade
            ? tradeEndingLabel(trade)
            : history?.open
              ? "Open, history incomplete"
              : "History incomplete"
        default:
          return trade?.openedAt ?? history!.firstAt
      }
    })
  }, [trades, unmatchedHistory, direction, sort, walletName])

  const listedIds = rows.flatMap((row) =>
    row.kind === "finished" || !row.history.open ? [row.id] : []
  )

  return (
    <TradeTable
      columns={TRADE_COLUMNS}
      rows={rows}
      loading={!settled}
      failed={failed}
      loadingLabel="Reading your trade history"
      failedWords="The journal could not be read, so it is not known how past trades went."
      emptyWords="No trade history yet. Every saved fill appears here, even when its matching entry or exit is missing."
      onRetry={onRetry}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      leadingHeader={
        <Checkbox
          checked={tickAllState(listedIds)}
          onCheckedChange={() => onTickVisible(listedIds)}
          aria-label="Select every removable Journal row"
        />
      }
      renderRow={(row) =>
        row.kind === "finished" ? (
          <TableRow
            key={row.id}
            rowAction={() => onSelectTrade(row.trade)}
            data-state={row.id === selectedId ? "selected" : undefined}
            className="border-t"
          >
            {/* Marked as the select column so ticking a row never also fires
                the row action and draws the trade on the chart. */}
            <td data-column="select" className="w-8 px-3 py-2">
              <Checkbox
                checked={ticked.has(row.id)}
                onCheckedChange={() => onTickTrade(row.id)}
                aria-label={`Select the ${marketSymbol(row.trade.marketKey)} trade`}
              />
            </td>
            <MarketCell
              marketKey={row.trade.marketKey}
              market={markets.get(row.trade.marketKey) ?? null}
              onSelect={() => onSelectMarket(row.trade.marketKey)}
              badge={
                row.trade.live ? (
                  <TestnetBadge marketKey={row.trade.marketKey} />
                ) : (
                  <PracticeBadge />
                )
              }
            />
            <WalletCell wallet={walletName(row.trade.walletId)} />
            <Cell>
              <TradeBadge
                tone={row.trade.direction === "long" ? "made" : "lost"}
              >
                {row.trade.direction === "long" ? "Long" : "Short"}
              </TradeBadge>
            </Cell>
            <Cell className="text-muted-foreground">
              {formatDateTime(new Date(row.trade.openedAt))}
            </Cell>
            <Cell className="text-muted-foreground">
              {formatDuration(row.trade.heldMs)}
            </Cell>
            <Cell>{formatPrice(row.trade.entryPx)}</Cell>
            <Cell>{formatPrice(row.trade.exitPx)}</Cell>
            <Cell>{formatSize(row.trade.sz)}</Cell>
            <Cell className={moneyTone(row.trade.pnl)}>
              {formatSignedUsd(row.trade.pnl)}
              {/* The dollars are the answer; the percentage is only there to
                  say whether they were a lot for the money that was in. */}
              <span className="ml-1.5 text-muted-foreground">
                {row.trade.returnPct >= 0 ? "+" : ""}
                {row.trade.returnPct.toFixed(1)}%
              </span>
            </Cell>
            <Cell>
              <TradeBadge tone={endingTone(row.trade)}>
                {tradeEndingLabel(row.trade)}
                {row.trade.stopPx !== null
                  ? ` at ${formatPrice(row.trade.stopPx)}`
                  : ""}
              </TradeBadge>
              {/* The entry went out against the person's own rules, and they
                  said "anyway". Kept on the row so a run of these can be read
                  against how the trades ended. */}
              {row.trade.overrode && row.trade.overrode.length > 0 ? (
                <span className="mt-1 block text-xs text-muted-foreground whitespace-nowrap">
                  {overrodeNote(row.trade.overrode)}
                </span>
              ) : null}
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
                aria-label={`Remove the ${marketSymbol(row.trade.marketKey)} trade from the Journal`}
                onClick={() => onRemove(row.trade)}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </td>
          </TableRow>
        ) : (
          <TableRow key={row.id} className="border-t">
            <td data-column="select" className="w-8 px-3 py-2">
              <Checkbox
                checked={row.history.open ? false : ticked.has(row.id)}
                disabled={row.history.open}
                onCheckedChange={() => onTickTrade(row.id)}
                aria-label={
                  row.history.open
                    ? `${marketSymbol(row.history.marketKey)} is still open and cannot be removed`
                    : `Select the incomplete ${marketSymbol(row.history.marketKey)} history`
                }
              />
            </td>
            <MarketCell
              marketKey={row.history.marketKey}
              market={markets.get(row.history.marketKey) ?? null}
              onSelect={() => onSelectMarket(row.history.marketKey)}
              badge={
                row.history.live ? (
                  <TestnetBadge marketKey={row.history.marketKey} />
                ) : (
                  <PracticeBadge />
                )
              }
            />
            <WalletCell wallet={walletName(row.history.walletId)} />
            <Cell>
              {row.history.position ? (
                <TradeBadge
                  tone={row.history.position.szi > 0 ? "made" : "lost"}
                >
                  {row.history.position.szi > 0 ? "Long" : "Short"}
                </TradeBadge>
              ) : (
                <span className="text-muted-foreground">&mdash;</span>
              )}
            </Cell>
            <Cell className="text-muted-foreground">
              <span className="block">Unknown</span>
              <span className="block text-xs whitespace-nowrap">
                First saved {formatDateTime(new Date(row.history.firstAt))}
              </span>
            </Cell>
            <Cell className="text-muted-foreground">
              {row.history.open ? "Still open" : <>&mdash;</>}
            </Cell>
            <Cell>
              {row.history.position?.entryPx === null ||
              row.history.position?.entryPx === undefined ? (
                <>&mdash;</>
              ) : (
                formatPrice(row.history.position.entryPx)
              )}
            </Cell>
            <Cell>&mdash;</Cell>
            <Cell>
              {row.history.position ? (
                formatSize(Math.abs(row.history.position.szi))
              ) : (
                <>&mdash;</>
              )}
            </Cell>
            <Cell>&mdash;</Cell>
            <Cell>
              <span className="inline-flex items-center gap-1.5">
                <TradeBadge tone="alarm">
                  {row.history.open
                    ? "Open, history incomplete"
                    : "History incomplete"}
                </TradeBadge>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {row.history.fills.length.toLocaleString()} saved{" "}
                  {row.history.fills.length === 1 ? "fill" : "fills"}
                </span>
                <InfoMark label="About incomplete trade history">
                  Trade has {row.history.fills.length.toLocaleString()} saved{" "}
                  {row.history.fills.length === 1 ? "fill" : "fills"}, but its
                  matching entry or exit is missing. The Journal keeps it
                  visible because the history and its money still exist.
                </InfoMark>
              </span>
            </Cell>
            <td
              data-column="actions"
              className="px-3 py-2 text-left whitespace-nowrap"
            >
              {row.history.open ? null : (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Remove the incomplete ${marketSymbol(row.history.marketKey)} history from the Journal`}
                  onClick={() => onRemove(row.history)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              )}
            </td>
          </TableRow>
        )
      }
      footer={
        settled && rows.length > 0 && onLoadOlder ? (
          <tfoot>
            <tr className={panelSectionBarClassName}>
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
