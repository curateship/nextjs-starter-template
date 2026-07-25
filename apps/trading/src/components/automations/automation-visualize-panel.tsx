import * as React from "react"
import { WorkflowIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  PriceChart,
  type ChartCandle,
  type ChartMarker,
  type ChartPriceLine,
} from "@/components/chart/price-chart"
import {
  CHART_DOWN_COLOR,
  CHART_UP_COLOR,
} from "@/components/chart/chart-markers"
import { buildBotFillMarkers } from "@/components/bots/bot-chart-overlays"
import type { BacktestTuneDrag } from "@/components/backtest/backtest-run-chart"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AUTOMATION_INTERVAL_MS,
  type AutomationGraph,
  type AutomationNode,
} from "@/lib/automations/automation"
import { simulateAutomation } from "@/lib/automations/live-sim"
import { nodeTuneUpdate } from "@/lib/automations/node-registry"
import { qflDeviations } from "@/lib/automations/qfl"
import { useMarketRows } from "@/lib/hl/hooks"
import { qflBase } from "@/lib/strategies/indicators"
import type { AutomationInterval } from "@/lib/strategies/kinds/contract"
import type { ProtectionSettings } from "@/lib/strategies/settings"
import type { AutomationConfig } from "@/lib/strategies/strategy-config"
import {
  effectiveStopPx,
  nextTrailState,
  type TrailState,
} from "@/lib/strategies/trailing-stop"
import type { IndicatorConfig } from "@/lib/trading/indicators-config"
import { usePersistedState } from "@/lib/use-persisted-state"

/** Visualize always uses real market data; testnet books are too sparse. */
const VISUALIZE_NETWORK = "mainnet" as const

const QFL_LEVEL_COLOR = "#f59e0b"
const ENTRY_GUIDE_COLOR = "#64748b"

type QflNode = Extract<AutomationNode, { kind: "qfl" }>

/** Per-node current QFL base level (last confirmed base over these candles). */
function qflBaseByNode(
  candles: ChartCandle[],
  nodes: QflNode[]
): Map<string, number> {
  const bases = new Map<string, number>()
  if (candles.length === 0) return bases
  const lows = candles.map((candle) => ({ l: Number(candle.l) }))
  for (const node of nodes) {
    const { line } = qflBase(lows, node.basePeriods, node.pumpPeriods)
    for (let i = line.length - 1; i >= 0; i -= 1) {
      if (Number.isFinite(line[i])) {
        bases.set(node.id, line[i])
        break
      }
    }
  }
  return bases
}

/**
 * The stop price in force right now for an open sim position — a trailing stop
 * ratchets, so fold the trade's bars to rebuild the extreme, then read the
 * shared stop math (the exact level the engine would enforce).
 */
function currentStopPx(
  settings: ProtectionSettings,
  position: { szi: number; entryPx: number },
  entryTime: number,
  candles: ChartCandle[]
): number | null {
  let trail: TrailState | null = null
  for (const candle of candles) {
    if (Number(candle.t) < entryTime) continue
    const extreme = position.szi > 0 ? Number(candle.h) : Number(candle.l)
    trail = nextTrailState(trail, position, extreme)
  }
  return effectiveStopPx(settings, position, trail)
}

/**
 * The node update a dropped visualize line maps to, or null when the drop
 * changes nothing (unknown line, missing anchor, or non-positive price). The
 * per-node clamp/rounding lives on each node's `applyTuneDrag` in the registry;
 * this just decodes the line id and picks the reference price. Visualize lines
 * anchor off the last close, which is always a long entry, so side is "long".
 */
export function nodeAfterLineDrag(
  nodes: AutomationNode[],
  lineId: string,
  price: number,
  anchor: number | null,
  qflBases: Map<string, number>
): AutomationNode | null {
  const [, kind, nodeId] = lineId.split(":")
  const node = nodes.find((candidate) => candidate.id === nodeId)
  if (!node) return null
  if (kind === "tp" || kind === "sl") {
    return nodeTuneUpdate(node, kind, price, anchor ?? 0, "long")
  }
  if (kind === "qfl-crack") {
    return nodeTuneUpdate(node, "crack", price, qflBases.get(node.id) ?? 0, "long")
  }
  return null
}

/**
 * The node update a dropped backtest tune-line maps to (dragging the recorded
 * Stop/TP/first-ladder line on the replay chart), or null when it changes
 * nothing. Decodes the drag into a target + reference price and lets the owning
 * node's `applyTuneDrag` do the clamp/rounding; side-aware, since the anchor is
 * the replayed position's real entry. First matching node in the graph wins.
 */
export function nodeAfterTuneDrag(
  nodes: AutomationNode[],
  change: BacktestTuneDrag
): AutomationNode | null {
  const [target, ref, side] =
    change.kind === "crack"
      ? (["crack", change.base, "long"] as const)
      : ([change.kind, change.anchor, change.side] as const)
  for (const node of nodes) {
    const updated = nodeTuneUpdate(node, target, change.price, ref, side)
    if (updated) return updated
  }
  return null
}

