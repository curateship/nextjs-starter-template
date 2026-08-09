import * as React from "react"
import { CandlestickChartIcon } from "lucide-react"
import { toast } from "sonner"

import {
  ChartOrderMenu,
  type ChartMenuState,
} from "@/components/trade/chart-order-menu"
import {
  ChartQuickOrder,
  type QuickOrderState,
} from "@/components/trade/chart-quick-order"
import { IndicatorLayer } from "@/components/trade/indicator-layer"
import { MeasureLayer } from "@/components/trade/measure-layer"
import { OrderEditDialog } from "@/components/trade/order-edit-dialog"
import { PaintLayer } from "@/components/trade/paint/paint-layer"
import { PaintToolbar } from "@/components/trade/paint/paint-toolbar"
import { useChartDrawings } from "@/components/trade/paint/use-drawings"
import { PanelPlaceholder } from "@/components/trade/panel-placeholder"
import { PriceChart, type ChartSurface } from "@/components/trade/price-chart"
import { SmartLadderExitsDialog } from "@/components/trade/smart-ladder-exits-dialog"
import { SmartLadderLayer } from "@/components/trade/smart-ladder-layer"
import {
  SmartOrderDialog,
  type SmartOrderState,
} from "@/components/trade/smart-order-dialog"
import { TradeLinesLayer } from "@/components/trade/trade-lines-layer"
import type { Trading } from "@/components/trade/use-trading"
import { useRememberedChartView } from "@/components/trade/use-chart-view"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorBanner } from "@/components/ui/error-banner"
import { getCandlesErrorMessage, loadCandles } from "@/lib/api/candles"
import {
  CANDLE_INTERVALS,
  type CandleBar,
  type CandleInterval,
  type MarketRow,
} from "@/lib/protocols/contracts"
import type { ChartOptions } from "@/lib/trade/chart-options"
import type { ChartView } from "@/lib/trade/chart-view"
import type { SmartLadder } from "@/lib/trade/dca"
import type { PaperOrder } from "@/lib/trade/paper"
import {
  indicatorPaint,
  type IndicatorSettings,
} from "@/lib/trade/indicators/registry"
import { useLiveCandle, useLiveCatchUp } from "@/lib/trade/live-market"
import { cn } from "@/lib/utils"

/**
 * The timeframe row. It draws in the middle panel's header — the workspace
 * owns the remembered choice and hands it to both this picker and the chart's
 * fetch, so the two can never disagree.
 */
