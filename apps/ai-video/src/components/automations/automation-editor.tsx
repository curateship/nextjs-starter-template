import * as React from "react"
import { ChevronsUpIcon, Loader2Icon, XIcon } from "lucide-react"
import type { Layout, PanelImperativeHandle } from "react-resizable-panels"
import { toast } from "sonner"

import { AutomationFlowCanvas } from "@/components/automations/automation-flow-canvas"
import { AutomationInspector } from "@/components/automations/automation-inspector"
import { AutomationPalette } from "@/components/automations/automation-palette"
import { AutomationRunsPanel } from "@/components/automations/automation-runs-panel"
import { AutomationToolbar } from "@/components/automations/automation-toolbar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
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
  cancelAutomationRun,
  decideAutomationRunApproval,
  getAutomationErrorMessage,
  getAutomationRun,
  listAutomationRuns,
  runAutomation,
  saveAutomation,
  type AutomationEditorData,
  type AutomationRunDetail,
  type AutomationRunSummary,
} from "@/lib/api/automations"
import {
  validateAutomationGraph,
  type AutomationGraph,
  type AutomationNode,
} from "@/lib/automations/automation"
import {
  createAutomationNode,
  type AutomationPaletteKey,
} from "@/lib/automations/node-registry"

import { nextNodePosition, type CanvasSize } from "./canvas-model"
import { AutomationPanelToggles } from "./automation-panel-toggles"
import type { AutomationNodeRunStatus } from "./automation-canvas-node"

const RUN_POLL_MS = 2_000

// Live = the worker is moving it, so poll. A run parked at an approval
// checkpoint can sit for days; polling it would be pure waste.
function isLiveStatus(status: AutomationRunSummary["status"]) {
  return status === "queued" || status === "running"
}

// Active = this automation's one in-flight run, parked or not. Drives the
// toolbar's Cancel run button.
function isActiveStatus(status: AutomationRunSummary["status"]) {
  return isLiveStatus(status) || status === "waiting_approval"
}

