import type {
  AutomationConfig,
  AutomationNode,
  AutomationSourcePort,
} from "@/lib/automations/automation"
import type { IndicatorConfig } from "@/lib/trading/indicators-config"
import {
  DEFAULT_DCA_MAX_POSITION_PCT,
  DEFAULT_DCA_RUNGS,
  DEFAULT_DCA_SIZE_MULTIPLIER,
} from "@/lib/automations/dca"
import {
  DEFAULT_MARKET_SCANNER_SETTINGS,
} from "@/lib/automations/dca-ladder"
import {
  INDICATORS,
  INDICATOR_IDS,
  type IndicatorId,
  type IndicatorParamValue,
} from "@/lib/indicators/registry"

/**
 * A run/order purpose → a human title for the chart. Purposes follow one shared
 * grammar across every strategy node — `<node>:b:<n>` (buy), `<node>:s|tp:<n>`
 * (sell / take-profit), `<node>:s:all` — so ONE decoder covers DCA, legacy qfl tapes, and any
 * future node without the chart knowing a single strategy's id format. A node
 * with an exotic purpose can special-case it here; everything else falls back to
 * the cleaned-up purpose string.
 */
export function orderLabelFor(purpose: string): string {
  const rung = purpose.match(/^[a-z]+:(b|s|tp):(\d+)$/)
  if (rung) {
    const kind = rung[1] === "b" ? "Buy" : rung[1] === "tp" ? "TP" : "Sell"
    return `${kind} ${Number(rung[2]) + 1}`
  }
  if (/^[a-z]+:s:all$/.test(purpose)) return "Sell all"
  return purpose.replace(/^auto:/, "").replace(/-/g, " ")
}

/**
 * The chart's Base indicator config — short horizontal dashes at each confirmed
 * base, keyed to the node that owns it. A `type: "base"` indicator, NOT a line
 * series, so the chart draws separate dashes instead of a ramp between bases.
 */
function baseOverlay(
  nodeId: string,
  basePeriods: number,
  pumpPeriods: number
): IndicatorConfig {
  return {
    id: `${nodeId}:base`,
    type: "base",
    enabled: true,
    params: { basePeriods, pumpPeriods },
  }
}

/** Which price line was dragged: a stop, a take-profit, or the base/crack line. */
export type TuneTarget = "tp" | "sl" | "crack"

function roundPct(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100))
}

/**
 * The node update a dragged price line maps to — the ONE place the per-node
 * setting math lives (replaces the switch that used to be duplicated across the
 * visualize and backtest drag handlers). `ref` is the position's entry for a
 * TP/SL drag, or the base for a crack drag. Returns null when the drag doesn't
 * apply to this node. A new draggable node just adds its own `applyTuneDrag`.
 */
export function nodeTuneUpdate(
  node: AutomationNode,
  target: TuneTarget,
  price: number,
  ref: number,
  side: "long" | "short"
): AutomationNode | null {
  if (!(price > 0)) return null
  return definitionForNode(node).applyTuneDrag?.(node, target, price, ref, side) ?? null
}

export type AutomationPaletteKey =
  | `indicator-${IndicatorId}`
  | "scanner-market"
  | "scanner-whale-wall"
  | "strategy-dca"
  | "filter-lookback"
  | "filter-timeframe"
  | "action-buy"
  | "action-short"
  | "action-reverse"
  | "action-close"
  | "exit-take-profit"
  | "exit-stop-loss"

export type AutomationNodeIconName =
  | "activity"
  | "gitBranch"
  | "layers"
  | "octagonX"
  | "radar"
  | "repeat"
  | "scanSearch"
  | "shieldX"
  | "target"
  | "timer"
  | "trendingDown"
  | "trendingUp"

export type AutomationNodeInspectorKind =
  | "action"
  | "dca"
  | "indicator"
  | "legacy"
  | "lookback"
  | "timeframe"
  | "marketScanner"
  | "protection"
  | "whaleWall"

export type AutomationPaletteGroup =
  | "Indicators"
  | "Scanners"
  | "Strategies"
  | "Filters"
  | "Actions"
  | "Exits"

export type AutomationNodePort = {
  id: AutomationSourcePort
  label: string
}

export type AutomationNodeAttachmentPort = {
  id: "tp" | "sl"
  edge: "top" | "bottom"
}

type PaletteDetails = {
  key: AutomationPaletteKey
  group: AutomationPaletteGroup
  description: string
}

