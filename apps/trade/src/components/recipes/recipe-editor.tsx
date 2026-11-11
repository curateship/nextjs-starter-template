/**
 * Deliberate Trade-owned fork of the shell automation editor. Recipes keep the
 * proven canvas save, drag, edge and inspector behavior, while omitting shell
 * runs, templates, member tests and scheduled automation controls.
 *
 * On the Bots dashboard an opened recipe fills the middle as an open automation
 * does on the shell's Automations dashboard: the step list, then the canvas,
 * with the dashboard's page still on its left and the picked step's settings
 * on the right only while a step is picked (Tyler, 10 Nov 2026: "In recipes, I
 * want to put that back into the left panel, look at how automation dashboard
 * does it and copy its design pattern").
 */
import * as React from "react"
import { ArrowLeftIcon, FlaskConicalIcon, PanelLeftCloseIcon, PanelLeftDashedIcon } from "lucide-react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import BacktestCanvasPanel from "@/components/recipes/backtest-canvas-panel"
import FlowStatusHeader from "@/components/recipes/flow-status-header"
import { RecipeFlowCanvas } from "@/components/recipes/recipe-flow-canvas"
import { RecipeInspector } from "@/components/recipes/recipe-inspector"
import { RecipePalette } from "@/components/recipes/recipe-palette"
import { PanelReopenButton, SidePanelCollapseButton } from "@/components/shared/three-panels"
import { DashboardCardHeader, dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup, WorkspacePanel } from "@/components/ui/resizable"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { SaveStatus } from "@/components/shell/sticky-header/sticky-header"
import type { AutomationGraph, AutomationNode } from "@/lib/automations/graph"
import {
  getRecipeErrorMessage,
  saveRecipe,
  type RecipeDetail,
} from "@/lib/api/trade/recipes"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useBlankSpaceDoubleClick, usePanelCollapsed, usePanelToggle } from "@/lib/layout/panel-collapse"
import { clampStepListWidth, DEFAULT_STEP_LIST_WIDTH, MIN_STEP_LIST_WIDTH } from "@/lib/layout/styling-values"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { compileRecipeGraph } from "@/lib/recipes/compile"
import { cn } from "@/lib/utils"
import { createRecipeNode, recipeNodeName, recipePaletteKeyForNode } from "@/lib/recipes/registry"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

import { nextNodePosition, type CanvasSize } from "./canvas-model"

const SAVE_DEBOUNCE_MS = 700

