import * as React from "react"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import { ArrowLeftIcon, CopyIcon, PlusIcon, Trash2Icon } from "lucide-react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { AutomationFlowCanvas } from "@/components/automations/automation-flow-canvas"
import { nextNodePosition, type CanvasPoint, type CanvasSize } from "@/components/automations/canvas-model"
import type { CrmFrame } from "@/components/crm/crm-frame"
import { useShellConfigPatch } from "@/components/settings/use-shell-config-patch"
import { DashboardCardHeader, dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { FoldingMenu, MenuAction, MenuLine } from "@/components/shared/folding-menu"
import { PanelReopenButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup, WorkspacePanel } from "@/components/ui/resizable"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { AutomationGraph, AutomationNode } from "@/lib/automations/graph"
import { deleteFlow, duplicateFlow, getFlowErrorMessage, saveFlowGraph, type FlowDetail } from "@/lib/api/video/flow"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useBlankSpaceDoubleClick, usePanelCollapsed, usePanelFold, usePanelToggle } from "@/lib/layout/panel-collapse"
import { clampStepListWidth, DEFAULT_STEP_LIST_WIDTH, MIN_STEP_LIST_WIDTH } from "@/lib/layout/styling-values"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { useListSearchNavigate } from "@/lib/nav/list-search"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import type { FlowSearch } from "@/lib/video/flow/flow-search"
import { createFlowNode, FLOW_KIND_INFO, FLOW_KINDS, flowKindOf, type FlowKind } from "@/lib/video/flow/node-kinds"
import { validateFlow } from "@/lib/video/flow/validate"

import { RunFlowButton } from "./flow-dropdowns"
import { FlowKindsPanel, KindsToggle } from "./flow-kinds-panel"
import { FlowNodePanel, FlowSettingsPanel } from "./flow-node-panel"

/** A canvas change is saved this long after the last one. */
const SAVE_AFTER_MS = 700

type SaveState = "saved" | "saving" | "unsaved"

/**
 * A flow being built, in the middle of the Flow dashboard, as a page is
 * built in Admin → Pages (`page-builder.tsx`, Tyler: "Look at how admin >
 * pages handles its panels"): the node kinds as a panel of their own, then
 * the canvas, which is the shell's automation canvas drawing Flow's nodes.
 * The right panel holds the picked node, or the flow's own settings with
 * none picked. Every change saves itself; Run asks for the project and
 * flips the middle to the run's steps page.
 */
