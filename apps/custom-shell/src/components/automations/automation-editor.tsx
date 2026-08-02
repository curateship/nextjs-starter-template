import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import type { Layout, PanelImperativeHandle } from "react-resizable-panels"

import { AutomationActivityLog } from "@/components/automations/automation-activity-log"
import { AutomationFlowCanvas } from "@/components/automations/automation-flow-canvas"
import { AutomationInspector } from "@/components/automations/automation-inspector"
import { AutomationPalette } from "@/components/automations/automation-palette"
import { useShellRuntime } from "@/components/shell/shell-layout"
import {
  BOTTOM_COLLAPSED_HEIGHT,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { compileAutomationGraph } from "@/lib/automations/compile"
import type { AutomationGraph, AutomationNode } from "@/lib/automations/graph"
import {
  automationNodeName,
  automationPaletteKeyForNode,
  createAutomationNode,
} from "@/lib/automations/node-registry"
import {
  getAutomationErrorMessage,
  saveAutomation,
  saveAutomationFavorites,
  type AutomationDetail,
} from "@/lib/api/automations"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { useEffectBeforePaint } from "@/lib/use-effect-before-paint"
import { useWideScreen } from "@/lib/wide-screen"
import { cn } from "@/lib/utils"
import type { SaveStatus } from "@/pages/dashboard/sticky-header/sticky-header"

import { nextNodePosition, type CanvasSize } from "./canvas-model"
import { appendAutomationLog, type AutomationLogEntry } from "./automation-log"

// Same debounce as the shell's settings auto-save, so editing an automation
// saves on the rhythm every other editable surface in this app uses.
const SAVE_DEBOUNCE_MS = 700

export function AutomationEditor({
  initial,
  initialFavoriteNodeKeys,
}: {
  initial: AutomationDetail
  initialFavoriteNodeKeys: string[]
}) {
  const { reportSaveStatus } = useShellRuntime()
  // Nothing on this page renames an automation any more, so the name is only
  // ever the one it loaded with — but it still has to ride along on every save,
  // or the record would be written back without it.
  const [name] = React.useState(initial.name)
  const [graph, setGraph] = React.useState(initial.graph)
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(
    null
  )
  const [previewNode, setPreviewNode] = React.useState<AutomationNode | null>(
    null
  )
  const [draggedNodeKey, setDraggedNodeKey] = React.useState<string | null>(
    null
  )
  const [selectedEdgeId, setSelectedEdgeId] = React.useState<string | null>(
    null
  )
  const [canvasSize, setCanvasSize] = React.useState<CanvasSize>({
    width: 0,
    height: 0,
  })
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle")
  // Known before the first render on both sides, so the editor opens in the
  // layout it is going to keep instead of painting the phone version — a
  // full-width canvas with no palette and no inspector — and rebuilding itself.
  const desktop = useWideScreen()
  const [paletteCollapsed, setPaletteCollapsed] = React.useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = React.useState(false)
  const [logEntries, setLogEntries] = React.useState<AutomationLogEntry[]>([])
  const [favoriteNodeKeys, setFavoriteNodeKeys] = React.useState(
    initialFavoriteNodeKeys
  )
  const [savingFavorites, setSavingFavorites] = React.useState(false)
  const graphRef = React.useRef(graph)
  const palettePanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const inspectorPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const logPanelRef = React.useRef<PanelImperativeHandle | null>(null)
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

  // ----- Auto-save (700ms debounce, serialized queue, version counter) -----
  // Mirrors the shell-layout config auto-save: edits schedule a debounced save
  // that runs on a serialized queue so rapid edits persist in order; an empty
  // name blocks the save and says so in the top bar instead of failing silently.
  const serialize = React.useCallback(
    (nextName: string, nextGraph: AutomationGraph) =>
      JSON.stringify({ name: nextName, graph: nextGraph }),
    []
  )
  const lastSavedRef = React.useRef(serialize(initial.name, initial.graph))
  const latestRef = React.useRef({ name, graph })
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveQueueRef = React.useRef(Promise.resolve())
  const saveVersionRef = React.useRef(0)

  const saveNow = React.useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const snapshot = latestRef.current
    const serialized = serialize(snapshot.name, snapshot.graph)
    if (serialized === lastSavedRef.current) return
    if (!snapshot.name.trim()) {
      setSaveStatus("blocked")
      return
    }

    const version = saveVersionRef.current + 1
    saveVersionRef.current = version
    setSaveStatus("saving")

    const save = saveQueueRef.current
      .catch(() => undefined)
      .then(() =>
        saveAutomation({
          automationId: initial.id,
          name: snapshot.name,
          graph: snapshot.graph,
        })
      )
    saveQueueRef.current = save.then(
      () => undefined,
      () => undefined
    )

    try {
      await save
      lastSavedRef.current = serialized
      if (version === saveVersionRef.current) {
        setSaveStatus("saved")
      }
    } catch (error) {
      if (version === saveVersionRef.current) {
        setSaveStatus("idle")
        showErrorToast(getAutomationErrorMessage(error))
      }
    }
  }, [initial.id, serialize])

  const scheduleSave = React.useCallback(() => {
    dismissErrorToast()
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void saveNow()
    }, SAVE_DEBOUNCE_MS)
  }, [saveNow])

  const changeGraph = React.useCallback(
    (updater: (current: AutomationGraph) => AutomationGraph) => {
      // Computed eagerly from the ref, not inside a functional setState: the
      // refs must update synchronously (the save snapshot reads them), and a
      // setState updater must stay pure — React may run it twice.
      const next = updater(graphRef.current)
      graphRef.current = next
      latestRef.current = { ...latestRef.current, graph: next }
      setGraph(next)
      scheduleSave()
    },
    [scheduleSave]
  )

  // Flush a pending edit if the editor unmounts (navigation) so a debounced
  // change isn't dropped. Fire-and-forget — the component is going away.
  React.useEffect(() => {
    return () => {
      if (!saveTimerRef.current) return
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
      const snapshot = latestRef.current
      const serialized = serialize(snapshot.name, snapshot.graph)
      if (serialized === lastSavedRef.current || !snapshot.name.trim()) return
      void saveAutomation({
        automationId: initial.id,
        name: snapshot.name,
        graph: snapshot.graph,
      }).catch(() => undefined)
    }
  }, [initial.id, serialize])

  // The "Saved" badge clears itself the way the shared header's does.
  React.useEffect(() => {
    if (saveStatus !== "saved") return
    const timer = setTimeout(() => setSaveStatus("idle"), 2000)
    return () => clearTimeout(timer)
  }, [saveStatus])

  // This editor has no bar of its own, so its saving is reported in the sticky
  // header alongside every other auto-save in the app. Clearing on the way out
  // matters: without it "Saved" would still be sitting there on the next page.
  React.useEffect(() => {
    reportSaveStatus(saveStatus)
  }, [reportSaveStatus, saveStatus])

  React.useEffect(() => {
    return () => reportSaveStatus(null)
  }, [reportSaveStatus])

  const compiled = React.useMemo(() => compileAutomationGraph(graph), [graph])
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
      changeGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === nextNode.id ? nextNode : node
        ),
      }))
    },
    [changeGraph, previewNode?.id]
  )

  const deleteNode = React.useCallback(
    (nodeId: string) => {
      if (nodeId === previewNode?.id) {
        setPreviewNode(null)
        return
      }
      const node = graphRef.current.nodes.find((item) => item.id === nodeId)
      changeGraph((current) => ({
        ...current,
        nodes: current.nodes.filter((item) => item.id !== nodeId),
        edges: current.edges.filter(
          (edge) => edge.from !== nodeId && edge.to !== nodeId
        ),
      }))
      setSelectedNodeId(null)
      record(`Deleted ${node ? automationNodeName(node) : "node"}.`)
    },
    [changeGraph, previewNode?.id, record]
  )

  const createNode = React.useCallback(
    (key: string) =>
      createAutomationNode(key, {
        id: crypto.randomUUID(),
        x: 0,
        y: 0,
      }),
    []
  )

  const toggleFavoriteNode = React.useCallback(
    async (key: string) => {
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
        showErrorToast(getAutomationErrorMessage(error))
      } finally {
        setSavingFavorites(false)
      }
    },
    [favoriteNodeKeys, savingFavorites]
  )

  const previewPaletteNode = React.useCallback(
    (key: string) => {
      setPreviewNode(createNode(key))
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      inspectorPanelRef.current?.expand()
    },
    [createNode]
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
      changeGraph((current) => ({
        ...current,
        nodes: [...current.nodes, placedNode],
      }))
      setPreviewNode(null)
      setSelectedNodeId(placedNode.id)
      setSelectedEdgeId(null)
      record(`Added ${automationNodeName(placedNode)}.`)
    },
    [canvasSize.width, changeGraph, record]
  )

  const addNode = React.useCallback(
    (key: string, position?: { x: number; y: number }) =>
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
      changeGraph(() => next)
    },
    [changeGraph, record]
  )

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
        <WorkspacePanel collapsed={paletteCollapsed}>
          <AutomationPalette
            favoriteNodeKeys={favoriteNodeKeys}
            onSelect={previewPaletteNode}
            onAdd={addNode}
            onDragStart={setDraggedNodeKey}
            onDragEnd={() => setDraggedNodeKey(null)}
          />
        </WorkspacePanel>
      </ResizablePanel>
      <ResizableHandle gap collapsed={paletteCollapsed} />
      <ResizablePanel id="canvas" defaultSize="60%" minSize="30%">
        <WorkspacePanel className="relative flex">
          {canvas}
          {paletteCollapsed ? (
            <PanelReopenTab side="left" label="Show node palette" onClick={togglePalette} />
          ) : null}
          {inspectorCollapsed ? (
            <PanelReopenTab side="right" label="Show inspector" onClick={toggleInspector} />
          ) : null}
        </WorkspacePanel>
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
        <WorkspacePanel collapsed={inspectorCollapsed}>{inspector}</WorkspacePanel>
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    // flex-1 and min-w-0 are load-bearing: this sits in a flex row, and without
    // a width to fill it shrinks to its content — the canvas has no width of
    // its own, so the whole panel collapsed to its two border edges and read as
    // a stray line down the page.
    <WorkspacePanel className="flex min-w-0 flex-1">{canvas}</WorkspacePanel>
  )

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ gap: "var(--shell-gutter, 0.75rem)" }}
      onKeyDown={(event) => {
        // Escape backs out of a node picked in the palette but not yet added.
        // It calls what the panel's Cancel button calls, so there is one way to
        // back out rather than two that could drift apart. It lives out here
        // because the key can arrive from the palette card you just clicked as
        // easily as from the panel itself.
        if (event.key !== "Escape" || !previewNode) return
        deleteNode(previewNode.id)
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <ResizablePanelGroup
          key={verticalLayout.layoutKey}
          orientation="vertical"
          className="min-h-0 flex-1"
          defaultLayout={verticalLayout.defaultLayout}
          onLayoutChanged={verticalLayout.onLayoutChanged}
        >
          <ResizablePanel id="workspace" defaultSize="78%" minSize="40%">
            <div className="flex h-full min-h-0">{workspace}</div>
          </ResizablePanel>
          {/* Keeps its gap even while the log is collapsed — the collapsed bar
              is still a panel on screen, and this handle is what makes it
              draggable back open. */}
          <ResizableHandle gap />
          <ResizablePanel
            id="activity-log"
            panelRef={logPanelRef}
            defaultSize="22%"
            minSize="12%"
            maxSize="45%"
            // Dragging the divider all the way down collapses the log to its
            // own header bar. It never unmounts, so it can always be dragged
            // back open.
            collapsible
            collapsedSize={BOTTOM_COLLAPSED_HEIGHT}
          >
            <WorkspacePanel>
              <AutomationActivityLog entries={logEntries} />
            </WorkspacePanel>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

    </div>
  )
}

function useAutomationLayout(key: string) {
  const [defaultLayout, setDefaultLayout] = React.useState<Layout>()
  const [loaded, setLoaded] = React.useState(false)

  useEffectBeforePaint(() => {
    // localStorage is only readable after hydration, so the saved layout has
    // to land via state — the same pattern the trading editor uses. Before the
    // paint, so the panel groups are keyed once and never rebuilt on screen.
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

/**
 * A slim tab on the canvas edge shown while a side panel is collapsed, so
 * reopening is discoverable right where the panel disappeared (the bottom-bar
 * toggles still work too). The arrow points toward where the panel opens.
 */
function PanelReopenTab({
  side,
  label,
  onClick,
}: {
  side: "left" | "right"
  label: string
  onClick: () => void
}) {
  const Icon = side === "left" ? ChevronRightIcon : ChevronLeftIcon
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "absolute top-1/2 z-10 flex h-14 w-5 -translate-y-1/2 items-center justify-center border border-foreground/10 bg-card text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        side === "left"
          ? "left-0 rounded-r-lg border-l-0"
          : "right-0 rounded-l-lg border-r-0"
      )}
    >
      <Icon className="size-4" />
    </button>
  )
}