export function IntervalPicker({
  value,
  onChange,
}: {
  value: CandleInterval
  onChange: (next: CandleInterval) => void
}) {
  return (
    <div className="flex items-center gap-1">
      {CANDLE_INTERVALS.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "flex h-6 items-center rounded-md px-1.5 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            value === option
              ? "font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

/**
 * The middle of the middle panel: the picked market's price history.
 *
 * This panel owns the fetching and the honest states; `PriceChart` under it
 * only ever sees candles. Data arrives per market-and-interval, and a stale
 * answer — one that lands after another market was picked — is dropped on the
 * floor rather than drawn over the wrong chart.
 */
export function ChartPanel({
  selectedKey,
  interval,
  initialChartView,
  options,
  indicators,
  market,
  trading,
  free,
  equity,
}: {
  selectedKey: string | null
  interval: CandleInterval
  /**
   * The zoom and scroll this account left the chart at, from the route's
   * loader — so the first chart drawn is already at it.
   */
  initialChartView: ChartView | null
  /** Which supporting parts of the chart are visible. */
  options: ChartOptions
  /** Which indicators are on and what each is set to, owned by the workspace. */
  indicators: IndicatorSettings
  /** The market on screen, for the rules an order has to obey. */
  market: MarketRow | null
  /**
   * Trading, practice and real together. Always present; it is
   * `trading.wallet` that is null when no wallet has been picked to trade
   * with (or the picked live wallet has no key).
   */
  trading: Trading
  /** Cash free to put behind a trade, from the account's own figures. */
  free: number
  /** What the account is worth — the pot a DCA ladder's shares are cut from. */
  equity: number
}) {
  // Only ever written from the fetch's callbacks. "Loading" is not stored:
  // an answer whose key does not match what is wanted right now IS the
  // loading state, so it cannot drift out of step with reality.
  const [answer, setAnswer] = React.useState<{
    /** Which market-and-interval these candles belong to. */
    key: string
    candles: CandleBar[]
    error: string | null
  } | null>(null)
  // Bumped by the retry button; the fetch effect depends on it.
  const [attempt, setAttempt] = React.useState(0)

  const wanted = selectedKey ? `${selectedKey}@${interval}` : null

  // The working bar, streamed. Tagged with the market-and-interval it
  // belongs to, so a tick that arrives just after a switch cannot draw on
  // the wrong chart.
  const [liveBar, setLiveBar] = React.useState<{
    key: string
    bar: CandleBar
  } | null>(null)
  useLiveCandle(selectedKey, interval, (bar) => {
    if (wanted) setLiveBar({ key: wanted, bar })
  })

  // The feed came back after a gap: the working bar alone cannot patch a
  // hole in history, so the snapshot is refetched.
  useLiveCatchUp(() => setAttempt((count) => count + 1))

  // The lines drawn on this market. They belong to the market, not to the
  // timeframe, so switching between 4h and 1d leaves them where they are.
  const paint = useChartDrawings(selectedKey)

  // The zoom and scroll, which belong to neither: one view, carried onto
  // whatever market and timeframe you open next.
  const chartView = useRememberedChartView(initialChartView)

  // Right-clicking the chart: the menu that opens under the pointer, and the
  // order window one of its rows opens at the same spot.
  const [menu, setMenu] = React.useState<ChartMenuState | null>(null)
  const [quick, setQuick] = React.useState<QuickOrderState | null>(null)
  // The DCA window, its live preview lines, and the exits window of a placed
  // ladder — the smart-order half of the same right-click.
  const [smart, setSmart] = React.useState<SmartOrderState | null>(null)
  const [preview, setPreview] = React.useState<number[] | null>(null)
  const [exitsFor, setExitsFor] = React.useState<SmartLadder | null>(null)
  // Stopping a ladder cancels every waiting rung at once, so unlike a single
  // order's × it asks first.
  const [cancelFor, setCancelFor] = React.useState<SmartLadder | null>(null)
  // The waiting order opened from its own bar on the chart.
  const [editing, setEditing] = React.useState<PaperOrder | null>(null)
  const plotRef = React.useRef<HTMLDivElement | null>(null)
  const surfaceRef = React.useRef<ChartSurface | null>(null)
  const readSurface = React.useCallback((next: ChartSurface) => {
    surfaceRef.current = next
  }, [])

  // An order window belongs to the market it was opened on. Switching markets
  // — from a row in the table below, say — would otherwise leave it holding a
  // price from the market it just left, and placing that order against the new
  // one. Adjusted during the render that brings the change in, the same way
  // the paint tools drop a half-drawn line: React re-runs the render
  // immediately without painting in between, so no frame shows the stale
  // window.
  const [lastMarket, setLastMarket] = React.useState(selectedKey)
  if (selectedKey !== lastMarket) {
    setLastMarket(selectedKey)
    setMenu(null)
    setQuick(null)
    setSmart(null)
    setPreview(null)
    setExitsFor(null)
    setCancelFor(null)
    setEditing(null)
  }

  const openMenu = (event: React.MouseEvent) => {
    // A tool in hand is drawing, not trading; the browser's own menu is the
    // honest answer when there is nothing here to offer.
    if (paint.tool || !trading.wallet || !market) return
    const surface = surfaceRef.current
    const box = plotRef.current?.getBoundingClientRect()
    if (!surface || !box) return
    const price = surface.priceAt(event.clientY - box.top)
    if (price === null || price <= 0) return
    event.preventDefault()
    setQuick(null)
    setSmart(null)
    setMenu({ price, x: event.clientX, y: event.clientY })
  }

  // The orders a ladder is running — its resting rungs and its sells — are
  // drawn by the ladder layer with their own labels and rules, so the plain
  // order lines must not draw them a second time (or offer to drag them).
  const ladderOrderIds = React.useMemo(() => {
    const ids = new Set<string>()
    for (const ladder of trading.ladders) {
      for (const rung of ladder.plan.rungs) {
        if (rung.orderId) ids.add(rung.orderId)
        if (rung.sellOrderId) ids.add(rung.sellOrderId)
      }
    }
    return ids
  }, [trading.ladders])
  const looseOrders = React.useMemo(
    () => [
      ...trading.orders.filter((order) => !ladderOrderIds.has(order.id)),
      // Orders asked for whose answer has not landed yet, so a press shows on
      // the chart at once instead of a second or two later.
      ...trading.placing,
    ],
    [trading.orders, trading.placing, ladderOrderIds]
  )

  // The open window follows the poll, because the order under it can move: the
  // line can be dragged to another price, and everything the window works out
  // is measured from that price. It is compared by what the window actually
  // reads, so an identical row arriving every four seconds costs nothing.
  //
  // An order that has gone — filled, or cancelled in another tab — leaves the
  // window standing on what it last saw rather than vanishing mid-typing.
  // Pressing Save then says so plainly, which is the server's own answer.
  const polled = editing
    ? (trading.orders.find((one) => one.id === editing.id) ?? null)
    : null
  if (
    polled &&
    editing &&
    (polled.px !== editing.px ||
      polled.sz !== editing.sz ||
      polled.tpPx !== editing.tpPx ||
      polled.slPx !== editing.slPx)
  ) {
    setEditing(polled)
  }

  /**
   * Dragging a stop or target the ladder was aiming: the drag wins — that is
   * the override rule — but it has to be said out loud that the line stopped
   * following the ladder, or the stillness would look like a bug.
   */
  const dragBrackets = (
    walletId: string,
    marketKey: string,
    brackets: { tpPx: number | null; slPx: number | null }
  ) => {
    const ladder = trading.ladders.find(
      (one) => one.walletId === walletId && one.marketKey === marketKey
    )
    if (ladder) {
      const same = (a: number | null, b: number | null) =>
        a === null || b === null
          ? a === b
          : Math.abs(a - b) <= Math.abs(a) * 1e-9
      const tpFollowed =
        ladder.plan.takeProfit !== null &&
        ladder.plan.takeProfit.mode !== "fixed" &&
        ladder.plan.takeProfit.mode !== "prevRung"
      const slFollowed = ladder.plan.stopLoss?.mode === "percent"
      if (
        (tpFollowed && !same(brackets.tpPx, ladder.plan.aimedTpPx)) ||
        (slFollowed && !same(brackets.slPx, ladder.plan.aimedSlPx))
      ) {
        toast.info(
          "That line is yours now — it no longer follows the ladder's rule."
        )
      }
    }
    void trading.dragBrackets(walletId, marketKey, brackets)
  }

  // The candles on screen right now: an answer whose tag does not match what
  // is wanted belongs to a market that was switched away from, and is not one.
  const current = answer && answer.key === wanted ? answer : null

  /**
   * What the switched-on indicators want drawn.
   *
   * Worked out from the closed candles only — the working bar the feed is
   * still filling in is left out on purpose. A level has to hold for several
   * candles before it counts, so the newest bar could not confirm one anyway,
   * and recomputing every level on the chart on every tick would be work for
   * an answer that cannot have changed.
   */
  const indicatorPainted = React.useMemo(
    () => indicatorPaint(indicators, current?.candles ?? []),
    [indicators, current?.candles]
  )

  React.useEffect(() => {
    if (!selectedKey || !wanted) return
    let stale = false
    loadCandles(selectedKey, interval)
      .then(({ candles }) => {
        if (stale) return
        setAnswer({ key: wanted, candles, error: null })
      })
      .catch((error: unknown) => {
        if (stale) return
        setAnswer({
          key: wanted,
          candles: [],
          error: getCandlesErrorMessage(error),
        })
      })
    return () => {
      stale = true
    }
  }, [selectedKey, interval, wanted, attempt])

  if (!selectedKey) {
    return (
      <PanelPlaceholder
        icon={<CandlestickChartIcon className="size-4" />}
        title="The chart goes here"
      >
        Pick a market on the left and its candles draw in this space.
      </PanelPlaceholder>
    )
  }

  return (
    <div
      ref={plotRef}
      className="relative h-full min-h-0"
      onContextMenu={openMenu}
    >
      {!current ? (
        <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
          Loading candles…
        </p>
      ) : current.error ? (
        <div className="p-3">
          <ErrorBanner
            message={current.error}
            onRetry={() => setAttempt((count) => count + 1)}
          />
        </div>
      ) : current.candles.length === 0 ? (
        <PanelPlaceholder
          icon={<CandlestickChartIcon className="size-4" />}
          title="No candles here yet"
        >
          The exchange has no price history for this market at this timeframe.
        </PanelPlaceholder>
      ) : (
        <>
          <PriceChart
            candles={current.candles}
            options={options}
            // Market and timeframe in one — the tag these very candles were
            // fetched under. It is what tells a new chart apart from more
            // candles for the one already drawn.
            viewKey={current.key}
            readView={chartView.readView}
            onViewChange={chartView.onViewChange}
            liveBar={liveBar?.key === wanted ? liveBar.bar : null}
            // The chart is handed a function and a surface, never a drawing or
            // a position. Both layers below draw in the same coordinates and
            // neither is anything the chart itself knows about.
            overlay={(surface) => (
              <>
                {/* First, so everything else sits over it. An indicator is
                    the chart's own reading of the candles — a drawn line, an
                    order or a stop is something somebody put there, and that
                    should never end up behind a dash. */}
                <IndicatorLayer surface={surface} paint={indicatorPainted} />
                <PaintLayer
                  surface={surface}
                  drawings={paint.drawings}
                  tool={paint.tool}
                  selectedId={paint.selectedId}
                  onSelect={paint.setSelectedId}
                  onCreate={paint.create}
                  onMove={paint.move}
                  onDelete={paint.remove}
                />
                <TradeLinesLayer
                  surface={surface}
                  marketKey={selectedKey}
                  // This layer paints over the paint tools, so it has to know
                  // when one is in hand and keep its hands off the pointer —
                  // otherwise starting a line near a stop drags the stop.
                  tool={paint.tool}
                  // Every wallet's, not just the active one's: a row in the
                  // table below is a link to its own market, and it would be a
                  // dead end if the chart then showed nothing.
                  positions={trading.positions}
                  orders={looseOrders}
                  walletName={(walletId) =>
                    trading.walletNames.get(walletId) ?? "Another wallet"
                  }
                  onMoveOrder={(walletId, orderId, price) =>
                    void trading.move(walletId, orderId, price)
                  }
                  onCancelOrder={(walletId, orderId) =>
                    void trading.cancel(walletId, orderId)
                  }
                  onEditOrder={(orderId) =>
                    setEditing(
                      trading.orders.find((one) => one.id === orderId) ?? null
                    )
                  }
                  entryBadge={(position) => {
                    const ladder = trading.ladders.find(
                      (one) =>
                        one.walletId === position.walletId &&
                        one.marketKey === position.marketKey &&
                        one.plan.rungs.some(
                          (rung) =>
                            rung.status === "filled" || rung.status === "sold"
                        )
                    )
                    if (!ladder) return null
                    const waiting = ladder.plan.rungs.filter(
                      (rung) => rung.status === "waiting"
                    ).length
                    return {
                      // Just the count in the bar; the words live on hover.
                      text: `${waiting}`,
                      hint: `DCA ladder — ${waiting} ${
                        waiting === 1 ? "rung" : "rungs"
                      } still waiting to buy. The gear changes its exits; the × stops it buying deeper.`,
                      onSettings: () => setExitsFor(ladder),
                      onRemove: waiting > 0 ? () => setCancelFor(ladder) : null,
                    }
                  }}
                  onSetBrackets={dragBrackets}
                  onSurface={readSurface}
                />
                <SmartLadderLayer
                  surface={surface}
                  marketKey={selectedKey}
                  ladders={trading.ladders}
                  preview={preview}
                  tool={paint.tool}
                  walletName={(walletId) =>
                    trading.walletNames.get(walletId) ?? "Another wallet"
                  }
                  onCancelRung={(walletId, ladderId, rungIndex) =>
                    void trading.cancelRung(walletId, ladderId, rungIndex)
                  }
                  onCancelLadder={setCancelFor}
                  onEditExits={setExitsFor}
                />
                {/* Last, so while Shift is held its sheet is over everything
                    else and a drag across a stop line measures rather than
                    moving the stop. Keyed on the market and timeframe: a
                    reading belongs to the candles it was taken on, so opening
                    another one puts the ruler away rather than carrying a box
                    onto a chart it means nothing on. */}
                <MeasureLayer
                  key={current.key}
                  surface={surface}
                  tool={paint.tool}
                />
              </>
            )}
          />
          <PaintToolbar
            tool={paint.tool}
            onPickTool={paint.setTool}
            drawingCount={paint.drawings.length}
            onClearAll={() => void paint.clearAll()}
          />
        </>
      )}

      {menu ? (
        <ChartOrderMenu
          menu={menu}
          // The ladders are the practice engine's; on a real wallet the menu
          // offers plain orders only rather than a row that would refuse.
          smartOrders={trading.wallet?.kind === "paper"}
          onClose={() => setMenu(null)}
          onPick={(side) => {
            setQuick({ side, px: menu.price, x: menu.x, y: menu.y })
            setMenu(null)
          }}
          onPickSmart={() => {
            setSmart({ px: menu.price, x: menu.x, y: menu.y })
            setMenu(null)
          }}
        />
      ) : null}
      {quick && market ? (
        <ChartQuickOrder
          quick={quick}
          market={market}
          wallet={trading.wallet?.label ?? ""}
          // Real money asks first — the window adds a confirm step that says
          // the order back in dollars before anything is sent.
          real={trading.wallet?.kind === "live"}
          free={free}
          onClose={() => setQuick(null)}
          onPlace={(input) => trading.place({ marketKey: market.key, ...input })}
        />
      ) : null}
      <OrderEditDialog
        order={editing}
        busy={trading.busy}
        onSave={trading.editOrder}
        onClose={() => setEditing(null)}
      />
      {smart && market ? (
        <SmartOrderDialog
          state={smart}
          market={market}
          wallet={trading.wallet?.label ?? ""}
          equity={equity}
          free={free}
          interval={interval}
          busy={trading.busy}
          onPreview={setPreview}
          onClose={() => setSmart(null)}
          onPlace={(input) =>
            trading.placeLadder({ marketKey: market.key, ...input })
          }
        />
      ) : null}
      <SmartLadderExitsDialog
        ladder={exitsFor}
        position={
          exitsFor
            ? (trading.positions.find(
                (one) =>
                  one.walletId === exitsFor.walletId &&
                  one.marketKey === exitsFor.marketKey
              ) ?? null)
            : null
        }
        busy={trading.busy}
        onSave={(ladder, exits) =>
          trading.setLadderExits(ladder.walletId, ladder.id, exits)
        }
        onClose={() => setExitsFor(null)}
      />
      <ConfirmDialog
        open={cancelFor !== null}
        onOpenChange={(open) => {
          if (!open) setCancelFor(null)
        }}
        title="Stop this ladder buying deeper?"
        description={
          cancelFor
            ? `${
                cancelFor.plan.rungs.filter((rung) => rung.status === "waiting")
                  .length
              } waiting ${
                cancelFor.plan.rungs.filter((rung) => rung.status === "waiting")
                  .length === 1
                  ? "rung is"
                  : "rungs are"
              } cancelled and buy nothing. Whatever has already been bought stays, with its exits.`
            : ""
        }
        confirmLabel="Stop the ladder"
        onConfirm={() => {
          if (cancelFor) {
            void trading.cancelLadder(cancelFor.walletId, cancelFor.id)
          }
          setCancelFor(null)
        }}
      />
    </div>
  )
}
