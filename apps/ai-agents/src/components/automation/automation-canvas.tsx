import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  MinusIcon,
  PlayIcon,
  PlusIcon,
  WorkflowIcon,
} from "lucide-react"

import {
  catalog,
  catColor,
  CONTACT_NODE_TYPES,
  createNode,
  glyphs,
  typeDef,
  type FlowEdge,
  type FlowNode,
  type NodeCategory,
} from "@/components/automation/catalog"
import {
  edgePath,
  flowBounds,
  NODE_H,
  NODE_W,
  outputCountOf,
  portIn,
  portOut,
} from "@/components/automation/flow-utils"
import { RunWorkflowDialog } from "@/components/automation/run-workflow-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  cancelWorkflowRun,
  getWorkflowErrorMessage,
  startWorkflowRun,
  tickWorkflowRun,
  updateWorkflow,
  type WorkflowEditorData,
  type WorkflowRunDetail,
  type WorkflowRunStepItem,
} from "@/lib/api/workflows"

const EDGE_IDLE = "color-mix(in oklab, var(--muted-foreground) 55%, transparent)"
const PORT_IDLE = "color-mix(in oklab, var(--muted-foreground) 55%, transparent)"
const GRID_DOT = "color-mix(in oklab, var(--muted-foreground) 28%, transparent)"
const RUN_GREEN = "oklch(0.55 0.13 150)"

const MINIMAP_W = 172
const MINIMAP_H = 106

type DragState =
  | { mode: "pan"; startX: number; startY: number; panX: number; panY: number }
  | { mode: "node"; id: string; offX: number; offY: number }
  | { mode: "resize"; startX: number; startW: number }
  | { mode: "logresize"; startY: number; startH: number }

type ConnectDraft = { from: string; port: number; x: number; y: number }

type RunStatus = "running" | "done" | "failed" | "skipped"

type LogEntry = { time: string; badge: string; color: string; msg: string }

const TICK_INTERVAL_MS = 2000

const STEP_TO_RUN_STATUS: Record<string, RunStatus> = {
  running: "running",
  waiting: "running",
  completed: "done",
  failed: "failed",
  skipped: "skipped",
}

const RUN_STATUS_COLORS: Record<RunStatus, string> = {
  running: "var(--primary)",
  done: RUN_GREEN,
  failed: "var(--destructive)",
  skipped: "var(--muted-foreground)",
}

const RUN_STATUS_MARKS: Record<RunStatus, string> = {
  running: "●",
  done: "✓",
  failed: "✕",
  skipped: "–",
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function logTime(iso: string | null) {
  if (!iso) return "--:--:--"
  return new Date(iso).toLocaleTimeString("en-US", { hour12: false })
}

// One log line per executed step, with the interesting output facts inline.
function stepLogEntry(step: WorkflowRunStepItem): LogEntry {
  if (step.status === "running" || step.status === "waiting") {
    return {
      time: logTime(step.started_at),
      badge: "▸",
      color: "var(--primary)",
      msg:
        step.status === "waiting"
          ? `${step.node_name} · call in progress…`
          : `${step.node_name} · executing…`,
    }
  }
  const time = logTime(step.finished_at ?? step.started_at)
  if (step.status === "failed") {
    return {
      time,
      badge: "✕",
      color: "var(--destructive)",
      msg: `${step.node_name} failed${step.error ? ` · ${step.error}` : ""}`,
    }
  }
  if (step.status === "skipped") {
    return {
      time,
      badge: "–",
      color: "var(--muted-foreground)",
      msg: `${step.node_name} skipped`,
    }
  }
  const output = step.output ?? {}
  let detail = ""
  if (output.simulated) {
    detail = " · simulated (no integration yet)"
  } else if (step.node_type === "branch") {
    detail = ` · ${String(output.cond ?? "")} → ${output.result ? "true" : "false"}`
  } else if (step.node_type === "voicecall") {
    detail = ` · call ${String(output.call_status ?? "done")}${
      output.ended_reason ? ` (${String(output.ended_reason)})` : ""
    }`
  } else if (step.node_type === "http") {
    detail = ` · HTTP ${String(output.status ?? "")}`
  }
  return {
    time,
    badge: "✓",
    color: RUN_GREEN,
    msg: `${step.node_name} finished${detail}`,
  }
}

function CategoryGlyph({
  cat,
  className,
}: {
  cat: NodeCategory
  className?: string
}) {
  const color = catColor(cat)
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center", className)}
      style={{
        background: `color-mix(in oklab, ${color} 12%, var(--card))`,
        color,
      }}
    >
      {glyphs[cat]}
    </div>
  )
}

