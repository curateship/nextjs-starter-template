import * as React from "react"
import type { ComponentType } from "react"
import { useRouter } from "@tanstack/react-router"
import {
  CopyIcon,
  PanelLeftCloseIcon,
  PanelLeftDashedIcon,
  HistoryIcon,
  Loader2Icon,
  PencilIcon,
  PlayIcon,
  Trash2Icon,
  UserIcon,
} from "lucide-react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { RefreshAutomationCounts } from "@/components/automations/automation-blocks"
import { AutomationRunsPanel } from "@/components/automations/automation-runs-panel"
import { TestWithContactDialog } from "@/components/automations/test-with-contact-dialog"
import { AutomationFlowCanvas } from "@/components/automations/automation-flow-canvas"
import { AutomationInspector } from "@/components/automations/automation-inspector"
import { AutomationPalette } from "@/components/automations/automation-palette"
import { RunRecord } from "@/components/automations/run-record"
import { RunsTable } from "@/components/automations/runs-table"
import { SendEmailEditor } from "@/components/automations/nodes/send-email-editor"
import type { CrmFrame } from "@/components/crm/crm-frame"
import { CrmRowMenu } from "@/components/crm/crm-row"
import { EmptyRecord } from "@/components/crm/record-frame"
import { NameDialog } from "@/components/shared/dashboard/name-dialog"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { FoldingMenu, MenuAction, MenuLine } from "@/components/shared/folding-menu"
import { PanelReopenButton } from "@/components/shared/three-panels"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useBlankSpaceDoubleClick, usePanelCollapsed, usePanelFold, usePanelToggle } from "@/lib/layout/panel-collapse"
import {
  clampStepListWidth,
  DEFAULT_STEP_LIST_WIDTH,
  MIN_STEP_LIST_WIDTH,
} from "@/lib/layout/styling-values"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { ErrorRow } from "@/components/ui/error-row"
import { Switch } from "@/components/ui/switch"
import { compileAutomationGraph } from "@/lib/automations/compile"
import type {
  AutomationCanvasStatus,
  AutomationCanvasStatusProps,
} from "@/lib/automations/canvas-panel"
import type { AutomationGraph, AutomationNode } from "@/lib/automations/graph"
import type { BroadcastBlockDefaults } from "@/lib/broadcasts/blocks"
import {
  automationKindIsTrigger,
  automationNodeName,
  automationPaletteKeyForNode,
  createAutomationNode,
} from "@/lib/automations/node-registry"
import { automationCanStartManually } from "@/lib/automations/run"
import {
  getAutomationRunErrorMessage,
  listRunsForAutomation,
  runAutomationNow,
  type AutomationRunsPage,
} from "@/lib/api/automations/automation-runs"
import {
  getAutomationErrorMessage,
  saveAutomation,
  saveAutomationFavorites,
  setAutomationLive,
  type AutomationDetail,
} from "@/lib/api/automations/automations"
import {
  toAutomationTemplateListItem,
  type AutomationTemplateDetail,
  type AutomationTemplateListItem,
} from "@/lib/api/automations/automation-templates"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { useAutoSave } from "@/lib/hooks/use-auto-save"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { cn } from "@/lib/utils"

import {
  appCanvasHeaderStatus,
  appCanvasPanel,
  appOffersMemberTest,
  appShowsRunButton,
} from "@/lib/app-options"
import type { AutomationCanvasPanelProps } from "@/lib/automations/canvas-panel"
import { nextNodePosition, type CanvasSize } from "./canvas-model"

export type EditorPane = "canvas" | "runs"

/**
 * One flow, or one template, open in the Automations dashboard's middle
 * (Tyler, 9 Nov 2026, picked "Canvas in the middle"): the left page stays,
 * and the flow takes the middle and, while something is picked, the right.
 *
 * - **Header:** no back arrow and no title; on the right the Canvas and Runs
 *   tabs (a template has no runs, so no tabs), the live switch, the app's own
 *   status, Test with one person, Run, and the ⋮ with Rename, Duplicate and
 *   Delete. The bottom Runs panel the editor used to have is the Runs tab:
 *   this flow's runs only, tests included.
 * - **Step list:** Fav, All nodes, Templates, between the page and the
 *   canvas, as the editor always had it. A press shows the step on the right,
 *   not added yet, with Add node and Cancel; the card's + and a drag onto the
 *   canvas add it at once.
 * - **Right:** the picked step's settings, only while a step is picked
 *   (`?node=`). A press on the empty canvas keeps it. On the Runs tab, the run
 *   open (`?run=`), or the newest.
 *
 * Every edit saves 700ms after the last one; leaving saves what is waiting.
 */
