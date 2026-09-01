/**
 * Deliberate Trade-owned fork of the shell automation editor. Recipes keep the
 * proven canvas save, drag, edge and panel behavior, while omitting shell runs,
 * templates, member tests and scheduled automation controls.
 */
import * as React from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"
import { WorkflowIcon } from "lucide-react"

import BacktestCanvasPanel from "@/components/recipes/backtest-canvas-panel"
import FlowStatusHeader from "@/components/recipes/flow-status-header"
import { RecipeFlowCanvas } from "@/components/recipes/recipe-flow-canvas"
import { RecipeInspector } from "@/components/recipes/recipe-inspector"
import { RecipePalette } from "@/components/recipes/recipe-palette"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import type { SaveStatus } from "@/components/shell/sticky-header/sticky-header"
import type { AutomationGraph, AutomationNode } from "@/lib/automations/graph"
import {
  getRecipeErrorMessage,
  saveRecipe,
  type RecipeDetail,
} from "@/lib/api/trade/recipes"
import { useLastValue } from "@/lib/hooks/use-last-value"
import {
  useBlankSpaceDoubleClick,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import { useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { compileRecipeGraph } from "@/lib/recipes/compile"
import { createRecipeNode, recipeNodeName } from "@/lib/recipes/registry"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

import { nextNodePosition, type CanvasSize } from "./canvas-model"

const SAVE_DEBOUNCE_MS = 700
const HORIZONTAL_LAYOUT_KEY = "trade-recipe-editor-horizontal"

export function RecipeEditor({
  initial,
  openNode,
}: {
  initial: Pick<RecipeDetail, "id" | "name" | "graph">
  openNode?: string
}) {
  const { reportSaveStatus } = useShellRuntime()
  const [name] = React.useState(initial.name)
  const [graph, setGraph] = React.useState(initial.graph)
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(
    () => {
      if (!openNode) return null
      const found =
        initial.graph.nodes.find((node) => node.id === openNode) ??
        initial.graph.nodes.find((node) => node.kind === openNode)
      return found?.id ?? null
    }
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
  const [deleteTarget, setDeleteTarget] = React.useState<{
    nodeId: string
    name: string
    connectionCount: number
  } | null>(null)
  const deleteConfirmedRef = React.useRef(false)
  const closingDeleteTarget = useLastValue(deleteTarget)
  const [canvasSize, setCanvasSize] = React.useState<CanvasSize>({
    width: 0,
    height: 0,
  })
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle")
  const [backtestShut, setBacktestShut] = React.useState(false)

  const desktop = useWideScreen()
  const [paletteCollapsed, setPaletteCollapsed] = React.useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = React.useState(false)
  const graphRef = React.useRef(graph)
  const palettePanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const inspectorPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const horizontalLayout = useRememberedPanelLayout(HORIZONTAL_LAYOUT_KEY)
  const togglePalette = usePanelToggle(palettePanelRef)
  const toggleInspector = usePanelToggle(inspectorPanelRef)
  const paletteDoubleClick = useBlankSpaceDoubleClick(togglePalette)
  const inspectorDoubleClick = useBlankSpaceDoubleClick(toggleInspector)

  React.useEffect(() => {
    graphRef.current = graph
  }, [graph])

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
    if (serialized === lastSavedRef.current) return true
    if (!snapshot.name.trim()) {
      setSaveStatus("blocked")
      return false
    }

    const version = saveVersionRef.current + 1
    saveVersionRef.current = version
    setSaveStatus("saving")
    const save = saveQueueRef.current
      .catch(() => undefined)
      .then(() =>
        saveRecipe({
          recipeId: initial.id,
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
      if (version === saveVersionRef.current) setSaveStatus("saved")
      return true
    } catch (error) {
      if (version === saveVersionRef.current) setSaveStatus("idle")
      showErrorToast(getRecipeErrorMessage(error))
      return false
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
      const next = updater(graphRef.current)
      graphRef.current = next
      latestRef.current = { ...latestRef.current, graph: next }
      setGraph(next)
      scheduleSave()
    },
    [scheduleSave]
  )

  React.useEffect(() => {
    return () => {
      if (!saveTimerRef.current) return
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
      const snapshot = latestRef.current
      const serialized = serialize(snapshot.name, snapshot.graph)
      if (serialized === lastSavedRef.current || !snapshot.name.trim()) return
      void saveRecipe({
        recipeId: initial.id,
        name: snapshot.name,
        graph: snapshot.graph,
      }).catch(() => undefined)
    }
  }, [initial.id, serialize])

  React.useEffect(() => {
    if (saveStatus !== "saved") return
    const timer = setTimeout(() => setSaveStatus("idle"), 2000)
    return () => clearTimeout(timer)
  }, [saveStatus])

  React.useEffect(() => {
    reportSaveStatus(saveStatus)
  }, [reportSaveStatus, saveStatus])

  React.useEffect(() => {
    return () => reportSaveStatus(null)
  }, [reportSaveStatus])

  const compiled = React.useMemo(() => compileRecipeGraph(graph), [graph])
  const selectedNode =
    previewNode ??
    (selectedNodeId
      ? (graph.nodes.find((node) => node.id === selectedNodeId) ?? null)
      : null)
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
      changeGraph((current) => ({
        ...current,
        nodes: current.nodes.filter((node) => node.id !== nodeId),
        edges: current.edges.filter(
          (edge) => edge.from !== nodeId && edge.to !== nodeId
        ),
      }))
      setSelectedNodeId(null)
    },
    [changeGraph, previewNode?.id]
  )

  const requestDeleteNode = React.useCallback(
    (nodeId: string) => {
      if (nodeId === previewNode?.id) {
        deleteNode(nodeId)
        return
      }
      const node = graphRef.current.nodes.find((item) => item.id === nodeId)
      if (!node) return
      setDeleteTarget({
        nodeId,
        name: recipeNodeName(node),
        connectionCount: graphRef.current.edges.filter(
          (edge) => edge.from === nodeId || edge.to === nodeId
        ).length,
      })
      deleteConfirmedRef.current = false
    },
    [deleteNode, previewNode?.id]
  )

  const createNode = React.useCallback(
    (key: string) =>
      createRecipeNode(key, {
        id: crypto.randomUUID(),
        x: 0,
        y: 0,
      }),
    []
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
    },
    [canvasSize.width, changeGraph]
  )

  const addNode = React.useCallback(
    (key: string, position?: { x: number; y: number }) =>
      placeNode(createNode(key), position),
    [createNode, placeNode]
  )

  const inspector = (
    <RecipeInspector
      selectedNode={selectedNode}
      graph={graph}
      errors={compiled.errors}
      onNodeChange={updateNode}
      onAddNode={previewNode ? placeNode : undefined}
      onDeleteNode={requestDeleteNode}
    />
  )

  const canvas = (
    <RecipeFlowCanvas
      graph={graph}
      errors={compiled.errors}
      selectedNodeId={selectedNodeId}
      selectedEdgeId={selectedEdgeId}
      onGraphChange={(next) => changeGraph(() => next)}
      onSelectNode={(nodeId) => {
        setPreviewNode(null)
        setSelectedNodeId(nodeId)
      }}
      onSelectEdge={setSelectedEdgeId}
      onDeleteNode={requestDeleteNode}
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

  const canvasHeader = (
    <DashboardCardTitleHeader
      icon={<WorkflowIcon className="size-4" />}
      back={{ to: "/admin/recipes", label: "Back to recipes" }}
      title={name}
      action={
        <FlowStatusHeader automationId={initial.id} beforeRun={saveNow} />
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
        <WorkspacePanel
          collapsed={paletteCollapsed}
          onDoubleClick={paletteDoubleClick}
        >
          <RecipePalette
            onSelect={previewPaletteNode}
            onAdd={addNode}
            onDragStart={setDraggedNodeKey}
            onDragEnd={() => setDraggedNodeKey(null)}
          />
        </WorkspacePanel>
      </ResizablePanel>
      <ResizableHandle gap collapsed={paletteCollapsed} />
      <ResizablePanel id="canvas" defaultSize="60%" minSize="30%">
        <WorkspacePanel className="flex flex-col">
          {canvasHeader}
          <div className="relative flex min-h-0 flex-1">
            {canvas}
            {backtestShut ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="absolute top-3 right-3 z-10 shadow-sm"
                onClick={() => setBacktestShut(false)}
              >
                Backtest
              </Button>
            ) : (
              <div className="absolute top-3 right-3 z-10 w-80 max-w-[calc(100%-1.5rem)]">
                <BacktestCanvasPanel
                  automationId={initial.id}
                  runId={null}
                  onClose={() => setBacktestShut(true)}
                  beforeRun={saveNow}
                />
              </div>
            )}
            {paletteCollapsed ? (
              <PanelReopenTab
                side="left"
                label="Show recipe steps"
                onClick={togglePalette}
              />
            ) : null}
            {inspectorCollapsed ? (
              <PanelReopenTab
                side="right"
                label="Show recipe settings"
                onClick={toggleInspector}
              />
            ) : null}
          </div>
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
        <WorkspacePanel
          collapsed={inspectorCollapsed}
          onDoubleClick={inspectorDoubleClick}
        >
          {inspector}
        </WorkspacePanel>
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    <WorkspacePanel className="flex min-w-0 flex-1 flex-col">
      {canvasHeader}
      {canvas}
    </WorkspacePanel>
  )

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ gap: pageGutter }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !previewNode) return
        deleteNode(previewNode.id)
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col">{workspace}</div>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={
          closingDeleteTarget
            ? `Delete "${closingDeleteTarget.name}"?`
            : "Delete this step?"
        }
        description={
          closingDeleteTarget
            ? closingDeleteTarget.connectionCount === 1
              ? "Its 1 connection goes with it. This cannot be undone."
              : `Its ${closingDeleteTarget.connectionCount} connections go with it. This cannot be undone.`
            : "Its connections go with it. This cannot be undone."
        }
        confirmLabel="Delete step"
        onCloseAutoFocus={(event) => {
          if (!deleteConfirmedRef.current) return
          event.preventDefault()
          deleteConfirmedRef.current = false
          document
            .querySelector<HTMLElement>('[aria-label="Recipe canvas"]')
            ?.focus()
        }}
        onConfirm={() => {
          if (!deleteTarget) return
          deleteConfirmedRef.current = true
          deleteNode(deleteTarget.nodeId)
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}