type AutomationNodeDefinition = {
  palette: PaletteDetails | null
  matches: (node: AutomationNode) => boolean
  create?: (position: { id: string; x: number; y: number }) => AutomationNode
  name: (node: AutomationNode) => string
  description: (node: AutomationNode) => string
  icon: AutomationNodeIconName
  inspector: AutomationNodeInspectorKind
  outputPorts: readonly AutomationNodePort[]
  sourcePorts?: readonly AutomationSourcePort[]
  attachmentPorts?: readonly AutomationNodeAttachmentPort[]
  inputMode?: "side" | "protection"
  /** Chart overlays this node draws (base dashes, ladder levels), read from the
   * COMPILED config — a strategy's base settings are resolved at compile time,
   * so this takes the config, not the raw node. Empty/absent = draws nothing. */
  overlays?: (config: AutomationConfig) => IndicatorConfig[]
  /** How dragging one of this node's price lines rewrites its setting. `ref` is
   * the entry anchor (TP/SL) or the base (crack). Absent = no draggable line. */
  applyTuneDrag?: (
    node: AutomationNode,
    target: TuneTarget,
    price: number,
    ref: number,
    side: "long" | "short"
  ) => AutomationNode | null
  connectionError: (
    sourcePort: AutomationSourcePort,
    target: AutomationNode
  ) => string | null
}

const noOutputs: readonly AutomationNodePort[] = []
const noConnection = () => "This connection is not allowed."

function indicatorDefinition(id: IndicatorId): AutomationNodeDefinition {
  const indicator = INDICATORS[id]
  return {
    palette: {
      key: `indicator-${id}`,
      group: "Indicators",
      description: indicator.description,
    },
    matches: (node) => node.kind === "indicator" && node.indicator.type === id,
    create: ({ id: nodeId, x, y }) => ({
      id: nodeId,
      kind: "indicator",
      x,
      y,
      indicator: {
        type: id,
        params: {
          ...(indicator.defaultParams as Record<string, IndicatorParamValue>),
        },
      },
    }),
    name: () => indicator.label,
    description: () => indicator.description,
    icon: "activity",
    inspector: "indicator",
    outputPorts: [
      { id: "bullish", label: "Bullish" },
      { id: "trend", label: "Trend" },
      { id: "bearish", label: "Bearish" },
    ],
    connectionError: (sourcePort, target) => {
      if (sourcePort === "trend") {
        return target.kind === "indicator" ||
          target.kind === "lookback" ||
          target.kind === "timeframe" ||
          target.kind === "dca"
          ? null
          : "The Trend output can only connect to an indicator, Look Back, Timeframe, or DCA node."
      }
      return target.kind === "action" || target.kind === "dca"
        ? null
        : "Bullish and Bearish outputs can only connect to an action or a DCA node."
    },
  }
}

