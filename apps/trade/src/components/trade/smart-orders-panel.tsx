import * as React from "react"
import {
  EllipsisVerticalIcon,
  Grid2x2Icon,
  LayersIcon,
  Loader2Icon,
  PlayIcon,
} from "lucide-react"

import { MarketIcon } from "@/components/trade/market-icon"
import { OrderPanelTotals } from "@/components/trade/order-panel-totals"
import { TradeBadge } from "@/components/trade/trade-badge"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { LoadingRow } from "@/components/ui/loading-row"
import { ErrorRow } from "@/components/ui/error-row"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import { marketSymbol, type MarketRow } from "@/lib/protocols/contracts"
import {
  formatClockTime,
  formatDateTime,
  formatTimeAgo,
} from "@/lib/format/format-time"
import { PnlAmount } from "@/components/trade/pnl-amount"
import {
  formatPrice,
  formatSignedUsd,
  formatUsd,
  formatWholeUsd,
} from "@/lib/trade/format"
import { keyExpiryNotice } from "@/lib/trade/live"
import { useLiveMarks } from "@/lib/trade/live-market"
import { sumProfits, sumValues } from "@/lib/trade/order-panel-sums"
import {
  gridRoundTrips,
  type LiveFill,
  type LiveTrade,
} from "@/lib/trade/live-trades"
import type { TradePosition } from "@/lib/trade/paper"
import { LOST_MONEY, moneyTone, WARNING } from "@/lib/trade/money-tone"
import {
  smartOrdersYouPlaced,
  type SmartOrder,
  type SmartOrderKind,
} from "@/lib/trade/smart-plan"
import type { TradeWallet } from "@/lib/trade/wallets"
import { focusRing } from "@/lib/layout/focus-ring"
import { stickyPanelTableHeaderClassName } from "@/lib/layout/panel-section-bar"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import {
  readSmartOrdersCache,
  type SmartOrderPosition,
  writeSmartOrdersCache,
} from "@/lib/trade/dashboard-cache"
import { cn } from "@/lib/utils"

/**
 * Every coin a smart order is working right now, under the wallets.
 *
 * **These coins are deliberately not in the Positions tab.** A position a
 * ladder or a grid is running is not a position somebody is holding — it is
 * one step of something still happening, and mixed in with hand-placed trades
 * it read as a trade nobody was managing. Positions is what you are holding;
 * this is what is being worked.
 *
 * **Only the ones somebody placed by hand.** A flow can have a hundred and
 * fifty ladders working at once, which would bury the two or three you placed
 * yourself and turn this into a second, worse copy of the run's dashboard.
 * What a flow is doing belongs to that run's page.
 *
 * One row per smart order. Clicking a row charts that coin; hovering or
 * focusing its ticker icon shows the order's progress and sales.
 */

const KIND_LABELS: Record<SmartOrderKind, string> = {
  dca: "DCA ladder",
  grid: "Grid",
  signal: "Signals",
  watch: "Watched price",
}

type SmartOrderColumn = "ticker" | "type" | "held" | "pnl"

function smartOrderType(order: SmartOrder): "long" | "short" {
  return order.kind === "grid" && order.plan.direction === "short"
    ? "short"
    : "long"
}

function defaultSmartOrderDirection(column: SmartOrderColumn) {
  return column === "pnl" || column === "held"
    ? ("desc" as const)
    : ("asc" as const)
}

/** The number a money column sorts on, or null when the row has none. */
function sortedValue(
  row: { openProfit: number | null; held: number | null },
  column: SmartOrderColumn
): number | null {
  return column === "held" ? row.held : row.openProfit
}