export function AutomationEditor({
  initial,
  initialFavoriteNodeKeys,
  initialBlockDefaults,
  initialTemplates,
  frame,
  pane = "canvas",
  runId,
  openNode,
  headingEnd,
  mode = "automation",
  onSaveTemplateGraph,
  onPaneChange,
  onOpenRun,
  onNodePicked,
  onRenamed,
  onDuplicate,
  onDelete,
}: {
  initial: Pick<AutomationDetail, "id" | "name" | "graph" | "enabled">
  initialFavoriteNodeKeys: string[]
  /** The step list's Templates tab. Left out, the list has no such tab. */
  initialTemplates?: AutomationTemplateListItem[]
  initialBlockDefaults: BroadcastBlockDefaults
  /** Draws the flow into the dashboard's one frame. */
  frame: CrmFrame
  pane?: EditorPane
  /** The run open on the Runs tab; the newest when left out. */
  runId?: string
  /**
   * A step to arrive with already picked, by its id or by its kind. A kind
   * is accepted because a sender usually knows what the step is without
   * knowing this flow's copy of it.
   */
  openNode?: string
  /** The end of the header: the button that reopens a shut right panel. */
  headingEnd: React.ReactNode
  mode?: "automation" | "template"
  /** Answers with the template as saved, so its card can follow the canvas. */
  onSaveTemplateGraph?: (graph: AutomationGraph) => Promise<AutomationTemplateDetail>
  /** Switches between Canvas and Runs, with a run to open there. */
  onPaneChange: (pane: EditorPane, runId?: string) => void
  onOpenRun: (runId: string) => void
  /** The step picked, written to the address so a reload keeps it. */
  onNodePicked: (nodeId: string | null) => void
  onRenamed?: (name: string) => void
  onDuplicate?: () => void
  onDelete?: () => void
}) {
  const router = useRouter()
  const { config } = useShellRuntime()
  const refreshCounts = React.useContext(RefreshAutomationCounts)
  // The step list's own panel beside the canvas, shut by its button or a
  // double-click on its blank space. It opens at Settings → Styling → Side
  // panels → Automation step list width, in pixels, and keeps its pixels
  // while the right panel opens and shuts (Tyler, 9 Nov 2026: "this panel
  // save is inconsistent ... add a panel size setting in settings"). A
  // remembered share of the middle grew and shrank with the right panel,
  // and came back at another width on a wider or narrower screen.
  const wide = useWideScreen()
  const stepListWidth = clampStepListWidth(config.styling.stepListWidth ?? DEFAULT_STEP_LIST_WIDTH)
  const stepsRef = React.useRef<PanelImperativeHandle | null>(null)
  const stepsState = usePanelCollapsed(stepsRef)
  // Every fold and open slides rather than snapping (`usePanelFold`).
  const { fold, className: foldingClassName } = usePanelFold()
  const snapSteps = usePanelToggle(stepsRef)
  const toggleSteps = React.useCallback(() => fold(snapSteps), [fold, snapSteps])
  const stepsDoubleClick = useBlankSpaceDoubleClick(toggleSteps)
  const templateModeAtStart = React.useRef(mode === "template")
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(
    // Worked out here rather than in an effect: an effect that ran again would
    // drag somebody back to this step every time they picked another.
    () => {
      if (!openNode) return null
      const found =
        initial.graph.nodes.find((node) => node.id === openNode) ??
        initial.graph.nodes.find((node) => node.kind === openNode)
      return found?.id ?? null
    }
  )
  // A template opens on a step it chose itself (its last or its first); the
  // step goes into the address, so a reload draws the same one on the server
  // and in the browser.
  const openedOn = React.useRef(selectedNodeId)
  React.useEffect(() => {
    if (templateModeAtStart.current && openedOn.current) onNodePicked(openedOn.current)
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // The run this canvas started, and whether the app's own panel is open.
  const [startedRunId, setStartedRunId] = React.useState<string | null>(null)
  const [appPanelShut, setAppPanelShut] = React.useState(false)
  const [editingEmailNodeId, setEditingEmailNodeId] = React.useState<string | null>(null)
  const [draggedNodeKey, setDraggedNodeKey] = React.useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<{
    nodeId: string
    name: string
    connectionCount: number
  } | null>(null)
  const deleteConfirmedRef = React.useRef(false)
  const closingDeleteTarget = useLastValue(deleteTarget)
  const [canvasSize, setCanvasSize] = React.useState<CanvasSize>({ width: 0, height: 0 })
  const [running, setRunning] = React.useState(false)
  const [testOpen, setTestOpen] = React.useState(false)
  const [preparingTest, setPreparingTest] = React.useState(false)
  const [live, setLive] = React.useState(initial.enabled)
  const [savingLive, setSavingLive] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  // A step's right-click menu, at the pointer (Tyler, 9 Nov 2026: "enable
  // right click to delete node").
  const [stepMenu, setStepMenu] = React.useState<{ nodeId: string; x: number; y: number } | null>(null)
  const [renameOpen, setRenameOpen] = React.useState(false)
  const [renameText, setRenameText] = React.useState("")
  const [renaming, setRenaming] = React.useState(false)
  const templateMode = mode === "template"
  const [favoriteNodeKeys, setFavoriteNodeKeys] = React.useState(initialFavoriteNodeKeys)
  const [savingFavorites, setSavingFavorites] = React.useState(false)
  // The Templates tab's list. Kept here, not in the tab, because a canvas save
  // changes a card too: its steps, Customized, and "Has a step to fix".
  const [templates, setTemplates] = React.useState(initialTemplates)
  const takeTemplate = React.useCallback((template: AutomationTemplateDetail) => {
    const item = toAutomationTemplateListItem(template)
    setTemplates((current) => current?.map((candidate) => (candidate.key === item.key ? item : candidate)))
  }, [])

  // The name rides along on every save, or the record would be written back
  // without it. An empty name blocks the save and says so in the top bar.
  const autoSave = useAutoSave(
    { name: initial.name, graph: initial.graph },
    {
      save: async (draft) => {
        await (templateMode && onSaveTemplateGraph
          ? onSaveTemplateGraph(draft.graph).then(takeTemplate)
          : saveAutomation({ automationId: initial.id, name: draft.name, graph: draft.graph }))
      },
      describeError: getAutomationErrorMessage,
      blockedReason: (draft) => (draft.name.trim() ? null : "name this automation"),
    }
  )
  const { name, graph } = autoSave.value
  const { change, saveNow, isSaved, latest } = autoSave

  // A rename or Reset from the Templates tab, on the template that is open.
  // Its canvas edits go to the server first, so a Reset cannot be overwritten
  // by an older save landing after it. Then the canvas takes what the server
  // holds.
  const templateHooks = {
    before: async (key: string) => (templateMode && key === initial.id ? saveNow() : true),
    after: async (template: AutomationTemplateDetail) => {
      takeTemplate(template)
      if (!templateMode || template.key !== initial.id) return
      autoSave.reset({ name: template.name, graph: template.graph })
      await router.invalidate()
    },
  }

  const changeGraph = React.useCallback(
    (updater: (current: AutomationGraph) => AutomationGraph) =>
      change((current) => ({ ...current, graph: updater(current.graph) })),
    [change]
  )

  const compiled = React.useMemo(() => compileAutomationGraph(graph), [graph])
  const canRunManually = compiled.config ? automationCanStartManually(compiled.config) : false
  const nodeKinds = React.useMemo(() => graph.nodes.map((node) => node.kind), [graph.nodes])
  const offersMemberTest = appOffersMemberTest(nodeKinds)
  // Read off the draft, so the switch appears the moment a trigger is dropped
  // on the canvas rather than once the flow happens to compile.
  const triggerName = React.useMemo(() => {
    const triggers = graph.nodes.filter((node) => automationKindIsTrigger(node.kind))
    return triggers.length === 1 ? automationNodeName(triggers[0]) : null
  }, [graph.nodes])
  const paused = config.automationPause.enabled

  // This flow's runs, for the Runs tab: tests included, since a flow being
  // built is mostly tested. Read when the tab first shows and after a run.
  const [flowRuns, setFlowRuns] = React.useState<AutomationRunsPage | null>(null)
  const [flowRunsError, setFlowRunsError] = React.useState<string | null>(null)
  const [loadingMoreRuns, setLoadingMoreRuns] = React.useState(false)
  const readFlowRuns = React.useCallback(async () => {
    if (templateMode) return
    try {
      setFlowRuns(await listRunsForAutomation(initial.id, 0))
      setFlowRunsError(null)
    } catch (error) {
      setFlowRunsError(getAutomationRunErrorMessage(error))
    }
  }, [initial.id, templateMode])
  const runsShown = pane === "runs" && !templateMode
  React.useEffect(() => {
    if (runsShown) void readFlowRuns()
  }, [runsShown, readFlowRuns])
  const loadMoreRuns = async () => {
    if (!flowRuns || loadingMoreRuns) return
    setLoadingMoreRuns(true)
    try {
      const next = await listRunsForAutomation(initial.id, flowRuns.runs.length)
      setFlowRuns((current) => {
        if (!current) return next
        const seen = new Set(current.runs.map((run) => run.id))
        return { runs: [...current.runs, ...next.runs.filter((run) => !seen.has(run.id))], total: next.total }
      })
    } catch (error) {
      showErrorToast(getAutomationRunErrorMessage(error))
    } finally {
      setLoadingMoreRuns(false)
    }
  }

  /** A run this canvas started: the Runs tab opens on it. */
  const showStartedRun = (startedId: string) => {
    setStartedRunId(startedId)
    onPaneChange("runs", startedId)
    void readFlowRuns()
    refreshCounts()
  }

  /**
   * The flow's own switch, and the only thing that makes a trigger act. The
   * pending edit is saved first: switching on reads the compiled copy on the
   * server, and a trigger typed a second ago is not in it yet.
   */
  const handleLiveChange = async (next: boolean) => {
    if (savingLive) return
    setSavingLive(true)
    try {
      if (next && !(await saveNow())) return
      const saved = await setAutomationLive(initial.id, next)
      dismissErrorToast()
      setLive(saved.enabled)
    } catch (error) {
      showErrorToast(getAutomationErrorMessage(error))
    } finally {
      setSavingLive(false)
    }
  }

  const handleRunNow = async () => {
    if (running || paused || !compiled.config) return
    setRunning(true)
    setAppPanelShut(false)
    try {
      await saveNow()
      if (!isSaved()) return
      const { runId: startedId } = await runAutomationNow(initial.id)
      dismissErrorToast()
      showStartedRun(startedId)
    } catch (error) {
      showErrorToast(getAutomationRunErrorMessage(error))
    } finally {
      setRunning(false)
    }
  }

  const openMemberTest = async () => {
    if (preparingTest || paused || !compiled.config) return
    setPreparingTest(true)
    try {
      await saveNow()
      if (!isSaved()) return
      setTestOpen(true)
    } catch (error) {
      showErrorToast(getAutomationErrorMessage(error))
    } finally {
      setPreparingTest(false)
    }
  }

  /** Renamed through the flow's own save, so the name and the canvas never race. */
  const handleRename = async () => {
    const next = renameText.trim()
    if (!next || renaming) return
    if (next === name) {
      setRenameOpen(false)
      return
    }
    setRenaming(true)
    try {
      change((current) => ({ ...current, name: next }))
      if (await saveNow()) {
        onRenamed?.(next)
        setRenameOpen(false)
      }
    } finally {
      setRenaming(false)
    }
  }

  // A step pressed in the step list is shown on the right first, "Not added
  // yet", and goes on the canvas only with its Add button (Tyler, 9 Nov 2026:
  // "clicking on the nodes should not be adding it automatically"). The +
  // on a step's card and a drag onto the canvas still add it at once.
  const [previewNode, setPreviewNode] = React.useState<AutomationNode | null>(null)
  const selectedNode =
    previewNode ?? (selectedNodeId ? (graph.nodes.find((node) => node.id === selectedNodeId) ?? null) : null)
  const selectedPaletteKey = selectedNode ? automationPaletteKeyForNode(selectedNode) : null

  const pickNode = React.useCallback(
    (nodeId: string | null) => {
      setPreviewNode(null)
      setSelectedNodeId(nodeId)
      onNodePicked(nodeId)
    },
    [onNodePicked]
  )

  const updateNode = React.useCallback(
    (nextNode: AutomationNode) => {
      if (nextNode.id === previewNode?.id) {
        setPreviewNode(nextNode)
        return
      }
      changeGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) => (node.id === nextNode.id ? nextNode : node)),
      }))
    },
    [changeGraph, previewNode?.id]
  )

  const deleteNode = React.useCallback(
    (nodeId: string) => {
      // Cancel on a step not added yet only lets go of it.
      if (nodeId === previewNode?.id) {
        setPreviewNode(null)
        return
      }
      changeGraph((current) => ({
        ...current,
        nodes: current.nodes.filter((item) => item.id !== nodeId),
        edges: current.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
      }))
      pickNode(null)
    },
    [changeGraph, pickNode, previewNode?.id]
  )

  const requestDeleteNode = React.useCallback(
    (nodeId: string) => {
      if (nodeId === previewNode?.id) {
        setPreviewNode(null)
        return
      }
      const node = latest().graph.nodes.find((item) => item.id === nodeId)
      if (!node) return
      setDeleteTarget({
        nodeId,
        name: automationNodeName(node),
        connectionCount: latest().graph.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId).length,
      })
      deleteConfirmedRef.current = false
    },
    [latest, previewNode?.id]
  )

  const toggleFavoriteNode = React.useCallback(
    async (key: string) => {
      if (savingFavorites) return
      const previous = favoriteNodeKeys
      const next = previous.includes(key) ? previous.filter((candidate) => candidate !== key) : [...previous, key]
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

  /** Puts a step on the canvas, at `position` or the middle of the view, and picks it. */
  const placeNode = React.useCallback(
    (node: AutomationNode, position?: { x: number; y: number }) => {
      const { x, y } =
        position ?? nextNodePosition(latest().graph.nodes.length, latest().graph.viewport, canvasSize.width || 800)
      const placed = { ...node, x, y }
      changeGraph((current) => ({ ...current, nodes: [...current.nodes, placed] }))
      setSelectedEdgeId(null)
      pickNode(placed.id)
    },
    [canvasSize.width, changeGraph, latest, pickNode]
  )

  /** A new step of this kind, straight onto the canvas: the card's + or a drag. */
  const addNode = React.useCallback(
    (key: string, position?: { x: number; y: number }) =>
      placeNode(createAutomationNode(key, { id: crypto.randomUUID(), x: 0, y: 0 }), position),
    [placeNode]
  )

  /** A step pressed in the step list: shown on the right, not on the canvas yet. */
  const previewStep = React.useCallback((key: string) => {
    setSelectedEdgeId(null)
    setPreviewNode(createAutomationNode(key, { id: crypto.randomUUID(), x: 0, y: 0 }))
  }, [])

  const runsPanel = !templateMode
    ? (active: boolean) => <AutomationRunsPanel key={initial.id} automationId={initial.id} active={active} />
    : null

  const editingEmailNode = editingEmailNodeId
    ? (graph.nodes.find((node) => node.id === editingEmailNodeId) ?? null)
    : null

  const windows = (
    <>
      {stepMenu ? (
        <CrmRowMenu
          key={`${stepMenu.nodeId}-${stepMenu.x}-${stepMenu.y}`}
          at={stepMenu}
          massSelect={null}
          items={[
            {
              label: "Delete step",
              icon: <Trash2Icon className="size-4" />,
              destructive: true,
              // Asks first, as the Delete key does.
              onSelect: () => requestDeleteNode(stepMenu.nodeId),
            },
          ]}
          onClose={() => setStepMenu(null)}
        />
      ) : null}
      {!templateMode ? (
        <TestWithContactDialog
          open={testOpen}
          automationId={initial.id}
          onOpenChange={setTestOpen}
          onStarted={async (startedId) => {
            setAppPanelShut(false)
            showStartedRun(startedId)
          }}
        />
      ) : null}
      <NameDialog
        open={renameOpen}
        title="Rename automation"
        description="Only the name changes. The steps and whether it is live stay as they are."
        cardTitle="Automation details"
        inputId="rename-open-automation"
        value={renameText}
        onValueChange={setRenameText}
        maxLength={80}
        placeholder="Weekly product email"
        dirty={renameText.trim() !== name}
        busy={renaming}
        submitLabel="Save name"
        onSubmit={() => void handleRename()}
        onClose={() => setRenameOpen(false)}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={closingDeleteTarget ? `Delete "${closingDeleteTarget.name}"?` : "Delete this step?"}
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
          document.querySelector<HTMLElement>('[aria-label="Automation canvas"]')?.focus()
        }}
        onConfirm={() => {
          if (!deleteTarget) return
          deleteConfirmedRef.current = true
          deleteNode(deleteTarget.nodeId)
          setDeleteTarget(null)
        }}
      />
    </>
  )

  // An email step's "Open email builder" takes the middle until Back to flow.
  if (editingEmailNode?.kind === "sendEmail") {
    return frame({
      ids: [],
      showMiddleFor: `email|${editingEmailNode.id}`,
      bare: wide,
      middle: (
        <EmailBuilderBox wide={wide}>
        <SendEmailEditor
          key={editingEmailNode.id}
          automationName={name}
          node={editingEmailNode}
          graph={graph}
          initialBlockDefaults={initialBlockDefaults}
          onSave={async (nextNode) => {
            updateNode(nextNode)
            return saveNow()
          }}
          onBack={() => setEditingEmailNodeId(null)}
          runsPanel={runsPanel}
        />
        </EmailBuilderBox>
      ),
      right: null,
      windows,
    })
  }

  // The step list in a panel of its own, left of the canvas, as the editor
  // always had it, with the page still on its left (Tyler, 9 Nov 2026: "dont
  // put the add steps button in the bottom, return the left panel as it was
  // before", then "where is the other left panel?"). A press shows the step
  // on the right first (`previewStep`); the card's + and a drag add it.
  const stepList = (
    <AutomationPalette
      favoriteNodeKeys={favoriteNodeKeys}
      templates={
        templates ? { items: templates, openKey: templateMode ? initial.id : undefined, hooks: templateHooks } : undefined
      }
      // At the panel's outer edge, the drawn icon 16px in, as every side
      // panel's collapse button is (the header's own 20px gutter less 13px).
      headerStart={<StepsToggle shut={false} label="Hide the steps" onClick={toggleSteps} className="-ml-[13px]" />}
      // From the Runs tab, a press goes back to the canvas it is about.
      onSelect={(key) => {
        if (runsShown) onPaneChange("canvas")
        previewStep(key)
      }}
      onAdd={(key) => {
        if (runsShown) onPaneChange("canvas")
        addNode(key)
      }}
      onDragStart={setDraggedNodeKey}
      onDragEnd={() => setDraggedNodeKey(null)}
    />
  )

  const canvas = (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <AutomationFlowCanvas
        graph={graph}
        errors={compiled.errors}
        selectedNodeId={selectedNodeId}
        selectedEdgeId={selectedEdgeId}
        onGraphChange={(next) => changeGraph(() => next)}
        onSelectNode={pickNode}
        onSelectEdge={setSelectedEdgeId}
        onDeleteNode={requestDeleteNode}
        onSizeChange={setCanvasSize}
        onNodeContextMenu={(nodeId, x, y) => setStepMenu({ nodeId, x, y })}
        onDropNode={
          draggedNodeKey
            ? (position) => {
                addNode(draggedNodeKey, position)
                setDraggedNodeKey(null)
              }
            : undefined
        }
      />
      {templateMode ? null : (
        <AppCanvasPanel
          automationId={initial.id}
          nodeKinds={nodeKinds}
          runId={startedRunId}
          shut={appPanelShut}
          onShut={() => setAppPanelShut(true)}
          onOpen={() => setAppPanelShut(false)}
        />
      )}
    </div>
  )

  const runRows = flowRuns?.runs ?? []
  const openRunId = runId ?? runRows[0]?.id
  const runsList = (
    <div className="@container flex min-h-0 flex-1 flex-col">
      {flowRunsError && !flowRuns ? (
        <ErrorRow message={flowRunsError} onRetry={() => void readFlowRuns()} className="p-4" />
      ) : flowRuns ? (
        <RunsTable
          mode="flow"
          runs={runRows}
          total={flowRuns.total}
          openId={openRunId}
          loadingMore={loadingMoreRuns}
          onOpen={onOpenRun}
          onLoadMore={() => void loadMoreRuns()}
          empty="This flow has not run yet. Press Run to try it."
        />
      ) : null}
    </div>
  )

  const header = (
    <DashboardCardHeader className="@container gap-2">
      <PanelReopenButton side="left" label="Show the page" />
      {wide && stepsState.collapsed ? (
        // First in the header while the page is open, its icon 16px in, where
        // the step list's own collapse button sat (Tyler, 9 Nov 2026: "The
        // uncollapse icon left padding has to be the same as when it was
        // uncollapsed").
        <StepsToggle shut label="Show the steps" onClick={toggleSteps} className="first:-ml-[13px]" />
      ) : null}
      {/* No back arrow and no title (Tyler, 9 Nov 2026: "Remove the arrow
          and title to go back"): the flow's name is its line in the table,
          and Automations in the Dashboards block, or the browser's Back,
          returns there. */}
      {templateMode ? (
        <span className="text-sm text-muted-foreground">Template, {name}</span>
      ) : (
        // At the header's start, where the title was (Tyler, 9 Nov 2026:
        // "Tabs move here").
        <DashboardTabs
          className="shrink-0"
          value={pane}
          onValueChange={(value) => onPaneChange(value as EditorPane)}
          tabs={[
            { value: "canvas", label: "Canvas" },
            { value: "runs", label: "Runs", count: flowRuns?.total },
          ]}
        />
      )}
      {templateMode ? null : (
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2">
          {triggerName ? (
            <DisabledReason
              disabled={!compiled.config && !live}
              reason="Fix the steps marked in red before switching this flow on."
            >
              <label className="flex items-center gap-2 text-sm">
                {/* On, but edited since into something that cannot run: the
                    switch alone would read as "this is happening". */}
                <span
                  className={cn(
                    "@max-4xl:sr-only",
                    live && !compiled.config ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {!live ? "Off" : compiled.config ? "Live" : "On, but not running"}
                </span>
                <Switch
                  checked={live}
                  disabled={savingLive || (!compiled.config && !live)}
                  aria-label={`${live ? "Stop" : "Start"} this flow reacting to ${triggerName}`}
                  onCheckedChange={(next) => void handleLiveChange(next)}
                />
              </label>
            </DisabledReason>
          ) : null}
          {/* The app's own controls: what its flow is right now, read first. */}
          <CanvasHeaderStatus automationId={initial.id} nodeKinds={nodeKinds} />
          {offersMemberTest ? (
            <DisabledReason
              disabled={paused || !compiled.config}
              reason={
                paused
                  ? "Every automation is paused. Resume them to start this flow."
                  : "Fix the steps marked in red before running this automation."
              }
            >
              <Button
                type="button"
                variant="outline"
                aria-label="Test with one person"
                disabled={paused || !compiled.config || preparingTest}
                onClick={() => void openMemberTest()}
              >
                {preparingTest ? <Loader2Icon className="size-4 animate-spin" /> : <UserIcon className="size-4" />}
                <span className="@max-3xl:sr-only">Test</span>
              </Button>
            </DisabledReason>
          ) : null}
          {canRunManually && appShowsRunButton() ? (
            <DisabledReason
              disabled={paused || !compiled.config || running}
              reason={
                paused
                  ? "Every automation is paused. Resume them to start this flow."
                  : !compiled.config
                    ? "Fix the steps marked in red before running this automation."
                    : null
              }
            >
              <Button type="button" disabled={paused || !compiled.config || running} onClick={() => void handleRunNow()}>
                {running ? <Loader2Icon className="size-4 animate-spin" /> : <PlayIcon className="size-4" />}
                Run
              </Button>
            </DisabledReason>
          ) : null}
          <FoldingMenu label="More for this automation" fit align="end" open={menuOpen} onOpenChange={setMenuOpen}>
            <MenuAction
              icon={<PencilIcon className="size-4" />}
              onClick={() => {
                setMenuOpen(false)
                setRenameText(name)
                setRenameOpen(true)
              }}
            >
              Rename
            </MenuAction>
            {onDuplicate ? (
              <MenuAction
                icon={<CopyIcon className="size-4" />}
                onClick={() => {
                  setMenuOpen(false)
                  void saveNow().then(onDuplicate)
                }}
              >
                Duplicate
              </MenuAction>
            ) : null}
            {onDelete ? (
              <>
                <MenuLine />
                <MenuAction
                  destructive
                  icon={<Trash2Icon className="size-4" />}
                  onClick={() => {
                    setMenuOpen(false)
                    onDelete()
                  }}
                >
                  Delete
                </MenuAction>
              </>
            ) : null}
          </FoldingMenu>
        </div>
      )}
      {headingEnd}
    </DashboardCardHeader>
  )

  const canvasCard = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      {header}
      {runsShown ? runsList : canvas}
    </div>
  )
  // Two panels in the middle on a wide screen: the step list, then the canvas
  // or the Runs tab; the step list stays beside the Runs tab too (Tyler,
  // 9 Nov 2026: "clicking on the runs tab should not close the left panel").
  // A narrow screen draws the canvas card alone.
  const middle = wide ? (
    <ResizablePanelGroup
      // A new width from Settings starts the list again at it.
      key={stepListWidth}
      orientation="horizontal"
      className={cn("min-h-0 flex-1", foldingClassName)}
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

  const right = runsShown
    ? {
        label: "Run",
        showLabel: "Show the run",
        content: openRunId ? (
          <RunRecord
            key={openRunId}
            runId={openRunId}
            fallback={runRows.find((run) => run.id === openRunId) ?? null}
            onChanged={() => {
              void readFlowRuns()
              refreshCounts()
            }}
            onDeleted={() => {
              onPaneChange("runs")
              void readFlowRuns()
              refreshCounts()
            }}
          />
        ) : (
          <EmptyRecord
            title="Run"
            icon={<HistoryIcon aria-hidden />}
            line={flowRuns ? "This flow has not run yet." : ""}
            loading={!flowRuns}
            hideLabel="Hide the run"
          />
        ),
      }
    : selectedNode
      ? {
          label: "Step",
          showLabel: "Show the step",
          content: (
            <AutomationInspector
              automationId={templateMode ? undefined : initial.id}
              selectedNode={selectedNode}
              graph={graph}
              errors={compiled.errors}
              favorite={selectedPaletteKey ? favoriteNodeKeys.includes(selectedPaletteKey) : undefined}
              savingFavorite={savingFavorites}
              onNodeChange={updateNode}
              onOpenNodeEditor={setEditingEmailNodeId}
              onToggleFavorite={selectedPaletteKey ? () => void toggleFavoriteNode(selectedPaletteKey) : undefined}
              onDeleteNode={requestDeleteNode}
              onAddNode={previewNode ? (node) => placeNode(node) : undefined}
            />
          ),
        }
      : null

  return frame({
    ids: [],
    showMiddleFor: `${initial.id}|${pane}`,
    showRightFor: runsShown ? runId : (previewNode?.id ?? selectedNodeId ?? undefined),
    middle,
    // Bare for as long as a flow is open on a wide screen, whatever it shows:
    // the frame draws a bare middle with another element, and switching
    // between the two started the editor over, losing an open email builder.
    bare: wide,
    right,
    windows,
  })
}

/**
 * The app's own panel on the canvas, and the button that brings it back.
 *
 * Drawn over the canvas at the top right, under the Run button, because that is
 * where somebody is looking when a flow starts. Nothing at all when the app has
 * not asked for one.
 *
 * Each panel is wrapped once and kept: `React.lazy` returns a new component
 * type every call, and one made during a render loses its state on every
 * render.
 */
const lazyCanvasPanels = new Map<
  string,
  React.LazyExoticComponent<ComponentType<AutomationCanvasPanelProps>>
>()

/**
 * The app's own status in the canvas header, or nothing at all.
 *
 * Nothing is the default and nothing is drawn around it: no chrome, no label,
 * no fallback. An app that has not asked for this finds the header exactly as
 * it has always been, which is what the option test checks.
 */
function CanvasHeaderStatus({
  automationId,
  nodeKinds,
}: {
  automationId: string
  nodeKinds: readonly string[]
}) {
  const declared = appCanvasHeaderStatus()
  const asked =
    declared && (declared.appliesTo?.(nodeKinds) ?? true) ? declared : null

  // Fetched as the editor draws rather than when it is first needed, for the
  // reason written on the panel below.
  React.useEffect(() => {
    if (asked) void asked.status()
  }, [asked])

  if (!asked) return null

  let chip = lazyHeaderStatus.get(asked)
  if (!chip) {
    chip = React.lazy(asked.status)
    lazyHeaderStatus.set(asked, chip)
  }

  // No fallback: a header that flickers a placeholder every time it draws is
  // worse than one that fills in a moment later.
  return (
    <React.Suspense fallback={null}>
      {React.createElement(chip, { automationId })}
    </React.Suspense>
  )
}

/** Kept so the lazy import is made once rather than on every draw. */
const lazyHeaderStatus = new Map<
  AutomationCanvasStatus,
  React.LazyExoticComponent<ComponentType<AutomationCanvasStatusProps>>
>()

function AppCanvasPanel({
  automationId,
  nodeKinds,
  runId,
  shut,
  onShut,
  onOpen,
}: {
  automationId: string
  nodeKinds: readonly string[]
  runId: string | null
  shut: boolean
  onShut: () => void
  onOpen: () => void
}) {
  const declared = appCanvasPanel()
  // Nothing at all — not even the button — on a flow this panel is not about.
  const asked =
    declared && (declared.appliesTo?.(nodeKinds) ?? true) ? declared : null

  // Fetched as soon as the editor is drawn, not when the panel is first shown.
  // It is a lazy import, so without this the first open waits on a download —
  // which is exactly the moment somebody has just pressed Run and is watching.
  React.useEffect(() => {
    if (asked) void asked.panel()
  }, [asked])

  if (!asked) return null

  if (shut) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="absolute top-3 right-3 z-10 shadow-sm"
        onClick={onOpen}
      >
        {asked.label}
      </Button>
    )
  }

  let panel = lazyCanvasPanels.get(asked.label)
  if (!panel) {
    panel = React.lazy(asked.panel)
    lazyCanvasPanels.set(asked.label, panel)
  }

  return (
    <div className="absolute top-3 right-3 z-10 w-80 max-w-[calc(100%-1.5rem)]">
      <React.Suspense fallback={null}>
        {React.createElement(panel as ComponentType<AutomationCanvasPanelProps>, {
          automationId,
          runId,
          onClose: onShut,
        })}
      </React.Suspense>
    </div>
  )
}

/** The step list's shut and reopen button: at its header's end, or the canvas header's start while shut. */
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

/** The email builder's card when the middle is bare, as it is on a wide screen. */
function EmailBuilderBox({ wide, children }: { wide: boolean; children: React.ReactNode }) {
  return wide ? <WorkspacePanel className="flex h-full flex-col">{children}</WorkspacePanel> : <>{children}</>
}
