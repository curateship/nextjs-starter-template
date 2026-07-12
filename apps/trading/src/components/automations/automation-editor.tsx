import * as React from "react"
import { ChevronsUpIcon, XIcon } from "lucide-react"
import type { Layout } from "react-resizable-panels"

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
} from "@/components/ui/resizable"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  compileAutomationGraph,
  type AutomationGraph,
  type AutomationNode,
  type AutomationProtection,
} from "@/lib/automations/automation"
import { saveAutomation, type AutomationDetail } from "@/lib/api/automations"
import {
  INDICATORS,
  type IndicatorId,
  type IndicatorParamValue,
} from "@/lib/indicators/registry"
import type { StrategyInterval } from "@/lib/strategies/kinds/contract"

import {
  clampZoom,
  fitViewport,
  nextNodePosition,
  type CanvasSize,
} from "./canvas-model"
import { appendAutomationLog, type AutomationLogEntry } from "./automation-log"
import { automationNodeName } from "./node-labels"

export function AutomationEditor({
  initial,
  pinnedIndicators,
  indicatorParamSeeds,
  onQuickTest,
  onCreateBot,
  onCreateBacktest,
}: {
  initial: AutomationDetail
  pinnedIndicators: IndicatorId[]
  /** Per-indicator starting params (e.g. the chart's saved Price Action
   * settings) a new node copies instead of the module defaults. */
  indicatorParamSeeds?: Partial<
    Record<IndicatorId, Record<string, IndicatorParamValue>>
  >
  onQuickTest?: () => void
  onCreateBot?: () => void
  onCreateBacktest?: () => void
}) {
  const [name, setName] = React.useState(initial.name)
  const [interval, setInterval] = React.useState<StrategyInterval>(
    initial.interval
  )
  const [graph, setGraph] = React.useState(initial.graph)
  const [protection, setProtection] = React.useState(initial.protection)
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
  const [logOpen, setLogOpen] = React.useState(true)
  const [logEntries, setLogEntries] = React.useState<AutomationLogEntry[]>([])
  const graphRef = React.useRef(graph)
  const horizontalLayout = useAutomationLayout("automation-editor-horizontal")
  const verticalLayout = useAutomationLayout("automation-editor-vertical")

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
      nextInterval: StrategyInterval,
      nextGraph: AutomationGraph,
      nextProtection: AutomationProtection
    ) =>
      JSON.stringify({
        name: nextName,
        interval: nextInterval,
        graph: nextGraph,
        protection: nextProtection,
      }),
    []
  )
  const [lastSaved, setLastSaved] = React.useState(() =>
    serialize(initial.name, initial.interval, initial.graph, initial.protection)
  )

  React.useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)")
    const update = () => setDesktop(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  const compiled = React.useMemo(
    () => compileAutomationGraph({ interval, graph, protection }),
    [graph, interval, protection]
  )
  const currentSerialized = serialize(name, interval, graph, protection)
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

  const zoomBy = React.useCallback(
    (factor: number) => {
      setGraph((current) => {
        const zoom = clampZoom(current.viewport.zoom * factor)
        const anchorX = (canvasSize.width || 800) / 2
        const anchorY = (canvasSize.height || 560) / 2
        return {
          ...current,
          viewport: {
            zoom,
            x:
              anchorX -
              (anchorX - current.viewport.x) * (zoom / current.viewport.zoom),
            y:
              anchorY -
              (anchorY - current.viewport.y) * (zoom / current.viewport.zoom),
          },
        }
      })
    },
    [canvasSize.height, canvasSize.width]
  )

  const handleSave = React.useCallback(async () => {
    if (saving) return
    setSaving(true)
    setSaveError(null)
    const payload = { name, interval, graph, protection }
    try {
      const saved = await saveAutomation({
        automationId: initial.id,
        ...payload,
      })
      setName(saved.name)
      setInterval(saved.interval)
      setGraph(saved.graph)
      setProtection(saved.protection)
      setLastSaved(
        serialize(saved.name, saved.interval, saved.graph, saved.protection)
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
    graph,
    initial.id,
    interval,
    name,
    protection,
    record,
    saving,
    serialize,
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
        defaultSize="18%"
        minSize="14%"
        maxSize="26%"
      >
        <AutomationPalette pinnedIndicators={pinnedIndicators} onAdd={addNode} />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="canvas" defaultSize="58%" minSize="35%">
        <div className="flex h-full min-h-0">{canvas}</div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel
        id="inspector"
        defaultSize="24%"
        minSize="18%"
        maxSize="34%"
      >
        {inspector}
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    <div className="flex h-full min-h-0">{canvas}</div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <AutomationToolbar
        name={name}
        zoom={graph.viewport.zoom}
        runnable={compiled.config !== null && !dirty && !saving}
        dirty={dirty}
        saving={saving}
        onNameChange={setName}
        onOpenSettings={() => setSettingsOpen(true)}
        onZoomOut={() => zoomBy(1 / 1.2)}
        onZoomIn={() => zoomBy(1.2)}
        onFit={() =>
          setGraph((current) => ({
            ...current,
            viewport: fitViewport(
              current.nodes,
              canvasSize.width || 800,
              canvasSize.height || 560
            ),
          }))
        }
        logOpen={logOpen}
        onToggleLog={() => setLogOpen((open) => !open)}
        onSave={() => void handleSave()}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenInspector={() => setInspectorOpen(true)}
        onQuickTest={
          onQuickTest
            ? () => {
                record("Opened Quick Test.")
                onQuickTest()
              }
            : undefined
        }
        onCreateBot={onCreateBot}
        onCreateBacktest={onCreateBacktest}
      />
      {saveError ? (
        <div
          role="alert"
          className="border-b bg-destructive/10 px-4 py-1.5 text-xs text-destructive"
        >
          {saveError}
        </div>
      ) : null}

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
        {logOpen ? <ResizableHandle withHandle /> : null}
        {logOpen ? (
          <ResizablePanel
            id="activity-log"
            defaultSize="22%"
            minSize="12%"
            maxSize="45%"
          >
            <AutomationActivityLog
              entries={logEntries}
              onCollapse={() => setLogOpen(false)}
            />
          </ResizablePanel>
        ) : null}
      </ResizablePanelGroup>
      {!logOpen ? (
        <div className="flex min-h-10 shrink-0 items-center border-t bg-background p-4">
          <span className="text-xs font-semibold tracking-wide uppercase">
            Activity log
          </span>
          <span className="ml-2 text-xs text-muted-foreground">
            {logEntries.length} {logEntries.length === 1 ? "event" : "events"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            aria-label="Expand activity log"
            onClick={() => setLogOpen(true)}
          >
            <ChevronsUpIcon className="size-4" />
          </Button>
        </div>
      ) : null}

      <AutomationCanvasSettingsDialog
        open={settingsOpen}
        interval={interval}
        protection={protection}
        onOpenChange={setSettingsOpen}
        onApply={(settings) => {
          setInterval(settings.interval)
          setProtection(settings.protection)
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
