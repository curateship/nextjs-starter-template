import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  LayoutTemplateIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  WorkflowIcon,
} from "lucide-react"
import type { PanelImperativeHandle } from "react-resizable-panels"
import { toast } from "sonner"

import { AutomationRunsPanel } from "@/components/automations/automation-runs-panel"
import { AutomationFlowCanvas } from "@/components/automations/automation-flow-canvas"
import { AutomationInspector } from "@/components/automations/automation-inspector"
import { AutomationPalette } from "@/components/automations/automation-palette"
import { SendEmailEditor } from "@/components/automations/nodes/send-email-editor"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
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
import type { AutomationGraph, AutomationNode } from "@/lib/automations/graph"
import type { BroadcastBlockDefaults } from "@/lib/broadcasts/blocks"
import {
  automationKindIsTrigger,
  automationNodeName,
  automationPaletteKeyForNode,
  createAutomationNode,
} from "@/lib/automations/node-registry"
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
import {
  useBlankSpaceDoubleClick,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import {
  panelLayoutKey,
  useRememberedPanelLayout,
} from "@/lib/layout/panel-layout"
import { useWideScreen } from "@/lib/layout/wide-screen"
import type { SaveStatus } from "@/components/shell/sticky-header/sticky-header"

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
  mode = "automation",
  onSaveTemplateGraph,
}: {
  initial: Pick<AutomationDetail, "id" | "name" | "graph" | "enabled">
  initialFavoriteNodeKeys: string[]
  initialRuns?: AutomationRunsPanelData
  initialBlockDefaults: BroadcastBlockDefaults
  /** The run a bell notice linked to, opened in the bottom panel on arrival. */
  openRunId?: string
  mode?: "automation" | "template"
  onSaveTemplateGraph?: (graph: AutomationGraph) => Promise<unknown>
}) {
  const navigate = useNavigate()
  const {
    config,
    automationPauseBusy,
    onAutomationPauseChange,
    reportSaveStatus,
  } = useShellRuntime()
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
  const [editingEmailNodeId, setEditingEmailNodeId] = React.useState<
    string | null
  >(null)
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
  const [running, setRunning] = React.useState(false)
  const [live, setLive] = React.useState(initial.enabled)
  const [savingLive, setSavingLive] = React.useState(false)
  const [confirmPauseOpen, setConfirmPauseOpen] = React.useState(false)
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
  // Read off the draft, so the switch appears the moment a trigger is dropped
  // on the canvas rather than once the flow happens to compile.
  const triggerName = React.useMemo(() => {
    const triggers = graph.nodes.filter((node) =>
      automationKindIsTrigger(node.kind)
    )
    return triggers.length === 1 ? automationNodeName(triggers[0]) : null
  }, [graph.nodes])
  const paused = config.automationPause.enabled

  const handlePauseChange = async (enabled: boolean) => {
    if (automationPauseBusy) return
    if (await onAutomationPauseChange(enabled)) setConfirmPauseOpen(false)
  }

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
    try {
      await saveNow()
      const current = latestRef.current
      if (serialize(current.name, current.graph) !== lastSavedRef.current)
        return

      const { runId } = await runAutomationNow(initial.id)
      dismissErrorToast()
      toast.success(`Started "${name}".`)
      runsPanelRef.current?.expand()
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
      onDeleteNode={deleteNode}
    />
  )

  const runsPanel =
    !templateMode && initialRuns ? (
      <AutomationRunsPanel
        key={`${initial.id}:${openRunId ?? "runs"}`}
        automationId={initial.id}
        initial={initialRuns}
        openRunId={openRunId}
      />
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
    <WorkspacePanelHeader
      icon={
        templateMode ? (
          <LayoutTemplateIcon className="size-4" />
        ) : (
          <WorkflowIcon className="size-4" />
        )
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
                  <Switch
                    checked={live}
                    disabled={savingLive || (!compiled.config && !live)}
                    aria-label={`${live ? "Stop" : "Start"} this flow reacting to ${triggerName}`}
                    onCheckedChange={(next) => void handleLiveChange(next)}
                  />
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
                      ? "Off"
                      : compiled.config
                        ? `On — ${triggerName}`
                        : "On, but not running"}
                  </span>
                </label>
              </DisabledReason>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={automationPauseBusy}
              onClick={() =>
                paused
                  ? void handlePauseChange(false)
                  : setConfirmPauseOpen(true)
              }
            >
              {automationPauseBusy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : paused ? (
                <PlayIcon className="size-4" />
              ) : (
                <PauseIcon className="size-4" />
              )}
              {paused ? "Resume all" : "Pause all"}
            </Button>
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
            >
              <WorkspacePanel onDoubleClick={runsDoubleClick}>
                {runsPanel}
              </WorkspacePanel>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>

      {!templateMode ? (
        <ConfirmDialog
          open={confirmPauseOpen}
          onOpenChange={setConfirmPauseOpen}
          title="Pause every automation?"
          description="Every flow stops as soon as you confirm, and no new one can be started by hand. Runs already in progress hold their place until you resume them."
          confirmLabel="Pause automations"
          loading={automationPauseBusy}
          onConfirm={() => void handlePauseChange(true)}
        />
      ) : null}
    </div>
  )
}
