import * as React from "react"
import type { ComponentType } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  LayoutTemplateIcon,
  Loader2Icon,
  PlayIcon,
  UserIcon,
  WorkflowIcon,
} from "lucide-react"
import type { PanelImperativeHandle } from "react-resizable-panels"
import { toast } from "sonner"

import { AutomationRunsPanel } from "@/components/automations/automation-runs-panel"
import { TestWithMemberDialog } from "@/components/automations/test-with-member-dialog"
import { AutomationFlowCanvas } from "@/components/automations/automation-flow-canvas"
import { AutomationInspector } from "@/components/automations/automation-inspector"
import { AutomationPalette } from "@/components/automations/automation-palette"
import { SendEmailEditor } from "@/components/automations/nodes/send-email-editor"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Switch } from "@/components/ui/switch"
import {
  BOTTOM_COLLAPSED_HEIGHT,
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
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
  runAutomationNow,
  type AutomationRunsPanelData,
} from "@/lib/api/automations/automation-runs"
import {
  getAutomationErrorMessage,
  saveAutomation,
  saveAutomationFavorites,
  setAutomationLive,
  type AutomationDetail,
} from "@/lib/api/automations/automations"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { useLastValue } from "@/lib/hooks/use-last-value"
import {
  useBlankSpaceDoubleClick,
  usePanelCollapsed,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import {
  panelLayoutKey,
  useRememberedPanelLayout,
} from "@/lib/layout/panel-layout"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { useWideScreen } from "@/lib/layout/wide-screen"
import type { SaveStatus } from "@/components/shell/sticky-header/sticky-header"

import {
  appCanvasHeaderStatus,
  appCanvasPanel,
  appOffersMemberTest,
  appShowsRunButton,
} from "@/lib/app-options"
import type { AutomationCanvasPanelProps } from "@/lib/automations/canvas-panel"
import { nextNodePosition, type CanvasSize } from "./canvas-model"

// Same debounce as the shell's settings auto-save, so editing an automation
// saves on the rhythm every other editable surface in this app uses.
const SAVE_DEBOUNCE_MS = 700

export function AutomationEditor({
  initial,
  initialFavoriteNodeKeys,
  initialRuns,
  initialBlockDefaults,
  openRunId,
  openNode,
  mode = "automation",
  onSaveTemplateGraph,
}: {
  initial: Pick<AutomationDetail, "id" | "name" | "graph" | "enabled">
  initialFavoriteNodeKeys: string[]
  initialRuns?: AutomationRunsPanelData
  initialBlockDefaults: BroadcastBlockDefaults
  /** The run a bell notice linked to, opened in the bottom panel on arrival. */
  openRunId?: string
  /**
   * A step to arrive with already selected, by its id or by its kind.
   *
   * For a page built out of one step's work — a backtest report, say — sending
   * somebody back to "the settings that produced this" rather than to the
   * canvas with nothing chosen. A kind is accepted because the sender usually
   * knows what the step is without knowing this flow's copy of it.
   */
  openNode?: string
  mode?: "automation" | "template"
  onSaveTemplateGraph?: (graph: AutomationGraph) => Promise<unknown>
}) {
  const navigate = useNavigate()
  const { config, reportSaveStatus } = useShellRuntime()
  // Nothing on this page renames an automation any more, so the name is only
  // ever the one it loaded with — but it still has to ride along on every save,
  // or the record would be written back without it.
  const [name] = React.useState(initial.name)
  const [graph, setGraph] = React.useState(initial.graph)
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(
    // Worked out here rather than in an effect: selecting after the first draw
    // would flash the empty settings panel first, and an effect that ran again
    // would drag somebody back to this step every time they picked another.
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
  // The run this canvas started, and whether the app's own panel is open.
  // Opened by pressing Run, and stays until it is closed by hand — a panel
  // that vanished when the run finished would take the result with it.
  const [startedRunId, setStartedRunId] = React.useState<string | null>(null)
  const [appPanelShut, setAppPanelShut] = React.useState(false)
  const [editingEmailNodeId, setEditingEmailNodeId] = React.useState<
    string | null
  >(null)
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
  const [running, setRunning] = React.useState(false)
  const [testOpen, setTestOpen] = React.useState(false)
  const [preparingTest, setPreparingTest] = React.useState(false)
  const [live, setLive] = React.useState(initial.enabled)
  const [savingLive, setSavingLive] = React.useState(false)
  const templateMode = mode === "template"
  const saveTemplateGraphRef = React.useRef(onSaveTemplateGraph)
  React.useEffect(() => {
    saveTemplateGraphRef.current = onSaveTemplateGraph
  }, [onSaveTemplateGraph])
  // Known before the first render on both sides, so the editor opens in the
  // layout it is going to keep instead of painting the phone version — a
  // full-width canvas with no palette and no inspector — and rebuilding itself.
  const desktop = useWideScreen()
  const [paletteCollapsed, setPaletteCollapsed] = React.useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = React.useState(false)
  const [favoriteNodeKeys, setFavoriteNodeKeys] = React.useState(
    initialFavoriteNodeKeys
  )
  const [savingFavorites, setSavingFavorites] = React.useState(false)
  const graphRef = React.useRef(graph)
  const palettePanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const inspectorPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const runsPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const horizontalLayout = useRememberedPanelLayout(
    panelLayoutKey.automationEditorHorizontal
  )
  const verticalLayout = useRememberedPanelLayout(
    panelLayoutKey.automationEditorVertical
  )

  const togglePalette = usePanelToggle(palettePanelRef)
  const toggleInspector = usePanelToggle(inspectorPanelRef)
  const toggleRuns = usePanelToggle(runsPanelRef)

  // Shut, the runs panel is exactly its own tab row, and that row's line would
  // sit on top of the panel's bottom edge. See `headerOnly`.
  const runsShut = usePanelCollapsed(runsPanelRef)

  // Double-clicking the empty part of a panel shuts it, and double-clicking
  // what is left of it opens it again.
  const paletteDoubleClick = useBlankSpaceDoubleClick(togglePalette)
  const inspectorDoubleClick = useBlankSpaceDoubleClick(toggleInspector)
  const runsDoubleClick = useBlankSpaceDoubleClick(toggleRuns)

  React.useEffect(() => {
    graphRef.current = graph
  }, [graph])

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
        templateMode && saveTemplateGraphRef.current
          ? saveTemplateGraphRef.current(snapshot.graph)
          : saveAutomation({
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
      return true
    } catch (error) {
      if (version === saveVersionRef.current) {
        setSaveStatus("idle")
        showErrorToast(getAutomationErrorMessage(error))
      }
      return false
    }
  }, [initial.id, serialize, templateMode])

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
      const save =
        templateMode && saveTemplateGraphRef.current
          ? saveTemplateGraphRef.current(snapshot.graph)
          : saveAutomation({
              automationId: initial.id,
              name: snapshot.name,
              graph: snapshot.graph,
            })
      void save.catch(() => undefined)
    }
  }, [initial.id, serialize, templateMode])

  // The "Saved" badge clears itself the way the shared header's does.
  React.useEffect(() => {
    if (saveStatus !== "saved") return
    const timer = setTimeout(() => setSaveStatus("idle"), 2000)
    return () => clearTimeout(timer)
  }, [saveStatus])

  // Saving is reported in the sticky app header alongside every other
  // auto-save. Clearing on the way out matters: without it "Saved" would still
  // be sitting there on the next page.
  React.useEffect(() => {
    reportSaveStatus(saveStatus)
  }, [reportSaveStatus, saveStatus])

  React.useEffect(() => {
    return () => reportSaveStatus(null)
  }, [reportSaveStatus])

  const compiled = React.useMemo(() => compileAutomationGraph(graph), [graph])
  const canRunManually = compiled.config
    ? automationCanStartManually(compiled.config)
    : false
  // What is on the canvas, for the two things that ask: whether this app wants
  // its own panel here, and whether testing against one member means anything
  // on a flow made of these steps.
  const nodeKinds = React.useMemo(
    () => graph.nodes.map((node) => node.kind),
    [graph.nodes]
  )
  const offersMemberTest = appOffersMemberTest(nodeKinds)
  // Read off the draft, so the switch appears the moment a trigger is dropped
  // on the canvas rather than once the flow happens to compile.
  const triggerName = React.useMemo(() => {
    const triggers = graph.nodes.filter((node) =>
      automationKindIsTrigger(node.kind)
    )
    return triggers.length === 1 ? automationNodeName(triggers[0]) : null
  }, [graph.nodes])
  const paused = config.automationPause.enabled

  /**
   * The flow's own switch, and the only thing that makes a trigger act.
   *
   * The pending edit is flushed first, exactly as Run does: switching on reads
   * the compiled copy on the server, and a trigger typed a second ago is not in
   * it yet. Without this, switching on straight after drawing the trigger would
   * be refused for a flow that is plainly fine on screen.
   */
  const handleLiveChange = async (next: boolean) => {
    if (savingLive) return
    setSavingLive(true)
    try {
      if (next && !(await saveNow())) return
      const saved = await setAutomationLive(initial.id, next)
      dismissErrorToast()
      setLive(saved.enabled)
      toast.success(
        next
          ? `"${name}" is on. Its "${saved.trigger_name}" step starts it from now on — nothing from before is caught up.`
          : `"${name}" is off. Nothing starts it on its own any more.`
      )
    } catch (error) {
      showErrorToast(getAutomationErrorMessage(error))
    } finally {
      setSavingLive(false)
    }
  }

  const handleRunNow = async () => {
    if (running || paused || !compiled.config) return
    setRunning(true)
    // Opened on the press, not on the answer. Saving and starting take a
    // moment, and a panel that appears afterwards makes the button feel like
    // it did nothing.
    setAppPanelShut(false)
    try {
      await saveNow()
      const current = latestRef.current
      if (serialize(current.name, current.graph) !== lastSavedRef.current)
        return

      const { runId } = await runAutomationNow(initial.id)
      setStartedRunId(runId)
      // No toast for starting: the canvas panel opens on the press and shows
      // the run happening, which says it better than a message that covers
      // part of the screen to repeat what you just did.
      dismissErrorToast()
      await navigate({
        to: "/admin/automations/$automationId",
        params: { automationId: initial.id },
        search: { run: runId },
        replace: true,
      })
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
      const current = latestRef.current
      if (serialize(current.name, current.graph) !== lastSavedRef.current)
        return
      setTestOpen(true)
    } catch (error) {
      showErrorToast(getAutomationErrorMessage(error))
    } finally {
      setPreparingTest(false)
    }
  }
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
      changeGraph((current) => ({
        ...current,
        nodes: current.nodes.filter((item) => item.id !== nodeId),
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
        name: automationNodeName(node),
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
    },
    [canvasSize.width, changeGraph]
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
    (next: AutomationGraph) => changeGraph(() => next),
    [changeGraph]
  )

  const inspector = (
    <AutomationInspector
      selectedNode={selectedNode}
      graph={graph}
      errors={compiled.errors}
      favorite={
        selectedPaletteKey
          ? favoriteNodeKeys.includes(selectedPaletteKey)
          : undefined
      }
      savingFavorite={savingFavorites}
      onNodeChange={updateNode}
      onOpenNodeEditor={setEditingEmailNodeId}
      onToggleFavorite={
        selectedPaletteKey
          ? () => void toggleFavoriteNode(selectedPaletteKey)
          : undefined
      }
      onAddNode={previewNode ? placeNode : undefined}
      onDeleteNode={requestDeleteNode}
    />
  )

  const runsPanel =
    !templateMode && initialRuns ? (
      (active: boolean) => (
        <AutomationRunsPanel
          key={`${initial.id}:${openRunId ?? "runs"}`}
          automationId={initial.id}
          initial={initialRuns}
          openRunId={openRunId}
          active={active}
        />
      )
    ) : null
  const editingEmailNode = editingEmailNodeId
    ? (graph.nodes.find((node) => node.id === editingEmailNodeId) ?? null)
    : null

  if (editingEmailNode?.kind === "sendEmail") {
    return (
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
        bottomPanel={runsPanel}
      />
    )
  }

  const canvas = (
    <AutomationFlowCanvas
      graph={graph}
      errors={compiled.errors}
      selectedNodeId={selectedNodeId}
      selectedEdgeId={selectedEdgeId}
      onGraphChange={handleCanvasGraphChange}
      onSelectNode={selectCanvasNode}
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
      icon={
        templateMode ? (
          <LayoutTemplateIcon className="size-4" />
        ) : (
          <WorkflowIcon className="size-4" />
        )
      }
      // A template already carries its way out on the right, as a named
      // button. Only the real flow's icon is spare enough to become the arrow.
      back={
        templateMode
          ? undefined
          : { to: "/admin/automations", label: "Back to automations" }
      }
      title={name}
      meta={templateMode ? "Template" : undefined}
      action={
        templateMode ? (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void navigate({ to: "/admin/automations/templates" })
            }
          >
            <ArrowLeftIcon className="size-4" />
            Templates
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            {triggerName ? (
              <DisabledReason
                disabled={!compiled.config && !live}
                reason="Fix the steps marked in red before switching this flow on."
              >
                <label className="flex items-center gap-2 text-sm">
                  {/* On, but edited since into something that cannot run. The
                    switch alone would read as "this is happening". */}
                  <span
                    className={
                      live && !compiled.config
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }
                  >
                    {!live
                      ? "Start automation"
                      : compiled.config
                        ? `On — ${triggerName}`
                        : "On, but not running"}
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
            {/* The app's own controls, and every one of them.

                This strip is the one home an app has in this header: what its
                flow is right now, and anything a person would press about it.
                It sits before the shell's own buttons so the app's answer is
                read first. */}
            {templateMode ? null : (
              <CanvasHeaderStatus
                automationId={initial.id}
                nodeKinds={nodeKinds}
              />
            )}
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
                  disabled={paused || !compiled.config || preparingTest}
                  onClick={() => void openMemberTest()}
                >
                  {preparingTest ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <UserIcon className="size-4" />
                  )}
                  Test with member…
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
                <Button
                  type="button"
                  disabled={paused || !compiled.config || running}
                  onClick={() => void handleRunNow()}
                >
                  {running ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <PlayIcon className="size-4" />
                  )}
                  Run
                </Button>
              </DisabledReason>
            ) : null}
          </div>
        )
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
        <WorkspacePanel className="flex flex-col">
          {canvasHeader}
          <div className="relative flex min-h-0 flex-1">
            {canvas}
            <AppCanvasPanel
              automationId={initial.id}
              nodeKinds={nodeKinds}
              runId={startedRunId}
              shut={appPanelShut}
              onShut={() => setAppPanelShut(true)}
              onOpen={() => setAppPanelShut(false)}
            />
            {paletteCollapsed ? (
              <PanelReopenTab
                side="left"
                label="Show node palette"
                onClick={togglePalette}
              />
            ) : null}
            {inspectorCollapsed ? (
              <PanelReopenTab
                side="right"
                label="Show inspector"
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
    // flex-1 and min-w-0 are load-bearing: this sits in a flex row, and without
    // a width to fill it shrinks to its content — the canvas has no width of
    // its own, so the whole panel collapsed to its two border edges and read as
    // a stray line down the page.
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
        {templateMode ? (
          <div className="flex h-full min-h-0">{workspace}</div>
        ) : (
          <ResizablePanelGroup
            key={verticalLayout.layoutKey}
            orientation="vertical"
            className="min-h-0 flex-1"
            defaultLayout={verticalLayout.defaultLayout}
            onLayoutChanged={verticalLayout.onLayoutChanged}
          >
            <ResizablePanel id="workspace" defaultSize="72%" minSize="40%">
              <div className="flex h-full min-h-0">{workspace}</div>
            </ResizablePanel>
            {/* Keeps its gap even while the panel is collapsed — the collapsed
              tab row is still a panel on screen, and this handle is what makes
              it draggable back open. */}
            <ResizableHandle gap />
            <ResizablePanel
              id="runs"
              panelRef={runsPanelRef}
              // A shade taller than the old canvas log: this one holds rows that
              // open, and a run's steps need somewhere to land.
              defaultSize="28%"
              minSize="12%"
              maxSize="60%"
              // Dragging the divider all the way down collapses the panel to its
              // own tab row, counts and all. It never unmounts, so it can always
              // be dragged back open.
              collapsible
              collapsedSize={BOTTOM_COLLAPSED_HEIGHT}
              onResize={runsShut.onResize}
            >
              <WorkspacePanel
                onDoubleClick={runsDoubleClick}
                headerOnly={runsShut.collapsed}
              >
                {runsPanel?.(!runsShut.collapsed)}
              </WorkspacePanel>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>

      {!templateMode ? (
        <>
          <TestWithMemberDialog
            open={testOpen}
            automationId={initial.id}
            automationName={name}
            onOpenChange={setTestOpen}
            onStarted={async (runId) => {
              setStartedRunId(runId)
              setAppPanelShut(false)
              await navigate({
                to: "/admin/automations/$automationId",
                params: { automationId: initial.id },
                search: { run: runId },
                replace: true,
              })
            }}
          />
        </>
      ) : null}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={
          closingDeleteTarget
            ? `Delete “${closingDeleteTarget.name}”?`
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
            .querySelector<HTMLElement>('[aria-label="Automation canvas"]')
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
