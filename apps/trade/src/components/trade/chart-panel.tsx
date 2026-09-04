import * as React from "react"
import { CandlestickChartIcon, ChevronDownIcon, StarIcon } from "lucide-react"
import { toast } from "sonner"

import {
  ChartOrderMenu,
  type ChartMenuState,
} from "@/components/trade/chart-order-menu"
import {
  ChartArrowMenu,
  type ChartArrowMenuState,
} from "@/components/trade/chart-arrow-menu"
import {
  ChartQuickOrder,
  type QuickOrderState,
} from "@/components/trade/chart-quick-order"
import {
  ChartTakeProfit,
  type ChartTakeProfitState,
} from "@/components/trade/chart-take-profit"
import { IndicatorLayer } from "@/components/trade/indicator-layer"
import { MeasureLayer } from "@/components/trade/measure-layer"
import { OrderEditWindow } from "@/components/trade/order-edit-window"
import { PaintLayer } from "@/components/trade/paint/paint-layer"
import { PaintToolbar } from "@/components/trade/paint/paint-toolbar"
import { useChartDrawings } from "@/components/trade/paint/use-drawings"
import { PanelPlaceholder } from "@/components/trade/panel-placeholder"
import { PriceChart, type ChartSurface } from "@/components/trade/price-chart"
import { prefetchChartEngine } from "@/components/trade/chart-engine"
import { GridLayer } from "@/components/trade/grid-layer"
import type {
  GridOrderState,
  GridPreview,
} from "@/components/trade/grid-order-dialog"
import { GridSettingsWindow } from "@/components/trade/grid-settings-window"
import { LazyOrderWindowFallback } from "@/components/trade/lazy-window-fallback"
import { orderWindowBeside } from "@/components/trade/order-window-form"
import { SmartLadderLayer } from "@/components/trade/smart-ladder-layer"
import type {
  DcaPreview,
  SmartOrderState,
} from "@/components/trade/smart-order-dialog"
import { JournalMarksLayer } from "@/components/trade/journal-marks-layer"
import { TradeLinesLayer } from "@/components/trade/trade-lines-layer"
import { useLongPress } from "@/components/trade/use-long-press"
import type { Trading } from "@/components/trade/use-trading"
import { UnmetRulesPanel } from "@/components/trade/unmet-rules-panel"
import {
  lastOrderAt,
  rememberLastOrder,
} from "@/components/trade/use-trading-rules"
import { useRememberedChartView } from "@/components/trade/use-chart-view"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ErrorBanner } from "@/components/ui/error-banner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  getCandlesErrorMessage,
  loadCandles,
  loadOlderCandlesFor,
} from "@/lib/api/trade/candles"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { intervalMs, stitchCandles } from "@/lib/trade/chart-history"
import { saveQuickOrderPrefs } from "@/lib/api/trade/quick-order"
import {
  CANDLE_INTERVALS,
  parseMarketKey,
  type CandleBar,
  type CandleInterval,
  type MarketRow,
} from "@/lib/protocols/contracts"
import { formatPrice, formatUsd } from "@/lib/trade/format"
import type { ChartOptions } from "@/lib/trade/chart-options"
import type { ChartToolbarPosition } from "@/lib/trade/panel-layout"
import type { ChartColors } from "@/lib/trade/chart-theme"
import {
  DEFAULT_MARGIN_BOTTOM,
  DEFAULT_MARGIN_TOP,
  type ChartView,
} from "@/lib/trade/chart-view"
import {
  entrySide,
  gridStopLegPrices,
  holdsEntry,
  isGridStopLeg,
  plannedGridReversal,
  type GridRangeMove,
} from "@/lib/trade/grid"
import { prefetchLadderBase } from "@/lib/trade/ladder-base-cache"
import { prefetchSmartPrefs } from "@/lib/trade/smart-prefs-cache"
import {
  forEachPlanOrderId,
  type SmartGrid,
  type SmartLadder,
} from "@/lib/trade/smart-plan"
import {
  gridHoldingFees,
  type LiveTrade,
  type RemovableTradeHistory,
} from "@/lib/trade/live-trades"
import { positionFees } from "@/lib/trade/position-fees"
import { CHART_INTERVAL_FAVORITES_STORAGE_KEY } from "@/lib/trade/chart-interval"
import { floorSize } from "@/lib/trade/dca"
import { TAKER_FEE_RATE } from "@/lib/trade/paper"
import { resizeForStop } from "@/lib/trade/risk-size"
import type { QuickOrderPrefs } from "@/lib/trade/quick-order"
import {
  loadRecentOrderTypes,
  saveRecentOrderTypes,
  withRecentOrderType,
  type RecentOrderType,
} from "@/lib/trade/recent-order-types"
import type { Drawing } from "@/lib/trade/drawings"
import type { TradeOrder, TradePosition, TradeSide } from "@/lib/trade/paper"
import {
  anyTradingRuleOn,
  checkTradingRules,
  type TradingRules,
  type UnmetRule,
} from "@/lib/trade/trading-rules"
import type { PriceAlert } from "@/lib/trade/price-alerts"
import { bracketsWithStopAt } from "@/lib/trade/bracket-shortcuts"
import {
  indicatorPaint,
  type IndicatorSettings,
} from "@/lib/trade/indicators/registry"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  liveMarkOf,
  useLiveCatchUp,
  watchLiveCandle,
} from "@/lib/trade/live-market"

const CANDLE_LOAD_SETTLE_MS = 250
const ORB_SOURCE_INTERVAL: CandleInterval = "15m"
const NO_PRICE_ALERTS: readonly PriceAlert[] = []
const IGNORE_PRICE_ALERT = () => {}

const GridOrderDialog = React.lazy(() =>
  import("@/components/trade/grid-order-dialog").then((module) => ({
    default: module.GridOrderDialog,
  }))
)
const SmartOrderDialog = React.lazy(() =>
  import("@/components/trade/smart-order-dialog").then((module) => ({
    default: module.SmartOrderDialog,
  }))
)
const SmartLadderSettingsWindow = React.lazy(() =>
  import("@/components/trade/smart-ladder-settings-window").then((module) => ({
    default: module.SmartLadderSettingsWindow,
  }))
)

if (typeof window !== "undefined") prefetchChartEngine()

/**
 * The last charts this browser drew, so a revisit paints instantly.
 *
 * Clicking back to a market you were just on used to pay the full price
 * every time — the deliberate settle delay, a server round trip, and the
 * loading shimmer in between — for bars that were on screen seconds ago.
 * Now the remembered bars paint at once and the fresh answer replaces them
 * when it lands. The live feed keeps the forming bar moving either way, so
 * the hand-off is invisible.
 */
const drawnCharts = new Map<string, CandleBar[]>()

const DRAWN_CHARTS_KEPT = 40

/**
 * Charts whose older rows are already drawn behind the venue's slice. A
 * refresh on a bar close then asks the venue again and leaves the store
 * alone: the older rows cannot have changed, and the refresh job keeps the
 * store itself current.
 */
const olderRowsDrawn = new Set<string>()

function rememberDrawnChart(key: string, candles: CandleBar[]) {
  drawnCharts.delete(key)
  drawnCharts.set(key, candles)
  if (drawnCharts.size > DRAWN_CHARTS_KEPT) {
    const oldest = drawnCharts.keys().next().value
    if (oldest !== undefined) {
      drawnCharts.delete(oldest)
      olderRowsDrawn.delete(oldest)
    }
  }
}

function readFavoriteIntervals(): CandleInterval[] {
  try {
    const stored = window.localStorage.getItem(
      CHART_INTERVAL_FAVORITES_STORAGE_KEY
    )
    if (stored === null) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    const saved = new Set(parsed)
    return CANDLE_INTERVALS.filter((option) => saved.has(option))
  } catch {
    return []
  }
}

/**
 * The timeframe shortcuts and dropdown. The workspace owns the current choice
 * and hands it to both this picker and the chart's fetch, so the two can never
 * disagree. This browser keeps the starred shortcuts beside that choice.
 */
export function IntervalPicker({
  value,
  onChange,
}: {
  value: CandleInterval
  onChange: (next: CandleInterval) => void
}) {
  const [favoriteIntervals, setFavoriteIntervals] = React.useState<
    CandleInterval[]
  >([])

  useEffectBeforePaint(() => {
    setFavoriteIntervals(readFavoriteIntervals())
  }, [])

  const headerIntervals = CANDLE_INTERVALS.filter(
    (option) => option === value || favoriteIntervals.includes(option)
  )

  function toggleFavorite(option: CandleInterval) {
    const next = favoriteIntervals.includes(option)
      ? favoriteIntervals.filter((favorite) => favorite !== option)
      : CANDLE_INTERVALS.filter(
          (candidate) =>
            candidate === option || favoriteIntervals.includes(candidate)
        )
    try {
      window.localStorage.setItem(
        CHART_INTERVAL_FAVORITES_STORAGE_KEY,
        JSON.stringify(next)
      )
      setFavoriteIntervals(next)
    } catch {
      showErrorToast(
        "Trade could not remember that favorite timeframe. Check this browser's storage and try again."
      )
    }
  }

  const menu = (
    <DropdownMenuContent align="end">
      {CANDLE_INTERVALS.map((option) => {
        const favorite = favoriteIntervals.includes(option)
        return (
          <div key={option} className="flex items-center gap-0.5">
            <DropdownMenuCheckboxItem
              checked={option === value}
              className="min-w-0 flex-1"
              onCheckedChange={(checked) => {
                if (checked) onChange(option)
              }}
            >
              {option}
            </DropdownMenuCheckboxItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuItem
                  aria-label={`${favorite ? "Remove" : "Add"} ${option} ${favorite ? "from" : "to"} favorite timeframes`}
                  className="size-7 shrink-0 justify-center p-0"
                  onSelect={(event) => {
                    event.preventDefault()
                    toggleFavorite(option)
                  }}
                >
                  <StarIcon
                    className={
                      favorite
                        ? "fill-current text-amber-500 dark:text-amber-400"
                        : ""
                    }
                  />
                </DropdownMenuItem>
              </TooltipTrigger>
              <TooltipContent>
                {favorite ? "Remove from favorites" : "Add to favorites"}
              </TooltipContent>
            </Tooltip>
          </div>
        )
      })}
    </DropdownMenuContent>
  )

  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as CandleInterval)}
      className="gap-0"
    >
      <div className="inline-flex h-8 w-fit items-center rounded-lg bg-muted/60 p-0.5 text-muted-foreground">
        <TabsList
          aria-label="Candle intervals"
          className="h-7 rounded-none bg-transparent p-0"
        >
          {headerIntervals.map((option) => (
            <TabsTrigger
              key={option}
              value={option}
              aria-label={`Show ${option} candles`}
              className={option === value ? "px-2" : "hidden md:inline-flex"}
            >
              {option}
            </TabsTrigger>
          ))}
        </TabsList>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Candle interval"
                  className="rounded-md"
                >
                  <ChevronDownIcon className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Choose timeframe</TooltipContent>
          </Tooltip>
          {menu}
        </DropdownMenu>
      </div>
    </Tabs>
  )
}

