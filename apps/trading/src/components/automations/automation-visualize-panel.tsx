import * as React from "react"
import { WorkflowIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  PriceChart,
  type ChartCandle,
  type ChartPriceLine,
} from "@/components/chart/price-chart"
import {
  CHART_DOWN_COLOR,
  CHART_UP_COLOR,
} from "@/components/chart/chart-markers"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  AutomationGraph,
  AutomationNode,
} from "@/lib/automations/automation"
import { qflDeviations } from "@/lib/automations/qfl"
import { useMarketRows } from "@/lib/hl/hooks"
import { qflBase } from "@/lib/strategies/indicators"
import type { AutomationInterval } from "@/lib/strategies/kinds/contract"
import type { AutomationConfig } from "@/lib/strategies/strategy-config"
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

function roundPct(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100))
}

/**
 * The node update a dropped visualize line maps to, or null when the drop
 * changes nothing (unknown line, missing anchor, or non-positive price).
 * Percentages clamp to each setting's schema bounds and round to 2 decimals.
 */
export function nodeAfterLineDrag(
  nodes: AutomationNode[],
  lineId: string,
  price: number,
  anchor: number | null,
  qflBases: Map<string, number>
): AutomationNode | null {
  if (!(price > 0)) return null
  const [, kind, nodeId] = lineId.split(":")
  const node = nodes.find((candidate) => candidate.id === nodeId)
  if (!node) return null
  if (kind === "tp" && node.kind === "takeProfit" && anchor) {
    return { ...node, pct: roundPct(((price - anchor) / anchor) * 100, 0.1, 1000) }
  }
  if (kind === "sl" && node.kind === "stopLoss" && anchor) {
    return { ...node, pct: roundPct(((anchor - price) / anchor) * 100, 0.1, 95) }
  }
  if (kind === "qfl-crack" && node.kind === "qfl") {
    const base = qflBases.get(node.id)
    if (!base) return null
    return {
      ...node,
      crackPct: roundPct(((base - price) / base) * 100, 0.1, 50),
    }
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

  const priceLines = React.useMemo<ChartPriceLine[]>(() => {
    if (anchor === null) return []
    const lines: ChartPriceLine[] = []
    const protective = graph.nodes.filter(
      (node) => node.kind === "takeProfit" || node.kind === "stopLoss"
    )
    if (protective.length > 0) {
      // TP/SL are % from entry; "entry" here is the latest close, marked so
      // the anchor of the dashed levels is never a mystery.
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
    return lines
  }, [anchor, graph.nodes, qflNodes, qflBases, config])

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
          priceLines={priceLines}
          onLineDragEnd={handleLineDragEnd}
          onCandlesChange={setCandles}
        />
      </div>
    </div>
  )
}