export function FlowBuilder({
  flow,
  prices,
  search,
  headingEnd,
  frame,
}: {
  flow: FlowDetail
  prices: Record<FlowKind, number> | null
  search: FlowSearch
  headingEnd: React.ReactNode
  frame: CrmFrame
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const setListSearch = useListSearchNavigate()
  const wide = useWideScreen()
  const { config } = useShellConfigPatch()
  const width = clampStepListWidth(config.styling.stepListWidth ?? DEFAULT_STEP_LIST_WIDTH)
  const kindsRef = React.useRef<PanelImperativeHandle | null>(null)
  const kindsState = usePanelCollapsed(kindsRef)

  const [graph, setGraph] = React.useState<AutomationGraph>(flow.graph)
  const [saveState, setSaveState] = React.useState<SaveState>("saved")
  const [selectedEdgeId, setSelectedEdgeId] = React.useState<string | null>(null)
  const version = React.useRef(flow.version)
  const savedText = React.useRef(JSON.stringify(flow.graph))
  const latest = React.useRef(graph)
  const timer = React.useRef(0)
  const saving = React.useRef<Promise<void> | null>(null)
  const refused = React.useRef(false)
  const canvasSize = React.useRef<CanvasSize>({ width: 800, height: 560 })
  const dragging = React.useRef<FlowKind | null>(null)

  const errors = React.useMemo(() => validateFlow(graph), [graph])
  const selectedNodeId = search.node && graph.nodes.some((node) => node.id === search.node) ? search.node : null
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? null

  /** Saves the newest canvas, one save at a time. A refused save stops saving, so nothing newer is lost. */
  const flush = React.useCallback(async () => {
    window.clearTimeout(timer.current)
    if (refused.current) return
    if (saving.current) await saving.current
    const text = JSON.stringify(latest.current)
    if (text === savedText.current) {
      setSaveState("saved")
      return
    }
    setSaveState("saving")
    const work = saveFlowGraph(flow.id, latest.current, version.current)
      .then((saved) => {
        version.current = saved.version
        savedText.current = text
        dismissErrorToast()
        setSaveState(JSON.stringify(latest.current) === text ? "saved" : "unsaved")
      })
      .catch((error: unknown) => {
        refused.current = true
        setSaveState("unsaved")
        showErrorToast(getFlowErrorMessage(error))
      })
    saving.current = work
    await work
    saving.current = null
  }, [flow.id])

  const change = React.useCallback(
    (next: AutomationGraph) => {
      latest.current = next
      setGraph(next)
      setSaveState("unsaved")
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void flush(), SAVE_AFTER_MS)
    },
    [flush]
  )
  // Leaving the builder saves what is waiting.
  React.useEffect(
    () => () => {
      void flush()
    },
    [flush]
  )

  // A kind pressed in the nodes panel shows on the right first, not yet on
  // the canvas, as a step pressed in an automation's step list does (Tyler,
  // 14 Nov 2026: "clicking on a node should not add it"). The card's + , a
  // drag, or the right panel's Add node puts it on the canvas.
  const [preview, setPreview] = React.useState<AutomationNode | null>(null)

  const pickNode = (nodeId: string | null) => {
    if (nodeId) setPreview(null)
    setListSearch({ node: nodeId ?? undefined })
  }

  const previewKind = (kind: FlowKind) => {
    setSelectedEdgeId(null)
    setPreview(createFlowNode(kind, { id: crypto.randomUUID(), x: 0, y: 0 }))
  }

  /** Puts a node on the canvas: a fresh one of a kind, or the one shown on the right with what was typed into it. */
  const addNode = (kind: FlowKind, at?: CanvasPoint, from?: AutomationNode) => {
    const point = at ?? nextNodePosition(latest.current.nodes.length, latest.current.viewport, canvasSize.current.width)
    const place = { id: from?.id ?? crypto.randomUUID(), x: Math.round(point.x), y: Math.round(point.y) }
    const node = from ? { ...from, ...place } : createFlowNode(kind, place)
    change({ ...latest.current, nodes: [...latest.current.nodes, node] })
    setPreview(null)
    pickNode(node.id)
  }

  const updateNode = (node: AutomationNode) =>
    change({ ...latest.current, nodes: latest.current.nodes.map((one) => (one.id === node.id ? node : one)) })

  const deleteNode = (nodeId: string) => {
    change({
      ...latest.current,
      nodes: latest.current.nodes.filter((node) => node.id !== nodeId),
      edges: latest.current.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
    })
    if (selectedNodeId === nodeId) pickNode(null)
  }

  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [runAction, actionBusy] = useAsyncAction(getFlowErrorMessage)
  const onDuplicate = (flowId: string) =>
    void runAction(async () => {
      const made = await duplicateFlow(flowId)
      await router.invalidate()
      void navigate({ to: "/admin/video-flow", search: { edit: made.id } })
    })
  const removeFlow = () =>
    void runAction(async () => {
      window.clearTimeout(timer.current)
      refused.current = true
      await deleteFlow(flow.id)
      setDeleteOpen(false)
      await router.invalidate()
      void navigate({ to: "/admin/video-flow", search: {} })
    })

  const { fold, className: foldingClassName } = usePanelFold()
  const snapKinds = usePanelToggle(kindsRef)
  const toggleKinds = React.useCallback(() => fold(snapKinds), [fold, snapKinds])
  const kindsDoubleClick = useBlankSpaceDoubleClick(toggleKinds)

  const [addOpen, setAddOpen] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  // Shaped as the automation editor's canvas header: the panel's reopen
  // button, the nodes panel's button while it is shut, the flow's icon and
  // name, then the save state, Run and the ⋮ at the right.
  const header = (
    <DashboardCardHeader className="@container gap-2">
      <PanelReopenButton side="left" label="Show the page" />
      {wide && kindsState.collapsed ? (
        <KindsToggle shut label="Show the nodes" onClick={toggleKinds} className="first:-ml-[13px]" />
      ) : null}
      {/* Back to the Flows table (Tyler, 14 Nov 2026: "add a back button here
          to go back to the table"), in this header ("move the arrow back to
          the middle panel"). Leaving saves any change still waiting. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="ghost" size="icon" className="-ml-1 shrink-0">
            <Link to="/admin/video-flow" search={{}} aria-label="Back to the flows">
              <ArrowLeftIcon className="size-4" />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Back to the flows</TooltipContent>
      </Tooltip>
      <h2 className={cn("min-w-0 shrink truncate", dashboardCardHeadingClassName)}>{flow.name}</h2>
      <span className="shrink-0 text-xs text-muted-foreground @max-3xl:sr-only" aria-live="polite">
        {saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Not saved yet" : "Saved"}
      </span>
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2">
        {/* A phone has no nodes panel, so the nodes are added from here. */}
        {!wide ? (
          <FoldingMenu
            label="Add a node"
            fit
            open={addOpen}
            onOpenChange={setAddOpen}
            trigger={
              <Button type="button" variant="outline" size="icon" aria-label="Add a node">
                <PlusIcon className="size-4" />
              </Button>
            }
          >
            {FLOW_KINDS.map((kind) => {
              const Icon = FLOW_KIND_INFO[kind].icon
              return (
                <MenuAction
                  key={kind}
                  icon={<Icon className="size-4" />}
                  onClick={() => {
                    setAddOpen(false)
                    addNode(kind)
                  }}
                >
                  {FLOW_KIND_INFO[kind].name}
                </MenuAction>
              )
            })}
          </FoldingMenu>
        ) : null}
        <RunFlowButton
          flowId={flow.id}
          onBeforeRun={flush}
          onStarted={async (runId) => {
            await router.invalidate()
            void navigate({ to: "/admin/video-flow", search: { tab: "runs", run: runId } })
          }}
        >
          Run
        </RunFlowButton>
        <FoldingMenu label="More for this flow" fit align="end" open={menuOpen} onOpenChange={setMenuOpen}>
          <MenuAction
            icon={<CopyIcon className="size-4" />}
            onClick={() => {
              setMenuOpen(false)
              void flush().then(() => onDuplicate(flow.id))
            }}
          >
            Duplicate
          </MenuAction>
          <MenuLine />
          <MenuAction
            destructive
            icon={<Trash2Icon className="size-4" />}
            onClick={() => {
              setMenuOpen(false)
              setDeleteOpen(true)
            }}
          >
            Delete
          </MenuAction>
        </FoldingMenu>
      </div>
      {headingEnd}
    </DashboardCardHeader>
  )

  const canvasCard = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      {header}
      <AutomationFlowCanvas
        graph={graph}
        errors={errors}
        selectedNodeId={selectedNodeId}
        selectedEdgeId={selectedEdgeId}
        onGraphChange={change}
        onSelectNode={pickNode}
        onSelectEdge={setSelectedEdgeId}
        onDeleteNode={deleteNode}
        onSizeChange={(size) => {
          canvasSize.current = size
        }}
        onDropNode={(point) => {
          const kind = dragging.current
          dragging.current = null
          if (kind) addNode(kind, point)
        }}
      />
    </div>
  )

  const previewedKind = preview ? flowKindOf(preview.kind) : null
  const kinds = (
    <FlowKindsPanel
      onToggle={toggleKinds}
      picked={previewedKind}
      onSelect={previewKind}
      onAdd={(kind) => addNode(kind)}
      onDragStart={(kind) => {
        dragging.current = kind
      }}
      onDragEnd={() => {
        dragging.current = null
      }}
    />
  )

  return frame({
    ids: [],
    showMiddleFor: `builder|${flow.id}`,
    showRightFor: preview?.id ?? selectedNodeId ?? undefined,
    bare: wide,
    middle: wide ? (
      <ResizablePanelGroup key={width} orientation="horizontal" className={cn("min-h-0 flex-1", foldingClassName)}>
        <ResizablePanel
          id="flow-kinds"
          panelRef={kindsRef}
          collapsible
          collapsedSize="0px"
          defaultSize={`${width}px`}
          minSize={`${MIN_STEP_LIST_WIDTH}px`}
          maxSize="45%"
          groupResizeBehavior="preserve-pixel-size"
          onResize={kindsState.onResize}
        >
          <WorkspacePanel collapsed={kindsState.collapsed} onDoubleClick={kindsDoubleClick} className="flex flex-col">
            {kinds}
          </WorkspacePanel>
        </ResizablePanel>
        <ResizableHandle gap collapsed={kindsState.collapsed} />
        <ResizablePanel id="flow-canvas" minSize="40%">
          <WorkspacePanel className="flex flex-col">{canvasCard}</WorkspacePanel>
        </ResizablePanel>
      </ResizablePanelGroup>
    ) : (
      canvasCard
    ),
    right: preview && previewedKind
      ? {
          label: "Node",
          showLabel: "Show the node",
          content: (
            <FlowNodePanel
              key={preview.id}
              node={preview}
              graph={graph}
              errors={errors}
              prices={prices}
              onChange={setPreview}
              onAdd={() => addNode(previewedKind, undefined, preview)}
              onDelete={() => setPreview(null)}
            />
          ),
        }
      : selectedNode
      ? {
          label: "Node",
          showLabel: "Show the node",
          content: (
            <FlowNodePanel
              key={selectedNode.id}
              node={selectedNode}
              graph={graph}
              errors={errors}
              prices={prices}
              onChange={updateNode}
              onDelete={() => deleteNode(selectedNode.id)}
            />
          ),
        }
      : {
          label: "Flow",
          showLabel: "Show the flow",
          content: <FlowSettingsPanel flow={flow} errors={errors} />,
        },
    windows: (
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this flow?"
        description="The flow and its canvas go for good. Its runs stay, and every video they made stays in its project."
        confirmLabel="Delete flow"
        loading={actionBusy}
        onConfirm={removeFlow}
      />
    ),
  })
}
