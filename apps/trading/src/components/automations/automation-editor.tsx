import * as React from "react"
import { ChevronsUpIcon, XIcon } from "lucide-react"
import type { Layout, PanelImperativeHandle } from "react-resizable-panels"

import { AutomationActivityLog } from "@/components/automations/automation-activity-log"
import { AutomationCanvasSettingsDialog } from "@/components/automations/automation-canvas-settings-dialog"
import { AutomationFlowCanvas } from "@/components/automations/automation-flow-canvas"
import { AutomationInspector } from "@/components/automations/automation-inspector"
import {
  AutomationPalette,
  type AutomationPaletteChoice,
} from "@/components/automations/automation-palette"
import { AutomationToolbar } from "@/components/automations/automation-toolbar"
import { Button } from "@/components/ui/button"
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
  compileAutomationGraph,
  type AutomationBacktestSettings,
  type AutomationGraph,
  type AutomationNode,
} from "@/lib/automations/automation"
import { saveAutomation, type AutomationDetail } from "@/lib/api/automations"
import {
  INDICATORS,
  type IndicatorId,
  type IndicatorParamValue,
} from "@/lib/indicators/registry"
import type { AutomationInterval } from "@/lib/strategies/kinds/contract"

import { nextNodePosition, type CanvasSize } from "./canvas-model"
import { appendAutomationLog, type AutomationLogEntry } from "./automation-log"
import { AutomationPanelToggles } from "./automation-panel-toggles"
import { automationNodeName } from "./node-labels"