const fixedDefinitions: AutomationNodeDefinition[] = [
  {
    palette: null,
    matches: (node) => node.kind === "logic",
    name: (node) => (node.kind === "logic" ? node.op.toUpperCase() : "Logic"),
    description: () =>
      "No longer supported — delete this node and connect indicators directly.",
    icon: "gitBranch",
    inspector: "legacy",
    outputPorts: [{ id: "match", label: "Match" }],
    connectionError: noConnection,
  },
  {
    palette: {
      key: "filter-lookback",
      group: "Filters",
      description: "Incoming signal only counts for a set number of candles",
    },
    matches: (node) => node.kind === "lookback",
    create: ({ id, x, y }) => ({ id, kind: "lookback", bars: 48, x, y }),
    name: () => "Look Back",
    description: (node) =>
      node.kind === "lookback"
        ? `The incoming signal only counts for ${node.bars} candles after it fires.`
        : "",
    icon: "timer",
    inspector: "lookback",
    outputPorts: [{ id: "trend", label: "Trend" }],
    connectionError: (_sourcePort, target) =>
      target.kind === "indicator"
        ? null
        : "A Look Back node can only connect to an indicator.",
  },
  {
    palette: {
      key: "filter-timeframe",
      group: "Filters",
      description: "Evaluates the signal feeding it on a higher timeframe",
    },
    matches: (node) => node.kind === "timeframe",
    create: ({ id, x, y }) => ({ id, kind: "timeframe", interval: "4h", x, y }),
    name: () => "Timeframe",
    description: (node) =>
      node.kind === "timeframe"
        ? `The indicators feeding it watch closed ${node.interval} candles instead of the bot's timeframe.`
        : "",
    icon: "layers",
    inspector: "timeframe",
    outputPorts: [{ id: "trend", label: "Trend" }],
    connectionError: (_sourcePort, target) =>
      target.kind === "indicator"
        ? null
        : "A Timeframe node can only connect to an indicator.",
  },
  {
    palette: {
      key: "scanner-market",
      group: "Scanners",
      description: "Filter selected markets by liquidity and available history",
    },
    matches: (node) => node.kind === "marketScanner",
    create: ({ id, x, y }) => ({
      id,
      kind: "marketScanner",
      ...DEFAULT_MARKET_SCANNER_SETTINGS,
      x,
      y,
    }),
    name: () => "Market Scanner",
    description: (node) => {
      if (node.kind !== "marketScanner") return ""
      const volume = `$${Math.round(node.minDailyVolumeUsd).toLocaleString()}`
      return node.historyFilterEnabled
        ? `Selected markets need ${volume} daily volume and ${node.minHistoryMonths} months of history.`
        : `Selected markets need at least ${volume} daily volume.`
    },
    icon: "scanSearch",
    inspector: "marketScanner",
    outputPorts: [{ id: "markets", label: "Markets" }],
    connectionError: (_sourcePort, target) =>
      target.kind === "dca"
        ? null
        : "Market Scanner can only connect to the DCA ladder.",
  },
  {
    palette: {
      key: "scanner-whale-wall",
      group: "Scanners",
      description:
        "Watch large nearby bid and ask levels in the live order book",
    },
    matches: (node) => node.kind === "whaleWall",
    create: ({ id, x, y }) => ({
      id,
      kind: "whaleWall",
      minUsd: 500_000,
      relativeSize: 5,
      maxDistancePct: 0.5,
      confirmationMs: 2_000,
      x,
      y,
    }),
    name: () => "Whale Wall",
    description: (node) =>
      node.kind === "whaleWall"
        ? `At least $${Math.round(node.minUsd).toLocaleString()}, ${node.relativeSize}× nearby size, within ${node.maxDistancePct}%.`
        : "",
    icon: "radar",
    inspector: "whaleWall",
    outputPorts: [
      { id: "bidWall", label: "Bid Wall" },
      { id: "askWall", label: "Ask Wall" },
    ],
    connectionError: (sourcePort, target) => {
      if (sourcePort === "bidWall") {
        return target.kind === "action" && target.action === "buy"
          ? null
          : "Bid Wall can only connect to Long."
      }
      return target.kind === "action" && target.action === "short"
        ? null
        : "Ask Wall can only connect to Short."
    },
  },
  {
    palette: {
      key: "strategy-dca",
      group: "Strategies",
      description: "Average into a position with a ladder of buys below the base",
    },
    matches: (node) => node.kind === "dca",
    create: ({ id, x, y }) => ({
      id,
      kind: "dca",
      rungs: DEFAULT_DCA_RUNGS.map((rung) => ({ ...rung })),
      maxPositionPct: DEFAULT_DCA_MAX_POSITION_PCT,
      sizeMultiplier: DEFAULT_DCA_SIZE_MULTIPLIER,
      compound: true,
      rungEntry: "market",
      requireTwoGreen: false,
      crackPct: 2.5,
      maxCrackBars: 4,
      respectFilterEnabled: false,
      respectLookbackMonths: 6,
      minRespectPct: 80,
      recoveryTargetPct: -2,
      x,
      y,
    }),
    name: () => "DCA",
    description: (node) => {
      if (node.kind !== "dca") return ""
      const first = node.rungs[0]?.deviation ?? 0
      const last = node.rungs.at(-1)?.deviation ?? 0
      return `${node.rungs.length} buys to ${node.maxPositionPct}%, ${first}%–${last}% below the base.`
    },
    icon: "layers",
    inspector: "dca",
    overlays: (config) =>
      config.dca
        ? [
            baseOverlay(
              config.dca.nodeId,
              config.dca.basePeriods,
              config.dca.pumpPeriods
            ),
          ]
        : [],
    // No signal output; TP/SL hang off its top/bottom hooks and read its average.
    outputPorts: noOutputs,
    sourcePorts: ["tp", "sl"],
    attachmentPorts: [
      { id: "tp", edge: "top" },
      { id: "sl", edge: "bottom" },
    ],
    connectionError: (sourcePort, target) => {
      if (sourcePort === "tp") {
        return target.kind === "takeProfit"
          ? null
          : "The Take Profit hook can only connect to a Take Profit node."
      }
      if (sourcePort === "sl") {
        return target.kind === "stopLoss"
          ? null
          : "The Stop Loss hook can only connect to a Stop Loss node."
      }
      return noConnection()
    },
  },
  actionDefinition(
    "buy",
    "action-buy",
    "Long",
    "Target a long portfolio percentage",
    "trendingUp"
  ),
  actionDefinition(
    "short",
    "action-short",
    "Short",
    "Target a short portfolio percentage",
    "trendingDown"
  ),
  actionDefinition(
    "reverse",
    "action-reverse",
    "Reverse Position",
    "Flip to the opposite side in one step (close + open)",
    "repeat"
  ),
  actionDefinition(
    "close",
    "action-close",
    "Close Position",
    "Close the current position completely",
    "shieldX"
  ),
  protectionDefinition(
    "takeProfit",
    "exit-take-profit",
    "Take Profit",
    "Bank profit at a set % from entry — hang it on a Long or Short",
    "target",
    2
  ),
  protectionDefinition(
    "stopLoss",
    "exit-stop-loss",
    "Stop Loss",
    "Cap the loss at a set % from entry — hang it on a Long or Short",
    "octagonX",
    1
  ),
]