/**
 * Chart mode for the Automation editor: live candles for a picked market with
 * the compiled automation's indicator paint, plus draggable dashed lines for
 * the settings that map to a price level — Take Profit, Stop Loss, and the
 * QFL first-buy crack. Dragging a line rewrites the node's setting exactly as
 * typing it in the inspector would.
 */
export function AutomationVisualizePanel({
  graph,
  config,
  interval,
  onNodeChange,
  onExit,
}: {
  graph: AutomationGraph
  /** Compiled config, or null while the graph has validation issues. */
  config: AutomationConfig | null
  interval: AutomationInterval
  onNodeChange: (node: AutomationNode) => void
  /** Switches the editor back to the node canvas. */
  onExit: () => void
}) {
  const [coin, setCoin] = usePersistedState<string>(
    "automation-visualize-market",
    "BTC",
    // Stored values are user-editable localStorage: accept only a plausible
    // market name, else fall back to the default.
    (raw) => {
      const parsed: unknown = JSON.parse(raw)
      return typeof parsed === "string" && parsed.length > 0 && parsed.length <= 40
        ? parsed
        : "BTC"
    }
  )
  const marketRows = useMarketRows(VISUALIZE_NETWORK)
  const [candles, setCandles] = React.useState<ChartCandle[]>([])

  const markets = React.useMemo(() => {
    const rows = [...(marketRows ?? [])]
    rows.sort((a, b) => Number(b.dayNtlVlm) - Number(a.dayNtlVlm))
    const names = rows.map((row) => row.coin)
    // The saved pick stays selectable even while the catalog loads.
    return names.includes(coin) ? names : [coin, ...names]
  }, [marketRows, coin])

  // Anchor lines to the last CLOSED candle so they don't wobble every tick;
  // the forming candle only matters once it closes.
  const anchor = React.useMemo(() => {
    if (candles.length === 0) return null
    const closed = candles[candles.length - 2] ?? candles[candles.length - 1]
    const close = Number(closed.c)
    return Number.isFinite(close) && close > 0 ? close : null
  }, [candles])

  const qflNodes = React.useMemo(
    () => graph.nodes.filter((node): node is QflNode => node.kind === "qfl"),
    [graph.nodes]
  )
  const qflBases = React.useMemo(
    () => qflBaseByNode(candles, qflNodes),
    [candles, qflNodes]
  )

  // The automation, run as a paper bot over the candles in view. It re-runs
  // only when a candle CLOSES (or the market/interval/config change), never on
  // every streaming tick of the forming bar — a full replay per tick is waste.
  const candlesRef = React.useRef(candles)
  candlesRef.current = candles
  const closedCount = candles.length
  const lastClosedTime =
    candles.length >= 2 ? Number(candles[candles.length - 2].t) : 0
  const sim = React.useMemo(() => {
    if (!config) return null
    const source = candlesRef.current.map((candle) => ({
      t: Number(candle.t),
      o: Number(candle.o),
      h: Number(candle.h),
      l: Number(candle.l),
      c: Number(candle.c),
      v: Number(candle.v),
    }))
    return simulateAutomation({ config, candles: source, market: coin, interval })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, coin, interval, closedCount, lastClosedTime])

  // Every buy and sell the sim made across the window, as the same green/red/
  // yellow O/C/F chips the deployed bot paints — one chip PER fill, so each DCA
  // ladder rung shows as its own buy (not one blended entry).
  const markers = React.useMemo<ChartMarker[]>(() => {
    if (!sim) return []
    const fills = sim.fills.map((fill, index) => ({
      id: String(index),
      market: coin,
      side: fill.side,
      px: String(fill.px),
      sz: String(fill.sz),
      notional: String(fill.px * fill.sz),
      fee: String(fill.fee),
      closed_pnl: String(fill.closedPnl),
      fill_time: new Date(fill.t).toISOString(),
    }))
    return buildBotFillMarkers(fills, AUTOMATION_INTERVAL_MS[interval])
  }, [sim, coin, interval])
  const open = sim?.openPosition ?? null

  // The base drawn the way the trade chart draws it: a short horizontal dash at
  // each confirmed base (not a connected line, which ramps between bases). The
  // shared paint path only does this for the old QFL node, so feed the DCA base
  // overlay explicitly with the same params the engine's base tracker uses.
  const baseIndicators = React.useMemo<IndicatorConfig[]>(() => {
    if (!config?.dca) return []
    return [
      {
        id: "viz:dca-base",
        type: "base",
        enabled: true,
        params: {
          basePeriods: config.dca.basePeriods,
          pumpPeriods: config.dca.pumpPeriods,
        },
      },
    ]
  }, [config])

  const priceLines = React.useMemo<ChartPriceLine[]>(() => {
    const lines: ChartPriceLine[] = []

    if (open && config) {
      // The sim is holding a position: show its real, live levels off the
      // blended average entry (a trailing stop ratchets with price).
      const long = open.side === "long"
      const settings = long ? config.protection.long : config.protection.short
      const position = {
        szi: long ? Math.abs(open.szi) : -Math.abs(open.szi),
        entryPx: open.entryPx,
      }
      lines.push({
        id: "viz:pos-entry",
        price: open.entryPx,
        color: ENTRY_GUIDE_COLOR,
        title: "Avg entry",
        lineStyle: "solid",
        lineWidth: 1,
      })
      if (settings?.takeProfitPct) {
        lines.push({
          id: "viz:pos-tp",
          price:
            open.entryPx * (1 + ((long ? 1 : -1) * settings.takeProfitPct) / 100),
          color: CHART_UP_COLOR,
          title: `TP +${settings.takeProfitPct}%`,
          lineStyle: "dashed",
        })
      }
      const stop = settings
        ? currentStopPx(settings, position, open.entryTime, candles)
        : null
      if (stop !== null) {
        lines.push({
          id: "viz:pos-sl",
          price: stop,
          color: CHART_DOWN_COLOR,
          title: settings?.stopLossMode === "trailing" ? "Trailing stop" : "Stop",
          lineStyle: "dashed",
        })
      }
    } else if (anchor !== null) {
      // Flat: preview the protective levels from the latest close, draggable so
      // dropping one rewrites the node's setting (planning while out of a trade).
      const protective = graph.nodes.filter(
        (node) => node.kind === "takeProfit" || node.kind === "stopLoss"
      )
      if (protective.length > 0) {
        lines.push({
          id: "viz:entry",
          price: anchor,
          color: ENTRY_GUIDE_COLOR,
          title: "Entry (now)",
          lineStyle: "dashed",
          lineWidth: 1,
        })
      }
      for (const node of protective) {
        if (node.kind === "takeProfit") {
          lines.push({
            id: `viz:tp:${node.id}`,
            price: anchor * (1 + node.pct / 100),
            color: CHART_UP_COLOR,
            title: `TP +${node.pct}%`,
            lineStyle: "dashed",
            draggable: true,
          })
        } else if (node.kind === "stopLoss") {
          lines.push({
            id: `viz:sl:${node.id}`,
            price: anchor * (1 - node.pct / 100),
            color: CHART_DOWN_COLOR,
            title: `${node.mode === "trailing" ? "Trail SL" : "SL"} -${node.pct}%`,
            lineStyle: "dashed",
            draggable: true,
          })
        }
      }
    }

    for (const node of qflNodes) {
      const base = qflBases.get(node.id)
      if (base === undefined) continue
      if (config === null) {
        // Compiled paint normally draws the base's history; while the graph
        // has issues, at least mark the current base level.
        lines.push({
          id: `viz:qfl-base:${node.id}`,
          price: base,
          color: QFL_LEVEL_COLOR,
          title: "QFL base",
          lineStyle: "solid",
          lineWidth: 1,
        })
      }
      const deviations = qflDeviations(node)
      deviations.forEach((deviation, index) => {
        lines.push({
          id: index === 0 ? `viz:qfl-crack:${node.id}` : `viz:qfl-${index}:${node.id}`,
          price: base * (1 - deviation / 100),
          color: QFL_LEVEL_COLOR,
          title:
            index === 0
              ? `QFL buy 1 -${node.crackPct}%`
              : `QFL buy ${index + 1}`,
          lineStyle: "dashed",
          lineWidth: 1,
          draggable: index === 0,
          axisLabelVisible: index === 0,
        })
      })
    }

    // The DCA buy ladder is drawn as MOVING overlay lines (baseOverlays), not
    // static price lines, since each buy is a set percent below the base that
    // was active then — a fixed line would misrepresent every past buy.

    return lines
  }, [open, anchor, graph.nodes, qflNodes, qflBases, config, candles])

  const handleLineDragEnd = React.useCallback(
    (id: string, price: number) => {
      const next = nodeAfterLineDrag(graph.nodes, id, price, anchor, qflBases)
      if (next) onNodeChange(next)
    },
    [anchor, graph.nodes, onNodeChange, qflBases]
  )

  const draggableCount = priceLines.filter((line) => line.draggable).length

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex h-12 shrink-0 flex-wrap items-center gap-2 border-b px-2 sm:px-3">
        <Label htmlFor="visualize-market" className="text-xs text-muted-foreground">
          Market
        </Label>
        <Select value={coin} onValueChange={setCoin}>
          <SelectTrigger id="visualize-market" className="h-8 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {markets.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="hidden text-xs text-muted-foreground lg:inline">
          {draggableCount > 0
            ? "Drag a dashed line to adjust that node's setting."
            : "Add a Take Profit, Stop Loss, or QFL node to get draggable levels."}
        </span>
        {config === null ? (
          <span className="text-xs text-amber-600 dark:text-amber-500">
            Fix the automation's issues to see its indicator paint.
          </span>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto h-8"
          onClick={onExit}
        >
          <WorkflowIcon className="size-3.5" />
          Canvas
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <PriceChart
          network={VISUALIZE_NETWORK}
          coin={coin}
          interval={interval}
          automationConfig={config}
          indicators={baseIndicators}
          markers={markers}
          priceLines={priceLines}
          onLineDragEnd={handleLineDragEnd}
          onCandlesChange={setCandles}
        />
      </div>
    </div>
  )
}