type SmartOrdersViewProps = {
  cacheScope: string
  smartOrders: readonly SmartOrder[]
  /** What each of them is holding, when it has bought anything yet. */
  positions: readonly TradePosition[]
  /** Fills not yet part of a finished trade, where a grid's sells live. */
  fills: readonly LiveFill[]
  /** Finished round trips, for the orders that do go flat. */
  trades: readonly LiveTrade[]
  markets: ReadonlyMap<string, MarketRow>
  wallets: readonly TradeWallet[]
  walletName: (walletId: string) => string
  /** The market on the chart. Its smart-order row keeps the selected shade. */
  selectedMarketKey: string | null
  /** Both the practice and real-money reads have landed. */
  settled: boolean
  /** The first read failed and there is nothing to fall back on. */
  failed: boolean
  onRetry: () => void
  onResumeSmartOrder: (order: SmartOrder) => Promise<boolean>
  onSelectMarket: (marketKey: string) => void
  /**
   * Told whenever the panel has no row to show, or has one again, so the
   * dashboard can leave an empty panel out when Hide on empty is on. A failed
   * read with nothing listed is never "empty": its Retry button has to stay
   * reachable. Reported before paint, so a panel is never drawn for a frame
   * and then taken away.
   */
  onEmptyChange?: (empty: boolean) => void
}

/** The two panels, one per kind of smart order placed by hand. */
export type SmartOrdersPanelKind = "grid" | "dca"

/** How each panel names what it lists, in its empty and failed answers. */
const PANEL_WORDS: Record<SmartOrdersPanelKind, { one: string; many: string }> = {
  grid: { one: "grid", many: "grids" },
  dca: { one: "DCA ladder", many: "DCA ladders" },
}

/**
 * Grids or DCA ladders, one kind per panel. The dashboard stacks the Grid
 * panel above the DCA panel (Tyler, 6 Oct 2026). Before that the two were tabs
 * of one panel, and before that one tab listed both beside a Bots tab of
 * running flows. Running flows are listed on the trading overview's Running
 * bots card instead.
 */
export function SmartOrdersPanel({
  kind,
  ...props
}: SmartOrdersViewProps & { kind: SmartOrdersPanelKind }) {
  return (
    // The panel fills the box it was given and scrolls inside it, in its own
    // column and in the collapsed-column menu alike. Both boxes are a flex
    // column with a height cap, so one class covers them.
    <section
      data-smart-orders-panel={kind}
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card"
    >
      <DashboardCardTitleHeader
        icon={
          kind === "grid" ? (
            <Grid2x2Icon className="size-4" />
          ) : (
            <LayersIcon className="size-4" />
          )
        }
        title={kind === "grid" ? "Grid" : "DCA"}
      />
      <SmartOrdersView {...props} kind={kind} />
    </section>
  )
}

