import * as React from "react"
import { useBlocker } from "@tanstack/react-router"
import { ChartCandlestickIcon, ChevronsUpIcon, XIcon } from "lucide-react"
import type { PanelImperativeHandle } from "react-resizable-panels"
import { toast } from "sonner"

import { AutomationActivityLog } from "@/components/automations/automation-activity-log"
import { AutomationBacktestParamsPanel } from "@/components/automations/automation-backtest-params-panel"
import { AutomationBacktestSidePanel } from "@/components/automations/automation-backtest-side-panel"
import { AutomationBacktestTradesPanel } from "@/components/automations/automation-backtest-trades-panel"
import { AutomationBotSidePanel } from "@/components/automations/automation-bot-side-panel"
import { AutomationCanvasSettingsDialog } from "@/components/automations/automation-canvas-settings-dialog"
import { AutomationFlowCanvas } from "@/components/automations/automation-flow-canvas"
import { AutomationInspector } from "@/components/automations/automation-inspector"
import { AutomationPalette } from "@/components/automations/automation-palette"
import {
  AutomationToolbar,
  type AutomationView,
} from "@/components/automations/automation-toolbar"
import {
  AutomationVisualizePanel,
  nodeAfterTuneDrag,
} from "@/components/automations/automation-visualize-panel"
import {
  BacktestRunChart,
  type BacktestTuneDrag,
} from "@/components/backtest/backtest-run-chart"
import { StrategyTester } from "@/components/backtest/strategy-tester"
import { BotLifecycleControls } from "@/components/bots/bot-lifecycle-controls"
import { BotLiveChartPanel } from "@/components/bots/bot-live-chart-panel"
import { buildBotResult } from "@/components/bots/bot-result"
import { BotSummaryPanel } from "@/components/bots/bot-summary-panel"
import { useBotLive } from "@/components/bots/use-bot-live"
import type { BotCommand } from "@/components/bots/bot-lifecycle-controls"
import { CHART_DOWN_COLOR, CHART_UP_COLOR } from "@/components/chart/chart-markers"
import type { ChartPriceLine } from "@/components/chart/price-chart"
import { getBotErrorMessage, sendCommand } from "@/lib/api/bots"
import { maxWindowDays } from "@/lib/backtest/types"
import type { TradingNetwork } from "@/lib/hl/network"
import type { CandleInterval } from "@/lib/hl/ws"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  automationCapabilities,
  compileAutomationGraph,
  type AutomationBacktestSettings,
  type AutomationGraph,
  type AutomationNode,
} from "@/lib/automations/automation"
import {
  getAutomationErrorMessage,
  saveAutomation,
  saveAutomationFavorites,
  type AutomationDetail,
} from "@/lib/api/automations"
import {
  automationPaletteKeyForNode,
  type AutomationPaletteKey,
} from "@/lib/automations/palette"
import {
  automationNodeName,
  createAutomationNode,
} from "@/lib/automations/node-registry"
import type { AutomationInterval } from "@/lib/strategies/kinds/contract"
import { usePanelLayout } from "@/lib/use-panel-layout"

import { nextNodePosition, type CanvasSize } from "./canvas-model"
import { appendAutomationLog, type AutomationLogEntry } from "./automation-log"
import { AutomationPanelToggles } from "./automation-panel-toggles"
import { useAutomationBacktest } from "./use-automation-backtest"
import { useAutomationBot } from "./use-automation-bot"