export function RecipeEditor({
  initial,
  node,
  onNode,
  heading,
  menu,
  onBack,
  frame,
}: {
  initial: Pick<RecipeDetail, "id" | "name" | "graph">
  /**
   * `?node=`: the step picked, by its id (or its kind, from an older link).
   * Kept in the address, because the dashboard shows the right panel only
   * while a step is picked.
   */
  node?: string
  /** Picks a step, or none. */
  onNode: (nodeId: string | null) => void
  /** The end of the middle's header: the button that reopens a shut right panel. */
  heading: React.ReactNode
  /** The recipe's ⋮, last in the middle's header before the reopen button. */
  menu: React.ReactNode
  /** Back to the Recipes table. */
  onBack: () => void
  /** The Bots dashboard's frame: the middle, and the right panel while a step is picked. */
  frame: (panels: { header: React.ReactNode; middle: React.ReactNode; right?: { label: string; content: React.ReactNode } }) => React.ReactNode
}) {
  const { config, reportSaveStatus } = useShellRuntime()
  // The step list's own panel beside the canvas, at Settings → Styling → Side
  // panels → Automation step list width in pixels, shut by its button or a
  // double-click on its blank space, as on the Automations dashboard.
  const wide = useWideScreen()
  const stepListWidth = clampStepListWidth(config.styling.stepListWidth ?? DEFAULT_STEP_LIST_WIDTH)
  const stepsRef = React.useRef<PanelImperativeHandle | null>(null)
  const stepsState = usePanelCollapsed(stepsRef)
  const toggleSteps = usePanelToggle(stepsRef)
  const stepsDoubleClick = useBlankSpaceDoubleClick(toggleSteps)
  // A step pressed in the step list shows on the right first, "Not added yet",
  // and goes on the canvas with its Add step button; the card's + and a drag
  // add it at once.
  const [previewNode, setPreviewNode] = React.useState<AutomationNode | null>(null)
  const [draggedKey, setDraggedKey] = React.useState<string | null>(null)
  const [name] = React.useState(initial.name)
  const [graph, setGraph] = React.useState(initial.graph)
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
  // Shut until the header's Backtest button opens it.
  const [backtestShut, setBacktestShut] = React.useState(true)

  const graphRef = React.useRef(graph)

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
      setSaveStatus({ blocked: "name this recipe" })
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
  const placedNode = node
    ? (graph.nodes.find((one) => one.id === node) ?? graph.nodes.find((one) => one.kind === node) ?? null)
    : null
  const selectedNode = previewNode ?? placedNode
  const selectedNodeId = placedNode?.id ?? null
  const onCanvas = React.useMemo(
    () => new Set(graph.nodes.flatMap((one) => recipePaletteKeyForNode(one) ?? [])),
    [graph.nodes]
  )

  const pickNode = React.useCallback(
    (nodeId: string | null) => {
      setPreviewNode(null)
      onNode(nodeId)
    },
    [onNode]
  )

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
      changeGraph((current) => ({
        ...current,
        nodes: current.nodes.filter((node) => node.id !== nodeId),
        edges: current.edges.filter(
          (edge) => edge.from !== nodeId && edge.to !== nodeId
        ),
      }))
      pickNode(null)
    },
    [changeGraph, pickNode]
  )

  const requestDeleteNode = React.useCallback(
    (nodeId: string) => {
      // Cancel on a step not added yet only lets go of it.
      if (nodeId === previewNode?.id) {
        setPreviewNode(null)
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
    [previewNode?.id]
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
      pickNode(placedNode.id)
      setSelectedEdgeId(null)
    },
    [canvasSize.width, changeGraph, pickNode]
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
      onDeleteNode={requestDeleteNode}
      onAddNode={previewNode ? (one) => placeNode(one) : undefined}
      headerEnd={<SidePanelCollapseButton side="right" label="Hide the step" />}
    />
  )

  // A press on a step already on the canvas picks that one: a recipe takes
  // one of each, so a second copy would only be marked red.
  const pressStep = (key: string) => {
    const existing = graphRef.current.nodes.find((one) => recipePaletteKeyForNode(one) === key)
    setSelectedEdgeId(null)
    if (existing) pickNode(existing.id)
    else setPreviewNode(createNode(key))
  }

  const stepList = (
    <RecipePalette
      // At the panel's outer edge, the drawn icon 16px in, as on the
      // automation step list (the header's 20px gutter less 13px).
      headerStart={<StepsToggle shut={false} label="Hide the steps" onClick={toggleSteps} className="-ml-[13px]" />}
      onCanvas={onCanvas}
      onSelect={pressStep}
      onAdd={(key) => addNode(key)}
      onDragStart={setDraggedKey}
      onDragEnd={() => setDraggedKey(null)}
    />
  )

  const canvas = (
    <RecipeFlowCanvas
      graph={graph}
      errors={compiled.errors}
      selectedNodeId={selectedNodeId}
      selectedEdgeId={selectedEdgeId}
      onGraphChange={(next) => changeGraph(() => next)}
      onSelectNode={pickNode}
      onSelectEdge={setSelectedEdgeId}
      onDeleteNode={requestDeleteNode}
      onSizeChange={setCanvasSize}
      onDropNode={
        draggedKey
          ? (position) => {
              addNode(draggedKey, position)
              setDraggedKey(null)
            }
          : undefined
      }
    />
  )


  // The middle's one header: the way back, the recipe's name, then the
  // trading status, Backtest and the recipe's ⋮. No tabs: the name and Result
  // tabs went (Tyler, 10 Nov 2026: "Better to just remove the tabs so that
  // theres no confusing"); a recipe's backtests are on the Backtests row. While the step list is
  // shut, its button comes first, where the list's own one sat.
  const canvasHeader = (
    <DashboardCardHeader className="gap-2">
      <PanelReopenButton side="left" label="Show the page" />
      {wide && stepsState.collapsed ? (
        <StepsToggle shut label="Show the steps" onClick={toggleSteps} className="first:-ml-[13px]" />
      ) : null}
      <Button type="button" variant="ghost" size="icon" aria-label="Back to recipes" className="-ml-1 shrink-0" onClick={onBack}>
        <ArrowLeftIcon className="size-4" />
      </Button>
      <h2 className={cn("min-w-0 truncate", dashboardCardHeadingClassName)}>{name}</h2>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <FlowStatusHeader automationId={initial.id} beforeRun={saveNow} />
        <Button
          type="button"
          variant={backtestShut ? "outline" : "secondary"}
          aria-pressed={!backtestShut}
          onClick={() => setBacktestShut((shut) => !shut)}
        >
          <FlaskConicalIcon className="size-4" />
          Backtest
        </Button>
        {menu}
        {heading}
      </div>
    </DashboardCardHeader>
  )

  // The Backtest window floats over the canvas while the header's Backtest
  // button is pressed, and stays mounted while shut, hidden.
  const backtestPanel = (
    <div className={cn("absolute top-3 right-3 z-10 w-80 max-w-[calc(100%-1.5rem)]", backtestShut && "hidden")}>
      <BacktestCanvasPanel
        automationId={initial.id}
        runId={null}
        onClose={() => setBacktestShut(true)}
        beforeRun={saveNow}
        compiledConfig={compiled.config}
      />
    </div>
  )

  const canvasCard = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      {canvasHeader}
      <div className="relative flex min-h-0 flex-1">
        {canvas}
        {backtestPanel}
      </div>
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

  // Two panels in the middle on a wide screen, the step list then the canvas,
  // as the Automations dashboard draws an open flow. A narrow screen draws the
  // canvas card alone.
  const middle = wide ? (
    <ResizablePanelGroup
      // A new width from Settings starts the list again at it.
      key={stepListWidth}
      orientation="horizontal"
      className="min-h-0 flex-1"
    >
      <ResizablePanel
        id="steps"
        panelRef={stepsRef}
        collapsible
        collapsedSize="0px"
        defaultSize={`${stepListWidth}px`}
        minSize={`${MIN_STEP_LIST_WIDTH}px`}
        maxSize="45%"
        groupResizeBehavior="preserve-pixel-size"
        onResize={stepsState.onResize}
      >
        <WorkspacePanel collapsed={stepsState.collapsed} onDoubleClick={stepsDoubleClick} className="flex flex-col">
          {stepList}
        </WorkspacePanel>
      </ResizablePanel>
      <ResizableHandle gap collapsed={stepsState.collapsed} />
      <ResizablePanel id="canvas" minSize="40%">
        <WorkspacePanel className="flex flex-col">{canvasCard}</WorkspacePanel>
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    canvasCard
  )

  // No right panel until a step is picked (Tyler, 9 Nov 2026: "For the canvas
  // page, just dont show the right panel until a node is clicked on").
  // Result has none either: a line opens its backtest.
  return frame({ header: null, middle, right: selectedNode ? { label: "Step", content: inspector } : undefined })

}

/** The step list's hide and show button, drawn as the automation editor's. */
function StepsToggle({
  shut,
  label,
  onClick,
  className,
}: {
  shut: boolean
  label: string
  onClick: () => void
  className?: string
}) {
  const Icon = shut ? PanelLeftDashedIcon : PanelLeftCloseIcon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label} className={cn("shrink-0 rounded-lg", className)} onClick={onClick}>
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
