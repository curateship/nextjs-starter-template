import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { ChevronsUpIcon, XIcon } from "lucide-react"
import type { PanelImperativeHandle } from "react-resizable-panels"
import { toast } from "sonner"

import { AutomationActivityLog } from "@/components/automations/automation-activity-log"
import { AutomationBacktestParamsPanel } from "@/components/automations/automation-backtest-params-panel"
import { AutomationBacktestSidePanel } from "@/components/automations/automation-backtest-side-panel"
import { combineMarketStats } from "@/components/backtest/backtest-combine"
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
import { nodeAfterTuneDrag } from "@/components/automations/node-tune-drag"
import {
  BacktestRunChart,
  type BacktestTuneDrag,
} from "@/components/backtest/backtest-run-chart"
import { BotLiveChartPanel } from "@/components/bots/bot-live-chart-panel"
import { useBotLive } from "@/components/bots/use-bot-live"
import {
  CHART_DOWN_COLOR,
  CHART_UP_COLOR,
} from "@/components/chart/chart-markers"
import type { ChartPriceLine } from "@/components/chart/price-chart"
import type { TradingNetwork } from "@/lib/hl/network"
import type { CandleInterval } from "@/lib/hl/ws"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import type { SaveStatus } from "@/components/ui/save-status"

import { nextNodePosition, type CanvasSize } from "./canvas-model"
import { appendAutomationLog, type AutomationLogEntry } from "./automation-log"
import { AutomationPanelToggles } from "./automation-panel-toggles"
import { useAutomationBacktest } from "./use-automation-backtest"
import { useAutomationBot } from "./use-automation-bot"