export function AutomationEditor({
  initial,
  pinnedIndicators,
  indicatorParamSeeds,
  onCreateBot,
  onBacktest,
}: {
  initial: AutomationDetail
  pinnedIndicators: IndicatorId[]
  /** Per-indicator starting params (e.g. the chart's saved Price Action
   * settings) a new node copies instead of the module defaults. */
  indicatorParamSeeds?: Partial<
    Record<IndicatorId, Record<string, IndicatorParamValue>>
  >
  onCreateBot?: () => void
  onBacktest?: () => void
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
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [desktop, setDesktop] = React.useState(false)
  const [paletteCollapsed, setPaletteCollapsed] = React.useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = React.useState(false)
  const [logOpen, setLogOpen] = React.useState(true)
  const [logEntries, setLogEntries] = React.useState<AutomationLogEntry[]>([])
  const graphRef = React.useRef(graph)
  const palettePanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const inspectorPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const horizontalLayout = useAutomationLayout("automation-editor-horizontal-v2")
  const verticalLayout = useAutomationLayout("automation-editor-vertical")

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
        graph: nextGraph,
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
  const selectedNode = selectedNodeId
    ? (graph.nodes.find((node) => node.id === selectedNodeId) ?? null)
    : null

  const updateNode = React.useCallback((nextNode: AutomationNode) => {
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nextNode.id ? nextNode : node
      ),
    }))
  }, [])

  const deleteNode = React.useCallback(
    (nodeId: string) => {
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
    [record]
  )

  const addNode = React.useCallback(
    (choice: AutomationPaletteChoice) => {
      const width = canvasSize.width || 800
      const { x, y } = nextNodePosition(
        graph.nodes.length,
        graph.viewport,
        width
      )
      const id = crypto.randomUUID()
      let node: AutomationNode
      if (choice.kind === "indicator") {
        node = {
          id,
          kind: "indicator",
          x,
          y,
          indicator: {
            type: choice.indicatorType,
            params: {
              ...(INDICATORS[choice.indicatorType].defaultParams as Record<
                string,
                IndicatorParamValue
              >),
              ...indicatorParamSeeds?.[choice.indicatorType],
            },
          },
        }
      } else if (choice.kind === "lookback") {
        node = { id, kind: "lookback", bars: 48, x, y }
      } else if (choice.kind === "takeProfit") {
        node = { id, kind: "takeProfit", pct: 2, x, y }
      } else if (choice.kind === "stopLoss") {
        node = { id, kind: "stopLoss", pct: 1, x, y }
      } else {
        node = {
          id,
          kind: "action",
          action: choice.action,
          ...(choice.action === "close" ? {} : { targetEquityPct: 10 }),
          x,
          y,
        }
      }
      setGraph((current) => ({
        ...current,
        nodes: [...current.nodes, node],
      }))
      setSelectedNodeId(id)
      setSelectedEdgeId(null)
      setPaletteOpen(false)
      record(`Added ${automationNodeName(node)}.`)
    },
    [
      canvasSize.width,
      graph.nodes.length,
      graph.viewport,
      indicatorParamSeeds,
      record,
    ]
  )

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
    if (saving) return
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
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Could not save this automation."
      )
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

  const inspector = (
    <AutomationInspector
      selectedNode={selectedNode}
      errors={compiled.errors}
      onNodeChange={updateNode}
      onDeleteNode={deleteNode}
    />
  )
  const canvas = (
    <AutomationFlowCanvas
      graph={graph}
      errors={compiled.errors}
      selectedNodeId={selectedNodeId}
      selectedEdgeId={selectedEdgeId}
      onGraphChange={handleCanvasGraphChange}
      onSelectNode={setSelectedNodeId}
      onSelectEdge={setSelectedEdgeId}
      onSizeChange={setCanvasSize}
    />
  )
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
        <WorkspacePanel>
          <AutomationPalette pinnedIndicators={pinnedIndicators} onAdd={addNode} />
        </WorkspacePanel>
      </ResizablePanel>
      <ResizableHandle gap />
      <ResizablePanel id="canvas" defaultSize="60%" minSize="30%">
        <WorkspacePanel className="flex">{canvas}</WorkspacePanel>
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
        <WorkspacePanel>{inspector}</WorkspacePanel>
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    <WorkspacePanel className="flex">{canvas}</WorkspacePanel>
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/40">
      <AutomationToolbar
        name={name}
        runnable={compiled.config !== null && !dirty && !saving}
        dirty={dirty}
        saving={saving}
        onNameChange={setName}
        onOpenSettings={() => setSettingsOpen(true)}
        onSave={() => void handleSave()}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenInspector={() => setInspectorOpen(true)}
        onCreateBot={onCreateBot}
        onBacktest={onBacktest}
      />
      {saveError ? (
        <div
          role="alert"
          className="border-b bg-destructive/10 px-4 py-1.5 text-xs text-destructive"
        >
          {saveError}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 md:gap-3 md:p-3">
        <ResizablePanelGroup
          key={`${logOpen ? "log-open" : "log-closed"}-${verticalLayout.layoutKey}`}
          orientation="vertical"
          className="min-h-0 flex-1"
          defaultLayout={logOpen ? verticalLayout.defaultLayout : undefined}
          onLayoutChanged={
            logOpen ? verticalLayout.onLayoutChanged : undefined
          }
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
                <AutomationActivityLog
                  entries={logEntries}
                  onCollapse={() => setLogOpen(false)}
                  showPanelToggles={desktop}
                  paletteCollapsed={paletteCollapsed}
                  inspectorCollapsed={inspectorCollapsed}
                  onTogglePalette={togglePalette}
                  onToggleInspector={toggleInspector}
                />
              </WorkspacePanel>
            </ResizablePanel>
          ) : null}
        </ResizablePanelGroup>
        {!logOpen ? (
          <div className="flex min-h-10 shrink-0 items-center rounded-xl border border-foreground/5 bg-card px-4 py-2">
          <span className="text-xs font-semibold tracking-wide uppercase">
            Activity log
          </span>
          <span className="ml-2 text-xs text-muted-foreground">
            {logEntries.length} {logEntries.length === 1 ? "event" : "events"}
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
          <SheetPanelHeader title="Add a node" />
          <AutomationPalette pinnedIndicators={pinnedIndicators} onAdd={addNode} />
        </SheetContent>
      </Sheet>
      <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-[min(90vw,360px)] gap-0 p-0"
        >
          <SheetPanelHeader title="Automation inspector" />
          {inspector}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function useAutomationLayout(key: string) {
  const [defaultLayout, setDefaultLayout] = React.useState<Layout>()
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(key)
      setDefaultLayout(saved ? (JSON.parse(saved) as Layout) : undefined)
    } catch {
      setDefaultLayout(undefined)
    } finally {
      setLoaded(true)
    }
  }, [key])

  const onLayoutChanged = React.useCallback(
    (layout: Layout) => {
      if (!loaded) return
      try {
        localStorage.setItem(key, JSON.stringify(layout))
      } catch {
        // Storage may be blocked; resizing still works for this session.
      }
    },
    [key, loaded]
  )

  return {
    defaultLayout,
    onLayoutChanged,
    layoutKey: loaded ? JSON.stringify(defaultLayout ?? {}) : "loading",
  }
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
