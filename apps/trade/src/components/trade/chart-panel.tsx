import * as React from "react"
import { CandlestickChartIcon } from "lucide-react"

import {
  ChartOrderMenu,
  type ChartMenuState,
} from "@/components/trade/chart-order-menu"
import {
  ChartQuickOrder,
  type QuickOrderState,
} from "@/components/trade/chart-quick-order"
import { PaintLayer } from "@/components/trade/paint/paint-layer"
import { PaintToolbar } from "@/components/trade/paint/paint-toolbar"
import { useChartDrawings } from "@/components/trade/paint/use-drawings"
import { PanelPlaceholder } from "@/components/trade/panel-placeholder"
import { PriceChart, type ChartSurface } from "@/components/trade/price-chart"
import { TradeLinesLayer } from "@/components/trade/trade-lines-layer"
import type { PaperTrading } from "@/components/trade/use-paper-trading"
import { useRememberedChartView } from "@/components/trade/use-chart-view"
import { ErrorBanner } from "@/components/ui/error-banner"
import { getCandlesErrorMessage, loadCandles } from "@/lib/api/candles"
import {
  CANDLE_INTERVALS,
  type CandleBar,
  type CandleInterval,
  type MarketRow,
} from "@/lib/protocols/contracts"
import type { ChartView } from "@/lib/trade/chart-view"
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
  market,
  paper,
  free,
}: {
  selectedKey: string | null
  interval: CandleInterval
  /**
   * The zoom and scroll this account left the chart at, from the route's
   * loader — so the first chart drawn is already at it.
   */
  initialChartView: ChartView | null
  /** The market on screen, for the rules an order has to obey. */
  market: MarketRow | null
  /**
   * Practice trading. Always present; it is `paper.wallet` that is null when
   * no practice wallet has been picked to trade with.
   */
  paper: PaperTrading
  /** Cash free to put behind a trade, from the account's own figures. */
  free: number
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
  }

  const openMenu = (event: React.MouseEvent) => {
    // A tool in hand is drawing, not trading; the browser's own menu is the
    // honest answer when there is nothing here to offer.
    if (paint.tool || !paper.wallet || !market) return
    const surface = surfaceRef.current
    const box = plotRef.current?.getBoundingClientRect()
    if (!surface || !box) return
    const price = surface.priceAt(event.clientY - box.top)
    if (price === null || price <= 0) return
    event.preventDefault()
    setQuick(null)
    setMenu({ price, x: event.clientX, y: event.clientY })
  }

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

  const current = answer && answer.key === wanted ? answer : null

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
                  positions={paper.positions}
                  orders={paper.orders}
                  walletName={(walletId) =>
                    paper.walletNames.get(walletId) ?? "Another wallet"
                  }
                  onMoveOrder={(walletId, orderId, price) =>
                    void paper.move(walletId, orderId, price)
                  }
                  onCancelOrder={(walletId, orderId) =>
                    void paper.cancel(walletId, orderId)
                  }
                  onSetBrackets={(walletId, marketKey, brackets) =>
                    void paper.dragBrackets(walletId, marketKey, brackets)
                  }
                  onSurface={readSurface}
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
          onClose={() => setMenu(null)}
          onPick={(side) => {
            setQuick({ side, px: menu.price, x: menu.x, y: menu.y })
            setMenu(null)
          }}
        />
      ) : null}
      {quick && market ? (
        <ChartQuickOrder
          quick={quick}
          market={market}
          wallet={paper.wallet?.label ?? ""}
          free={free}
          busy={paper.busy}
          onClose={() => setQuick(null)}
          onPlace={(input) =>
            paper.place({ marketKey: market.key, ...input })
          }
        />
      ) : null}
    </div>
  )
}