export function AutomationEditor({
  initial,
  initialFavoriteNodeKeys,
  initialView,
}: {
  initial: AutomationDetail
  initialFavoriteNodeKeys: AutomationPaletteKey[]
  /** Opens the editor straight in a mode (deep links from run dashboards). */
  initialView?: "backtest" | "bot"
}) {
  const [name, setName] = React.useState(initial.name)
  const [type, setType] = React.useState(initial.type)
  const [interval, setInterval] = React.useState<AutomationInterval>(
    initial.interval
  )
  const [graph, setGraph] = React.useState(initial.graph)
  const [backtestSettings, setBacktestSettings] = React.useState(
    initial.backtest
  )
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(
    null
  )
  const [previewNode, setPreviewNode] = React.useState<AutomationNode | null>(
    null
  )
  const [draggedNodeKey, setDraggedNodeKey] =
    React.useState<AutomationPaletteKey | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = React.useState<string | null>(
    null
  )
  const [canvasSize, setCanvasSize] = React.useState<CanvasSize>({
    width: 0,
    height: 0,
  })
  const [visualize, setVisualize] = React.useState(false)
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [inspectorOpen, setInspectorOpen] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [desktop, setDesktop] = React.useState(false)
  const [paletteCollapsed, setPaletteCollapsed] = React.useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = React.useState(false)
  const [logOpen, setLogOpen] = React.useState(true)
  const [logEntries, setLogEntries] = React.useState<AutomationLogEntry[]>([])
  const [favoriteNodeKeys, setFavoriteNodeKeys] = React.useState(
    initialFavoriteNodeKeys
  )
  const [savingFavorites, setSavingFavorites] = React.useState(false)
  const backtest = useAutomationBacktest(initial.id)
  const bot = useAutomationBot(initial.id)
  // Land straight in a mode when a run dashboard deep-links here.
  const enteredInitialView = React.useRef(false)
  React.useEffect(() => {
    if (enteredInitialView.current) return
    enteredInitialView.current = true
    if (initialView === "backtest") {
      setVisualize(false)
      backtest.enter()
    } else if (initialView === "bot") {
      setVisualize(false)
      bot.enter()
    }
  }, [initialView, backtest, bot])
  const [runLastClose, setRunLastClose] = React.useState<number | null>(null)
  /** Trade selected in the bot bottom panel — pulses rings on the live chart. */
  const [botFocusedTradeN, setBotFocusedTradeN] = React.useState<number | null>(
    null
  )
  const [botCommandBusy, setBotCommandBusy] = React.useState(false)
  const graphRef = React.useRef(graph)
  const palettePanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const inspectorPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const horizontalLayout = usePanelLayout("automation-editor-horizontal-v2")
  const verticalLayout = usePanelLayout("automation-editor-vertical")

  const togglePalette = React.useCallback(() => {
    const panel = palettePanelRef.current
    if (!panel) return
    if (panel.isCollapsed()) panel.expand()
    else panel.collapse()
  }, [])
  const toggleInspector = React.useCallback(() => {
    const panel = inspectorPanelRef.current
    if (!panel) return
    if (panel.isCollapsed()) panel.expand()
    else panel.collapse()
  }, [])

  React.useEffect(() => {
    graphRef.current = graph
  }, [graph])

  const record = React.useCallback((message: string) => {
    setLogEntries((current) =>
      appendAutomationLog(current, {
        id: crypto.randomUUID(),
        time: Date.now(),
        message,
      })
    )
  }, [])

  const serialize = React.useCallback(
    (
      nextName: string,
      nextType: string,
      nextInterval: AutomationInterval,
      nextGraph: AutomationGraph,
      nextBacktest: AutomationBacktestSettings
    ) =>
      JSON.stringify({
        name: nextName,
        type: nextType,
        interval: nextInterval,
        // The camera is not a strategy change: pan/zoom/fit write
        // graph.viewport, and counting that as dirty blocked backtesting
        // with "nothing to save". The viewport still persists as a side
        // effect of the next real save.
        graph: { ...nextGraph, viewport: null },
        backtest: nextBacktest,
      }),
    []
  )
  const [lastSaved, setLastSaved] = React.useState(() =>
    serialize(
      initial.name,
      initial.type,
      initial.interval,
      initial.graph,
      initial.backtest
    )
  )

  React.useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)")
    const update = () => setDesktop(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  const compiled = React.useMemo(
    () => compileAutomationGraph({ interval, graph }),
    [graph, interval]
  )
  const currentSerialized = serialize(
    name,
    type,
    interval,
    graph,
    backtestSettings
  )
  const dirty = currentSerialized !== lastSaved

  // Guard navigation while the graph has unsaved edits. Keyed on `dirty`
  // alone: a save in flight keeps `dirty` true until it succeeds, and after a
  // successful save the programmatic create-bot/backtest navigations pass
  // through unprompted. `enableBeforeUnload` covers refresh/close natively.
  const shouldBlockNavigation = React.useCallback(() => dirty, [dirty])
  const blocker = useBlocker({
    shouldBlockFn: shouldBlockNavigation,
    enableBeforeUnload: shouldBlockNavigation,
    withResolver: true,
  })

  const selectedNode =
    previewNode ??
    (selectedNodeId
      ? (graph.nodes.find((node) => node.id === selectedNodeId) ?? null)
      : null)
  const selectedPaletteKey = selectedNode
    ? automationPaletteKeyForNode(selectedNode)
    : null

  const updateNode = React.useCallback(
    (nextNode: AutomationNode) => {
      if (nextNode.id === previewNode?.id) {
        setPreviewNode(nextNode)
        return
      }
      setGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === nextNode.id ? nextNode : node
        ),
      }))
    },
    [previewNode?.id]
  )

  const deleteNode = React.useCallback(
    (nodeId: string) => {
      if (nodeId === previewNode?.id) {
        setPreviewNode(null)
        return
      }
      const node = graphRef.current.nodes.find((item) => item.id === nodeId)
      setGraph((current) => ({
        ...current,
        nodes: current.nodes.filter((item) => item.id !== nodeId),
        edges: current.edges.filter(
          (edge) => edge.from !== nodeId && edge.to !== nodeId
        ),
      }))
      setSelectedNodeId(null)
      record(`Deleted ${node ? automationNodeName(node) : "node"}.`)
    },
    [previewNode?.id, record]
  )

  const createNode = React.useCallback(
    (key: AutomationPaletteKey) =>
      createAutomationNode(key, {
        id: crypto.randomUUID(),
        x: 0,
        y: 0,
      }),
    []
  )

  const toggleFavoriteNode = React.useCallback(
    async (key: AutomationPaletteKey) => {
      if (savingFavorites) return
      const previous = favoriteNodeKeys
      const next = previous.includes(key)
        ? previous.filter((candidate) => candidate !== key)
        : [...previous, key]
      setFavoriteNodeKeys(next)
      setSavingFavorites(true)
      try {
        const saved = await saveAutomationFavorites(next)
        setFavoriteNodeKeys(saved.favoriteNodeKeys)
      } catch (error) {
        setFavoriteNodeKeys(previous)
        toast.error(getAutomationErrorMessage(error))
      } finally {
        setSavingFavorites(false)
      }
    },
    [favoriteNodeKeys, savingFavorites]
  )

  const previewPaletteNode = React.useCallback(
    (key: AutomationPaletteKey) => {
      setPreviewNode(createNode(key))
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setPaletteOpen(false)
      if (desktop) inspectorPanelRef.current?.expand()
      else setInspectorOpen(true)
    },
    [createNode, desktop]
  )

  const placeNode = React.useCallback(
    (node: AutomationNode, position?: { x: number; y: number }) => {
      const { x, y } =
        position ??
        nextNodePosition(
          graph.nodes.length,
          graph.viewport,
          canvasSize.width || 800
        )
      const placedNode = { ...node, x, y }
      setGraph((current) => ({
        ...current,
        nodes: [...current.nodes, placedNode],
      }))
      setPreviewNode(null)
      setSelectedNodeId(placedNode.id)
      setSelectedEdgeId(null)
      setPaletteOpen(false)
      record(`Added ${automationNodeName(placedNode)}.`)
    },
    [canvasSize.width, graph.nodes.length, graph.viewport, record]
  )

  const addNode = React.useCallback(
    (key: AutomationPaletteKey, position?: { x: number; y: number }) =>
      placeNode(createNode(key), position),
    [createNode, placeNode]
  )

  const selectCanvasNode = React.useCallback((nodeId: string | null) => {
    setPreviewNode(null)
    setSelectedNodeId(nodeId)
  }, [])

  const handleCanvasGraphChange = React.useCallback(
    (next: AutomationGraph) => {
      const current = graphRef.current
      if (next.nodes.length < current.nodes.length) {
        const removed = current.nodes.find(
          (node) => !next.nodes.some((candidate) => candidate.id === node.id)
        )
        record(`Deleted ${removed ? automationNodeName(removed) : "node"}.`)
      } else if (next.edges.length > current.edges.length) {
        record("Connected nodes.")
      } else if (next.edges.length < current.edges.length) {
        record("Removed connection.")
      }
      graphRef.current = next
      setGraph(next)
    },
    [record]
  )

  const handleSave = React.useCallback(async () => {
    if (saving) return false
    setSaving(true)
    setSaveError(null)
    const payload = {
      name,
      type,
      interval,
      graph,
      backtest: backtestSettings,
    }
    try {
      const saved = await saveAutomation({
        automationId: initial.id,
        ...payload,
      })
      setName(saved.name)
      setType(saved.type)
      setInterval(saved.interval)
      setGraph(saved.graph)
      setBacktestSettings(saved.backtest)
      setLastSaved(
        serialize(
          saved.name,
          saved.type,
          saved.interval,
          saved.graph,
          saved.backtest
        )
      )
      record(
        saved.compiledConfig
          ? "Saved Automation. It is ready to run."
          : "Saved draft with validation issues."
      )
      return Boolean(saved.compiledConfig)
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Could not save this automation."
      )
      return false
    } finally {
      setSaving(false)
    }
  }, [
    backtestSettings,
    graph,
    initial.id,
    interval,
    name,
    record,
    saving,
    serialize,
    type,
  ])

  // Whale Wall gate + save gate, shared by the toolbar and the backtest panel.
  const backtestDisabledReason =
    compiled.config &&
    !automationCapabilities(compiled.config).supportsHistoricalBacktest
      ? "Whale Wall needs live order-book data, so historical backtesting is unavailable."
      : undefined
  const runnableNow = compiled.config !== null && !dirty && !saving
  const runnableDisabledReason =
    compiled.config === null
      ? "Fix the automation's issues to enable."
      : dirty || saving
        ? "Save the automation to enable."
        : undefined

  const view: AutomationView = bot.open
    ? "bot"
    : backtest.open
      ? "backtest"
      : "canvas"
  const handleViewChange = (next: AutomationView) => {
    if (next === view) return
    const openSidePanels = () => {
      if (desktop) {
        palettePanelRef.current?.expand()
        inspectorPanelRef.current?.expand()
      } else {
        setInspectorOpen(true)
      }
    }
    if (next === "backtest") {
      if (bot.open) bot.exit()
      setVisualize(false)
      backtest.enter()
      openSidePanels()
      return
    }
    if (next === "bot") {
      if (backtest.open) backtest.exit()
      setVisualize(false)
      bot.enter()
      openSidePanels()
      return
    }
    if (backtest.open) backtest.exit()
    if (bot.open) bot.exit()
  }

  const selectedBacktestRun =
    backtest.open && backtest.selectedRun?.status === "done"
      ? backtest.selectedRun
      : null
  const selectedBacktestResult = selectedBacktestRun?.result ?? null

  // A dropped tune line rewrites the matching node's setting — the rule, not
  // that one order. The graph goes dirty like any inspector edit.
  const handleTuneDrag = React.useCallback(
    (change: BacktestTuneDrag) => {
      const next = nodeAfterTuneDrag(graphRef.current.nodes, change)
      if (!next) return
      updateNode(next)
      record("Adjusted a setting by dragging on the backtest chart.")
    },
    [record, updateNode]
  )

  const handleSaveAndRerun = async () => {
    const saved = await handleSave()
    if (!saved) return
    const windowDays = Number(backtest.days)
    await backtest.start(
      Math.min(
        Number.isInteger(windowDays) && windowDays >= 1 ? windowDays : 30,
        maxWindowDays(interval)
      )
    )
  }

  // Selecting a market surfaces its trades in the bottom panel.
  const selectedBacktestRunId = backtest.selectedRunId
  React.useEffect(() => {
    if (selectedBacktestRunId) setLogOpen(true)
  }, [selectedBacktestRunId])

  // ── Bot mode: the automation running live ───────────────────────────────
  // Bot mode's center is ALWAYS a live chart, never the node canvas: the
  // current run's market when one is loaded, else the market picked in the
  // setup form (a preview of what's about to be deployed).
  const botChartMarket = bot.detail
    ? bot.selectedMarket
    : (bot.selectedMarkets[0] ?? "BTC")
  const botSetupNetwork: TradingNetwork =
    bot.wallets.find((wallet) => wallet.id === bot.walletId)?.network ===
    "mainnet"
      ? "mainnet"
      : "testnet"
  const botLive = useBotLive(bot.detail, botChartMarket, botSetupNetwork)
  const botShowsDashboard = bot.open && bot.detail !== null
  React.useEffect(() => {
    if (botShowsDashboard) setLogOpen(true)
  }, [botShowsDashboard])

  // Per-market equity base: cash minus what this market realized, falling
  // back to the bot's paper stake, then the paper default.
  const botClosedPnl = botLive.trips
    .filter((trip) => !trip.open)
    .reduce((sum, trip) => sum + trip.pnl, 0)
  const botStartingEquity =
    botLive.state?.paper_cash != null && botLive.state.paper_cash - botClosedPnl > 0
      ? botLive.state.paper_cash - botClosedPnl
      : (bot.detail?.bot.paper_starting_equity ?? 10_000)
  const botResult = React.useMemo(
    () =>
      botShowsDashboard
        ? buildBotResult(
            botLive.trips,
            botLive.marketTrades,
            botLive.state,
            botStartingEquity
          )
        : null,
    [botShowsDashboard, botLive.trips, botLive.marketTrades, botLive.state, botStartingEquity]
  )

  // Live TP/SL lines come from the CANVAS nodes (the bot's config is the
  // canvas): anchored at the open position's entry, else the mark price.
  // Dragging rewrites the node — dirty — and Save pushes it to the bot.
  const botPosition = botLive.state?.paper_position ?? null
  const botPositionSzi = botPosition ? Number(botPosition.szi) : 0
  const botTuneSide: "long" | "short" = botPositionSzi < 0 ? "short" : "long"
  const botTuneAnchor =
    botPositionSzi !== 0 && Number(botPosition?.entryPx) > 0
      ? Number(botPosition?.entryPx)
      : botLive.markPrice
  const botPriceLines = React.useMemo<ChartPriceLine[]>(() => {
    if (!bot.open || !(botTuneAnchor > 0)) return []
    const long = botTuneSide === "long"
    const lines: ChartPriceLine[] = []
    const protective = graph.nodes.filter(
      (node) => node.kind === "takeProfit" || node.kind === "stopLoss"
    )
    if (protective.length > 0) {
      lines.push({
        id: "bot:entry",
        price: botTuneAnchor,
        color: "#64748b",
        title: botPositionSzi !== 0 ? "Entry" : "Entry (now)",
        lineStyle: "dashed",
        lineWidth: 1,
      })
    }
    for (const node of protective) {
      if (node.kind === "takeProfit") {
        lines.push({
          id: "bot:tp",
          price: botTuneAnchor * (1 + (long ? 1 : -1) * (node.pct / 100)),
          color: CHART_UP_COLOR,
          title: `TP +${node.pct}%`,
          lineStyle: "dashed",
          draggable: true,
        })
      } else {
        lines.push({
          id: "bot:sl",
          price: botTuneAnchor * (1 - (long ? 1 : -1) * (node.pct / 100)),
          color: CHART_DOWN_COLOR,
          title: `${node.mode === "trailing" ? "Trail SL" : "SL"} -${node.pct}%`,
          lineStyle: "dashed",
          draggable: true,
        })
      }
    }
    return lines
  }, [bot.open, botTuneAnchor, botTuneSide, botPositionSzi, graph.nodes])

  const handleBotLineDrag = React.useCallback(
    (id: string, price: number) => {
      const kind = id === "bot:tp" ? "tp" : id === "bot:sl" ? "sl" : null
      if (!kind || !(botTuneAnchor > 0)) return
      const next = nodeAfterTuneDrag(graphRef.current.nodes, {
        kind,
        price,
        anchor: botTuneAnchor,
        side: botTuneSide,
      })
      if (!next) return
      updateNode(next)
      record("Adjusted a setting by dragging on the live chart — Save applies it to the bot.")
    },
    [botTuneAnchor, botTuneSide, record, updateNode]
  )

  async function runBotCommand(command: BotCommand) {
    const currentBotId = bot.botId
    if (!currentBotId || botCommandBusy) return
    setBotCommandBusy(true)
    try {
      await sendCommand(currentBotId, command)
      bot.refresh()
    } catch (commandError) {
      toast.error(getBotErrorMessage(commandError))
    } finally {
      setBotCommandBusy(false)
    }
  }

  const inspector = (
    <AutomationInspector
      selectedNode={selectedNode}
      errors={compiled.errors}
      interval={interval}
      favorite={
        selectedPaletteKey
          ? favoriteNodeKeys.includes(selectedPaletteKey)
          : undefined
      }
      savingFavorite={savingFavorites}
      onNodeChange={updateNode}
      onToggleFavorite={
        selectedPaletteKey
          ? () => void toggleFavoriteNode(selectedPaletteKey)
          : undefined
      }
      onAddNode={previewNode ? placeNode : undefined}
      onDeleteNode={deleteNode}
    />
  )
  const centerPanel =
    bot.open && botChartMarket ? (
      <BotLiveChartPanel
        key={`${bot.botId ?? "setup"}-${botChartMarket}`}
        network={botLive.network}
        market={botChartMarket}
        interval={(compiled.config?.interval ?? "15m") as CandleInterval}
        automationConfig={compiled.config}
        fills={botLive.marketTrades}
        trips={botLive.trips}
        focusedTradeN={botFocusedTradeN}
        priceLines={botPriceLines}
        onLineDragEnd={handleBotLineDrag}
        toolbarActions={
          bot.detail ? (
            <BotLifecycleControls
              bot={bot.detail.bot}
              busy={botCommandBusy}
              onCommand={(command) => void runBotCommand(command)}
            />
          ) : null
        }
      />
    ) : selectedBacktestRun && selectedBacktestResult ? (
      <BacktestRunChart
        key={selectedBacktestRun.id}
        run={selectedBacktestRun}
        focusedTrade={backtest.focusedTrade}
        onLastCloseChange={setRunLastClose}
        toolbarLeading={
          <span className="text-sm font-bold">{selectedBacktestRun.market}</span>
        }
        onTuneDrag={handleTuneDrag}
      />
    ) : visualize ? (
    <AutomationVisualizePanel
      graph={graph}
      config={compiled.config}
      interval={interval}
      onNodeChange={updateNode}
      onExit={() => setVisualize(false)}
    />
  ) : (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <AutomationFlowCanvas
        graph={graph}
        errors={compiled.errors}
        selectedNodeId={selectedNodeId}
        selectedEdgeId={selectedEdgeId}
        onGraphChange={handleCanvasGraphChange}
        onSelectNode={selectCanvasNode}
        onSelectEdge={setSelectedEdgeId}
        onSizeChange={setCanvasSize}
        onDropNode={
          draggedNodeKey
            ? (position) => {
                addNode(draggedNodeKey, position)
                setDraggedNodeKey(null)
              }
            : undefined
        }
      />
      {backtest.open || bot.open ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="absolute top-3 right-3 z-10 h-8 shadow-sm"
          onClick={() => setVisualize(true)}
        >
          <ChartCandlestickIcon className="size-3.5" />
          Visualize
        </Button>
      )}
    </div>
  )

  const palette = (
    <AutomationPalette
      favoriteNodeKeys={favoriteNodeKeys}
      onSelect={previewPaletteNode}
      onAdd={addNode}
      onDragStart={setDraggedNodeKey}
      onDragEnd={() => setDraggedNodeKey(null)}
    />
  )
  const sidePanel = (
    <AutomationBacktestSidePanel
      backtest={backtest}
      interval={interval}
      isQfl={Boolean(compiled.config?.qfl)}
      runnable={runnableNow && !backtestDisabledReason}
      disabledReason={backtestDisabledReason ?? runnableDisabledReason}
      canSaveAndRerun={dirty && compiled.config !== null && !saving}
      onSaveAndRerun={() => void handleSaveAndRerun()}
    />
  )
  const paramsPanel = (
    <AutomationBacktestParamsPanel
      selectedRun={selectedBacktestRun}
      interval={interval}
      days={backtest.days}
      backtestSettings={backtestSettings}
      config={compiled.config}
    />
  )
  const botSidePanel = (
    <AutomationBotSidePanel
      bot={bot}
      isQfl={Boolean(compiled.config?.qfl)}
      runnable={runnableNow}
      disabledReason={runnableDisabledReason}
    />
  )
  const botSummaryPanel =
    botShowsDashboard && bot.detail ? (
      <BotSummaryPanel
        bot={bot.detail.bot}
        state={botLive.state}
        stats={bot.detail.stats}
        openOrders={botLive.openOrders}
        selectedMarket={bot.selectedMarket}
        markPrice={botLive.markPrice}
        dayChangePct={botLive.dayChangePct}
      />
    ) : (
      palette
    )
  const leftPanel = bot.open
    ? botSummaryPanel
    : backtest.open
      ? paramsPanel
      : palette
  const rightPanel = bot.open
    ? botSidePanel
    : backtest.open
      ? sidePanel
      : inspector
  const workspace = desktop ? (
    <ResizablePanelGroup
      key={horizontalLayout.layoutKey}
      orientation="horizontal"
      className="min-h-0 flex-1"
      defaultLayout={horizontalLayout.defaultLayout}
      onLayoutChanged={horizontalLayout.onLayoutChanged}
    >
      <ResizablePanel
        id="palette"
        panelRef={palettePanelRef}
        collapsible
        collapsedSize="0%"
        defaultSize="16%"
        minSize="14%"
        maxSize="26%"
        onResize={(size) => setPaletteCollapsed(size.asPercentage < 0.5)}
      >
        <WorkspacePanel>{leftPanel}</WorkspacePanel>
      </ResizablePanel>
      <ResizableHandle gap />
      <ResizablePanel id="canvas" defaultSize="60%" minSize="30%">
        <WorkspacePanel className="flex">{centerPanel}</WorkspacePanel>
      </ResizablePanel>
      <ResizableHandle gap />
      <ResizablePanel
        id="inspector"
        panelRef={inspectorPanelRef}
        collapsible
        collapsedSize="0%"
        defaultSize="20%"
        minSize="18%"
        maxSize="34%"
        onResize={(size) => setInspectorCollapsed(size.asPercentage < 0.5)}
      >
        <WorkspacePanel>{rightPanel}</WorkspacePanel>
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    <WorkspacePanel className="flex">{centerPanel}</WorkspacePanel>
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/60 dark:bg-background">
      <AutomationToolbar
        name={name}
        backtestDisabledReason={backtestDisabledReason}
        view={view}
        onViewChange={handleViewChange}
        dirty={dirty}
        saving={saving}
        onNameChange={setName}
        onOpenSettings={() => setSettingsOpen(true)}
        onSave={() => void handleSave()}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenInspector={() => setInspectorOpen(true)}
      />
      {saveError ? (
        <div
          role="alert"
          className="border-b bg-destructive/10 px-4 py-1.5 text-xs text-destructive"
        >
          {saveError}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-[var(--shell-gutter,0.75rem)] p-[var(--shell-gutter,0.75rem)]">
        <ResizablePanelGroup
          key={`${logOpen ? "log-open" : "log-closed"}-${verticalLayout.layoutKey}`}
          orientation="vertical"
          className="min-h-0 flex-1"
          defaultLayout={logOpen ? verticalLayout.defaultLayout : undefined}
          onLayoutChanged={logOpen ? verticalLayout.onLayoutChanged : undefined}
        >
          <ResizablePanel id="workspace" defaultSize="78%" minSize="40%">
            <div className="flex h-full min-h-0">{workspace}</div>
          </ResizablePanel>
          {logOpen ? <ResizableHandle gap /> : null}
          {logOpen ? (
            <ResizablePanel
              id="activity-log"
              defaultSize="22%"
              minSize="12%"
              maxSize="45%"
            >
              <WorkspacePanel>
                {botShowsDashboard && botResult ? (
                  <StrategyTester
                    result={botResult}
                    startingEquity={botStartingEquity}
                    markPrice={botLive.markPrice}
                    selectedTradeN={botFocusedTradeN}
                    onSelectTrade={(trade) =>
                      setBotFocusedTradeN(trade?.n ?? null)
                    }
                  />
                ) : selectedBacktestRun && selectedBacktestResult ? (
                  <AutomationBacktestTradesPanel
                    market={selectedBacktestRun.market}
                    result={selectedBacktestResult}
                    markPrice={runLastClose ?? 0}
                    focusedTradeN={backtest.focusedTrade?.n ?? null}
                    onSelectTrade={backtest.setFocusedTrade}
                    onCollapse={() => setLogOpen(false)}
                    showPanelToggles={desktop}
                    paletteCollapsed={paletteCollapsed}
                    inspectorCollapsed={inspectorCollapsed}
                    onTogglePalette={togglePalette}
                    onToggleInspector={toggleInspector}
                  />
                ) : (
                  <AutomationActivityLog
                    entries={logEntries}
                    onCollapse={() => setLogOpen(false)}
                    showPanelToggles={desktop}
                    paletteCollapsed={paletteCollapsed}
                    inspectorCollapsed={inspectorCollapsed}
                    onTogglePalette={togglePalette}
                    onToggleInspector={toggleInspector}
                  />
                )}
              </WorkspacePanel>
            </ResizablePanel>
          ) : null}
        </ResizablePanelGroup>
        {!logOpen ? (
          <div className="flex min-h-10 shrink-0 items-center rounded-xl border border-foreground/5 bg-card px-4 py-2">
            <span className="text-xs font-semibold tracking-wide uppercase">
              {botShowsDashboard
                ? `Trades — ${bot.selectedMarket}`
                : selectedBacktestRun
                  ? `Trades — ${selectedBacktestRun.market}`
                  : "Activity log"}
            </span>
            <span className="ml-2 text-xs text-muted-foreground">
              {botShowsDashboard && botResult
                ? `${botResult.trades.length} closed`
                : selectedBacktestRun && selectedBacktestResult
                  ? `${selectedBacktestResult.trades.length} closed`
                  : `${logEntries.length} ${logEntries.length === 1 ? "event" : "events"}`}
            </span>
            <div className="ml-auto flex items-center gap-1">
              {desktop ? (
                <AutomationPanelToggles
                  paletteCollapsed={paletteCollapsed}
                  inspectorCollapsed={inspectorCollapsed}
                  onTogglePalette={togglePalette}
                  onToggleInspector={toggleInspector}
                />
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Expand activity log"
                onClick={() => setLogOpen(true)}
              >
                <ChevronsUpIcon className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <AutomationCanvasSettingsDialog
        open={settingsOpen}
        type={type}
        interval={interval}
        backtest={backtestSettings}
        onOpenChange={setSettingsOpen}
        onApply={(settings) => {
          setType(settings.type)
          setInterval(settings.interval)
          setBacktestSettings(settings.backtest)
        }}
      />

      <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[min(90vw,320px)] gap-0 p-0"
        >
          <SheetPanelHeader
            title={backtest.open ? "Backtest params" : "Add a node"}
          />
          {leftPanel}
        </SheetContent>
      </Sheet>
      <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-[min(90vw,360px)] gap-0 p-0"
        >
          <SheetPanelHeader
            title={backtest.open ? "Backtest" : "Automation inspector"}
          />
          {rightPanel}
        </SheetContent>
      </Sheet>

      <Dialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.()
        }}
      >
        <DialogContent variant="admin" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>
              Leaving discards the edits made since the last save.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You have unsaved changes — leave without saving?
            </p>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              onClick={() => blocker.reset?.()}
            >
              Stay
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => blocker.proceed?.()}
            >
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SheetPanelHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-3">
      <SheetTitle className="text-sm">{title}</SheetTitle>
      <SheetClose asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close panel"
        >
          <XIcon className="size-4" />
        </Button>
      </SheetClose>
    </div>
  )
}