// Quiet window after the last edit before the canvas auto-saves itself. Matches
// the settings page's debounce so the whole app feels the same.
const SAVE_DEBOUNCE_MS = 700

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
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [inspectorOpen, setInspectorOpen] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle")
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
  const navigate = useNavigate()
  // A deployed run lives on its own page — Bot mode here is only the setup
  // form. An existing current run (or a fresh deploy) navigates to it.
  const bot = useAutomationBot(initial.id, (botId) =>
    void navigate({ to: "/bots/$botId", params: { botId } })
  )
  // Land straight in a mode when a run dashboard deep-links here.
  const enteredInitialView = React.useRef(false)
  React.useEffect(() => {
    if (enteredInitialView.current) return
    enteredInitialView.current = true
    if (initialView === "backtest") {
      backtest.enter()
    } else if (initialView === "bot") {
      bot.enter()
    }
  }, [initialView, backtest, bot])
  const [runLastClose, setRunLastClose] = React.useState<number | null>(null)
  // "Save run" (toolbar, backtest results): names the group so the next
  // backtest won't replace it.
  const [saveRunOpen, setSaveRunOpen] = React.useState(false)
  const [saveRunName, setSaveRunName] = React.useState("")
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

  // No navigation guard: edits auto-save, and leaving flushes whatever is still
  // pending (see the unmount effect below), so there is nothing to warn about.

  const selectedNode =
    previewNode ??
    (selectedNodeId
      ? (graph.nodes.find((node) => node.id === selectedNodeId) ?? null)
      : null)
  // The "previous rung" take-profit modes only make sense on a Take Profit fed
  // by a DCA node (they reference its buy ladder), so the inspector only offers
  // them when the selected TP node has a DCA node wired into it.
  const selectedTpFeedsDca = React.useMemo(() => {
    if (selectedNode?.kind !== "takeProfit") return false
    return graph.edges.some(
      (edge) =>
        edge.to === selectedNode.id &&
        graph.nodes.find((node) => node.id === edge.from)?.kind === "dca"
    )
  }, [selectedNode, graph.edges, graph.nodes])
  // The stop's "Measured from" only means something when several buys average
  // into one position, which is what a DCA ladder does — so the option shows
  // whenever the automation contains one, wherever the stop sits.
  const graphHasDca = React.useMemo(
    () => graph.nodes.some((node) => node.kind === "dca"),
    [graph.nodes]
  )
  // The stop's non-percent levels each need the node that supplies them — a
  // Sessions node to say WHICH session, a Base node to say which base — so each
  // option only appears once its node is wired in. Offering one otherwise put a
  // choice in the list that could only ever produce a validation error.
  const parentsOf = (nodeId: string) =>
    graph.edges
      .filter((edge) => edge.to === nodeId)
      .map((edge) => graph.nodes.find((node) => node.id === edge.from))
  const isIndicator = (
    node: (typeof graph.nodes)[number] | undefined,
    type: string
  ) => node?.kind === "indicator" && node.indicator.type === type
  const stopFeedFrom = (type: "session" | "base") => {
    if (selectedNode?.kind !== "stopLoss") return false
    const parents = parentsOf(selectedNode.id)
    if (parents.some((parent) => isIndicator(parent, type))) return true
    // Mirrors the compiler: the indicator feeding the ENTRY this stop guards
    // counts too, so an ordinary Base → DCA → Stop Loss graph needs no second
    // wire from the Base straight to the stop.
    return parents.some(
      (parent) =>
        (parent?.kind === "dca" || parent?.kind === "action") &&
        parentsOf(parent.id).some((grandparent) =>
          isIndicator(grandparent, type)
        )
    )
  }
  const selectedStopFeedsSession = stopFeedFrom("session")
  const selectedStopFeedsBase = stopFeedFrom("base")
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

  // ── Auto-save ───────────────────────────────────────────────────────────
  // There is no Save button. Every edit schedules a debounced write, and
  // anything that reads the SAVED automation (a backtest, a deploy) flushes
  // first. Saves run on a serialized queue so rapid edits land in order.
  const latestPayloadRef = React.useRef({
    name,
    type,
    interval,
    graph,
    backtest: backtestSettings,
  })
  React.useEffect(() => {
    latestPayloadRef.current = {
      name,
      type,
      interval,
      graph,
      backtest: backtestSettings,
    }
  }, [backtestSettings, graph, interval, name, type])
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveQueueRef = React.useRef(Promise.resolve())
  const saveVersionRef = React.useRef(0)
  // The last snapshot a save was started for. A failed save is not retried
  // until the user edits again, so a rejected name can't loop every 700ms.
  const attemptedRef = React.useRef(lastSaved)
  const serializePayload = React.useCallback(
    (payload: typeof latestPayloadRef.current) =>
      serialize(
        payload.name,
        payload.type,
        payload.interval,
        payload.graph,
        payload.backtest
      ),
    [serialize]
  )

  /**
   * Writes the freshest canvas now, cancelling any pending debounce. Returns
   * whether the saved copy is ready to run, which is what gates Run/Deploy.
   * `explicit` is set by those buttons: they say why nothing happened, while a
   * background auto-save stays quiet about a half-typed name.
   */
  const saveNow = React.useCallback(
    async (explicit = false) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }

      const snapshot = latestPayloadRef.current
      // The server requires a name; skip while the field is mid-retype instead
      // of flashing a validation error at someone who just cleared it.
      if (!snapshot.name.trim()) {
        if (explicit) setSaveError("Give this automation a name first.")
        return false
      }

      const sent = serializePayload(snapshot)
      attemptedRef.current = sent
      const version = saveVersionRef.current + 1
      saveVersionRef.current = version
      setSaveStatus("saving")
      setSaveError(null)

      const save = saveQueueRef.current
        .catch(() => undefined)
        .then(() => saveAutomation({ automationId: initial.id, ...snapshot }))
      saveQueueRef.current = save.then(
        () => undefined,
        () => undefined
      )

      try {
        const saved = await save
        // A newer save has already superseded this one: let it own the status
        // and the state write-back, so an older reply can't rewind either.
        if (version !== saveVersionRef.current) {
          return Boolean(saved.compiledConfig)
        }
        if (sent === serializePayload(latestPayloadRef.current)) {
          // Nothing was typed during the round trip, so it is safe to adopt the
          // server's normalized copy. If something was, keep the user's version
          // — overwriting it would swallow keystrokes — and let the next
          // debounce save it.
          setName(saved.name)
          setType(saved.type)
          setInterval(saved.interval)
          // Keep the live camera. Pan and zoom are deliberately excluded from
          // the dirty check, so they move without a save — which means the
          // reply's viewport is stale and adopting it would snap the canvas
          // back to wherever it was when the save left.
          setGraph((current) => ({ ...saved.graph, viewport: current.viewport }))
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
        } else {
          setLastSaved(sent)
        }
        setSaveStatus("saved")
        return Boolean(saved.compiledConfig)
      } catch (error) {
        if (version === saveVersionRef.current) {
          setSaveError(
            error instanceof Error
              ? error.message
              : "Could not save this automation."
          )
          setSaveStatus("idle")
        }
        return false
      }
    },
    [initial.id, serialize, serializePayload]
  )

  // Debounce: every edit restarts the clock, so a save fires once the canvas
  // goes quiet. Guarded on the attempted snapshot so a failure doesn't retry.
  React.useEffect(() => {
    if (!dirty || currentSerialized === attemptedRef.current) return
    const timer = setTimeout(() => {
      saveTimerRef.current = null
      void saveNow()
    }, SAVE_DEBOUNCE_MS)
    saveTimerRef.current = timer
    return () => clearTimeout(timer)
  }, [currentSerialized, dirty, saveNow])

  // Leaving the editor flushes an edit the debounce never got to. Keyed on the
  // snapshot, not the timer: the debounce effect's own cleanup runs first on
  // unmount and would have already cleared it. It goes on the same queue as
  // every other save — an earlier write may still be in flight, and jumping it
  // would let the older content land last. Fire-and-forget, since the component
  // is going away and has no state left to update.
  React.useEffect(() => {
    return () => {
      const snapshot = latestPayloadRef.current
      if (!snapshot.name.trim()) return
      const sent = serializePayload(snapshot)
      if (sent === attemptedRef.current) return
      attemptedRef.current = sent
      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(() => saveAutomation({ automationId: initial.id, ...snapshot }))
        .then(
          () => undefined,
          () => undefined
        )
    }
  }, [initial.id, serializePayload])

  // Let the "Saved" tick fade so the toolbar isn't permanently annotated.
  React.useEffect(() => {
    if (saveStatus !== "saved") return
    const timer = setTimeout(() => setSaveStatus("idle"), 2000)
    return () => clearTimeout(timer)
  }, [saveStatus])

  // Run and Deploy read the SAVED automation, so they flush a pending edit
  // first. When nothing is pending they must NOT write: every save re-syncs
  // this automation's live bots and costs a database round trip before the run
  // can even start. `dirty === false` means the server confirmed this exact
  // graph, and the buttons are already gated on it compiling.
  const flushBeforeRun = React.useCallback(
    () => (dirty ? saveNow(true) : Promise.resolve(true)),
    [dirty, saveNow]
  )

  // Whale Wall gate, shared by the toolbar and the backtest panel. There is no
  // save gate any more: Run and Deploy flush the pending save themselves.
  const backtestDisabledReason =
    compiled.config &&
    !automationCapabilities(compiled.config).supportsHistoricalBacktest
      ? "Whale Wall needs live order-book data, so historical backtesting is unavailable."
      : undefined
  const runnableNow = compiled.config !== null
  const runnableDisabledReason =
    compiled.config === null
      ? "Fix the automation's issues to enable."
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
      backtest.enter()
      openSidePanels()
      return
    }
    if (next === "bot") {
      if (backtest.open) backtest.exit()
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

  // The whole basket's combined numbers for the left params panel — summed P&L,
  // trades and a weighted win rate across every finished market, so the panel
  // describes the entire run rather than only the market on the chart. The
  // percent is measured against the pot: the starting balance, once, however
  // many markets the run covered.
  const combinedBacktest = React.useMemo(() => {
    if (!backtest.open) return null
    const stats = backtest.runs
      .filter((run) => run.status === "done")
      .map((run) => backtest.runStats.get(run.id))
      .filter((stat): stat is NonNullable<typeof stat> => stat != null)
      .map((stat) => ({
        netPnl: stat.netPnl,
        tradeCount: stat.tradeCount,
        winRate: stat.winRate,
      }))
    return combineMarketStats(stats, {
      startingEquity: backtestSettings.startingEquity,
    })
  }, [
    backtest.open,
    backtest.runs,
    backtest.runStats,
    backtestSettings.startingEquity,
  ])

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

  // Selecting a market surfaces its trades in the bottom panel.
  const selectedBacktestRunId = backtest.selectedRunId
  React.useEffect(() => {
    if (selectedBacktestRunId) setLogOpen(true)
  }, [selectedBacktestRunId])

  // ── Bot mode: the deploy setup form ─────────────────────────────────────
  // Bot mode's center is a live chart of the market picked in the setup
  // form — a preview of what's about to be deployed. A deployed run lives
  // on its own page (/bots/$botId).
  const botChartMarket = bot.selectedMarkets[0] ?? "BTC"
  const botSetupNetwork: TradingNetwork =
    bot.wallets.find((wallet) => wallet.id === bot.walletId)?.network ===
    "mainnet"
      ? "mainnet"
      : "testnet"
  const botLive = useBotLive(null, botChartMarket, botSetupNetwork)

  // Preview TP/SL lines come from the CANVAS nodes (the bot's config is the
  // canvas), anchored at the current mark price. Dragging rewrites the node —
  // dirty, so the auto-save stores it; the deployed run gets exactly this
  // config, because Deploy flushes any pending write before it fires.
  const botTuneAnchor = botLive.markPrice
  const botPriceLines = React.useMemo<ChartPriceLine[]>(() => {
    if (!bot.open || !(botTuneAnchor > 0)) return []
    const lines: ChartPriceLine[] = []
    const protective = graph.nodes.filter(
      (node) => node.kind === "takeProfit" || node.kind === "stopLoss"
    )
    if (protective.length > 0) {
      lines.push({
        id: "bot:entry",
        price: botTuneAnchor,
        color: "#64748b",
        title: "Entry (now)",
        lineStyle: "dashed",
        lineWidth: 1,
      })
    }
    for (const node of protective) {
      if (node.kind === "takeProfit") {
        lines.push({
          id: "bot:tp",
          price: botTuneAnchor * (1 + node.pct / 100),
          color: CHART_UP_COLOR,
          title: `TP +${node.pct}%`,
          lineStyle: "dashed",
          draggable: true,
        })
      } else {
        lines.push({
          id: "bot:sl",
          price: botTuneAnchor * (1 - node.pct / 100),
          color: CHART_DOWN_COLOR,
          title: `${node.mode === "trailing" ? "Trail SL" : "SL"} -${node.pct}%`,
          lineStyle: "dashed",
          draggable: true,
        })
      }
    }
    return lines
  }, [bot.open, botTuneAnchor, graph.nodes])

  const handleBotLineDrag = React.useCallback(
    (id: string, price: number) => {
      const kind = id === "bot:tp" ? "tp" : id === "bot:sl" ? "sl" : null
      if (!kind || !(botTuneAnchor > 0)) return
      const next = nodeAfterTuneDrag(graphRef.current.nodes, {
        kind,
        price,
        anchor: botTuneAnchor,
        side: "long",
      })
      if (!next) return
      updateNode(next)
      record("Adjusted a setting by dragging on the preview chart.")
    },
    [botTuneAnchor, record, updateNode]
  )

  const inspector = (
    <AutomationInspector
      selectedNode={selectedNode}
      errors={compiled.errors}
      interval={interval}
      feedsFromDca={selectedTpFeedsDca}
      feedsFromSession={selectedStopFeedsSession}
      feedsFromBase={selectedStopFeedsBase}
      graphHasDca={graphHasDca}
      referenceEquity={backtestSettings.startingEquity}
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
        key={`setup-${botChartMarket}`}
        network={botLive.network}
        market={botChartMarket}
        interval={(compiled.config?.interval ?? "15m") as CandleInterval}
        automationConfig={compiled.config}
        fills={botLive.marketTrades}
        trips={botLive.trips}
        focusedTradeN={null}
        priceLines={botPriceLines}
        onLineDragEnd={handleBotLineDrag}
      />
    ) : selectedBacktestRun && selectedBacktestResult ? (
      <BacktestRunChart
        key={selectedBacktestRun.id}
        run={selectedBacktestRun}
        focusedTrade={backtest.focusedTrade}
        onLastCloseChange={setRunLastClose}
        toolbarLeading={
          <span className="text-sm font-bold">
            {selectedBacktestRun.market}
          </span>
        }
        onTuneDrag={handleTuneDrag}
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
      config={compiled.config}
      runnable={runnableNow && !backtestDisabledReason}
      disabledReason={backtestDisabledReason ?? runnableDisabledReason}
      onBeforeRun={flushBeforeRun}
    />
  )
  const paramsPanel = (
    <AutomationBacktestParamsPanel
      selectedRun={selectedBacktestRun}
      combined={combinedBacktest}
      combinedDrawdownPct={backtest.combinedDrawdownPct}
      potAtMaxDdUsd={backtest.potAtMaxDdUsd}
      groupCurve={backtest.groupCurve}
      openPositions={backtest.openPositions}
      marketsTotal={backtest.runs.length}
      interval={interval}
      days={backtest.days}
      backtestSettings={backtestSettings}
      config={compiled.config}
    />
  )
  const botSidePanel = (
    <AutomationBotSidePanel
      bot={bot}
      isDca={Boolean(compiled.config?.dca)}
      runnable={runnableNow}
      disabledReason={runnableDisabledReason}
      onBeforeDeploy={flushBeforeRun}
    />
  )
  const leftPanel = backtest.open ? paramsPanel : palette
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
      <ResizableHandle gap collapsed={paletteCollapsed} />
      <ResizablePanel id="canvas" defaultSize="60%" minSize="30%">
        <WorkspacePanel className="flex">{centerPanel}</WorkspacePanel>
      </ResizablePanel>
      <ResizableHandle gap collapsed={inspectorCollapsed} />
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
        saveStatus={saveStatus}
        onNameChange={setName}
        onOpenSettings={() => setSettingsOpen(true)}
        onSaveRun={
          view === "backtest" &&
          backtest.phase === "results" &&
          backtest.replaceable
            ? () => setSaveRunOpen(true)
            : undefined
        }
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
                {selectedBacktestRun && selectedBacktestResult ? (
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
              {selectedBacktestRun
                ? `Trades — ${selectedBacktestRun.market}`
                : "Activity log"}
            </span>
            <span className="ml-2 text-xs text-muted-foreground">
              {selectedBacktestRun && selectedBacktestResult
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

      <Dialog open={saveRunOpen} onOpenChange={setSaveRunOpen}>
        <DialogContent variant="admin" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save this run</DialogTitle>
            <DialogDescription>
              A saved run stays in your backtest history forever.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Input
              value={saveRunName}
              onChange={(event) => setSaveRunName(event.target.value)}
              placeholder="Run name"
              aria-label="Run name"
            />
            <p className="text-xs text-muted-foreground">
              Unnamed runs are replaced by your next backtest.
            </p>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSaveRunOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!saveRunName.trim()}
              onClick={() => {
                void backtest.keep(saveRunName)
                setSaveRunName("")
                setSaveRunOpen(false)
              }}
            >
              Save run
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