function actionDefinition(
  action: "buy" | "short" | "close" | "reverse",
  key: AutomationPaletteKey,
  name: string,
  paletteDescription: string,
  icon: AutomationNodeIconName
): AutomationNodeDefinition {
  const attachmentPorts: readonly AutomationNodeAttachmentPort[] =
    action === "buy"
      ? [
          { id: "tp", edge: "top" },
          { id: "sl", edge: "bottom" },
        ]
      : action === "short"
        ? [
            { id: "tp", edge: "bottom" },
            { id: "sl", edge: "top" },
          ]
        : []
  return {
    palette: { key, group: "Actions", description: paletteDescription },
    matches: (node) => node.kind === "action" && node.action === action,
    create: ({ id, x, y }) => ({
      id,
      kind: "action",
      action,
      ...(action === "close" ? {} : { targetEquityPct: 10 }),
      x,
      y,
    }),
    name: () => name,
    description: (node) => {
      if (node.kind !== "action") return ""
      if (node.action === "close") return "Closes the current market position."
      if (node.action === "reverse") {
        return `Flips the current position to the opposite side (${node.targetEquityPct ?? 10}%).`
      }
      return `Targets ${node.targetEquityPct ?? 10}% of account equity.`
    },
    icon,
    inspector: "action",
    outputPorts: [{ id: "then", label: "Then" }],
    sourcePorts: ["then", ...attachmentPorts.map((port) => port.id)],
    attachmentPorts,
    connectionError: (sourcePort, target) => {
      if (sourcePort === "then") {
        return target.kind === "indicator"
          ? null
          : "The Then output can only connect to an indicator."
      }
      if (sourcePort === "tp") {
        return target.kind === "takeProfit"
          ? null
          : "The Take Profit hook can only connect to a Take Profit node."
      }
      return target.kind === "stopLoss"
        ? null
        : "The Stop Loss hook can only connect to a Stop Loss node."
    },
  }
}

function protectionDefinition(
  kind: "takeProfit" | "stopLoss",
  key: AutomationPaletteKey,
  name: string,
  paletteDescription: string,
  icon: AutomationNodeIconName,
  pct: number
): AutomationNodeDefinition {
  return {
    palette: { key, group: "Exits", description: paletteDescription },
    matches: (node) => node.kind === kind,
    create: ({ id, x, y }) => ({ id, kind, pct, x, y }),
    name: () => name,
    description: (node) => {
      if (node.kind !== kind) return ""
      if (kind === "takeProfit") {
        return `Banks profit ${node.pct}% from the entry on the side it's attached to.`
      }
      return node.kind === "stopLoss" && node.mode === "trailing"
        ? `Trails the best price by ${node.pct}%, locking in gains on the side it's attached to.`
        : `Caps the loss ${node.pct}% from the entry on the side it's attached to.`
    },
    icon,
    inspector: "protection",
    outputPorts: noOutputs,
    inputMode: "protection",
    applyTuneDrag: (node, target, price, ref, side) => {
      if (node.kind !== kind || !(ref > 0)) return null
      if (kind === "takeProfit" && target === "tp") {
        const raw = ((side === "long" ? price - ref : ref - price) / ref) * 100
        return { ...node, pct: roundPct(raw, 0.1, 1000) }
      }
      if (kind === "stopLoss" && target === "sl") {
        const raw = ((side === "long" ? ref - price : price - ref) / ref) * 100
        return { ...node, pct: roundPct(raw, 0.1, 95) }
      }
      return null
    },
    connectionError: noConnection,
  }
}