/**
 * First-paint bars carried by the route's opening answer. `pending: true`
 * means the exchange half of that answer is still streaming in: the slice it
 * names is on its way, so the panel waits for it instead of asking the
 * server a second time for the same candles.
 */
type InitialChart = {
  key: string
  interval: CandleInterval
  candles: CandleBar[]
  error: string | null
  pending: boolean
} | null

/**
 * Where a chart's older bars came from, for the header line.
 *
 * `source` is the printed name of the history source when bars older than
 * the venue's own are on screen, and null when the whole chart is the
 * venue's. `failed` means the store could not be filled; the venue's bars
 * stay drawn and `retry` asks again.
 */
export type OlderBarsStatus = {
  /** The market-and-interval this is about, so a stale report is ignored. */
  key: string
  source: string | null
  volumeNote: string | null
  /**
   * One sentence naming whose history is drawn, on a venue that has to say
   * so. Null on every venue whose own candles these are, so their charts
   * read exactly as they always did.
   */
  borrowedNote: string | null
  failed: boolean
  retry: () => void
}

/**
 * The middle of the middle panel: the picked market's price history.
 *
 * This panel owns the fetching and the honest states; `PriceChart` under it
 * only ever sees candles. Data arrives per market-and-interval, and a stale
 * answer — one that lands after another market was picked — is dropped on the
 * floor rather than drawn over the wrong chart.
 */
/**
 * An entry held back by the person's own trading rules, until the warning
 * window is answered. `send` places it with the overridden rule names for
 * the Journal; `goBack` sends nothing and puts the order window back.
 */
type PendingEntry = {
  /** The action and the size, "Short $500": the title and, with "anyway", the button. */
  action: string
  unmet: UnmetRule[]
  send: (overrode: string[]) => void
  goBack: () => void
}