export function AutomationCanvas({ initial }: { initial: WorkflowEditorData }) {
  const workflowId = initial.workflow.id
  const [nodes, setNodes] = React.useState<FlowNode[]>(() => initial.workflow.nodes)
  const [edges, setEdges] = React.useState<FlowEdge[]>(() => initial.workflow.edges)
  const [name, setName] = React.useState(initial.workflow.name)
  const [pan, setPan] = React.useState({ x: 40, y: 30 })
  const [zoom, setZoom] = React.useState(0.95)
  const [sel, setSel] = React.useState<string | null>(null)
  const [selEdge, setSelEdge] = React.useState<string | null>(null)
  const [connect, setConnect] = React.useState<ConnectDraft | null>(null)
  const [isPanning, setIsPanning] = React.useState(false)
  const [run, setRun] = React.useState<WorkflowRunDetail | null>(
    initial.latest_run
  )
  const [logOpen, setLogOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [runDialogOpen, setRunDialogOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [inspW, setInspW] = React.useState(272)
  const [logH, setLogH] = React.useState(148)
  const [canvasSize, setCanvasSize] = React.useState({ width: 0, height: 0 })

  const canvasRef = React.useRef<HTMLDivElement | null>(null)
  const logScrollRef = React.useRef<HTMLDivElement | null>(null)
  const dragRef = React.useRef<DragState | null>(null)
  const addCountRef = React.useRef(0)
  // Serialized snapshot of the last persisted state; drives dirty tracking
  // across drags, config edits, and renames without touching every handler.
  const [lastSaved, setLastSaved] = React.useState(() =>
    JSON.stringify({
      name: initial.workflow.name,
      nodes: initial.workflow.nodes,
      edges: initial.workflow.edges,
    })
  )

  const running = run?.run.status === "running"
  const dirty = JSON.stringify({ name, nodes, edges }) !== lastSaved

  // Node + log render state comes straight from the persisted run.
  const status = React.useMemo(() => {
    const map: Record<string, RunStatus> = {}
    for (const step of run?.steps ?? []) {
      const mapped = STEP_TO_RUN_STATUS[step.status]
      if (mapped) map[step.node_id] = mapped
    }
    return map
  }, [run])

  const log = React.useMemo<LogEntry[]>(() => {
    if (!run) return []
    const entries: LogEntry[] = [
      {
        time: logTime(run.run.started_at),
        badge: "▸",
        color: "var(--muted-foreground)",
        msg: "Workflow started · manual run",
      },
    ]
    const steps = [...run.steps]
      .filter((step) => step.status !== "pending")
      .sort((a, b) =>
        (a.started_at ?? a.finished_at ?? "") <
        (b.started_at ?? b.finished_at ?? "")
          ? -1
          : 1
      )
    for (const step of steps) {
      entries.push(stepLogEntry(step))
    }
    if (run.run.status !== "running") {
      const ok = run.run.status === "completed"
      entries.push({
        time: logTime(run.run.finished_at ?? run.run.started_at),
        badge: ok ? "✓" : "✕",
        color: ok ? RUN_GREEN : "var(--destructive)",
        msg: `Workflow ${run.run.status}`,
      })
    }
    return entries
  }, [run])

  // Latest state for event handlers and async callbacks; synced after every
  // render (handlers only fire after effects have run).
  const stateRef = React.useRef({
    nodes,
    edges,
    name,
    pan,
    zoom,
    sel,
    selEdge,
    connect,
    running,
    lastSaved,
  })
  React.useEffect(() => {
    stateRef.current = {
      nodes,
      edges,
      name,
      pan,
      zoom,
      sel,
      selEdge,
      connect,
      running,
      lastSaved,
    }
  })

  // While the run is live this poll IS the engine — each tick advances steps
  // server-side and returns fresh state (same model as the campaign dialer).
  const activeRunId = running && run ? run.run.id : null
  React.useEffect(() => {
    if (!activeRunId) return
    const timer = setInterval(() => {
      tickWorkflowRun(activeRunId)
        .then(setRun)
        .catch((tickError) => {
          setError(getWorkflowErrorMessage(tickError))
        })
    }, TICK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [activeRunId])

  const worldFromClient = React.useCallback((clientX: number, clientY: number) => {
    const el = canvasRef.current
    const { pan: currentPan, zoom: currentZoom } = stateRef.current
    if (!el) {
      return { x: 0, y: 0 }
    }
    const rect = el.getBoundingClientRect()
    return {
      x: (clientX - rect.left - currentPan.x) / currentZoom,
      y: (clientY - rect.top - currentPan.y) / currentZoom,
    }
  }, [])

  const deleteNode = React.useCallback((id: string) => {
    setNodes((current) => current.filter((node) => node.id !== id))
    setEdges((current) =>
      current.filter((edge) => edge.from !== id && edge.to !== id)
    )
    setSel((current) => (current === id ? null : current))
  }, [])

  const fitView = React.useCallback(() => {
    const el = canvasRef.current
    const bounds = flowBounds(stateRef.current.nodes)
    if (!el || !bounds) {
      return
    }
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) {
      return
    }
    const minX = bounds.minX - 60
    const minY = bounds.minY - 60
    const maxX = bounds.maxX + 60
    const maxY = bounds.maxY + 60
    const nextZoom = Math.min(
      1.4,
      rect.width / (maxX - minX),
      rect.height / (maxY - minY)
    )
    setZoom(nextZoom)
    setPan({
      x: (rect.width - (maxX - minX) * nextZoom) / 2 - minX * nextZoom,
      y: (rect.height - (maxY - minY) * nextZoom) / 2 - minY * nextZoom,
    })
  }, [])

  const zoomAt = React.useCallback(
    (factor: number, anchorX: number, anchorY: number) => {
      const { pan: currentPan, zoom: currentZoom } = stateRef.current
      const nextZoom = clamp(currentZoom * factor, 0.25, 2)
      setZoom(nextZoom)
      setPan({
        x: anchorX - (anchorX - currentPan.x) * (nextZoom / currentZoom),
        y: anchorY - (anchorY - currentPan.y) * (nextZoom / currentZoom),
      })
    },
    []
  )

  const zoomBy = React.useCallback(
    (factor: number) => {
      const el = canvasRef.current
      if (!el) {
        return
      }
      const rect = el.getBoundingClientRect()
      zoomAt(factor, rect.width / 2, rect.height / 2)
    },
    [zoomAt]
  )

  React.useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (stateRef.current.connect) {
        const world = worldFromClient(event.clientX, event.clientY)
        setConnect((current) =>
          current ? { ...current, x: world.x, y: world.y } : current
        )
        return
      }
      const drag = dragRef.current
      if (!drag) {
        return
      }
      if (drag.mode === "pan") {
        setPan({
          x: drag.panX + event.clientX - drag.startX,
          y: drag.panY + event.clientY - drag.startY,
        })
      } else if (drag.mode === "node") {
        const world = worldFromClient(event.clientX, event.clientY)
        setNodes((current) =>
          current.map((node) =>
            node.id === drag.id
              ? { ...node, x: world.x - drag.offX, y: world.y - drag.offY }
              : node
          )
        )
      } else if (drag.mode === "resize") {
        setInspW(clamp(drag.startW + drag.startX - event.clientX, 220, 520))
      } else if (drag.mode === "logresize") {
        setLogH(clamp(drag.startH + drag.startY - event.clientY, 70, 440))
      }
    }

    const onUp = () => {
      dragRef.current = null
      setIsPanning(false)
      setConnect(null)
    }

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable
      ) {
        return
      }
      if (event.key === "Escape") {
        setSel(null)
        setSelEdge(null)
        setConnect(null)
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault()
        const { sel: selectedNode, selEdge: selectedEdge } = stateRef.current
        if (selectedNode) {
          deleteNode(selectedNode)
        } else if (selectedEdge) {
          setEdges((current) => current.filter((edge) => edge.id !== selectedEdge))
          setSelEdge(null)
        }
      }
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      window.removeEventListener("keydown", onKey)
    }
  }, [deleteNode, worldFromClient])

  React.useEffect(() => {
    const el = canvasRef.current
    if (!el) {
      return
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) {
        const rect = el.getBoundingClientRect()
        zoomAt(
          Math.exp(-event.deltaY * 0.01),
          event.clientX - rect.left,
          event.clientY - rect.top
        )
      } else {
        const { pan: currentPan } = stateRef.current
        setPan({
          x: currentPan.x - event.deltaX,
          y: currentPan.y - event.deltaY,
        })
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      el.removeEventListener("wheel", onWheel)
    }
  }, [zoomAt])

  React.useEffect(() => {
    const el = canvasRef.current
    if (!el) {
      return
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setCanvasSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
    }
  }, [])

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      fitView()
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [fitView])

  React.useEffect(() => {
    const el = logScrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [log.length, logOpen])

  const addNode = React.useCallback((type: string) => {
    const el = canvasRef.current
    const rect = el ? el.getBoundingClientRect() : { width: 800, height: 600 }
    const { pan: currentPan, zoom: currentZoom } = stateRef.current
    const stagger = addCountRef.current++ % 5
    const x =
      (rect.width / 2 - currentPan.x) / currentZoom - NODE_W / 2 + stagger * 26
    const y =
      (rect.height / 2 - currentPan.y) / currentZoom - NODE_H / 2 + stagger * 22
    const node = createNode(type, x, y)
    setNodes((current) => [...current, node])
    setSel(node.id)
    setSelEdge(null)
  }, [])

  const finishConnect = React.useCallback((targetId: string) => {
    const draft = stateRef.current.connect
    if (!draft || draft.from === targetId) {
      return
    }
    const duplicate = stateRef.current.edges.some(
      (edge) =>
        edge.from === draft.from && edge.port === draft.port && edge.to === targetId
    )
    if (!duplicate) {
      setEdges((current) => [
        ...current,
        { id: crypto.randomUUID(), from: draft.from, port: draft.port, to: targetId },
      ])
    }
    setConnect(null)
  }, [])

  const updateNodeConfig = React.useCallback(
    (id: string, key: string, value: string | number) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === id
            ? { ...node, config: { ...node.config, [key]: value } }
            : node
        )
      )
    },
    []
  )

  const renameNode = React.useCallback((id: string, name: string) => {
    setNodes((current) =>
      current.map((node) => (node.id === id ? { ...node, name } : node))
    )
  }, [])

  const save = React.useCallback(async (): Promise<boolean> => {
    const { nodes: currentNodes, edges: currentEdges, name: currentName } =
      stateRef.current
    const payload = JSON.stringify({
      name: currentName,
      nodes: currentNodes,
      edges: currentEdges,
    })
    if (payload === stateRef.current.lastSaved) return true
    setSaving(true)
    setError(null)
    try {
      await updateWorkflow({
        workflowId,
        name: currentName,
        nodes: currentNodes,
        edges: currentEdges,
      })
      setLastSaved(payload)
      return true
    } catch (saveError) {
      setError(getWorkflowErrorMessage(saveError))
      return false
    } finally {
      setSaving(false)
    }
  }, [workflowId])

  // Throws so callers (Run button, run dialog) surface the error where the
  // user acted.
  const startRun = React.useCallback(
    async (contactId?: string) => {
      const detail = await startWorkflowRun(workflowId, contactId)
      setRun(detail)
      setLogOpen(true)
    },
    [workflowId]
  )

  const handleRun = React.useCallback(async () => {
    if (stateRef.current.running) return
    setError(null)
    // Run what's on screen, not a stale save.
    if (!(await save())) return
    const needsContact = stateRef.current.nodes.some((node) =>
      CONTACT_NODE_TYPES.has(node.type)
    )
    if (needsContact) {
      setRunDialogOpen(true)
      return
    }
    try {
      await startRun()
    } catch (runError) {
      setError(getWorkflowErrorMessage(runError))
    }
  }, [save, startRun])

  const onCanvasMouseDown = (event: React.MouseEvent) => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    setSel(null)
    setSelEdge(null)
    setIsPanning(true)
    dragRef.current = {
      mode: "pan",
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    }
  }

  const onNodeMouseDown = (event: React.MouseEvent, node: FlowNode) => {
    if (event.button !== 0) {
      return
    }
    event.stopPropagation()
    event.preventDefault()
    const world = worldFromClient(event.clientX, event.clientY)
    setSel(node.id)
    setSelEdge(null)
    dragRef.current = {
      mode: "node",
      id: node.id,
      offX: world.x - node.x,
      offY: world.y - node.y,
    }
  }

  const onPortOutMouseDown = (
    event: React.MouseEvent,
    node: FlowNode,
    portIndex: number
  ) => {
    event.stopPropagation()
    event.preventDefault()
    const point = portOut(node, portIndex)
    setConnect({ from: node.id, port: portIndex, x: point.x, y: point.y })
  }

  const startInspectorResize = (event: React.MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    dragRef.current = { mode: "resize", startX: event.clientX, startW: inspW }
  }

  const startLogResize = (event: React.MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    dragRef.current = { mode: "logresize", startY: event.clientY, startH: logH }
  }

  const query = search.trim().toLowerCase()
  const libraryGroups = catalog
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          !query || `${item.name} ${item.desc}`.toLowerCase().includes(query)
      ),
    }))
    .filter((group) => group.items.length)

  const selNode = sel ? nodes.find((node) => node.id === sel) ?? null : null
  const selDef = selNode ? typeDef(selNode.type) : null

  const nodeById = (id: string) => {
    const node = nodes.find((candidate) => candidate.id === id)
    if (!node) {
      throw new Error(`Flow state out of sync: missing node ${id}`)
    }
    return node
  }

  // The connect draft's source node can be deleted mid-drag (keyboard Delete),
  // so drop the preview instead of failing.
  const connectFromNode = connect
    ? nodes.find((node) => node.id === connect.from) ?? null
    : null

  const bounds = flowBounds(nodes)
  let minimapScale = 0
  if (bounds) {
    minimapScale = Math.min(
      (MINIMAP_W - 20) / Math.max(1, bounds.maxX - bounds.minX),
      (MINIMAP_H - 20) / Math.max(1, bounds.maxY - bounds.minY)
    )
  }

  const onMinimapMouseDown = (event: React.MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    const el = canvasRef.current
    if (!el || !bounds || !minimapScale) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const worldX = bounds.minX + (event.clientX - rect.left - 10) / minimapScale
    const worldY = bounds.minY + (event.clientY - rect.top - 10) / minimapScale
    const canvasRect = el.getBoundingClientRect()
    setPan({
      x: canvasRect.width / 2 - worldX * zoom,
      y: canvasRect.height / 2 - worldY * zoom,
    })
  }

  const gridSize = 26 * zoom

  return (
    <div className="-m-3 flex h-[calc(100%+1.5rem)] min-h-0 flex-col overflow-hidden bg-background text-[13px] sm:-m-4 sm:h-[calc(100%+2rem)] md:-m-6 md:h-[calc(100%+3rem)]">
      <style>{`@keyframes af-dash{to{stroke-dashoffset:-30}}@keyframes af-pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>

      <div className="flex h-12 shrink-0 items-center gap-3 border-b px-3.5">
        <Button
          asChild
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Back to workflows"
        >
          <Link to="/admin/automation">
            <ArrowLeftIcon className="size-4" />
          </Link>
        </Button>
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <WorkflowIcon className="size-4" />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Workflow name"
            className="w-full min-w-0 border-none bg-transparent p-0 text-[13px] leading-none font-semibold outline-none focus:text-primary"
          />
          <div className="truncate text-[10.5px] leading-none text-muted-foreground">
            Automation ·{" "}
            {running ? "Running" : dirty ? "Unsaved changes" : "Saved"}
          </div>
        </div>
        {error ? (
          <div className="max-w-[320px] truncate text-[11px] text-destructive">
            {error}
          </div>
        ) : null}
        <div className="flex-1" />
        <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Zoom out"
            onClick={() => zoomBy(1 / 1.2)}
          >
            <MinusIcon />
          </Button>
          <div className="min-w-[42px] text-center font-mono text-[11px] text-muted-foreground">
            {Math.round(zoom * 100)}%
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Zoom in"
            onClick={() => zoomBy(1.2)}
          >
            <PlusIcon />
          </Button>
          <Button variant="ghost" size="xs" onClick={fitView}>
            Fit
          </Button>
        </div>
        <div className="h-5 w-px bg-border" />
        <Button variant="outline" size="sm" onClick={() => setLogOpen((open) => !open)}>
          Log
        </Button>
        <Button variant="outline" size="sm" disabled={saving} onClick={save}>
          {saving ? "Saving…" : dirty ? "Save" : "Saved ✓"}
        </Button>
        {running && run ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              cancelWorkflowRun(run.run.id)
                .then(setRun)
                .catch((cancelError) =>
                  setError(getWorkflowErrorMessage(cancelError))
                )
            }}
          >
            Cancel
          </Button>
        ) : null}
        <Button size="sm" disabled={running || saving} onClick={handleRun}>
          <PlayIcon data-icon="inline-start" />
          {running ? "Running…" : "Run"}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-[230px] shrink-0 flex-col border-r">
          <div className="p-3 pb-2">
            <Input
              placeholder="Search nodes…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-3 pb-4 pt-0.5">
            {libraryGroups.map((group) => (
              <div key={group.group} className="flex flex-col gap-1.5">
                <div className="px-0.5 text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                  {group.group}
                </div>
                {group.items.map((item) => {
                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => addNode(item.type)}
                      className="flex w-full items-center gap-2 rounded-[10px] border bg-card p-2 text-left transition-colors hover:border-primary/40 hover:shadow-sm"
                    >
                      <CategoryGlyph
                        cat={group.cat}
                        className="size-6.5 rounded-md text-xs"
                      />
                      <div className="flex min-w-0 flex-col gap-px">
                        <div className="truncate text-xs leading-tight font-semibold">
                          {item.name}
                        </div>
                        <div className="truncate text-[10.5px] leading-tight text-muted-foreground">
                          {item.desc}
                        </div>
                      </div>
                      <span className="ml-auto text-sm text-muted-foreground/60">
                        +
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="border-t px-3.5 py-2.5 text-[10.5px] leading-normal text-muted-foreground">
            Click a node to add it to the canvas
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            ref={canvasRef}
            onMouseDown={onCanvasMouseDown}
            className={cn(
              "relative min-h-0 flex-1 touch-none overflow-hidden bg-muted/50 select-none",
              isPanning ? "cursor-grabbing" : connect ? "cursor-crosshair" : "cursor-grab"
            )}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: `radial-gradient(${GRID_DOT} 1.2px, transparent 1.2px)`,
                backgroundSize: `${gridSize}px ${gridSize}px`,
                backgroundPosition: `${pan.x}px ${pan.y}px`,
              }}
            />
            <div
              className="absolute top-0 left-0 h-0 w-0"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
              }}
            >
              <svg
                className="pointer-events-none absolute top-0 left-0 overflow-visible"
                width={10}
                height={10}
              >
                {edges.map((edge) => {
                  const d = edgePath(
                    portOut(nodeById(edge.from), edge.port),
                    portIn(nodeById(edge.to))
                  )
                  const active =
                    status[edge.from] === "done" && status[edge.to] === "running"
                  const done =
                    status[edge.from] === "done" && status[edge.to] === "done"
                  const isSelected = selEdge === edge.id
                  return (
                    <g key={edge.id}>
                      <path
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={14}
                        className="cursor-pointer"
                        style={{ pointerEvents: "stroke" }}
                        onMouseDown={(event) => {
                          event.stopPropagation()
                          setSelEdge(edge.id)
                          setSel(null)
                        }}
                      />
                      <path
                        d={d}
                        fill="none"
                        stroke={
                          isSelected || active || done
                            ? "var(--primary)"
                            : EDGE_IDLE
                        }
                        strokeWidth={isSelected ? 2.5 : 2}
                        strokeLinecap="round"
                        strokeDasharray={active ? "7 8" : undefined}
                        style={
                          active
                            ? { animation: "af-dash .5s linear infinite" }
                            : undefined
                        }
                      />
                    </g>
                  )
                })}
                {connect && connectFromNode ? (
                  <path
                    d={edgePath(portOut(connectFromNode, connect.port), {
                      x: connect.x,
                      y: connect.y,
                    })}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    strokeDasharray="5 6"
                  />
                ) : null}
              </svg>

              {nodes.map((node) => {
                const def = typeDef(node.type)
                const nodeStatus = status[node.id]
                const isSelected = sel === node.id
                const outputCount = outputCountOf(node)
                return (
                  <div
                    key={node.id}
                    onMouseDown={(event) => onNodeMouseDown(event, node)}
                    className="absolute top-0 left-0 box-border w-56 cursor-grab rounded-[11px] bg-card"
                    style={{
                      transform: `translate(${node.x}px, ${node.y}px)`,
                      border: `1.5px solid ${
                        isSelected || nodeStatus === "running"
                          ? "var(--primary)"
                          : "var(--border)"
                      }`,
                      boxShadow: isSelected
                        ? "0 0 0 3px color-mix(in oklab, var(--primary) 15%, transparent), 0 10px 24px rgba(0,0,0,.10)"
                        : "0 1px 3px rgba(0,0,0,.07), 0 6px 16px rgba(0,0,0,.04)",
                    }}
                  >
                    <div className="box-border flex h-[58px] items-center gap-2 px-3 py-2.5">
                      <CategoryGlyph
                        cat={def.cat}
                        className="size-7.5 rounded-lg text-[13px]"
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-px">
                        <div className="truncate text-xs leading-tight font-semibold">
                          {node.name}
                        </div>
                        <div className="truncate text-[10.5px] leading-tight text-muted-foreground">
                          {def.desc}
                        </div>
                      </div>
                      {nodeStatus ? (
                        <div
                          className="text-[11px] font-bold"
                          style={{
                            color: RUN_STATUS_COLORS[nodeStatus],
                            animation:
                              nodeStatus === "running"
                                ? "af-pulse 1s ease-in-out infinite"
                                : undefined,
                          }}
                        >
                          {RUN_STATUS_MARKS[nodeStatus]}
                        </div>
                      ) : null}
                    </div>
                    {def.cat !== "trigger" ? (
                      <div
                        onMouseUp={() => finishConnect(node.id)}
                        className="absolute -left-2 box-border size-3.5 cursor-crosshair rounded-full bg-card transition-transform hover:scale-130"
                        style={{
                          top: 22,
                          border: `2.5px solid ${
                            connect ? "var(--primary)" : PORT_IDLE
                          }`,
                        }}
                      />
                    ) : null}
                    {Array.from({ length: outputCount }, (_, portIndex) => {
                      const centerY =
                        outputCount === 1 ? 29 : portIndex === 0 ? 16 : 42
                      return (
                        <React.Fragment key={portIndex}>
                          <div
                            onMouseDown={(event) =>
                              onPortOutMouseDown(event, node, portIndex)
                            }
                            className="absolute -right-2 box-border size-3.5 cursor-crosshair rounded-full bg-card transition-transform hover:scale-130"
                            style={{
                              top: centerY - 7,
                              border: `2.5px solid ${PORT_IDLE}`,
                            }}
                          />
                          {outputCount > 1 ? (
                            <div
                              className="absolute right-3 text-[8.5px] font-bold tracking-[0.06em] text-muted-foreground/70 uppercase"
                              style={{ top: centerY - 6 }}
                            >
                              {portIndex === 0 ? "true" : "false"}
                            </div>
                          ) : null}
                        </React.Fragment>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            {bounds && minimapScale ? (
              <div
                onMouseDown={onMinimapMouseDown}
                className="absolute right-3.5 bottom-3.5 cursor-pointer overflow-hidden rounded-[10px] border bg-card/85 shadow-lg backdrop-blur-sm"
                style={{ width: MINIMAP_W, height: MINIMAP_H }}
              >
                {nodes.map((node) => {
                  const color = catColor(typeDef(node.type).cat)
                  return (
                    <div
                      key={node.id}
                      className="absolute rounded-[2px]"
                      style={{
                        left: 10 + (node.x - bounds.minX) * minimapScale,
                        top: 10 + (node.y - bounds.minY) * minimapScale,
                        width: NODE_W * minimapScale,
                        height: NODE_H * minimapScale,
                        background: `color-mix(in oklab, ${color} 45%, transparent)`,
                      }}
                    />
                  )
                })}
                {canvasSize.width ? (
                  <div
                    className="absolute rounded-[3px] border-[1.5px] border-primary opacity-55"
                    style={{
                      left: 10 + (-pan.x / zoom - bounds.minX) * minimapScale,
                      top: 10 + (-pan.y / zoom - bounds.minY) * minimapScale,
                      width: (canvasSize.width / zoom) * minimapScale,
                      height: (canvasSize.height / zoom) * minimapScale,
                    }}
                  />
                ) : null}
              </div>
            ) : null}

            <div className="pointer-events-none absolute bottom-3.5 left-3.5 rounded-lg border bg-card/85 px-2.5 py-1.5 text-[10.5px] text-muted-foreground backdrop-blur-sm">
              Scroll to pan · ⌘ scroll to zoom · Drag from a port to connect
            </div>
          </div>

          <div className="relative shrink-0 border-t bg-background">
            {logOpen ? (
              <div
                onMouseDown={startLogResize}
                className="absolute -top-[3px] right-0 left-0 z-10 h-[7px] cursor-row-resize hover:bg-primary/10"
              />
            ) : null}
            <button
              type="button"
              onClick={() => setLogOpen((open) => !open)}
              className="flex h-[34px] w-full items-center gap-2.5 px-3.5 select-none"
            >
              <span className="text-[11px] font-semibold tracking-[0.07em] text-muted-foreground uppercase">
                Execution log
              </span>
              <span className="font-mono text-[10.5px] text-muted-foreground/70">
                {log.length} events
              </span>
              <span className="flex-1" />
              {running ? (
                <span
                  className="text-[10.5px] font-semibold text-primary"
                  style={{ animation: "af-pulse 1s ease-in-out infinite" }}
                >
                  Running…
                </span>
              ) : null}
              <span className="text-[11px] text-muted-foreground/70">
                {logOpen ? "▾" : "▴"}
              </span>
            </button>
            {logOpen ? (
              <div
                ref={logScrollRef}
                className="flex flex-col gap-1.5 overflow-y-auto px-3.5 pt-0.5 pb-3 font-mono text-[11px]"
                style={{ height: logH }}
              >
                {log.map((entry, index) => (
                  <div key={index} className="flex items-baseline gap-2.5">
                    <span className="text-muted-foreground/60">{entry.time}</span>
                    <span
                      className="min-w-3.5 text-center font-semibold"
                      style={{ color: entry.color }}
                    >
                      {entry.badge}
                    </span>
                    <span className="text-muted-foreground">{entry.msg}</span>
                  </div>
                ))}
                {!log.length ? (
                  <div className="pt-2 text-muted-foreground/60">
                    No runs yet — press Run to execute this workflow.
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div
          className="relative flex shrink-0 flex-col border-l bg-background"
          style={{ width: inspW }}
        >
          <div
            onMouseDown={startInspectorResize}
            className="absolute top-0 bottom-0 -left-[3px] z-10 w-[7px] cursor-col-resize hover:bg-primary/10"
          />
          {selNode && selDef ? (
            <>
              <div className="flex items-center gap-2.5 border-b p-3.5">
                <CategoryGlyph
                  cat={selDef.cat}
                  className="size-8 rounded-lg text-sm"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <input
                    value={selNode.name}
                    onChange={(event) => renameNode(selNode.id, event.target.value)}
                    className="w-full border-none bg-transparent p-0 text-[13px] font-semibold outline-none focus:text-primary"
                  />
                  <div className="text-[10.5px] text-muted-foreground capitalize">
                    {selDef.cat} · {selDef.name}
                  </div>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3.5">
                {selDef.fields.map((field) => {
                  const value = selNode.config[field.key] ?? ""
                  const setValue = (next: string | number) =>
                    updateNodeConfig(selNode.id, field.key, next)
                  return (
                    <div key={field.key} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between">
                        <label className="text-[11px] font-semibold text-muted-foreground">
                          {field.label}
                        </label>
                        {field.kind === "range" ? (
                          <span className="font-mono text-[10.5px] text-muted-foreground">
                            {value}
                          </span>
                        ) : null}
                      </div>
                      {field.kind === "text" ? (
                        <Input
                          value={String(value)}
                          onChange={(event) => setValue(event.target.value)}
                          className="h-8 font-mono text-xs"
                        />
                      ) : null}
                      {field.kind === "textarea" ? (
                        <textarea
                          rows={4}
                          value={String(value)}
                          onChange={(event) => setValue(event.target.value)}
                          className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                        />
                      ) : null}
                      {field.kind === "select" ? (
                        <select
                          value={String(value)}
                          onChange={(event) => setValue(event.target.value)}
                          className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                        >
                          {(field.options ?? []).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      {field.kind === "agent" || field.kind === "phone" ? (
                        <select
                          value={String(value)}
                          onChange={(event) => setValue(event.target.value)}
                          className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                        >
                          <option value="">Select…</option>
                          {field.kind === "agent"
                            ? initial.agents.map((agent) => (
                                <option key={agent.id} value={agent.id}>
                                  {agent.name}
                                </option>
                              ))
                            : initial.phone_numbers.map((phoneNumber) => (
                                <option key={phoneNumber.id} value={phoneNumber.id}>
                                  {phoneNumber.number}
                                  {phoneNumber.name ? ` — ${phoneNumber.name}` : ""}
                                </option>
                              ))}
                        </select>
                      ) : null}
                      {field.kind === "range" ? (
                        <input
                          type="range"
                          min={field.min ?? 0}
                          max={field.max ?? 1}
                          step={field.step ?? 0.1}
                          value={Number(value)}
                          onChange={(event) =>
                            setValue(parseFloat(event.target.value))
                          }
                          className="w-full"
                          style={{ accentColor: "var(--primary)" }}
                        />
                      ) : null}
                    </div>
                  )
                })}
                <Button
                  variant="destructive"
                  size="sm"
                  className="mt-1.5"
                  onClick={() => deleteNode(selNode.id)}
                >
                  Delete node
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2.5 p-6 text-center text-muted-foreground">
              <div className="size-9 rounded-[10px] border-[1.5px] border-dashed border-muted-foreground/40" />
              <div className="max-w-[170px] text-xs leading-relaxed">
                Select a node on the canvas to configure it
              </div>
            </div>
          )}
        </div>
      </div>

      <RunWorkflowDialog
        open={runDialogOpen}
        onOpenChange={setRunDialogOpen}
        providerWarning={
          !initial.provider_configured &&
          nodes.some((node) => node.type === "voicecall")
        }
        onStart={async (contactId) => {
          await startRun(contactId)
          setRunDialogOpen(false)
        }}
      />
    </div>
  )
}