const AUTOMATION_NODE_DEFINITIONS: readonly AutomationNodeDefinition[] =
  [...INDICATOR_IDS.map(indicatorDefinition), ...fixedDefinitions]

export const AUTOMATION_PALETTE_GROUPS: readonly AutomationPaletteGroup[] = [
  "Indicators",
  "Scanners",
  "Strategies",
  "Filters",
  "Actions",
  "Exits",
]

export const AUTOMATION_PALETTE_ITEMS = AUTOMATION_NODE_DEFINITIONS.flatMap(
  (definition) => {
    if (!definition.palette) return []
    return [
      {
        ...definition.palette,
        name: definition.name(
          definition.create!({ id: "palette", x: 0, y: 0 })
        ),
        icon: definition.icon,
      },
    ]
  }
).sort(
  (left, right) =>
    AUTOMATION_PALETTE_GROUPS.indexOf(left.group) -
    AUTOMATION_PALETTE_GROUPS.indexOf(right.group)
)

export const AUTOMATION_PALETTE_KEYS: readonly AutomationPaletteKey[] =
  AUTOMATION_PALETTE_ITEMS.map((item) => item.key)

function definitionForNode(node: AutomationNode): AutomationNodeDefinition {
  const definition = AUTOMATION_NODE_DEFINITIONS.find((item) =>
    item.matches(node)
  )
  if (!definition) throw new Error(`Unknown Automation node: ${node.kind}`)
  return definition
}

function definitionForPaletteKey(
  key: AutomationPaletteKey
): AutomationNodeDefinition {
  const definition = AUTOMATION_NODE_DEFINITIONS.find(
    (item) => item.palette?.key === key
  )
  if (!definition?.create)
    throw new Error(`Unknown Automation node key: ${key}`)
  return definition
}

export function createAutomationNode(
  key: AutomationPaletteKey,
  position: { id: string; x: number; y: number }
): AutomationNode {
  return definitionForPaletteKey(key).create!(position)
}

export function automationPaletteKeyForRegisteredNode(
  node: AutomationNode
): AutomationPaletteKey | null {
  return definitionForNode(node).palette?.key ?? null
}

/**
 * Every chart overlay the compiled config's nodes want drawn (base dashes today).
 * The chart and the paint pipeline call THIS instead of hardcoding a strategy —
 * a new node just declares its own `overlays` and gets drawn for free.
 */
export function configNodeOverlays(config: AutomationConfig): IndicatorConfig[] {
  return AUTOMATION_NODE_DEFINITIONS.flatMap(
    (definition) => definition.overlays?.(config) ?? []
  )
}

export function automationNodeName(node: AutomationNode): string {
  return definitionForNode(node).name(node)
}

export function automationNodeDescription(node: AutomationNode): string {
  return definitionForNode(node).description(node)
}

export function automationNodeIcon(
  node: AutomationNode
): AutomationNodeIconName {
  return definitionForNode(node).icon
}

export function automationNodeInspector(
  node: AutomationNode
): AutomationNodeInspectorKind {
  return definitionForNode(node).inspector
}

export function automationNodeOutputPorts(
  node: AutomationNode
): readonly AutomationNodePort[] {
  return definitionForNode(node).outputPorts
}

export function automationNodeAttachmentPorts(
  node: AutomationNode
): readonly AutomationNodeAttachmentPort[] {
  return definitionForNode(node).attachmentPorts ?? []
}

export function automationNodeInputMode(
  node: AutomationNode
): "side" | "protection" {
  return definitionForNode(node).inputMode ?? "side"
}

export function automationNodeSourcePortIsValid(
  node: AutomationNode,
  sourcePort: AutomationSourcePort
): boolean {
  const definition = definitionForNode(node)
  const sourcePorts =
    definition.sourcePorts ?? definition.outputPorts.map((port) => port.id)
  return sourcePorts.includes(sourcePort)
}

export function automationNodeConnectionError(
  source: AutomationNode,
  sourcePort: AutomationSourcePort,
  target: AutomationNode
): string | null {
  if (!automationNodeSourcePortIsValid(source, sourcePort)) {
    return "Connection uses an invalid output."
  }
  return definitionForNode(source).connectionError(sourcePort, target)
}

export function canConnectAutomationNodes(
  source: AutomationNode,
  sourcePort: AutomationSourcePort,
  target: AutomationNode
): boolean {
  return (
    source.id !== target.id &&
    automationNodeConnectionError(source, sourcePort, target) === null
  )
}