export function ChartPanel({
  selectedKey,
  interval,
  initialChartView,
  initialChart,
  chartToolbarPosition,
  onChartToolbarPositionChange,
  initialDrawings,
  onDrawingAlertChange,
  lineAlertsPaused = false,
  onExtendPreference,
  onBufferPreference,
  selectDrawing = null,
  onDrawingSelected,
  initialQuickOrder,
  priceAlerts = NO_PRICE_ALERTS,
  onCreatePriceAlert = IGNORE_PRICE_ALERT,
  onMovePriceAlert = IGNORE_PRICE_ALERT,
  onDeletePriceAlert = IGNORE_PRICE_ALERT,
  recentOrderScope = null,
  options,
  tradingRules,
  indicators,
  market,
  trading,
  free,
  equity,
  equityOfWallet,
  shownTrade,
  onClearShownTrade = () => {},
  addTo,
  onAddOpened,
  onOlderBars,
  cornerControl,
}: {
  selectedKey: string | null
  interval: CandleInterval
  /**
   * The zoom and scroll this account left the chart at, from the route's
   * loader — so the first chart drawn is already at it.
   */
  initialChartView: ChartView | null
  /** First-paint bars that arrived with the route's opening answer. */
  initialChart: InitialChart
  /** The drawing rail position restored with the current workspace layout. */
  chartToolbarPosition?: ChartToolbarPosition | null
  /** Saves the drawing rail into the current and selected named layout. */
  onChartToolbarPositionChange?: (position: ChartToolbarPosition | null) => void
  /** Saved lines for the remembered market, from that same answer. */
  initialDrawings: {
    marketKey: string | null
    rows: Drawing[]
    error: string | null
  }
  /** Told after a drawn line's alert is switched on or off and saved. */
  onDrawingAlertChange?: () => void
  /** The master switch in Settings is off, which the line's window says. */
  lineAlertsPaused?: boolean
  /** The Continuous line switch was flipped: remember it for the next line. */
  onExtendPreference?: (on: boolean) => void
  /** A break buffer saved on one line: remember it for the next line. */
  onBufferPreference?: (buffer: number | null) => void
  /**
   * A line to pick out once its market's drawings have arrived, from a row in
   * the Alerts panel. Answered with `onDrawingSelected` once done.
   */
  selectDrawing?: { marketKey: string; id: string } | null
  onDrawingSelected?: () => void
  /**
   * How the right-click order window was last set up, from the same loader.
   * The window opens on a click, so anything read after it is on screen would
   * arrive too late to be any use to somebody already typing.
   */
  initialQuickOrder: QuickOrderPrefs
  /** One shared list behind the chart and the left-side Alerts panel. */
  priceAlerts?: readonly PriceAlert[]
  onCreatePriceAlert?: (input: {
    marketKey: string
    price: number
    currentPrice: number
  }) => void
  onMovePriceAlert?: (input: {
    id: string
    price: number
    currentPrice: number
  }) => void
  onDeletePriceAlert?: (id: string) => void
  /** The signed-in account used to keep this browser's recent kinds separate. */
  recentOrderScope?: string | null
  /** Which supporting parts of the chart are visible. */
  options: ChartOptions
  /**
   * The person's own rules, checked before a real-money entry leaves. An
   * unmet rule opens one warning window; it never stops the trade.
   */
  tradingRules: TradingRules
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
  /** The account value for a placed ladder that belongs to another wallet. */
  equityOfWallet?: (walletId: string) => number | null
  /**
   * The finished trade picked in the Journal, drawn over the candles. Null
   * whenever nothing is picked, and ignored when it belongs to another market.
   */
  shownTrade: LiveTrade | null
  /** Clears the Journal selection when its trade is removed from an arrow. */
  onClearShownTrade?: () => void
  /**
   * A position whose row asked to buy more of it.
   *
   * The workspace holds it back until the chart and the traded wallet are both
   * that row's, so by the time it arrives here there is nothing left to check:
   * the order window opens over today's price, on this market, for this
   * wallet. Null the rest of the time.
   */
  addTo: TradePosition | null
  /** Taken; the workspace lets go of the request so it cannot fire twice. */
  onAddOpened: () => void
  /** Where the older bars came from, for the header line beside the timeframe. */
  onOlderBars?: (status: OlderBarsStatus) => void
  /** A chart action pinned inside the plot, immediately left of the price axis. */
  cornerControl?: React.ReactNode
}) {
  const wide = useWideScreen()
  // Only ever written from the fetch's callbacks. "Loading" is not stored:
  // an answer whose key does not match what is wanted right now IS the
  // loading state, so it cannot drift out of step with reality.
  const [answer, setAnswer] = React.useState<{
    /** Which market-and-interval these candles belong to. */
    key: string
    candles: CandleBar[]
    error: string | null
  } | null>(() => {
    const wanted = selectedKey ? `${selectedKey}@${interval}` : null
    // A pending marker carries no bars yet; null here is the loading state
    // the panel shows until the streamed slice lands.
    return wanted && initialChart?.key === wanted && !initialChart.pending
      ? {
          key: wanted,
          candles: initialChart.candles,
          error: initialChart.error,
        }
      : null
  })
  // Bumped by the retry button; the fetch effect depends on it.
  const [attempt, setAttempt] = React.useState(0)
  const [olderBars, setOlderBars] = React.useState<OlderBarsStatus | null>(null)
  const [orbAnswer, setOrbAnswer] = React.useState<{
    key: string
    candles: CandleBar[]
    error: string | null
  } | null>(null)
  const [orbAttempt, setOrbAttempt] = React.useState(0)
  const hasStartedCandleLoad = React.useRef(false)
  const handledInitialChart = React.useRef(false)
  // Whether the state initialiser above already put the carried bars on
  // screen. False when the opening slice streams in after the first render —
  // the fetch effect then draws it, which the initialiser can never redo.
  const adoptedAtMount = React.useRef(
    selectedKey !== null &&
      initialChart?.key === `${selectedKey}@${interval}` &&
      initialChart?.pending === false
  )

  const wanted = selectedKey ? `${selectedKey}@${interval}` : null
  const needsOrbSource =
    indicators.orb?.on === true &&
    intervalMs(interval) > intervalMs(ORB_SOURCE_INTERVAL)
  const orbWanted =
    selectedKey && needsOrbSource
      ? `${selectedKey}@${ORB_SOURCE_INTERVAL}`
      : null

  // The working bar, streamed — but not through this component. The chart
  // subscribes with this and applies each tick to its last candle itself.
  // Holding the bar in state here re-rendered this whole panel, and every
  // layer drawn over the chart, on every tick of the price.
  const liveBars = React.useCallback(
    (onBar: (bar: CandleBar) => void) =>
      watchLiveCandle(selectedKey, interval, onBar),
    [selectedKey, interval]
  )

  // The feed came back after a gap: the working bar alone cannot patch a
  // hole in history, so the snapshot is refetched.
  useLiveCatchUp(() => {
    setAttempt((count) => count + 1)
    if (needsOrbSource) setOrbAttempt((count) => count + 1)
  })

  // The lines drawn on this market. They belong to the market, not to the
  // timeframe, so switching between 4h and 1d leaves them where they are.
  const paint = useChartDrawings(
    selectedKey,
    initialDrawings,
    onDrawingAlertChange,
    options.lineAlertBuffer,
    onBufferPreference
  )
  const setPaintTool = paint.setTool
  const setSelectedDrawing = paint.setSelectedId

  // A row in the Alerts panel names a line on another market. The market is
  // opened first, and the line is picked out here once its drawings have
  // actually arrived, rather than the moment the market was asked for.
  const paintDrawings = paint.drawings
  React.useEffect(() => {
    if (!selectDrawing || selectDrawing.marketKey !== selectedKey) return
    if (!paintDrawings.some((drawing) => drawing.id === selectDrawing.id))
      return
    setSelectedDrawing(selectDrawing.id)
    onDrawingSelected?.()
  }, [
    selectDrawing,
    selectedKey,
    paintDrawings,
    setSelectedDrawing,
    onDrawingSelected,
  ])
  const clearPaintDrawings = paint.clearAll
  const paintTool = options.drawings ? paint.tool : null

  // The line's window opening reads this market's lines again, and the
  // account's line alerts with them, so a fire the engine wrote and the
  // master switch in Settings are both current the moment the window shows.
  const refreshPaint = paint.refresh
  const onAlertOpen = React.useCallback(() => {
    refreshPaint()
    onDrawingAlertChange?.()
  }, [refreshPaint, onDrawingAlertChange])

  // Hiding drawings also puts down the active tool and lets go of the picked
  // line. The drawings themselves stay loaded and saved, ready to be shown
  // again in the same positions.
  React.useEffect(() => {
    if (options.drawings) return
    setPaintTool(null)
    setSelectedDrawing(null)
  }, [options.drawings, setPaintTool, setSelectedDrawing])

  // The zoom and scroll, which belong to neither: one view, carried onto
  // whatever market and timeframe you open next.
  const chartView = useRememberedChartView(initialChartView)

  // How the order window is set up, held here rather than inside the window —
  // the window is thrown away and rebuilt on every right-click, so it has
  // nowhere to keep anything. Written down as well, best-effort: a failed
  // write only loses the memory, and a toast about it would interrupt somebody
  // who has just placed an order and is watching for it to land.
  const [quickPrefs, setQuickPrefs] = React.useState(initialQuickOrder)
  const rememberQuickOrder = React.useCallback((next: QuickOrderPrefs) => {
    setQuickPrefs(next)
    saveQuickOrderPrefs(next).catch(() => {})
  }, [])
  const [recentOrderTypes, setRecentOrderTypes] = React.useState(() =>
    recentOrderScope ? loadRecentOrderTypes(recentOrderScope) : []
  )
  const recentOrderTypesRef = React.useRef(recentOrderTypes)
  const rememberRecentOrderType = React.useCallback(
    (orderType: RecentOrderType) => {
      const next = withRecentOrderType(recentOrderTypesRef.current, orderType)
      recentOrderTypesRef.current = next
      setRecentOrderTypes(next)
      if (recentOrderScope) saveRecentOrderTypes(recentOrderScope, next)
    },
    [recentOrderScope]
  )

  // Right-clicking the chart: the menu that opens under the pointer, and the
  // order window one of its rows opens at the same spot.
  const [menu, setMenu] = React.useState<ChartMenuState | null>(null)
  const [quick, setQuick] = React.useState<QuickOrderState | null>(null)
  // Take profit from the same menu opens a small chart window because that
  // exit may sell only part of a position. Stop loss saves at once.
  const [takeProfit, setTakeProfit] =
    React.useState<ChartTakeProfitState | null>(null)
  // The DCA window, its live preview lines, and the settings window of a placed
  // ladder — the smart-order half of the same right-click.
  const [smart, setSmart] = React.useState<SmartOrderState | null>(null)
  const [preview, setPreview] = React.useState<DcaPreview | null>(null)
  const [ladderSettingsFor, setLadderSettingsFor] =
    React.useState<SmartLadder | null>(null)
  const [ladderSettingsAnchor, setLadderSettingsAnchor] =
    React.useState<Element | null>(null)
  // The grid's half of the same right-click: its window, its preview lines,
  // and the two things a placed grid can be asked to do.
  const [grid, setGrid] = React.useState<GridOrderState | null>(null)
  const [gridPreview, setGridPreview] = React.useState<GridPreview | null>(null)
  const [settingsFor, setSettingsFor] = React.useState<SmartGrid | null>(null)
  const [settingsAnchor, setSettingsAnchor] =
    React.useState<HTMLElement | null>(null)
  // An entry that broke one of the person's own trading rules and is waiting
  // for "anyway" or "Go back" in the warning window. Real money only.
  const [pendingEntry, setPendingEntry] = React.useState<PendingEntry | null>(
    null
  )
  // When this coin was opened on this page — the clock behind the "time on
  // this chart" rule. Written from an effect keyed on the coin, so it restarts
  // on every change of coin and on a reload, and a render never reads a clock.
  const chartOpenedAtRef = React.useRef(0)
  React.useEffect(() => {
    chartOpenedAtRef.current = Date.now()
  }, [selectedKey])
  // The position whose × on the Entry line was pressed. Closing costs real
  // money, so it asks first — the same question the Positions table asks.
  const [closingPosition, setClosingPosition] =
    React.useState<TradePosition | null>(null)
  const [arrowMenu, setArrowMenu] = React.useState<
    (ChartArrowMenuState & { history: RemovableTradeHistory }) | null
  >(null)
  const [reverseGridFor, setReverseGridFor] = React.useState<SmartGrid | null>(
    null
  )
  const [cancelGridFor, setCancelGridFor] = React.useState<SmartGrid | null>(
    null
  )
  // A ladder that has started asks before its remaining buys are called off.
  // An empty ladder can go at once because it holds nothing.
  const [cancelFor, setCancelFor] = React.useState<SmartLadder | null>(null)
  // The waiting order and chart cog that opened its settings window.
  const [editing, setEditing] = React.useState<TradeOrder | null>(null)
  const [editingAnchor, setEditingAnchor] = React.useState<Element | null>(null)
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
    setPendingEntry(null)
    setMenu(null)
    setArrowMenu(null)
    setQuick(null)
    setTakeProfit(null)
    setSmart(null)
    setPreview(null)
    setLadderSettingsFor(null)
    setLadderSettingsAnchor(null)
    setGrid(null)
    setGridPreview(null)
    setSettingsFor(null)
    setSettingsAnchor(null)
    setCancelFor(null)
    setEditing(null)
    setEditingAnchor(null)
  }

  /**
   * The newest order this browser can see on this coin and wallet — the seed
   * for the "time since the last order" rule after a reload, when the memory
   * in `rememberLastOrder` is empty. Fills, the trades made of fills, resting
   * orders and watched levels all count; the newest wins.
   */
  const seenLastOrderAt = React.useMemo(() => {
    const walletId = trading.wallet?.id
    if (!market || !walletId) return null
    let newest: number | null = null
    const see = (at: number) => {
      if (newest === null || at > newest) newest = at
    }
    for (const trade of trading.trades) {
      if (trade.walletId === walletId && trade.marketKey === market.key)
        see(trade.closedAt)
    }
    for (const fill of trading.fills) {
      if (fill.walletId === walletId && fill.marketKey === market.key)
        see(fill.at)
    }
    for (const order of [...trading.orders, ...trading.watchOrders]) {
      if (order.walletId === walletId && order.marketKey === market.key)
        see(order.createdAt)
    }
    return newest
  }, [
    market,
    trading.wallet?.id,
    trading.trades,
    trading.fills,
    trading.orders,
    trading.watchOrders,
  ])

  // Real money with at least one rule on — the only time an entry is checked.
  const rulesApply =
    trading.wallet?.kind === "live" && anyTradingRuleOn(tradingRules)

  /**
   * Which of the person's own rules an entry would break right now. Read
   * straight off what is on screen: the lines drawn on this coin, the live
   * price, how long the coin has been open, and the last order on it.
   */
  const unmetRulesFor = React.useCallback(
    (about: { side: TradeSide }): UnmetRule[] => {
      if (!rulesApply || !market) return []
      const now = Date.now()
      return checkTradingRules({
        rules: tradingRules,
        side: about.side,
        drawings: paint.drawings,
        price: liveMarkOf(market.key) ?? market.price,
        onChartForMs: now - chartOpenedAtRef.current,
        lastOrderAt: lastOrderAt(market.key, seenLastOrderAt),
        now,
      })
    },
    [rulesApply, market, tradingRules, paint.drawings, seenLastOrderAt]
  )
  // What the order windows show above their button, or null when nothing
  // here is checked, which also stops their once-a-second re-read.
  const warnBeforeEntry = rulesApply ? unmetRulesFor : null

  /**
   * The position the open order window is adding to, resolved against the live
   * list on every render rather than held as a copy.
   *
   * A position that closes while its window is open — its own stop firing, say
   * — takes the window with it. Leaving it up would mean a window headed
   * "Adding to $500 long" over nothing, whose leverage line and whose whole
   * reason for being open had stopped being true.
   */
  const addingTo =
    quick?.addingToId === undefined
      ? null
      : (trading.positions.find((one) => one.id === quick.addingToId) ?? null)
  // The position it was adding to has closed under it — see `addingTo`.
  // Adjusted during the render that fact arrives in, the way the market switch
  // above drops a stale window, so no frame shows a window headed "Adding to
  // $500 long" over a position that is gone.
  if (quick?.addingToId !== undefined && addingTo === null) {
    setQuick(null)
  }

  /**
   * Opening the order window from a position's row.
   *
   * Which market and which wallet was all settled before `addTo` arrived, so
   * the only thing left is where today's price sits on screen. `yOf` is the
   * exact inverse of the `priceAt` a right-click uses, measured off the same
   * box, so the window lands on the price line rather than near it. A chart
   * whose scale is not drawn yet puts it in the middle rather than refusing to
   * open at all.
   *
   * **An effect, not a render-time adjustment**, and the two lines that read
   * the chart's laid-out box are why: a box and a price scale can only be
   * measured after the browser has laid the chart out, which is the one thing a
   * render is not allowed to look at. Everything else about this window is
   * decided during the render, right above.
   */
  React.useEffect(() => {
    if (!addTo || !market) return
    onAddOpened()
    const px = liveMarkOf(market.key) ?? market.price
    const box = plotRef.current?.getBoundingClientRect()
    const y = surfaceRef.current?.yOf(px) ?? null
    /* eslint-disable react-hooks/set-state-in-effect -- the window's place on
       screen is measured off the laid-out chart, which a render may not read. */
    setMenu(null)
    setQuick({
      side: addTo.szi > 0 ? "buy" : "sell",
      px,
      x: box ? box.left + box.width / 2 : window.innerWidth / 2,
      y: (box?.top ?? 0) + (y ?? (box?.height ?? window.innerHeight) / 2),
      addingToId: addTo.id,
    })
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [addTo, market, onAddOpened])

  const openMenu = (point: { clientX: number; clientY: number }) => {
    // A tool in hand is drawing, not trading. Right-click puts it down in the
    // handler below, and a touch long-press has no order menu to offer.
    if (paintTool || !market) return false
    const surface = surfaceRef.current
    const box = plotRef.current?.getBoundingClientRect()
    if (!surface || !box) return false
    const price = surface.priceAt(point.clientY - box.top)
    if (price === null || price <= 0) return false
    // Asked for the moment the menu opens, so by the time a preset is picked
    // the base the ladder hangs from and both windows' saved settings are
    // usually already in hand.
    if (trading.wallet) {
      prefetchLadderBase(market.key)
      prefetchSmartPrefs()
    }
    setQuick(null)
    setSmart(null)
    setMenu({ price, x: point.clientX, y: point.clientY })
    return true
  }
  const longPress = useLongPress(openMenu)

  // The orders a smart order is running — a ladder's rungs and sells, a grid's
  // levels and sells — are drawn by their own layer with their own labels and
  // rules, so the plain order lines must not draw them a second time (or offer
  // to drag them).
  //
  // Walked through `forEachPlanOrderId` rather than reaching into the rungs
  // here, so a kind that is added later cannot be left out of this set by
  // accident. It was: the grid's levels were drawn twice, a green label from
  // the grid layer sitting on top of a grey one from the plain order lines,
  // and the doubled pills read as some second thing at the same price.
  const smartOrderIds = React.useMemo(() => {
    const ids = new Set<string>()
    for (const order of trading.smartOrders) {
      forEachPlanOrderId(order.kind, order.plan, (orderId) => {
        ids.add(orderId)
      })
    }
    return ids
  }, [trading.smartOrders])
  // A grid draws its own STOP LOSS line and drags it, so the plain bracket
  // line must not draw a second one at the same price — that is a red pill
  // behind a red pill, and it reads as some other thing at the same level.
  //
  // Only the stop. A grid never writes a take profit onto the position, so one
  // that is there was put there by hand and still belongs to the plain lines.
  const gridStops = React.useMemo(
    () =>
      new Set(trading.grids.map((one) => `${one.walletId}:${one.marketKey}`)),
    [trading.grids]
  )
  // Where the exchange's own copy of each grid's stop is resting, so the plain
  // order lines can drop it. See `gridStopLegPrices`.
  const gridStopPrices = React.useMemo(
    () => gridStopLegPrices(trading.grids, trading.positions),
    [trading.grids, trading.positions]
  )
  const linePositions = React.useMemo(
    () =>
      trading.positions.map((one) =>
        gridStops.has(`${one.walletId}:${one.marketKey}`)
          ? { ...one, slPx: null }
          : one
      ),
    [trading.positions, gridStops]
  )
  // The position the menu's "Take profit" row would add a target to. Keep the
  // shortcut until all three places are used. The active wallet's comes first,
  // so when two wallets both hold the coin the row acts on the one being traded.
  const targetablePosition = React.useMemo(() => {
    const held = trading.positions.filter(
      (one) => one.marketKey === selectedKey && one.targets.length < 3
    )
    return (
      held.find((one) => one.walletId === trading.wallet?.id) ?? held[0] ?? null
    )
  }, [trading.positions, trading.wallet?.id, selectedKey])
  const bareStop = React.useMemo(() => {
    const held = trading.positions.filter(
      (one) => one.marketKey === selectedKey && one.slPx === null
    )
    return (
      held.find((one) => one.walletId === trading.wallet?.id) ?? held[0] ?? null
    )
  }, [trading.positions, trading.wallet?.id, selectedKey])
  // A manual watched order has no position yet, but it still needs the same
  // right-click shortcut while it waits. Keep the choice unambiguous: prefer
  // the active wallet and offer the row only when one stopless order matches.
  const bareWatchedStop = React.useMemo(() => {
    const waiting = trading.watchOrders.filter(
      (one) =>
        one.walletId === trading.wallet?.id &&
        one.marketKey === selectedKey &&
        !one.reduceOnly &&
        one.slPx === null
    )
    return waiting.length === 1 ? waiting[0] : null
  }, [trading.watchOrders, trading.wallet?.id, selectedKey])
  const takeProfitPosition = takeProfit
    ? (trading.positions.find((one) => one.id === takeProfit.positionId) ??
      null)
    : null
  const positionStopShortcut =
    menu &&
    bareStop &&
    (bareStop.szi > 0
      ? menu.price < bareStop.entryPx
      : menu.price > bareStop.entryPx)
      ? () => {
          // Draw the position stop from local state now. The wallet save and
          // account refresh continue behind it, through the drag path.
          void trading.dragBrackets(
            bareStop,
            bracketsWithStopAt(bareStop, menu.price)
          )
          setMenu(null)
        }
      : null
  const watchedStopShortcut =
    menu &&
    bareWatchedStop &&
    (bareWatchedStop.side === "buy"
      ? menu.price < bareWatchedStop.px
      : menu.price > bareWatchedStop.px)
      ? () => {
          void trading.editOrder(bareWatchedStop.walletId, bareWatchedStop.id, {
            sz: bareWatchedStop.sz,
            leverage: bareWatchedStop.leverage,
            tpPx: bareWatchedStop.tpPx,
            slPx: menu.price,
          })
          setMenu(null)
        }
      : null
  // The newly placed waiting order is the chart action this shortcut belongs
  // to, so it wins when a position also shares this losing-side price. Its own
  // line still identifies the exact watch when more than one is waiting.
  const stopLossShortcut = watchedStopShortcut ?? positionStopShortcut

  const looseOrders = React.useMemo(
    () => [
      // The grid's own STOP LOSS line is the only one drawn at that price. The
      // exchange's untriggered leg behind it is dropped, the same way every
      // other order type's protection leg already is — see `isGridStopLeg`.
      ...trading.orders.filter(
        (order) =>
          !smartOrderIds.has(order.id) && !isGridStopLeg(order, gridStopPrices)
      ),
      // A watched price, drawn as the order it stands in for.
      //
      // It is the same thing to whoever set it — a level, a size, and where it
      // gets out — and the difference, that nothing is on the exchange until
      // the price is touched, is not something a line on a chart can show. The
      // × cancels it and the settings pill opens it, exactly as they do for an
      // order, because both go through the same smart-order path underneath.
      // Watched prices, from the one shared list — see `watchOrders` on the
      // hook. Built there so this chart and the Open orders tab can never
      // disagree about what exists.
      ...trading.watchOrders,
      // Orders asked for whose answer has not landed yet, so a press shows on
      // the chart at once instead of a second or two later.
      ...trading.placing,
    ],
    [
      trading.orders,
      trading.placing,
      trading.watchOrders,
      smartOrderIds,
      gridStopPrices,
    ]
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
    ? (trading.orders.find((one) => one.id === editing.id) ??
      trading.watchOrders.find((one) => one.id === editing.id) ??
      null)
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
  // Every handler the overlay layers receive is pinned with `useCallback`,
  // because the layers are memoized: a keystroke in an order window re-renders
  // this panel, and handlers minted fresh each render would drag all seven
  // layers through a re-render for a change none of them can see.
  const tradingDragBrackets = trading.dragBrackets
  const tradingLadders = trading.ladders
  const dragBrackets = React.useCallback(
    (
      position: TradePosition,
      brackets: {
        targets: Array<{ px: number; sz: number | null }>
        slPx: number | null
      }
    ) => {
      const { walletId, marketKey } = position
      const ladder = tradingLadders.find(
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
          (tpFollowed &&
            !same(brackets.targets[0]?.px ?? null, ladder.plan.aimedTpPx)) ||
          (slFollowed && !same(brackets.slPx, ladder.plan.aimedSlPx))
        ) {
          toast.info(
            "That line is yours now — it no longer follows the ladder's rule."
          )
        }
      }
      void tradingDragBrackets(position, brackets)
    },
    [tradingLadders, tradingDragBrackets]
  )

  const walletNameOf = React.useCallback(
    (walletId: string) => trading.walletNames.get(walletId) ?? "Another wallet",
    [trading.walletNames]
  )
  const tradingMove = trading.move
  const onMoveOrder = React.useCallback(
    (walletId: string, orderId: string, price: number) =>
      void tradingMove(walletId, orderId, price),
    [tradingMove]
  )
  const tradingCancel = trading.cancel
  const onCancelOrder = React.useCallback(
    (order: TradeOrder) => void tradingCancel(order),
    [tradingCancel]
  )
  const tradingEditOrder = trading.editOrder
  const tradingOrders = trading.orders
  const tradingWatchOrders = trading.watchOrders
  const onMoveOrderTarget = React.useCallback(
    (walletId: string, orderId: string, price: number) => {
      const order =
        tradingOrders.find((one) => one.id === orderId) ??
        tradingWatchOrders.find((one) => one.id === orderId)
      if (!order) return
      void tradingEditOrder(walletId, orderId, {
        sz: order.sz,
        leverage: order.leverage,
        tpPx: price,
        slPx: order.slPx,
      })
    },
    [tradingOrders, tradingWatchOrders, tradingEditOrder]
  )
  const sizeDecimals = market?.sizeDecimals ?? null
  const onMoveOrderStop = React.useCallback(
    (walletId: string, orderId: string, price: number) => {
      const order =
        tradingOrders.find((one) => one.id === orderId) ??
        tradingWatchOrders.find((one) => one.id === orderId)
      if (!order || order.slPx === null) return
      void tradingEditOrder(walletId, orderId, {
        // Floored to the market's own step, never rounded up: rounding up
        // buys more than the risk asked for.
        sz: floorSize(
          resizeForStop({
            entryPx: order.px,
            fromStopPx: order.slPx,
            toStopPx: price,
            sz: order.sz,
          }),
          sizeDecimals
        ),
        leverage: order.leverage,
        tpPx: order.tpPx,
        slPx: price,
      })
    },
    [tradingOrders, tradingWatchOrders, tradingEditOrder, sizeDecimals]
  )
  const onEditOrder = React.useCallback(
    (orderId: string, anchor: Element) => {
      const order =
        tradingOrders.find((one) => one.id === orderId) ??
        tradingWatchOrders.find((one) => one.id === orderId) ??
        null
      setEditing(order)
      setEditingAnchor(order ? anchor : null)
    },
    [tradingOrders, tradingWatchOrders]
  )
  const tradingCancelLadder = trading.cancelLadder
  const onCancelLadder = React.useCallback(
    (ladder: SmartLadder) => {
      const hasBought = ladder.plan.rungs.some(
        (rung) => rung.status === "filled" || rung.status === "sold"
      )
      if (!hasBought) {
        void tradingCancelLadder(ladder.walletId, ladder.id)
        return
      }
      setCancelFor(ladder)
    },
    [tradingCancelLadder]
  )
  const entryBadgeOf = React.useCallback(
    (position: TradePosition) => {
      const ladder = tradingLadders.find(
        (one) =>
          one.walletId === position.walletId &&
          one.marketKey === position.marketKey &&
          one.plan.rungs.some(
            (rung) => rung.status === "filled" || rung.status === "sold"
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
        } still waiting to buy. The gear changes its settings; the × stops it buying deeper.`,
        onSettings: (anchor: Element) => {
          setLadderSettingsFor(ladder)
          setLadderSettingsAnchor(anchor)
        },
        onRemove: waiting > 0 ? () => onCancelLadder(ladder) : null,
      }
    },
    [tradingLadders, onCancelLadder]
  )
  const tradingCancelRung = trading.cancelRung
  const onCancelRung = React.useCallback(
    (walletId: string, ladderId: string, rungIndex: number) =>
      void tradingCancelRung(walletId, ladderId, rungIndex),
    [tradingCancelRung]
  )
  const tradingReshapeLadder = trading.reshapeLadder
  const onReshapeLadder = React.useCallback(
    (
      ladder: SmartLadder,
      shape:
        | { anchorPx: number }
        | { deepestPx: number }
        | { exitIndex: number; exitPx: number }
    ) => tradingReshapeLadder(ladder.walletId, ladder.id, shape),
    [tradingReshapeLadder]
  )
  const tradingCancelGridLevel = trading.cancelGridLevel
  const onCancelGridLevel = React.useCallback(
    (walletId: string, gridId: string, levelIndex: number) =>
      void tradingCancelGridLevel(walletId, gridId, levelIndex),
    [tradingCancelGridLevel]
  )
  const tradingMoveGridRange = trading.moveGridRange
  const onMoveGridRange = React.useCallback(
    (one: SmartGrid, move: GridRangeMove) =>
      tradingMoveGridRange(one.walletId, one.id, move),
    [tradingMoveGridRange]
  )
  const tradingMoveGridExit = trading.moveGridExit
  const onMoveGridExit = React.useCallback(
    (one: SmartGrid, which: "takeProfit" | "stopLoss", px: number) =>
      tradingMoveGridExit(one.walletId, one.id, which, px),
    [tradingMoveGridExit]
  )

  // The candles on screen right now: an answer whose tag does not match what
  // is wanted belongs to a market that was switched away from, and is not one.
  //
  // A chart this browser has already drawn stands in until the fresh answer
  // lands — same render as the click, no shimmer, no settle wait. The live
  // feed keeps the forming bar moving either way, so the hand-off from
  // remembered bars to fresh ones is invisible.
  const current = React.useMemo(() => {
    if (answer && answer.key === wanted) return answer
    const remembered = wanted ? drawnCharts.get(wanted) : undefined
    return remembered
      ? { key: wanted as string, candles: remembered, error: null }
      : null
  }, [answer, wanted])

  const orbCurrent = React.useMemo(() => {
    if (!orbWanted) return null
    if (orbAnswer?.key === orbWanted) return orbAnswer
    const remembered = drawnCharts.get(orbWanted)
    return remembered
      ? { key: orbWanted, candles: remembered, error: null }
      : null
  }, [orbAnswer, orbWanted])

  // The Journal's trade, but only while its own market is the one on screen.
  // A trade drawn over another coin's candles would be nonsense.
  const focusTrade =
    shownTrade && shownTrade.marketKey === selectedKey ? shownTrade : null
  const marketTrades = React.useMemo(
    () => trading.trades.filter((trade) => trade.marketKey === selectedKey),
    [trading.trades, selectedKey]
  )
  const marketFills = React.useMemo(
    () => trading.fills.filter((fill) => fill.marketKey === selectedKey),
    [trading.fills, selectedKey]
  )
  const positionFeeTotals = React.useMemo(
    () =>
      new Map(
        trading.positions.map((position) => {
          if (!position.live) return [position.id, position.feesPaid] as const
          const fees = positionFees(trading.fills, position)
          return [position.id, fees?.whole ? fees.paid : null] as const
        })
      ),
    [trading.fills, trading.positions]
  )
  const feesPaidForPosition = React.useCallback(
    (position: TradePosition): number | null =>
      positionFeeTotals.get(position.id) ?? null,
    [positionFeeTotals]
  )
  const gridFeeTotals = React.useMemo(
    () =>
      new Map(
        trading.grids.map(
          (grid) => [grid.id, gridHoldingFees(trading.fills, grid)] as const
        )
      ),
    [trading.fills, trading.grids]
  )
  const feesPaidForGrid = React.useCallback(
    (grid: SmartGrid): number | null => gridFeeTotals.get(grid.id) ?? null,
    [gridFeeTotals]
  )

  /**
   * Where to put the chart, with a picked trade taken into account.
   *
   * The chart frames itself once per `viewKey`, asking this at that moment —
   * so putting the trade's id in the key is what makes picking a row move the
   * chart, without `price-chart.tsx` learning what a trade is. Nothing is
   * remembered from it either: `chartView.readView` still owns the zoom
   * somebody set by hand, and this only borrows its up-and-down squash.
   */
  const readViewForChart = React.useCallback(() => {
    const remembered = chartView.readView()
    const candles = current?.candles ?? []
    if (!focusTrade || candles.length < 2) return remembered

    const entry = barIndexAt(candles, focusTrade.openedAt)
    const exit = barIndexAt(candles, focusTrade.closedAt)
    const span = Math.max(1, exit - entry)
    // Three times as wide as the trade, so what led up to it is on screen too,
    // and never so tight that a one-candle trade fills the whole width.
    const bars = Math.min(Math.max(span * 3, 40), 1_000)
    // The trade sits a little left of centre, leaving room for what came after.
    const to = Math.round(exit + bars * 0.3)
    return {
      bars,
      gap: candles.length - 1 - to,
      marginTop: remembered?.marginTop ?? DEFAULT_MARGIN_TOP,
      marginBottom: remembered?.marginBottom ?? DEFAULT_MARGIN_BOTTOM,
    }
  }, [chartView, current?.candles, focusTrade])

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
    () =>
      indicatorPaint(
        indicators,
        current?.candles ?? [],
        {
          zone: options.zone,
          interval,
        },
        orbCurrent
          ? {
              orb: {
                candles: orbCurrent.candles,
                interval: ORB_SOURCE_INTERVAL,
              },
            }
          : undefined
      ),
    [indicators, current?.candles, options.zone, interval, orbCurrent]
  )

  React.useEffect(() => {
    if (!selectedKey || !orbWanted) return
    let stale = false
    const timeout = setTimeout(() => {
      loadCandles(selectedKey, ORB_SOURCE_INTERVAL)
        .then(({ candles }) => {
          if (stale) return
          rememberDrawnChart(orbWanted, candles)
          setOrbAnswer({ key: orbWanted, candles, error: null })
        })
        .catch((error: unknown) => {
          if (stale) return
          setOrbAnswer({
            key: orbWanted,
            candles: drawnCharts.get(orbWanted) ?? [],
            error: getCandlesErrorMessage(error),
          })
        })
    }, CANDLE_LOAD_SETTLE_MS)
    return () => {
      stale = true
      clearTimeout(timeout)
    }
  }, [selectedKey, orbWanted, orbAttempt])

  // The coarse chart may not have a candle stream at all, so the supporting
  // 15m read follows the clock rather than relying on a tick to announce that
  // its newest bar has closed.
  React.useEffect(() => {
    if (!orbWanted) return
    let timer = 0
    const arm = () => {
      const barMs = intervalMs(ORB_SOURCE_INTERVAL)
      const untilClose = barMs - (Date.now() % barMs) + 2_000
      timer = window.setTimeout(() => {
        if (document.hidden) arm()
        else setOrbAttempt((count) => count + 1)
      }, untilClose)
    }
    arm()
    return () => window.clearTimeout(timer)
  }, [orbWanted, orbAttempt])

  React.useEffect(() => {
    if (!selectedKey || !wanted) return
    // Exactly this slice is still streaming in with the opening answer. Wait
    // for it instead of asking the server a second time — the marker becomes
    // the real slice as one prop change, and that re-runs this effect.
    if (
      initialChart?.pending &&
      initialChart.key === wanted &&
      attempt === 0 &&
      !handledInitialChart.current
    ) {
      return
    }
    let stale = false
    // The first chart has no earlier choice to settle, so it asks on the next
    // turn of the event loop. Later market and timeframe changes wait long
    // enough to collapse rapid clicks into one request. A request that has
    // already reached the server cannot be cancelled from here.
    const draw = (candles: CandleBar[]) => {
      if (stale) return
      rememberDrawnChart(wanted, candles)
      setAnswer({ key: wanted, candles, error: null })
    }
    const report = (status: Omit<OlderBarsStatus, "key" | "retry">) => {
      const full = {
        ...status,
        key: wanted,
        retry: () => setAttempt((count) => count + 1),
      }
      setOlderBars(full)
      onOlderBars?.(full)
    }

    /**
     * The store's rows behind the venue's slice, stitched in without a
     * flicker: the newer bars are the same bars and the chart keeps its zoom.
     *
     * A bonus, not the answer. The venue's bars are already drawn, so a
     * refusal here changes nothing on screen and must not put an error card
     * over bars that are perfectly good. The header line says the older bars
     * could not be loaded instead, with Try again.
     */
    const fillBehind = (venue: CandleBar[]) => {
      loadOlderCandlesFor(selectedKey, interval)
        .then(({ candles: older, source, partial }) => {
          if (stale) return
          // Remembered only once rows really came back, and only when the
          // fill finished. A market that had no source when it was first
          // opened, whose fill was empty, or whose source would not answer
          // is asked again on its next open: the answer is one cheap
          // request, and remembering "nothing" made META stay at 30 days
          // for the life of the tab after its source was added.
          if (older.length > 0) {
            draw(stitchCandles(older, venue))
            if (!partial) olderRowsDrawn.add(wanted)
          }
          const seam = venue[0]?.openTime ?? Number.POSITIVE_INFINITY
          const olderShown = older.some((bar) => bar.openTime < seam)
          report({
            source: source && olderShown ? source.label : null,
            volumeNote: source && olderShown ? source.volumeNote : null,
            // Said whenever the bars are borrowed, whether or not any of
            // them ended up older than the venue's own: on a venue with no
            // candles of its own, every bar on the chart is borrowed.
            borrowedNote: source?.borrowedNote ?? null,
            failed: partial,
          })
        })
        .catch(() => {
          if (!stale) {
            report({
              source: null,
              volumeNote: null,
              borrowedNote: null,
              failed: true,
            })
          }
        })
    }

    const timeout = setTimeout(
      () => {
        hasStartedCandleLoad.current = true

        if (
          !handledInitialChart.current &&
          attempt === 0 &&
          initialChart?.key === wanted &&
          !initialChart.pending
        ) {
          handledInitialChart.current = true
          // A slice that streamed in after the first render has not been
          // drawn yet — the mount-time initialiser only sees an answer the
          // document itself carried.
          if (!adoptedAtMount.current) {
            if (initialChart.error) {
              setAnswer({ key: wanted, candles: [], error: initialChart.error })
            } else {
              draw(initialChart.candles)
            }
          }
          if (!initialChart.error) fillBehind(initialChart.candles)
          return
        }

        // A refresh keeps what is already behind the venue's slice. Drawing
        // the slice alone would throw the older rows away for a bar.
        const previous = drawnCharts.get(wanted) ?? []
        loadCandles(selectedKey, interval)
          .then(({ candles }) => {
            draw(
              previous.length > 0 ? stitchCandles(previous, candles) : candles
            )
            if (stale || olderRowsDrawn.has(wanted)) return
            fillBehind(candles)
          })
          .catch((error: unknown) => {
            if (stale) return
            // Bars already on screen beat an error card about fetching newer
            // ones — the failure is a refresh that missed, not a chart that
            // could not load.
            if (drawnCharts.has(wanted)) return
            setAnswer({
              key: wanted,
              candles: [],
              error: getCandlesErrorMessage(error),
            })
          })
      },
      !handledInitialChart.current &&
        attempt === 0 &&
        initialChart?.key === wanted
        ? 0
        : hasStartedCandleLoad.current
          ? CANDLE_LOAD_SETTLE_MS
          : 0
    )
    return () => {
      stale = true
      clearTimeout(timeout)
    }
  }, [selectedKey, interval, wanted, attempt, initialChart, onOlderBars])

  // Refresh when a bar of this timeframe closes, so the chart appends it by
  // itself instead of waiting for a click. On the 1m chart that is the
  // once-a-minute somebody watching it expects; on the 4h chart it is four
  // hours of silence, because the forming bar is already painted live and
  // only a close changes history. A couple of seconds' grace lets the
  // exchange finish writing the bar, and a hidden tab skips its turn rather
  // than refreshing a chart nobody is looking at.
  React.useEffect(() => {
    if (!wanted) return
    let timer = 0
    const arm = () => {
      const barMs = intervalMs(interval)
      const untilClose = barMs - (Date.now() % barMs) + 2_000
      timer = window.setTimeout(() => {
        // A hidden tab skips the refresh but MUST re-arm itself: bumping
        // `attempt` is what usually restarts this effect, and a skipped bump
        // restarts nothing — the first version fell silent forever after one
        // minute in a background tab.
        if (document.hidden) arm()
        else setAttempt((count) => count + 1)
      }, untilClose)
    }
    arm()
    return () => window.clearTimeout(timer)
  }, [wanted, interval, attempt])

  /**
   * What is drawn over the candles, pinned with `useCallback` so the chart is
   * not handed a new function every render. The layers under it are memoized,
   * so a keystroke in an order window — which re-renders this panel through
   * its preview state — reaches only the layer whose preview changed, instead
   * of re-rendering all seven on every letter.
   */
  const currentKey = current?.key ?? ""
  /**
   * Why this grid cannot be reversed right now, or null when it can. The
   * greyed-out icon says the reason on hover, per
   * `a-greyed-out-button-says-why.md` — the server refuses these too; saying
   * it before the click beats saying it after.
   */
  const reverseDisabledReason = React.useCallback(
    (grid: SmartGrid): string | null => {
      if (grid.plan.takeProfitPx === null) {
        return "This grid has no End Grid line, and the reversal makes the new stop from it. Switch End Grid on first."
      }
      if (
        trading.ladders.some(
          (one) =>
            one.walletId === grid.walletId &&
            one.marketKey === grid.marketKey &&
            one.status === "active"
        )
      ) {
        return "A DCA ladder is working this coin, and a reversed grid would fight it."
      }
      if (trading.failed) {
        return "The last wallet read failed, so what the grid holds cannot be trusted. Wait for the next read."
      }
      return null
    },
    [trading.ladders, trading.failed]
  )

  const gridsShown = trading.grids
  const currentMarketPx = market?.price ?? null
  const openGridSettings = React.useCallback(
    (one: SmartGrid, anchor: HTMLElement) => {
      setSettingsFor(one)
      setSettingsAnchor(anchor)
    },
    []
  )
  const openLadderSettings = React.useCallback(
    (one: SmartLadder, anchor: Element) => {
      setLadderSettingsFor(one)
      setLadderSettingsAnchor(anchor)
    },
    []
  )
  const overlay = React.useCallback(
    (surface: ChartSurface, colors: ChartColors) => (
      <>
        {/* First, so everything else sits over it. An indicator is the
            chart's own reading of the candles — a drawn line, an order or a
            stop is something somebody put there, and that should never end
            up behind a dash. */}
        <IndicatorLayer surface={surface} paint={indicatorPainted} />
        {options.drawings ? (
          <PaintLayer
            surface={surface}
            candles={current?.candles ?? []}
            watchLiveBars={liveBars}
            drawings={paint.drawings}
            tool={paintTool}
            selectedId={paint.selectedId}
            onSelect={paint.setSelectedId}
            onCreate={paint.create}
            onMove={paint.move}
            onDelete={paint.remove}
            onSetAlert={paint.setAlert}
            onSetBuffer={paint.setBuffer}
            onAlertOpen={onAlertOpen}
            wide={wide}
            lineAlertsPaused={lineAlertsPaused}
            extendNewLines={options.extendTrendlines}
            onExtendPreference={onExtendPreference}
          />
        ) : null}
        <SmartLadderLayer
          orders={tradingOrders}
          surface={surface}
          colors={colors}
          marketKey={selectedKey}
          ladders={tradingLadders}
          preview={preview}
          tool={paintTool}
          walletName={walletNameOf}
          onCancelRung={onCancelRung}
          onCancelLadder={onCancelLadder}
          onOpenSettings={openLadderSettings}
          onReshapeLadder={onReshapeLadder}
        />
        <GridLayer
          surface={surface}
          colors={colors}
          marketKey={selectedKey}
          currentPx={currentMarketPx}
          grids={gridsShown}
          preview={gridPreview}
          tool={paintTool}
          walletName={walletNameOf}
          feesPaidFor={feesPaidForGrid}
          onReverseGrid={setReverseGridFor}
          reverseDisabledReason={reverseDisabledReason}
          onCancelLevel={onCancelGridLevel}
          onCancelGrid={setCancelGridFor}
          onOpenSettings={openGridSettings}
          onMoveRange={onMoveGridRange}
          onMoveExit={onMoveGridExit}
        />
        {/* Over the orders and under the ruler: a finished trade is history,
            so it must never hide a stop that is live right now, and
            Shift-dragging across it still measures. */}
        {/* AFTER the smart-order layers, so a position's pills paint over
            their chips. A grid level at the entry price used to stamp its
            money chip on top of the Entry pill's words — and the pills are
            the lines that carry the ×, the gear and the drag, so they are
            the ones a hand must always be able to find. */}
        <TradeLinesLayer
          surface={surface}
          colors={colors}
          marketKey={selectedKey}
          currentPx={currentMarketPx}
          // The grid's chips as things the pills slide around, so an Entry
          // pill at a level's own price sits BESIDE its money chip and both
          // stay readable.
          // This layer paints over the paint tools, so it has to know when
          // one is in hand and keep its hands off the pointer — otherwise
          // starting a line near a stop drags the stop.
          tool={paintTool}
          // Every wallet's, not just the active one's: a row in the table
          // below is a link to its own market, and it would be a dead end if
          // the chart then showed nothing.
          positions={linePositions}
          alerts={priceAlerts}
          feesPaidFor={feesPaidForPosition}
          onClosePosition={setClosingPosition}
          orders={looseOrders}
          walletName={walletNameOf}
          onMoveOrder={onMoveOrder}
          onMoveAlert={(id, price) => {
            if (!selectedKey || currentMarketPx === null) return
            onMovePriceAlert({
              id,
              price,
              currentPrice: liveMarkOf(selectedKey) ?? currentMarketPx,
            })
          }}
          onDeleteAlert={onDeletePriceAlert}
          onCancelOrder={onCancelOrder}
          // Dragging a waiting order's stop resizes the order so it still
          // risks the same money. Worked out from the order in front of you
          // rather than from a remembered setting, so it holds whether the
          // order was sized by risk or typed by hand.
          onMoveOrderTarget={onMoveOrderTarget}
          onMoveOrderStop={onMoveOrderStop}
          onEditOrder={onEditOrder}
          entryBadge={entryBadgeOf}
          onSetBrackets={dragBrackets}
          onSurface={readSurface}
        />
        <JournalMarksLayer
          surface={surface}
          trades={marketTrades}
          fills={marketFills}
          focusedTrade={focusTrade}
          positions={linePositions}
          showArrows={options.orderArrows}
          tradeLimit={options.orderArrowTrades}
          onOpenArrowMenu={(history, point) => {
            setMenu(null)
            setArrowMenu({ history, ...point })
          }}
        />
        {/* Last, so while Shift is held its sheet is over everything else
            and a drag across a stop line measures rather than moving the
            stop. Keyed on the market and timeframe: a reading belongs to the
            candles it was taken on, so opening another one puts the ruler
            away rather than carrying a box onto a chart it means nothing
            on. */}
        <MeasureLayer key={currentKey} surface={surface} tool={paintTool} />
        <PaintToolbar
          tool={paintTool}
          onPickTool={setPaintTool}
          drawingCount={paint.drawings.length}
          drawingsVisible={options.drawings}
          rightInset={surface.axisWidth}
          savedPosition={chartToolbarPosition}
          onPositionChange={onChartToolbarPositionChange}
          onClearAll={() => void clearPaintDrawings()}
        />
        {cornerControl ? (
          <div
            className="pointer-events-auto absolute bottom-3 z-20"
            style={{ right: surface.axisWidth + 12 }}
          >
            {cornerControl}
          </div>
        ) : null}
      </>
    ),
    [
      indicatorPainted,
      current?.candles,
      liveBars,
      options.drawings,
      options.orderArrows,
      options.orderArrowTrades,
      paint.drawings,
      paint.selectedId,
      paint.setSelectedId,
      paint.create,
      paint.move,
      paint.setAlert,
      paint.setBuffer,
      paint.remove,
      paintTool,
      onAlertOpen,
      lineAlertsPaused,
      options.extendTrendlines,
      onExtendPreference,
      wide,
      chartToolbarPosition,
      onChartToolbarPositionChange,
      cornerControl,
      setPaintTool,
      clearPaintDrawings,
      priceAlerts,
      onMovePriceAlert,
      onDeletePriceAlert,
      selectedKey,
      linePositions,
      looseOrders,
      walletNameOf,
      onMoveOrder,
      onCancelOrder,
      onMoveOrderTarget,
      onMoveOrderStop,
      onEditOrder,
      tradingOrders,
      entryBadgeOf,
      dragBrackets,
      readSurface,
      tradingLadders,
      preview,
      onCancelRung,
      onReshapeLadder,
      gridsShown,
      gridPreview,
      currentMarketPx,
      onCancelGridLevel,
      onMoveGridRange,
      onMoveGridExit,
      onCancelLadder,
      openGridSettings,
      openLadderSettings,
      reverseDisabledReason,
      feesPaidForGrid,
      feesPaidForPosition,
      marketTrades,
      marketFills,
      focusTrade,
      currentKey,
    ]
  )

  /**
   * The venue answered with nothing and the borrowed bars are still coming.
   *
   * **Saying "No candles here yet" here is a lie with a short life.** On a
   * venue that publishes no candles of its own — Solana — the venue's answer
   * is ALWAYS empty and every bar arrives from the store a moment later.
   * Drawn straight, the chart announced that the market had no history and
   * then quietly filled with years of it. Measured 4 Sep 2026: 1.5 seconds
   * of that on a warm store, and far longer the first time a coin's history
   * is fetched, which is long enough for Tyler to read it, believe it and
   * report the chart as broken.
   *
   * Derived rather than another piece of state: the older-bars request
   * reports for every market it finishes, success or failure, so "no report
   * for this market yet" is exactly "still waiting".
   */
  const waitingForBorrowedBars =
    current !== null &&
    !current.error &&
    current.candles.length === 0 &&
    olderBars?.key !== current.key

  if (!selectedKey) {
    return (
      <PanelPlaceholder
        icon={<CandlestickChartIcon className="size-4" />}
        title="The chart goes here"
      >
        Pick a market from the list and its candles draw in this space.
      </PanelPlaceholder>
    )
  }

  return (
    <div
      ref={plotRef}
      className="relative h-full min-h-0"
      {...longPress}
      onContextMenu={(event) => {
        if (paintTool) {
          event.preventDefault()
          paint.setTool(null)
          return
        }
        if (openMenu(event)) event.preventDefault()
      }}
    >
      {!current || waitingForBorrowedBars ? (
        <div
          role="status"
          aria-label="Loading candles"
          className="h-full min-h-0 w-full bg-muted/30 motion-safe:animate-pulse motion-reduce:bg-muted/20"
        />
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
        <div
          key={current.key}
          data-slot="chart-ready"
          className="relative h-full min-h-0 motion-safe:animate-in motion-safe:duration-300 motion-safe:fade-in-0"
        >
          {orbCurrent?.error ? (
            <ErrorBanner
              message="The opening range could not load the 15m candles it needs. The chart is still working. Try again in a moment."
              onRetry={() => setOrbAttempt((count) => count + 1)}
            />
          ) : null}
          {/* Dukascopy's volume is its own brokerage volume, not the stock
              market's. Said on the pane that draws it, for the bars it
              covers, rather than left for somebody to assume. */}
          {options.volume &&
          olderBars?.key === current.key &&
          olderBars.volumeNote ? (
            <span className="pointer-events-none absolute bottom-1 left-1 z-10 text-[10px] text-muted-foreground">
              {olderBars.volumeNote}
            </span>
          ) : null}
          <PriceChart
            candles={current.candles}
            options={options}
            // Market and timeframe in one — the tag these very candles were
            // fetched under. It is what tells a new chart apart from more
            // candles for the one already drawn.
            // With a trade picked, its id joins the tag: the chart frames
            // itself once per tag, so picking a row in the Journal is what
            // moves the chart to it.
            viewKey={
              focusTrade ? `${current.key}#${focusTrade.id}` : current.key
            }
            readView={readViewForChart}
            onViewChange={chartView.onViewChange}
            liveBars={liveBars}
            // The chart is handed a function and a surface, never a drawing or
            // a position. Every layer inside draws in the same coordinates and
            // none is anything the chart itself knows about.
            overlay={overlay}
          />
        </div>
      )}

      {menu ? (
        <ChartOrderMenu
          menu={menu}
          wide={wide}
          orders={trading.wallet !== null}
          smartOrders={trading.wallet !== null}
          recentOrderTypes={recentOrderTypes}
          onClose={() => setMenu(null)}
          onPick={(side) => {
            setQuick({ side, px: menu.price, x: menu.x, y: menu.y })
            setMenu(null)
          }}
          onPickSmart={(preset) => {
            const at = { px: menu.price, x: menu.x, y: menu.y }
            // One smart window at a time. Both stay open through outside
            // clicks now, so without this the two could stack and one
            // Escape would close the pair.
            if (preset === "grid") {
              setSmart(null)
              setGrid(at)
            } else {
              setGrid(null)
              setSmart(at)
            }
            setMenu(null)
          }}
          // Only when the click is on the winning side of the entry — a
          // "target" on the losing side is a stop, and the row would set one
          // at the mirrored price instead, which is worse than not offering.
          onPickTakeProfit={
            targetablePosition &&
            (targetablePosition.szi > 0
              ? menu.price > targetablePosition.entryPx
              : menu.price < targetablePosition.entryPx)
              ? () => {
                  setTakeProfit({
                    positionId: targetablePosition.id,
                    px: menu.price,
                    x: menu.x,
                    y: menu.y,
                  })
                  setMenu(null)
                }
              : null
          }
          // The losing side of the entry is the matching stop-loss shortcut.
          // A trailing stop beyond entry is still edited from the position's
          // existing stop line, where the current price can also be enforced.
          onPickStopLoss={stopLossShortcut}
          onPickAlert={() => {
            if (!market) return
            onCreatePriceAlert({
              marketKey: market.key,
              price: menu.price,
              currentPrice: liveMarkOf(market.key) ?? market.price,
            })
            setMenu(null)
          }}
        />
      ) : null}
      {quick && market ? (
        <ChartQuickOrder
          // A fresh window per opening. The size box starts empty when it is
          // adding to a position and on the remembered size when it is not, and
          // that is decided once, as it mounts.
          key={`${quick.addingToId ?? "manual"}:${quick.side}:${quick.px}`}
          quick={quick}
          wide={wide}
          market={market}
          wallet={trading.wallet?.label ?? ""}
          addingTo={addingTo}
          free={free}
          equity={equity}
          prefs={quickPrefs}
          onRemember={rememberQuickOrder}
          onClose={() => setQuick(null)}
          warnBeforeEntry={warnBeforeEntry}
          onPlace={(input) => {
            const send = (overrode?: string[]) => {
              // Checked before `place`, which draws its ghost order before
              // anything is sent — a paused entry must draw nothing.
              trading.place({ marketKey: market.key, ...input, overrode })
              rememberLastOrder(market.key)
              if (!input.market) rememberRecentOrderType(input.side)
            }
            const unmet = unmetRulesFor({ side: input.side })
            if (unmet.length === 0) {
              send()
              return
            }
            const action = input.market
              ? `Market ${input.side === "buy" ? "long" : "short"}`
              : input.side === "buy"
                ? "Long"
                : "Short"
            // The window has already shut itself. Go back reopens it on the
            // size it just remembered, with nothing sent and nothing drawn.
            const reopen = quick
            setPendingEntry({
              action: `${action} ${formatUsd(input.sz * input.px)}`,
              unmet,
              send,
              goBack: () => setQuick(reopen),
            })
          }}
        />
      ) : null}
      <OrderEditWindow
        order={editing}
        anchor={editingAnchor}
        wide={wide}
        busy={trading.busy}
        onSave={trading.editOrder}
        onClose={() => {
          setEditing(null)
          setEditingAnchor(null)
        }}
      />
      {takeProfit && takeProfitPosition ? (
        <ChartTakeProfit
          state={takeProfit}
          position={takeProfitPosition}
          wallet={
            trading.walletNames.get(takeProfitPosition.walletId) ??
            "Another wallet"
          }
          onSave={(brackets) =>
            void trading.dragBrackets(takeProfitPosition, brackets)
          }
          onClose={() => setTakeProfit(null)}
        />
      ) : null}
      {smart && market ? (
        <React.Suspense
          fallback={
            <LazyOrderWindowFallback
              state={smart}
              wide={wide}
              // The DCA window's header carries the free cash but no wallet
              // name, so the loading frame matches.
              wallet=""
              free={free}
              title="DCA order"
              onClose={() => setSmart(null)}
            />
          }
        >
          <SmartOrderDialog
            state={smart}
            wide={wide}
            market={market}
            equity={equity}
            free={free}
            interval={interval}
            busy={trading.busy}
            pairedWithGrid={trading.smartOrders.some(
              (one) =>
                one.kind === "grid" &&
                one.marketKey === market.key &&
                one.status === "active"
            )}
            onPreview={setPreview}
            onClose={() => setSmart(null)}
            warnBeforeEntry={warnBeforeEntry}
            onPlace={({ dollars, count, ...input }) => {
              const send = async (overrode?: string[]) => {
                const placed = await trading.placeLadder({
                  marketKey: market.key,
                  ...input,
                  overrode,
                })
                if (placed) {
                  rememberLastOrder(market.key)
                  rememberRecentOrderType("dca")
                }
                return placed
              }
              const unmet = unmetRulesFor({ side: "buy" })
              if (unmet.length === 0) return send()
              // The window stays open behind the question and closes itself
              // once a confirmed ladder is really placed.
              return new Promise<boolean>((resolve) => {
                setPendingEntry({
                  action: `Long ${dollars === null ? "" : `${formatUsd(dollars)} `}in ${count} ${count === 1 ? "rung" : "rungs"}`,
                  unmet,
                  send: (overrode) => void send(overrode).then(resolve),
                  goBack: () => resolve(false),
                })
              })
            }}
          />
        </React.Suspense>
      ) : null}
      {grid && market ? (
        <React.Suspense
          fallback={
            <LazyOrderWindowFallback
              state={grid}
              wide={wide}
              // The grid window's header carries the free cash but no wallet
              // name, so the loading frame matches.
              wallet=""
              free={free}
              title="Grid order"
              onClose={() => setGrid(null)}
            />
          }
        >
          <GridOrderDialog
            state={grid}
            wide={wide}
            market={market}
            equity={equity}
            free={free}
            takerFeeRate={TAKER_FEE_RATE}
            busy={trading.busy}
            pairedWithLadder={trading.smartOrders.some(
              (one) =>
                one.kind === "dca" &&
                one.walletId === trading.wallet?.id &&
                one.marketKey === market.key &&
                one.status === "active"
            )}
            pairedLeverage={
              trading.ladders.find(
                (one) =>
                  one.walletId === trading.wallet?.id &&
                  one.marketKey === market.key &&
                  one.status === "active"
              )?.plan.leverage ?? null
            }
            positionLeverage={
              trading.positions.find(
                (one) =>
                  one.walletId === trading.wallet?.id &&
                  one.marketKey === market.key &&
                  one.szi > 0
              )?.leverage ?? null
            }
            onPreview={setGridPreview}
            onClose={() => {
              setGridPreview(null)
              setGrid(null)
            }}
            warnBeforeEntry={warnBeforeEntry}
            onPlace={({ dollars, count, ...input }) => {
              const send = async (overrode?: string[]) => {
                const placed = await trading.placeGrid({
                  marketKey: market.key,
                  ...input,
                  overrode,
                })
                if (placed) {
                  // The saved grid replaces its preview before the browser can
                  // draw both copies on top of each other for one frame.
                  setGridPreview(null)
                  rememberLastOrder(market.key)
                  rememberRecentOrderType("grid")
                }
                return placed
              }
              const direction = input.params.direction
              const unmet = unmetRulesFor({ side: entrySide(direction) })
              if (unmet.length === 0) return send()
              return new Promise<boolean>((resolve) => {
                setPendingEntry({
                  action: `${direction === "long" ? "Buy" : "Short"} ${dollars === null ? "" : `${formatUsd(dollars)} `}in ${count} ${count === 1 ? "level" : "levels"}`,
                  unmet,
                  send: (overrode) => void send(overrode).then(resolve),
                  goBack: () => resolve(false),
                })
              })
            }}
          />
        </React.Suspense>
      ) : null}
      {/* The one warning window for every rule an entry breaks. Nothing has
          been sent or drawn while it is open. Go back leaves it that way;
          the other button repeats the action and the size, so what is
          confirmed is the trade and not an abstract yes. */}
      <ConfirmDialog
        open={pendingEntry !== null}
        onOpenChange={(open) => {
          if (open || !pendingEntry) return
          pendingEntry.goBack()
          setPendingEntry(null)
        }}
        title={pendingEntry ? `${pendingEntry.action}?` : ""}
        description="Nothing has been sent. Go back changes nothing."
        cancelLabel="Go back"
        confirmLabel={pendingEntry ? `${pendingEntry.action} anyway` : ""}
        destructive={false}
        onConfirm={() => {
          if (!pendingEntry) return
          const entry = pendingEntry
          setPendingEntry(null)
          entry.send(entry.unmet.map((rule) => rule.name))
        }}
      >
        {pendingEntry ? <UnmetRulesPanel rules={pendingEntry.unmet} /> : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={reverseGridFor !== null}
        onOpenChange={(open) => {
          if (!open) setReverseGridFor(null)
        }}
        title="Reverse this grid?"
        description={(() => {
          if (!reverseGridFor) return ""
          const plan = reverseGridFor.plan
          const reversal = plannedGridReversal(plan)
          if (!reversal.ok) return reversal.reason
          const held = trading.positions.find(
            (one) =>
              one.walletId === reverseGridFor.walletId &&
              one.marketKey === reverseGridFor.marketKey &&
              holdsEntry(plan.direction, one.szi)
          )
          const heldUsd =
            held && currentMarketPx !== null
              ? Math.abs(held.szi) * currentMarketPx
              : null
          const closes =
            heldUsd !== null
              ? `${plan.direction === "long" ? "Sells" : "Buys back"} about ${formatUsd(heldUsd)} at market, then places`
              : "The grid holds nothing, so this just places"
          return `${closes} a ${reversal.direction === "short" ? "selling" : "buying"} grid over the same range. Its stop goes on the old End Grid line at ${formatPrice(reversal.stopPx)}, and a new End Grid sits past the old stop. Both lines can be dragged afterwards. The new grid will not reverse again on its own.`
        })()}
        confirmLabel="Reverse the grid"
        onConfirm={() => {
          if (reverseGridFor) {
            void trading.reverseGrid(reverseGridFor.walletId, reverseGridFor.id)
          }
          setReverseGridFor(null)
        }}
      />
      <GridSettingsWindow
        grid={settingsFor}
        anchor={settingsAnchor}
        wide={wide}
        wallet={
          settingsFor
            ? (trading.walletNames.get(settingsFor.walletId) ??
              "Another wallet")
            : ""
        }
        mark={
          settingsFor && market?.key === settingsFor.marketKey
            ? market.price
            : null
        }
        busy={trading.busy}
        pairedLeverage={
          settingsFor
            ? (trading.ladders.find(
                (one) =>
                  one.walletId === settingsFor.walletId &&
                  one.marketKey === settingsFor.marketKey &&
                  one.status === "active"
              )?.plan.leverage ?? null)
            : null
        }
        positionLeverage={
          settingsFor
            ? (trading.positions.find(
                (one) =>
                  one.walletId === settingsFor.walletId &&
                  one.marketKey === settingsFor.marketKey &&
                  one.szi > 0
              )?.leverage ?? null)
            : null
        }
        onSave={(one, stopLoss, reverseWhenStopped) =>
          trading.setGridStop(
            one.walletId,
            one.id,
            stopLoss,
            reverseWhenStopped
          )
        }
        onReshape={(one, shape) =>
          trading.reshapeGrid(one.walletId, one.id, shape)
        }
        onSetEnd={(one, abovePct) =>
          trading.setGridEnd(one.walletId, one.id, abovePct)
        }
        onSetFollow={(one, following) =>
          trading.setGridFollow(one.walletId, one.id, following)
        }
        onClose={() => {
          setSettingsFor(null)
          setSettingsAnchor(null)
        }}
      />
      {arrowMenu ? (
        <ChartArrowMenu
          menu={arrowMenu}
          onClose={() => setArrowMenu(null)}
          onPick={() => {
            if (shownTrade?.id === arrowMenu.history.id) onClearShownTrade()
            void trading.hideTrades([arrowMenu.history])
            setArrowMenu(null)
          }}
        />
      ) : null}
      <ConfirmDialog
        open={closingPosition !== null}
        onOpenChange={(open) => {
          if (!open) setClosingPosition(null)
        }}
        title="Close this position?"
        description={
          closingPosition
            ? `${parseMarketKey(closingPosition.marketKey)?.marketId ?? "This position"} is closed at whatever the market pays right now, and whatever it has made or lost is settled. Its stop and target go with it.`
            : ""
        }
        confirmLabel="Close it"
        onConfirm={() => {
          if (closingPosition) {
            void trading.close(closingPosition)
          }
          setClosingPosition(null)
        }}
      />
      <ConfirmDialog
        open={cancelGridFor !== null}
        onOpenChange={(open) => {
          if (!open) setCancelGridFor(null)
        }}
        title="Stop this grid buying?"
        description={
          cancelGridFor
            ? `${
                cancelGridFor.plan.levels.filter(
                  (level) => level.status === "waiting"
                ).length
              } waiting ${
                cancelGridFor.plan.levels.filter(
                  (level) => level.status === "waiting"
                ).length === 1
                  ? "level is"
                  : "levels are"
              } cancelled and buy nothing — they do not come back. Whatever the grid is holding stays, and its sells keep working.`
            : ""
        }
        confirmLabel="Stop the grid"
        onConfirm={() => {
          if (cancelGridFor) {
            void trading.cancelGrid(cancelGridFor.walletId, cancelGridFor.id)
          }
          setCancelGridFor(null)
        }}
      />
      {ladderSettingsFor ? (
        <React.Suspense
          fallback={
            <LazyOrderWindowFallback
              state={orderWindowBeside(ladderSettingsAnchor)}
              wide={wide}
              wallet={
                trading.walletNames.get(ladderSettingsFor.walletId) ??
                "Another wallet"
              }
              title="DCA ladder settings"
              onClose={() => {
                setLadderSettingsFor(null)
                setLadderSettingsAnchor(null)
              }}
            />
          }
        >
          <SmartLadderSettingsWindow
            ladder={ladderSettingsFor}
            anchor={ladderSettingsAnchor}
            wide={wide}
            wallet={
              trading.walletNames.get(ladderSettingsFor.walletId) ??
              "Another wallet"
            }
            equity={
              equityOfWallet
                ? equityOfWallet(ladderSettingsFor.walletId)
                : equity
            }
            market={market}
            interval={interval}
            position={
              trading.positions.find(
                (one) =>
                  one.walletId === ladderSettingsFor.walletId &&
                  one.marketKey === ladderSettingsFor.marketKey
              ) ?? null
            }
            busy={trading.busy}
            onSaveExits={(ladder, exits) =>
              trading.setLadderExits(ladder.walletId, ladder.id, exits)
            }
            onReshape={(ladder, change) =>
              trading.reshapeLadder(ladder.walletId, ladder.id, change)
            }
            onClose={() => {
              setLadderSettingsFor(null)
              setLadderSettingsAnchor(null)
            }}
          />
        </React.Suspense>
      ) : null}
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

/**
 * Which candle a moment falls in: the last bar that had opened by then.
 *
 * A binary search rather than a scan, because the chart holds thousands of
 * bars and this is asked every time the chart is framed. A time before the
 * first bar answers 0 — the trade is older than the history on screen, and the
 * left edge is the closest true thing that can be said.
 */
function barIndexAt(candles: readonly CandleBar[], at: number): number {
  let low = 0
  let high = candles.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (candles[middle].openTime <= at) low = middle
    else high = middle - 1
  }
  return low
}