function SmartOrdersView({
  cacheScope,
  smartOrders,
  positions,
  fills,
  trades,
  markets,
  wallets,
  walletName,
  selectedMarketKey,
  settled,
  failed,
  onRetry,
  onResumeSmartOrder,
  onSelectMarket,
  onEmptyChange,
  kind,
}: SmartOrdersViewProps & { kind: SmartOrdersPanelKind }) {
  const [cached, setCached] = React.useState<ReturnType<
    typeof readSmartOrdersCache
  >>(null)
  useEffectBeforePaint(() => {
    setCached(readSmartOrdersCache(cacheScope))
  }, [cacheScope])
  React.useEffect(() => {
    if (!settled || failed) return
    writeSmartOrdersCache(cacheScope, { orders: smartOrders, positions })
  }, [cacheScope, failed, positions, settled, smartOrders])
  const shownOrders =
    !settled && !failed && cached !== null ? cached.orders : smartOrders
  const shownPositions: readonly SmartOrderPosition[] =
    !settled && !failed && cached !== null ? cached.positions : positions

  const [readAt, setReadAt] = React.useState(Date.now)
  React.useEffect(() => {
    const timer = window.setInterval(() => setReadAt(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  // Placed by hand. An order carrying a run id was placed by a flow, and one
  // written before that was recorded reads as a hand-placed one — which is
  // what it looks like on screen anyway. The Positions tab leaves out the
  // coins this same list covers, so both come from one function.
  //
  // Grid lists grids. DCA lists ladders and the one other kind that function
  // lets through, a paused signal trade. That row has to be listed somewhere,
  // because the Positions tab leaves its coin out, and the ladder engine is
  // what runs a signal trade.
  const mine = React.useMemo(
    () =>
      smartOrdersYouPlaced(shownOrders).filter((order) =>
        kind === "grid" ? order.kind === "grid" : order.kind !== "grid"
      ),
    [kind, shownOrders]
  )
  const marks = useLiveMarks(mine.map((one) => one.marketKey))
  const held = React.useMemo(
    () =>
      new Map(
        shownPositions.map((one) => [
          `${one.walletId}:${one.marketKey}`,
          one,
        ])
      ),
    [shownPositions]
  )
  const expiredWallets = React.useMemo(
    () =>
      new Set(
        wallets
          .filter(
            (wallet) =>
              wallet.status === "active" &&
              keyExpiryNotice(wallet.keyValidUntil, readAt)?.tone === "expired"
          )
          .map((wallet) => wallet.id)
      ),
    [wallets, readAt]
  )

  const { sort, direction, toggleSort } = useTableSort<SmartOrderColumn>(
    "pnl",
    "desc",
    defaultSmartOrderDirection
  )
  const rows = React.useMemo(() => {
    const unsorted = mine.map((order) => {
      const position = held.get(`${order.walletId}:${order.marketKey}`) ?? null
      const catalogueSymbol =
        markets.get(order.marketKey)?.symbol ?? marketSymbol(order.marketKey)
      // The ticker without its venue namespace — "xyz:SNDK" reads SNDK. The
      // same rule as the icon's letter in `market-icon.tsx`: the prefix is a
      // venue, whatever the exchange, so no protocol is named here and the
      // fence test stays clean.
      const symbol = catalogueSymbol.includes(":")
        ? catalogueSymbol.slice(catalogueSymbol.indexOf(":") + 1)
        : catalogueSymbol
      const mark =
        marks.get(order.marketKey) ??
        markets.get(order.marketKey)?.price ??
        null
      const openProfit =
        position && mark !== null
          ? (mark - position.entryPx) * position.szi - position.feesPaid
          : null
      return {
        order,
        symbol,
        position,
        openProfit,
        held: heldUsd(order),
        // What it has sold lives in the details card, not in a column.
        banked: bankedBy(order, fills, trades),
        keyExpired: expiredWallets.has(order.walletId),
      }
    })
    const compared = (
      left: (typeof unsorted)[number],
      right: (typeof unsorted)[number]
    ) => {
      if (sort === "ticker") {
        return left.symbol.localeCompare(right.symbol)
      }
      if (sort === "type") {
        return smartOrderType(left.order).localeCompare(
          smartOrderType(right.order)
        )
      }
      const leftValue = sortedValue(left, sort)
      const rightValue = sortedValue(right, sort)
      if (leftValue === null || rightValue === null) return 0
      return leftValue - rightValue
    }
    return unsorted.sort((left, right) => {
      if (sort === "pnl" || sort === "held") {
        const leftValue = sortedValue(left, sort)
        const rightValue = sortedValue(right, sort)
        if (leftValue === null) return rightValue === null ? 0 : 1
        if (rightValue === null) return -1
      }
      const result = compared(left, right)
      if (result !== 0) return direction === "asc" ? result : -result
      return left.symbol.localeCompare(right.symbol)
    })
  }, [
    direction,
    expiredWallets,
    fills,
    held,
    markets,
    marks,
    mine,
    sort,
    trades,
  ])

  // Every column reads from the left, headings and figures alike (Tyler,
  // 13 Sep 2026). PnL and Banked used to hug the right edge, which left a hole
  // between Value and PnL once Value was moved to the left.
  const heading = (column: SmartOrderColumn, label: React.ReactNode) => (
    <TableSortButton
      active={sort === column}
      direction={direction}
      onClick={() => toggleSort(column)}
      className="gap-0.5 whitespace-nowrap sm:text-xs"
    >
      {label}
    </TableSortButton>
  )

  const empty = rows.length === 0 && !failed
  useEffectBeforePaint(() => {
    onEmptyChange?.(empty)
  }, [empty, onEmptyChange])

  return (
    <>
      {rows.length === 0 && !settled && cached === null ? (
        <LoadingRow
          label={`Reading your ${PANEL_WORDS[kind].many}`}
          className="flex-1 text-xs"
        />
      ) : rows.length === 0 && failed ? (
        <ErrorRow
          message={`The smart orders could not be read, so it is not known whether a ${PANEL_WORDS[kind].one} is working.`}
          onRetry={onRetry}
          className="flex-1 p-6 text-sm"
        />
      ) : rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          No {PANEL_WORDS[kind].one} of your own is working. Right-click the
          chart to place one. A flow&rsquo;s {PANEL_WORDS[kind].many} live on its
          own dashboard.
        </p>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <Table
            className="table-fixed [&_tbody_tr:first-child_td]:pt-2 [&_tbody_tr:last-child_td]:pb-2 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4"
            containerClassName={cn(
              "overflow-visible [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10",
              stickyPanelTableHeaderClassName
            )}
          >
            <TableHeader>
              <TableRow>
                {/* Four columns since Banked left, and the width it freed is
                    shared out rather than all going to the ticker (Tyler,
                    13 Sep 2026). Value stays the narrow one because its
                    figures are the shortest, which keeps PnL beside it. */}
                <TableHead className="w-[34%] px-1">
                  {heading("ticker", "Ticker")}
                </TableHead>
                <TableHead className="w-[22%] px-1">
                  {heading("type", "Type")}
                </TableHead>
                <TableHead className="w-[20%] px-1">
                  {heading("held", "Value")}
                </TableHead>
                <TableHead className="w-[24%] px-1">
                  {heading("pnl", "PnL")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(
                ({
                  order,
                  symbol,
                  position,
                  openProfit,
                  held: heldMoney,
                  banked,
                  keyExpired,
                }) => {
                  const selected = order.marketKey === selectedMarketKey
                  return (
                    <TableRow
                      key={order.id}
                      className="group"
                      rowAction={() => onSelectMarket(order.marketKey)}
                      data-state={selected ? "selected" : undefined}
                    >
                      <TableCell className="py-2 pl-1 pr-2">
                        <div className="grid min-w-0 gap-1">
                          <div className="flex min-w-0 items-center gap-1">
                            <SmartOrderDetailsPopover
                              order={order}
                              symbol={symbol}
                              position={position}
                              openProfit={openProfit}
                              banked={banked}
                              keyExpired={keyExpired}
                              walletName={walletName(order.walletId)}
                            >
                              <MarketIcon
                                symbol={symbol}
                                iconUrl={
                                  markets.get(order.marketKey)?.iconUrl ?? null
                                }
                              />
                              <button
                                type="button"
                                onClick={() => onSelectMarket(order.marketKey)}
                                className={cn(
                                  "min-w-0 flex-1 rounded-sm text-left",
                                  focusRing
                                )}
                              >
                                {/* Block, because an inline span ignores
                                    the clipping and a long name ran into
                                    the Type column (Tyler, 24 Sep 2026). */}
                                <span className="block min-w-0 truncate text-xs font-semibold sm:text-sm">
                                  {symbol}
                                </span>
                              </button>
                            </SmartOrderDetailsPopover>
                          </div>
                          {order.plan.paused ? (
                            <span
                              className={cn(
                                "flex items-center gap-1 pl-6 text-xs",
                                WARNING
                              )}
                            >
                              <span className="truncate">Paused</span>
                              <ResumeSmartOrderButton
                                order={order}
                                onResume={onResumeSmartOrder}
                              />
                            </span>
                          ) : keyExpired ? (
                            <span
                              className={cn(
                                "block truncate pl-6 text-xs",
                                LOST_MONEY
                              )}
                            >
                              Key expired
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="px-1 py-2">
                        <TradeBadge
                          tone={
                            smartOrderType(order) === "long" ? "made" : "lost"
                          }
                        >
                          {smartOrderType(order) === "long" ? "Long" : "Short"}
                        </TradeBadge>
                      </TableCell>
                      <TableCell className="px-1 py-2 font-mono text-xs tabular-nums">
                        <span className="text-muted-foreground">
                          {heldMoney === null
                            ? "—"
                            : formatWholeUsd(heldMoney)}
                        </span>
                      </TableCell>
                      <TableCell className="px-1 py-2 font-mono text-xs tabular-nums">
                        {openProfit === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <PnlAmount
                            className={cn("font-medium", moneyTone(openProfit))}
                          >
                            {formatSignedUsd(openProfit)}
                          </PnlAmount>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                }
              )}
            </TableBody>
            <OrderPanelTotals
              count={rows.length}
              value={sumValues(rows.map((row) => row.held))}
              pnl={sumProfits(rows.map((row) => row.openProfit))}
            />
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}
    </>
  )
}

function DetailRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-2 text-xs">
      <span className="whitespace-nowrap opacity-70">{label}</span>
      <span className="min-w-0 text-right break-words">{children}</span>
    </div>
  )
}

function ResumeSmartOrderButton({
  order,
  onResume,
}: {
  order: SmartOrder
  onResume: (order: SmartOrder) => Promise<boolean>
}) {
  const [resuming, setResuming] = React.useState(false)
  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      disabled={resuming}
      onClick={() => {
        setResuming(true)
        void onResume(order).finally(() => setResuming(false))
      }}
    >
      <PlayIcon className="size-3" />
      {resuming ? <Loader2Icon className="size-3 animate-spin" aria-hidden="true" /> : null}
      Resume
    </Button>
  )
}

function SmartOrderDetailsPopover({
  order,
  symbol,
  position,
  openProfit,
  banked,
  keyExpired,
  walletName,
  children,
}: {
  order: SmartOrder
  symbol: string
  position: SmartOrderPosition | null
  openProfit: number | null
  banked: ReturnType<typeof bankedBy>
  keyExpired: boolean
  walletName: string
  children: React.ReactNode
}) {
  const pausedReason =
    order.plan.pauseReason ?? "The exchange refused this smart order."
  return (
    <Popover>
      <div className="relative flex w-full min-w-0 items-center gap-1">
        {children}
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${symbol} smart order details`}
            title={`Show ${symbol} smart order details`}
            className={cn(
              "absolute top-1/2 right-0 -translate-y-1/2 rounded-sm p-1 text-muted-foreground/40 hover:bg-muted hover:text-foreground",
              // Out of sight until the row is pointed at (Tyler, 13 Sep 2026).
              // It floats over the right edge of the cell, so no ticker jumps
              // sideways on hover and the name can use the whole cell before
              // it is cut short. It comes back for the keyboard and while its
              // card is open.
              "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
              focusRing
            )}
          >
            <EllipsisVerticalIcon className="size-4" aria-hidden="true" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent
        side="left"
        sideOffset={8}
        collisionPadding={8}
        className="w-64 max-w-[calc(100vw-1rem)] overflow-hidden p-0"
      >
        {/* The cap sits on the viewport, which is the box that scrolls. On
            the outer frame it only clipped the list, and the last sales and
            the total could not be reached. */}
        <ScrollArea viewportClassName="max-h-[min(28rem,var(--radix-popover-content-available-height))]">
        <div className="border-b p-2.5">
          <p className="font-medium">
            {symbol} smart order
          </p>
          <p className="opacity-70">
            {KIND_LABELS[order.kind]} · {walletName}
          </p>
        </div>
        <div className="grid gap-1.5 p-2.5">
          <p className="text-xs font-medium">Progress</p>
          <DetailRow label="Status">
            {order.plan.paused
              ? `Paused. ${pausedReason}`
              : keyExpired
                ? `Trading key expired. This ${order.kind === "grid" ? "grid" : "ladder"} will not act.`
                : whereItHasGot(order, position)}
          </DetailRow>
          {order.kind === "grid" ? (
            <DetailRow
              // A selling grid buys its position back; everything else,
              // including any plan too old to carry a direction, sells.
              label={
                order.plan.direction === "short"
                  ? "Held to buy back"
                  : "Held to sell"
              }
            >
              <span className="tabular-nums">
                {formatUsd(gridHeldToSell(order))}
              </span>
            </DetailRow>
          ) : null}
          {openProfit === null ? null : (
            <DetailRow label="Open profit">
              <PnlAmount className={cn("tabular-nums", moneyTone(openProfit))}>
                {formatSignedUsd(openProfit)}
              </PnlAmount>
            </DetailRow>
          )}
        </div>
        <div className="grid gap-1.5 border-t p-2.5">
          <p className="text-xs font-medium">Sales</p>
          {banked.sells.length === 0 ? (
            <p className="text-sm opacity-70">Nothing sold yet.</p>
          ) : (
            <>
              {banked.capped ? (
                <p className="text-xs opacity-70">
                  The {SHOW_AT_MOST} most recent are listed. The total counts
                  them all.
                </p>
              ) : null}
              {banked.sells.map((sell) => (
                <div
                  key={sell.fillId}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 text-xs"
                >
                  <span
                    className="min-w-0 truncate opacity-70"
                    title={formatDateTime(new Date(sell.at))}
                  >
                    {formatTimeAgo(new Date(sell.at))} @{" "}
                    {formatClockTime(new Date(sell.at))} ·{" "}
                    {formatUsd(sell.amountUsd)}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      sell.money === null ? "opacity-70" : moneyTone(sell.money)
                    )}
                  >
                    {sell.money === null ? "—" : formatSignedUsd(sell.money)}
                  </span>
                </div>
              ))}
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 border-t pt-2 text-xs font-medium">
                <span>
                  {banked.sells.length}{" "}
                  {banked.sells.length === 1 ? "sale" : "sales"}
                </span>
                <span
                  className={cn(
                    "tabular-nums",
                    banked.unpriced === banked.sells.length
                      ? "opacity-70"
                      : moneyTone(banked.total)
                  )}
                >
                  {banked.unpriced === banked.sells.length
                    ? "—"
                    : formatSignedUsd(banked.total)}
                </span>
              </div>
              {banked.unpriced > 0 ? (
                <p className="text-xs opacity-70">
                  {banked.unpriced === 1
                    ? "The exchange has not said what that sale banked."
                    : `The exchange has not said what ${banked.unpriced} of these sales banked.`}
                </p>
              ) : null}
            </>
          )}
        </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Where one smart order has got to, shown in its detail tooltip.
 *
 * Each kind is asked its own question, because the same words would be a lie
 * about the others: a ladder has rungs waiting, a grid has levels recycling,
 * and a signal trade is simply in one of four states.
 */
function whereItHasGot(
  order: SmartOrder,
  position: SmartOrderPosition | null
): string {
  if (order.kind === "dca") {
    const waiting = order.plan.rungs.filter(
      (rung) => rung.status === "waiting"
    ).length
    const bought = order.plan.rungs.filter(
      (rung) => rung.status === "filled"
    ).length
    if (bought === 0) {
      return waiting === 0
        ? "Nothing left waiting"
        : `${waiting} ${waiting === 1 ? "rung" : "rungs"} waiting from ${formatPrice(order.plan.anchorPx)}`
    }
    return `${bought} bought, ${waiting} still waiting`
  }
  if (order.kind === "grid") {
    const waiting = order.plan.levels.filter(
      (level) => level.status === "waiting"
    ).length
    const completed =
      order.plan.levels.filter((level) => level.status === "holding").length +
      order.plan.carriedLevels.length
    return `${waiting} waiting · ${completed} completed`
  }
  if (order.kind === "watch") {
    // A watch has its own three states and they mean different things from a
    // signal trade's. Falling through to that one told somebody a price that
    // has not been reached yet was a position being held.
    if (order.plan.phase === "waiting") {
      return `Waiting for ${formatPrice(order.plan.triggerPx)}, nothing sent yet`
    }
    if (order.plan.phase === "stopping") return "Being called off"
    return `Reached ${formatPrice(order.plan.triggerPx)} — buying in`
  }
  const phase = order.plan.phase
  if (phase === "buying") return "Waiting to buy in"
  if (phase === "selling") return "Selling out"
  if (phase === "stopping") return "Getting out"
  return position ? `Holding from ${formatPrice(position.entryPx)}` : "Holding"
}

/**
 * Dollars this smart order is still holding: coins it has bought and not sold,
 * or a short it has sold and not bought back, counted at what it paid.
 *
 * Null for the kinds that hold nothing of their own. A watched price has not
 * bought anything until it fires, and a signal trade's position belongs to the
 * flow that placed it, not to a row on this panel.
 */
function heldUsd(order: SmartOrder): number | null {
  if (order.kind === "grid") return gridHeldToSell(order)
  if (order.kind === "dca") {
    return order.plan.rungs.reduce(
      (total, rung) =>
        rung.status === "filled" ? total + rung.sz * rung.px : total,
      0
    )
  }
  return null
}

/**
 * Dollars a grid's open levels put up, and have not closed yet — coins a
 * buying grid still has to sell, or a short a selling grid still has to buy
 * back.
 */
function gridHeldToSell(order: Extract<SmartOrder, { kind: "grid" }>): number {
  return [...order.plan.levels, ...order.plan.carriedLevels].reduce(
    (total, level) => total + level.heldSz * level.buyPx,
    0
  )
}

/** How many sales are listed before the list gets in the way of reading it. */
const SHOW_AT_MOST = 12

type Sale = {
  fillId: string
  at: number
  /** Gross dollars bought or sold by the closing fill. */
  amountUsd: number
  /** Null when the venue sold but never said what the sale banked. */
  money: number | null
}

/**
 * What one smart order has actually banked, and each sale that banked it.
 *
 * **Read off the fills, not off the plan.** A grid's levels say what they were
 * set to do; the fills say what happened, in the exchange's own figures, fee
 * included. Every closing fill on this coin since the order was placed counts
 * — there is one smart order per coin per wallet, so on this coin, over this
 * stretch of time, they are its sales.
 *
 * Finished round trips are counted too, for the kinds that do go flat. A grid
 * rarely does, which is exactly why its sells sit in the open fills instead.
 *
 * **A sell is a sale even when the venue states no profit for it.** This used
 * to count only fills carrying a closed profit, and on KuCoin that is never a
 * grid's fills: KuCoin reports money per POSITION closed, not per fill, and a
 * grid selling a fifth of what it holds never closes a position. So a KuCoin
 * grid recycled all week and the panel still said "Nothing sold yet". A grid
 * and a ladder are both long only, so a sell on their coin is a sale, whoever
 * is keeping the books.
 *
 * What the venue would not state is left NULL rather than counted as zero.
 * Zero is a real answer, meaning the sale broke even, and printing it for a
 * sale that made money is the kind of wrong that gets believed.
 *
 * **A grid's sale is worth what its own level made.** The venue books every
 * partial sell against the position average, and while a grid is working that
 * average is held up by the expensive levels still holding, so a level that
 * did its job reads as a loss. The panel said "$1.15 banked" on a CHIP level
 * that put $4.28 in the account. `gridRoundTrips` has the arithmetic. It also
 * answers where KuCoin says nothing at all, because it is worked out from the
 * fills rather than asked for.
 */
export function bankedBy(
  order: SmartOrder,
  fills: readonly LiveFill[],
  trades: readonly LiveTrade[]
): {
  sells: Sale[]
  total: number
  capped: boolean
  /** Sales the venue never put a figure on, so the total is short of them. */
  unpriced: number
} {
  const mine = (walletId: string, marketKey: string, at: number) =>
    walletId === order.walletId &&
    marketKey === order.marketKey &&
    at >= order.createdAt

  // Over every fill, not only this order's: a level's round trip is paid out
  // of the trade that level opened with, and that trade has to still be in the
  // list for the closing one to be worth anything.
  const levels = gridRoundTrips(
    fills,
    order.kind === "grid" ? order.plan.direction : "long"
  )

  const sales: Sale[] = []
  for (const fill of fills) {
    if (!mine(fill.walletId, fill.marketKey, fill.at)) continue
    const level = levels.get(fill.fillId)
    // A stated profit, or a sell out of a long-only order. The first also
    // catches a short being bought back, which the second cannot see.
    const stated = fill.closedPnl !== 0
    if (!level && !stated && fill.side !== "sell") continue
    sales.push({
      fillId: fill.fillId,
      at: fill.at,
      amountUsd: Math.abs(fill.px * fill.sz),
      money: level ? level.money : stated ? fill.closedPnl - fill.fee : null,
    })
  }
  for (const trade of trades) {
    if (!mine(trade.walletId, trade.marketKey, trade.closedAt)) continue
    sales.push({
      fillId: trade.id,
      at: trade.closedAt,
      amountUsd: Math.abs(trade.exitPx * trade.sz),
      money: trade.pnl,
    })
  }

  sales.sort((left, right) => right.at - left.at)
  const total = sales.reduce((sum, sale) => sum + (sale.money ?? 0), 0)
  return {
    sells: sales.slice(0, SHOW_AT_MOST),
    total,
    capped: sales.length > SHOW_AT_MOST,
    /** Sales the venue never put a figure on, so the total is short of them. */
    unpriced: sales.filter((sale) => sale.money === null).length,
  }
}
