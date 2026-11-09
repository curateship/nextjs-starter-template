/**
 * Deliberate Trade-owned fork of the shell automation editor. Recipes keep the
 * proven canvas save, drag, edge and inspector behavior, while omitting shell
 * runs, templates, member tests and scheduled automation controls.
 *
 * On the Bots dashboard (9 Nov 2026) an opened recipe fills the middle, and the
 * right panel shows only while a step is picked, holding its settings. The left panel stays the
 * dashboard's page (Tyler: "if we combine all the sidebars, there's like 3
 * sidebar on the left"), so the five steps are added from a + Add step button
 * at the top of the canvas instead of a panel of their own.
 */
import * as React from "react"
import { ArrowLeftIcon, FlaskConicalIcon, PlusIcon } from "lucide-react"

import BacktestCanvasPanel from "@/components/recipes/backtest-canvas-panel"
import FlowStatusHeader from "@/components/recipes/flow-status-header"
import { RecipeFlowCanvas } from "@/components/recipes/recipe-flow-canvas"
import { RecipeInspector } from "@/components/recipes/recipe-inspector"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { RecipeNodeIcon } from "@/components/recipes/recipe-node-icon"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { FoldingMenu, MenuAction } from "@/components/shared/folding-menu"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { SaveStatus } from "@/components/shell/sticky-header/sticky-header"
import type { AutomationGraph, AutomationNode } from "@/lib/automations/graph"
import {
  getRecipeErrorMessage,
  saveRecipe,
  type RecipeDetail,
} from "@/lib/api/trade/recipes"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { compileRecipeGraph } from "@/lib/recipes/compile"
import { cn } from "@/lib/utils"
import { createRecipeNode, RECIPE_PALETTE_ITEMS, recipeNodeName } from "@/lib/recipes/registry"
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
  onOpenBacktest,
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
  /** The Results tab: the recipe's newest finished backtest, opened in the dashboard. */
  onOpenBacktest: (groupId: string) => void
  /** The Bots dashboard's frame: the middle, and the right panel while a step is picked. */
  frame: (panels: { header: React.ReactNode; middle: React.ReactNode; right?: { label: string; content: React.ReactNode } }) => React.ReactNode
}) {
  const { reportSaveStatus } = useShellRuntime()
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
  const [latestResultId, setLatestResultId] = React.useState<string | null>(
    null
  )

  const [addOpen, setAddOpen] = React.useState(false)
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
  const selectedNode = node
    ? (graph.nodes.find((one) => one.id === node) ?? graph.nodes.find((one) => one.kind === node) ?? null)
    : null
  const selectedNodeId = selectedNode?.id ?? null
  const updateNode = React.useCallback(
    (nextNode: AutomationNode) => {
      changeGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === nextNode.id ? nextNode : node
        ),
      }))
    },
    [changeGraph]
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
      onNode(null)
    },
    [changeGraph, onNode]
  )

  const requestDeleteNode = React.useCallback(
    (nodeId: string) => {
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
    []
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
      onNode(placedNode.id)
      setSelectedEdgeId(null)
    },
    [canvasSize.width, changeGraph, onNode]
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
      headerEnd={<SidePanelCollapseButton side="right" label="Hide the step" />}
    />
  )

  // The five steps, in place of a panel of their own (Tyler, 9 Nov 2026: "+ Add
  // step button"), beside the canvas's zoom bar ("actually move the add step
  // here", "it should be its own button and not stuck with the others").
  // Picking one puts it on the canvas and shows its settings on the right.
  const addStep = (
    <FoldingMenu
      label="Add a step"
      fit
      align="start"
      open={addOpen}
      onOpenChange={setAddOpen}
      trigger={
        <Button type="button" variant="outline" size="sm" className="h-7.5 bg-card/90 shadow-sm backdrop-blur-sm">
          <PlusIcon />
          Add step
        </Button>
      }
    >
      {RECIPE_PALETTE_ITEMS.map((item) => (
        <MenuAction
          key={item.key}
          icon={<RecipeNodeIcon icon={item.icon} className="size-4" />}
          onClick={() => {
            setAddOpen(false)
            addNode(item.key)
          }}
        >
          {item.name}
        </MenuAction>
      ))}
    </FoldingMenu>
  )

  const canvas = (
    <RecipeFlowCanvas
      graph={graph}
      errors={compiled.errors}
      selectedNodeId={selectedNodeId}
      selectedEdgeId={selectedEdgeId}
      onGraphChange={(next) => changeGraph(() => next)}
      onSelectNode={onNode}
      onSelectEdge={setSelectedEdgeId}
      onDeleteNode={requestDeleteNode}
      onSizeChange={setCanvasSize}
      toolbarEnd={addStep}
    />
  )


  // The middle's one header (Tyler, 9 Nov 2026: "Turn recipe name into tabs
  // ... [Recipe name canvas][result] put the backtest button here"): the way
  // back, then the recipe's name as the Canvas tab and Results beside it, then
  // the trading status, Backtest, + Add step and the recipe's ⋮.
  const canvasHeader = (
    <DashboardCardHeader className="gap-2">
      <Button type="button" variant="ghost" size="icon" aria-label="Back to recipes" className="-ml-1 shrink-0" onClick={onBack}>
        <ArrowLeftIcon className="size-4" />
      </Button>
      <DashboardTabs
        value="canvas"
        onValueChange={(value) => {
          if (value === "results" && latestResultId) onOpenBacktest(latestResultId)
        }}
        tabs={[
          { value: "canvas", label: name },
          {
            value: "results",
            // Results opens the newest finished backtest in the Backtests row.
            // With none yet it is greyed out and does nothing, and its tooltip
            // says how to make one (Tyler, 9 Nov 2026: "remove the toast
            // altogether and gray out the result tab if no result is ready").
            label: latestResultId ? (
              "Results"
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span aria-disabled="true" className="text-muted-foreground/50">
                    Results
                  </span>
                </TooltipTrigger>
                <TooltipContent>No result yet. Press Backtest to run one.</TooltipContent>
              </Tooltip>
            ),
          },
        ]}
      />
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
  // button is pressed. It stays mounted while shut, hidden, because it is what
  // finds the newest result the Results tab opens.
  const backtestPanel = (
    <div className={cn("absolute top-3 right-3 z-10 w-80 max-w-[calc(100%-1.5rem)]", backtestShut && "hidden")}>
      <BacktestCanvasPanel
        automationId={initial.id}
        runId={null}
        onClose={() => setBacktestShut(true)}
        beforeRun={saveNow}
        compiledConfig={compiled.config}
        onLatestRunIdChange={setLatestResultId}
      />
    </div>
  )

  const middle = (
    <div className="flex min-h-0 flex-1 flex-col">
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

  // No right panel until a step is picked (Tyler, 9 Nov 2026: "For the canvas
  // page, just dont show the right panel until a node is clicked on").
  return frame({ header: null, middle, right: selectedNode ? { label: "Step", content: inspector } : undefined })
}