export function AutomationEditor({ initial }: { initial: AutomationEditorData }) {
  const automationId = initial.automation.id
  const [name, setName] = React.useState(initial.automation.name)
  const [enabled, setEnabled] = React.useState(initial.automation.enabled)
  const [graph, setGraph] = React.useState(initial.automation.graph)
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
  const [saving, setSaving] = React.useState(false)
  const [running, setRunning] = React.useState(false)
  const [canceling, setCanceling] = React.useState(false)
  const [deciding, setDeciding] = React.useState(false)
  const [rejectRunId, setRejectRunId] = React.useState<string | null>(null)
  const [desktop, setDesktop] = React.useState(false)
  const [paletteCollapsed, setPaletteCollapsed] = React.useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = React.useState(false)
  const [runsOpen, setRunsOpen] = React.useState(true)
  const [runs, setRuns] = React.useState<AutomationRunSummary[]>(
    initial.latest_run ? [initial.latest_run.run] : []
  )
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(
    initial.latest_run?.run.id ?? null
  )
  const [selectedRunDetail, setSelectedRunDetail] =
    React.useState<AutomationRunDetail | null>(initial.latest_run)
  const graphRef = React.useRef(graph)
  const palettePanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const inspectorPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const horizontalLayout = useAutomationLayout("automation-editor-horizontal")
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

  React.useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)")
    const update = () => setDesktop(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  // Full run history loads after mount; the route loader only carries the
  // latest run so the canvas can badge immediately.
  React.useEffect(() => {
    let active = true
    listAutomationRuns(automationId)
      .then((response) => {
        if (active) setRuns(response.runs)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [automationId])

  // Poll the active run while one is live; the worker advances it
  // server-side, this only refreshes what the panel and badges show. (The
  // partial unique index means at most one run is ever live.)
  const liveRunId =
    runs.find((run) => isLiveStatus(run.status))?.id ?? null
  React.useEffect(() => {
    if (!liveRunId) return
    const timer = setInterval(() => {
      getAutomationRun(liveRunId)
        .then((detail) => {
          setRuns((current) =>
            current.map((run) => (run.id === detail.run.id ? detail.run : run))
          )
          setSelectedRunDetail((current) =>
            current && current.run.id === detail.run.id ? detail : current
          )
        })
        .catch(() => undefined)
    }, RUN_POLL_MS)
    return () => clearInterval(timer)
  }, [liveRunId])

  const serialize = React.useCallback(
    (nextName: string, nextEnabled: boolean, nextGraph: AutomationGraph) =>
      JSON.stringify({ name: nextName, enabled: nextEnabled, graph: nextGraph }),
    []
  )
  const [lastSaved, setLastSaved] = React.useState(() =>
    serialize(
      initial.automation.name,
      initial.automation.enabled,
      initial.automation.graph
    )
  )

  const errors = React.useMemo(() => validateAutomationGraph(graph), [graph])
  const dirty = serialize(name, enabled, graph) !== lastSaved
  const activeRun = runs.find((run) => isActiveStatus(run.status)) ?? null

  const selectedNode =
    previewNode ??
    (selectedNodeId
      ? (graph.nodes.find((node) => node.id === selectedNodeId) ?? null)
      : null)

  const nodeStatuses = React.useMemo(() => {
    if (!selectedRunDetail) return undefined
    const statuses: Record<string, AutomationNodeRunStatus> = {}
    for (const step of selectedRunDetail.steps) {
      statuses[step.node_id] = step.status
    }
    return statuses
  }, [selectedRunDetail])

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
      setGraph((current) => ({
        ...current,
        nodes: current.nodes.filter((item) => item.id !== nodeId),
        edges: current.edges.filter(
          (edge) => edge.from !== nodeId && edge.to !== nodeId
        ),
      }))
      setSelectedNodeId(null)
    },
    [previewNode?.id]
  )

  const previewPaletteNode = React.useCallback(
    (key: AutomationPaletteKey) => {
      setPreviewNode(
        createAutomationNode(key, { id: crypto.randomUUID(), x: 0, y: 0 })
      )
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setPaletteOpen(false)
      if (desktop) inspectorPanelRef.current?.expand()
      else setInspectorOpen(true)
    },
    [desktop]
  )

  const placeNode = React.useCallback(
    (node: AutomationNode, position?: { x: number; y: number }) => {
      const { x, y } =
        position ??
        nextNodePosition(
          graphRef.current.nodes.length,
          graphRef.current.viewport,
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
    },
    [canvasSize.width]
  )

  const addNode = React.useCallback(
    (key: AutomationPaletteKey, position?: { x: number; y: number }) =>
      placeNode(
        createAutomationNode(key, { id: crypto.randomUUID(), x: 0, y: 0 }),
        position
      ),
    [placeNode]
  )

  const selectCanvasNode = React.useCallback((nodeId: string | null) => {
    setPreviewNode(null)
    setSelectedNodeId(nodeId)
  }, [])

  const handleSave = React.useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      const saved = await saveAutomation({
        automationId,
        name,
        graph,
        enabled,
      })
      setName(saved.name)
      setEnabled(saved.enabled)
      setGraph(saved.graph)
      setLastSaved(serialize(saved.name, saved.enabled, saved.graph))
      if (saved.validation_errors.length > 0) {
        toast.warning("Saved draft with validation issues.")
      }
    } catch (error) {
      toast.error(getAutomationErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }, [automationId, enabled, graph, name, saving, serialize])

  const handleRun = React.useCallback(async () => {
    if (running) return
    setRunning(true)
    try {
      const detail = await runAutomation(automationId)
      setSelectedRunDetail(detail)
      setSelectedRunId(detail.run.id)
      setRuns((current) => [
        detail.run,
        ...current.filter((run) => run.id !== detail.run.id),
      ])
      setRunsOpen(true)
    } catch (error) {
      toast.error(getAutomationErrorMessage(error))
    } finally {
      setRunning(false)
    }
  }, [automationId, running])

  const handleCancelRun = React.useCallback(async () => {
    if (!activeRun || canceling) return
    setCanceling(true)
    try {
      const detail = await cancelAutomationRun(activeRun.id)
      setSelectedRunDetail(detail)
      setSelectedRunId(detail.run.id)
      setRuns((current) =>
        current.map((run) => (run.id === detail.run.id ? detail.run : run))
      )
    } catch (error) {
      toast.error(getAutomationErrorMessage(error))
    } finally {
      setCanceling(false)
    }
  }, [activeRun, canceling])

  const selectRun = React.useCallback((runId: string) => {
    setSelectedRunId(runId)
    getAutomationRun(runId)
      .then(setSelectedRunDetail)
      .catch((error) => toast.error(getAutomationErrorMessage(error)))
  }, [])

  const decideApproval = React.useCallback(
    async (runId: string, approved: boolean) => {
      if (deciding) return
      setDeciding(true)
      try {
        const detail = await decideAutomationRunApproval(runId, approved)
        setSelectedRunDetail(detail)
        setSelectedRunId(detail.run.id)
        setRuns((current) =>
          current.map((run) => (run.id === detail.run.id ? detail.run : run))
        )
        setRejectRunId(null)
        toast.success(
          approved
            ? "Approved — the run is continuing."
            : "Rejected — the run stopped here."
        )
      } catch (error) {
        toast.error(getAutomationErrorMessage(error))
        // The run moved on without us (timed out, canceled, already decided);
        // pull the truth back into both the list and the detail so the panel
        // stops offering the buttons and the two stop disagreeing.
        getAutomationRun(runId)
          .then((detail) => {
            setSelectedRunDetail(detail)
            setRuns((current) =>
              current.map((run) =>
                run.id === detail.run.id ? detail.run : run
              )
            )
          })
          .catch(() => undefined)
      } finally {
        setDeciding(false)
      }
    },
    [deciding]
  )

  const runDisabledReason = dirty
    ? "Save your changes first."
    : errors.length > 0
      ? errors[0].message
      : undefined

  const inspector = (
    <AutomationInspector
      selectedNode={selectedNode}
      isPreview={Boolean(previewNode)}
      errors={errors}
      creators={initial.creators}
      onNodeChange={updateNode}
      onAddNode={placeNode}
      onDeleteNode={deleteNode}
    />
  )
  const canvas = (
    <AutomationFlowCanvas
      graph={graph}
      errors={errors}
      selectedNodeId={selectedNodeId}
      selectedEdgeId={selectedEdgeId}
      nodeStatuses={nodeStatuses}
      onGraphChange={setGraph}
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
          <AutomationPalette
            onSelect={previewPaletteNode}
            onAdd={addNode}
            onDragStart={setDraggedNodeKey}
            onDragEnd={() => setDraggedNodeKey(null)}
          />
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
    <div className="flex h-full min-h-0 flex-col bg-muted/60">
      <AutomationToolbar
        name={name}
        enabled={enabled}
        dirty={dirty}
        saving={saving}
        runnable={!dirty && !saving && !running && errors.length === 0}
        runDisabledReason={runDisabledReason}
        runActive={Boolean(activeRun)}
        canceling={canceling}
        onNameChange={setName}
        onEnabledChange={setEnabled}
        onSave={() => void handleSave()}
        onRun={() => void handleRun()}
        onCancelRun={() => void handleCancelRun()}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenInspector={() => setInspectorOpen(true)}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-[var(--shell-gutter,0.75rem)] p-[var(--shell-gutter,0.75rem)]">
        <ResizablePanelGroup
          key={`${runsOpen ? "runs-open" : "runs-closed"}-${verticalLayout.layoutKey}`}
          orientation="vertical"
          className="min-h-0 flex-1"
          defaultLayout={runsOpen ? verticalLayout.defaultLayout : undefined}
          onLayoutChanged={runsOpen ? verticalLayout.onLayoutChanged : undefined}
        >
          <ResizablePanel id="workspace" defaultSize="78%" minSize="40%">
            <div className="flex h-full min-h-0">{workspace}</div>
          </ResizablePanel>
          {runsOpen ? <ResizableHandle gap /> : null}
          {runsOpen ? (
            <ResizablePanel
              id="runs"
              defaultSize="22%"
              minSize="12%"
              maxSize="45%"
            >
              <WorkspacePanel>
                <AutomationRunsPanel
                  runs={runs}
                  selectedRun={selectedRunDetail}
                  selectedRunId={selectedRunId}
                  deciding={deciding}
                  onSelectRun={selectRun}
                  onApproveRun={(runId) => void decideApproval(runId, true)}
                  onRejectRun={setRejectRunId}
                  onCollapse={() => setRunsOpen(false)}
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
        {!runsOpen ? (
          <div className="flex min-h-10 shrink-0 items-center rounded-xl border border-foreground/5 bg-card px-4 py-2">
            <span className="text-xs font-semibold tracking-wide uppercase">
              Runs
            </span>
            <span className="ml-2 text-xs text-muted-foreground">
              {runs.length} {runs.length === 1 ? "run" : "runs"}
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
                aria-label="Expand runs panel"
                onClick={() => setRunsOpen(true)}
              >
                <ChevronsUpIcon className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <Dialog
        open={Boolean(rejectRunId)}
        onOpenChange={(open) => {
          if (!open && !deciding) setRejectRunId(null)
        }}
      >
        <DialogContent variant="admin" showCloseButton={!deciding}>
          <DialogHeader>
            <DialogTitle>Reject this run?</DialogTitle>
            <DialogDescription>
              The run stops at the checkpoint and every step after it is
              skipped. Anything earlier steps already created is kept. To try
              again, start a new run.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              disabled={deciding}
              onClick={() => setRejectRunId(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deciding}
              onClick={() =>
                rejectRunId && void decideApproval(rejectRunId, false)
              }
            >
              {deciding ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              {deciding ? "Rejecting" : "Reject run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[min(90vw,320px)] gap-0 p-0"
        >
          <SheetPanelHeader title="Add a node" />
          <AutomationPalette
            onSelect={previewPaletteNode}
            onAdd={addNode}
            onDragStart={setDraggedNodeKey}
            onDragEnd={() => setDraggedNodeKey(null)}
          />
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
