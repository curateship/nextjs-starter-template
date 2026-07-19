import * as React from "react"
import { ChevronsUpIcon, XIcon } from "lucide-react"
import type { Layout, PanelImperativeHandle } from "react-resizable-panels"
import { toast } from "sonner"

import { AutomationActivityLog } from "@/components/automations/automation-activity-log"
import { AutomationFlowCanvas } from "@/components/automations/automation-flow-canvas"
import { AutomationInspector } from "@/components/automations/automation-inspector"
import { AutomationPalette } from "@/components/automations/automation-palette"
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
  type AutomationGraph,
  type AutomationNode,
} from "@/lib/automations/automation"
import {
  getAutomationErrorMessage,
  saveAutomation,
  saveAutomationFavorites,
  setAutomationStatus,
  type AutomationDetail,
  type AutomationStatus,
} from "@/lib/api/automations"
import {
  automationPaletteKeyForNode,
  type AutomationPaletteKey,
} from "@/lib/automations/palette"
import {
  automationNodeName,
  createAutomationNode,
} from "@/lib/automations/node-registry"

import { nextNodePosition, type CanvasSize } from "./canvas-model"
import { appendAutomationLog, type AutomationLogEntry } from "./automation-log"
import { AutomationPanelToggles } from "./automation-panel-toggles"

export function AutomationEditor({
  initial,
  initialFavoriteNodeKeys,
}: {
  initial: AutomationDetail
  initialFavoriteNodeKeys: AutomationPaletteKey[]
}) {
  const [name, setName] = React.useState(initial.name)
  const [status, setStatus] = React.useState<AutomationStatus>(initial.status)
  const [graph, setGraph] = React.useState(initial.graph)
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
  const [statusBusy, setStatusBusy] = React.useState(false)
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
    (nextName: string, nextGraph: AutomationGraph) =>
      JSON.stringify({ name: nextName, graph: nextGraph }),
    []
  )
  const [lastSaved, setLastSaved] = React.useState(() =>
    serialize(initial.name, initial.graph)
  )

  React.useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)")
    const update = () => setDesktop(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  const compiled = React.useMemo(() => compileAutomationGraph(graph), [graph])
  const currentSerialized = serialize(name, graph)
  const dirty = currentSerialized !== lastSaved
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
    if (saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await saveAutomation({
        automationId: initial.id,
        name,
        graph,
      })
      setName(saved.name)
      setStatus(saved.status)
      setGraph(saved.graph)
      setLastSaved(serialize(saved.name, saved.graph))
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
  }, [graph, initial.id, name, record, saving, serialize])

  const handleToggleStatus = React.useCallback(async () => {
    if (statusBusy) return
    const nextStatus: AutomationStatus =
      status === "active" ? "paused" : "active"
    setStatusBusy(true)
    try {
      const saved = await setAutomationStatus(initial.id, nextStatus)
      setStatus(saved.status)
      record(
        saved.status === "active"
          ? "Activated — new contacts will enroll."
          : "Paused — no new contacts will enroll."
      )
    } catch (error) {
      toast.error(getAutomationErrorMessage(error))
    } finally {
      setStatusBusy(false)
    }
  }, [initial.id, record, status, statusBusy])

  const inspector = (
    <AutomationInspector
      selectedNode={selectedNode}
      errors={compiled.errors}
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
  const canvas = (
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
            favoriteNodeKeys={favoriteNodeKeys}
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
        status={status}
        runnable={compiled.config !== null && !dirty && !saving}
        dirty={dirty}
        saving={saving}
        statusBusy={statusBusy}
        onNameChange={setName}
        onSave={() => void handleSave()}
        onToggleStatus={() => void handleToggleStatus()}
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
          <div
            data-slot="workspace-panel"
            className="flex min-h-10 shrink-0 items-center rounded-xl border border-foreground/5 bg-card px-4 py-2"
          >
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

      <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[min(90vw,320px)] gap-0 p-0"
        >
          <SheetPanelHeader title="Add a node" />
          <AutomationPalette
            favoriteNodeKeys={favoriteNodeKeys}
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
    // localStorage is only readable after hydration, so the saved layout has
    // to land via state — the same pattern the trading editor uses.
    try {
      const saved = localStorage.getItem(key)
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
