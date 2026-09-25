import * as React from "react"
import { Maximize2Icon, MinusIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type {
  AutomationGraph,
  AutomationSourcePort,
  AutomationValidationError,
} from "@/lib/automations/automation"
import { automationNodeName } from "@/lib/automations/node-registry"
import { cn } from "@/lib/utils"

import {
  canConnectNodes,
  clampZoom,
  edgePath,
  fitViewport,
  flowBounds,
  NODE_HEIGHT,
  NODE_WIDTH,
  portIn,
  portOut,
  type CanvasPoint,
  type CanvasSize,
} from "./canvas-model"
import {
  AutomationCanvasNode,
  type AutomationNodeRunStatus,
} from "./automation-canvas-node"

const MINIMAP_WIDTH = 164
const MINIMAP_HEIGHT = 100

type ConnectDraft = {
  from: string
  sourcePort: AutomationSourcePort
  point: CanvasPoint
}

type DragState =
  | {
      mode: "pan"
      startX: number
      startY: number
      viewportX: number
      viewportY: number
    }
  | { mode: "node"; id: string; offsetX: number; offsetY: number }

export function AutomationFlowCanvas({
  graph,
  errors,
  selectedNodeId,
  selectedEdgeId,
  nodeStatuses,
  onGraphChange,
  onSelectNode,
  onSelectEdge,
  onSizeChange,
  onDropNode,
}: {
  graph: AutomationGraph
  errors: AutomationValidationError[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
  // Per-node status of the run shown in the runs panel (badges on nodes).
  nodeStatuses?: Record<string, AutomationNodeRunStatus>
  onGraphChange: (graph: AutomationGraph) => void
  onSelectNode: (nodeId: string | null) => void
  onSelectEdge: (edgeId: string | null) => void
  onSizeChange: (size: CanvasSize) => void
  onDropNode?: (position: CanvasPoint) => void
}) {
  const canvasRef = React.useRef<HTMLDivElement | null>(null)
  const dragRef = React.useRef<DragState | null>(null)
  const [connect, setConnect] = React.useState<ConnectDraft | null>(null)
  const [panning, setPanning] = React.useState(false)
  const currentRef = React.useRef({ graph, connect })
  React.useEffect(() => {
    currentRef.current = { graph, connect }
  }, [connect, graph])

  const worldFromClient = React.useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      const current = currentRef.current.graph.viewport
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      return {
        x: (clientX - rect.left - current.x) / current.zoom,
        y: (clientY - rect.top - current.y) / current.zoom,
      }
    },
    []
  )

  React.useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = currentRef.current
      if (current.connect) {
        setConnect({
          ...current.connect,
          point: worldFromClient(event.clientX, event.clientY),
        })
      }
      const drag = dragRef.current
      if (!drag) return
      if (drag.mode === "pan") {
        onGraphChange({
          ...current.graph,
          viewport: {
            ...current.graph.viewport,
            x: drag.viewportX + event.clientX - drag.startX,
            y: drag.viewportY + event.clientY - drag.startY,
          },
        })
        return
      }
      const point = worldFromClient(event.clientX, event.clientY)
      onGraphChange({
        ...current.graph,
        nodes: current.graph.nodes.map((node) =>
          node.id === drag.id
            ? { ...node, x: point.x - drag.offsetX, y: point.y - drag.offsetY }
            : node
        ),
      })
    }

    const up = () => {
      dragRef.current = null
      setPanning(false)
      setConnect(null)
    }

    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
  }, [onGraphChange, worldFromClient])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const current = currentRef.current.graph
      const rect = canvas.getBoundingClientRect()
      const anchorX = event.clientX - rect.left
      const anchorY = event.clientY - rect.top
      // Normalize scroll units so a wheel notch zooms the same amount whether the
      // browser reports pixels (Chrome/most webviews), lines (Firefox), or pages.
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? rect.height || 1
            : 1
      const nextZoom = clampZoom(
        current.viewport.zoom * Math.exp(-event.deltaY * unit * 0.0015)
      )
      onGraphChange({
        ...current,
        viewport: {
          zoom: nextZoom,
          x:
            anchorX -
            (anchorX - current.viewport.x) * (nextZoom / current.viewport.zoom),
          y:
            anchorY -
            (anchorY - current.viewport.y) * (nextZoom / current.viewport.zoom),
        },
      })
    }
    canvas.addEventListener("wheel", wheel, { passive: false })
    return () => canvas.removeEventListener("wheel", wheel)
  }, [onGraphChange])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        onSizeChange({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [onSizeChange])

  const deleteNode = React.useCallback(
    (nodeId: string) => {
      onGraphChange({
        ...graph,
        nodes: graph.nodes.filter((node) => node.id !== nodeId),
        edges: graph.edges.filter(
          (edge) => edge.from !== nodeId && edge.to !== nodeId
        ),
      })
      onSelectNode(null)
    },
    [graph, onGraphChange, onSelectNode]
  )

  const deleteEdge = React.useCallback(
    (edgeId: string) => {
      onGraphChange({
        ...graph,
        edges: graph.edges.filter((edge) => edge.id !== edgeId),
      })
      onSelectEdge(null)
    },
    [graph, onGraphChange, onSelectEdge]
  )

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setConnect(null)
      onSelectNode(null)
      onSelectEdge(null)
      return
    }
    if (event.key !== "Delete" && event.key !== "Backspace") return
    event.preventDefault()
    if (selectedNodeId) deleteNode(selectedNodeId)
    else if (selectedEdgeId) deleteEdge(selectedEdgeId)
  }

  const finishConnect = (targetId: string) => {
    const draft = currentRef.current.connect
    if (!draft || draft.from === targetId) return
    const current = currentRef.current.graph
    const source = current.nodes.find((node) => node.id === draft.from)
    const target = current.nodes.find((node) => node.id === targetId)
    const allowed =
      source &&
      target &&
      canConnectNodes(source, draft.sourcePort, target, current)
    if (!allowed) {
      setConnect(null)
      return
    }
    const duplicate = current.edges.some(
      (edge) =>
        edge.from === draft.from &&
        edge.sourcePort === draft.sourcePort &&
        edge.to === targetId
    )
    if (!duplicate) {
      onGraphChange({
        ...current,
        edges: [
          ...current.edges,
          {
            id: crypto.randomUUID(),
            from: draft.from,
            sourcePort: draft.sourcePort,
            to: targetId,
          },
        ],
      })
    }
    setConnect(null)
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const renderedEdges = graph.edges.flatMap((edge) => {
    const source = nodeById.get(edge.from)
    const target = nodeById.get(edge.to)
    return source && target ? [{ edge, source, target }] : []
  })
  const errorNodeIds = new Set(
    errors.flatMap((error) => (error.nodeId ? [error.nodeId] : []))
  )
  const errorEdgeIds = new Set(
    errors.flatMap((error) => (error.edgeId ? [error.edgeId] : []))
  )
  const bounds = flowBounds(graph.nodes)
  const minimapScale = bounds
    ? Math.min(
        (MINIMAP_WIDTH - 20) / Math.max(1, bounds.maxX - bounds.minX),
        (MINIMAP_HEIGHT - 20) / Math.max(1, bounds.maxY - bounds.minY)
      )
    : 0

  const zoomByFactor = (factor: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const current = graph.viewport
    const anchorX = (rect?.width ?? 800) / 2
    const anchorY = (rect?.height ?? 560) / 2
    const nextZoom = clampZoom(current.zoom * factor)
    onGraphChange({
      ...graph,
      viewport: {
        zoom: nextZoom,
        x: anchorX - (anchorX - current.x) * (nextZoom / current.zoom),
        y: anchorY - (anchorY - current.y) * (nextZoom / current.zoom),
      },
    })
  }

  const fitToView = () => {
    const rect = canvasRef.current?.getBoundingClientRect()
    onGraphChange({
      ...graph,
      viewport: fitViewport(
        graph.nodes,
        rect?.width || 800,
        rect?.height || 560
      ),
    })
  }

  const centerViewportAt = (worldX: number, worldY: number) => {
    const canvas = canvasRef.current?.getBoundingClientRect()
    if (!canvas) return
    onGraphChange({
      ...graph,
      viewport: {
        ...graph.viewport,
        x: canvas.width / 2 - worldX * graph.viewport.zoom,
        y: canvas.height / 2 - worldY * graph.viewport.zoom,
      },
    })
  }

  return (
    <div
      ref={canvasRef}
      role="application"
      aria-label="Automation canvas"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onDragOver={(event) => {
        if (!onDropNode) return
        event.preventDefault()
        event.dataTransfer.dropEffect = "copy"
      }}
      onDrop={(event) => {
        if (!onDropNode) return
        event.preventDefault()
        const point = worldFromClient(event.clientX, event.clientY)
        onDropNode({
          x: point.x - NODE_WIDTH / 2,
          y: point.y - NODE_HEIGHT / 2,
        })
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || event.target !== event.currentTarget) return
        event.preventDefault()
        onSelectNode(null)
        onSelectEdge(null)
        setPanning(true)
        dragRef.current = {
          mode: "pan",
          startX: event.clientX,
          startY: event.clientY,
          viewportX: graph.viewport.x,
          viewportY: graph.viewport.y,
        }
      }}
      className={cn(
        "relative min-h-0 flex-1 touch-none overflow-hidden bg-muted/40 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50",
        panning
          ? "cursor-grabbing"
          : connect
            ? "cursor-crosshair"
            : "cursor-grab"
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(color-mix(in oklab, var(--muted-foreground) 24%, transparent) 1px, transparent 1px)",
          backgroundSize: `${26 * graph.viewport.zoom}px ${26 * graph.viewport.zoom}px`,
          backgroundPosition: `${graph.viewport.x}px ${graph.viewport.y}px`,
        }}
      />

      <div
        className="pointer-events-none absolute top-0 left-0 h-0 w-0"
        style={{
          transform: `translate(${graph.viewport.x}px, ${graph.viewport.y}px) scale(${graph.viewport.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        <svg
          aria-label="Automation connections"
          className="absolute top-0 left-0 overflow-visible"
          width={1}
          height={1}
        >
          {renderedEdges.map(({ edge, source, target }) => {
            const from = portOut(source, edge.sourcePort)
            const path = edgePath(from, portIn(target))
            const selected = edge.id === selectedEdgeId
            const invalid = errorEdgeIds.has(edge.id)
            return (
              <g key={edge.id}>
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  tabIndex={0}
                  role="button"
                  aria-label={`Connection from ${automationNodeName(source)} ${edge.sourcePort} to ${automationNodeName(target)}`}
                  style={{ pointerEvents: "stroke" }}
                  onFocus={() => {
                    onSelectEdge(edge.id)
                    onSelectNode(null)
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    onSelectEdge(edge.id)
                    onSelectNode(null)
                  }}
                />
                <path
                  d={path}
                  fill="none"
                  stroke={
                    invalid
                      ? "var(--destructive)"
                      : selected
                        ? "var(--primary)"
                        : "color-mix(in oklab, var(--muted-foreground) 55%, transparent)"
                  }
                  strokeWidth={selected ? 2.5 : 2}
                  strokeLinecap="round"
                  strokeDasharray={invalid ? "5 5" : undefined}
                />
              </g>
            )
          })}
          {connect && nodeById.get(connect.from) ? (
            <path
              d={edgePath(
                portOut(nodeById.get(connect.from)!, connect.sourcePort),
                connect.point
              )}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={2}
              strokeDasharray="5 6"
            />
          ) : null}
        </svg>

        {graph.nodes.map((node) => (
          <AutomationCanvasNode
            key={node.id}
            node={node}
            selected={selectedNodeId === node.id}
            invalid={errorNodeIds.has(node.id)}
            runStatus={nodeStatuses?.[node.id] ?? null}
            connecting={Boolean(connect)}
            onSelect={() => {
              onSelectNode(node.id)
              onSelectEdge(null)
            }}
            onMoveStart={(event) => {
              const point = worldFromClient(event.clientX, event.clientY)
              dragRef.current = {
                mode: "node",
                id: node.id,
                offsetX: point.x - node.x,
                offsetY: point.y - node.y,
              }
            }}
            onConnectStart={(sourcePort) =>
              setConnect({
                from: node.id,
                sourcePort,
                point: portOut(node, sourcePort),
              })
            }
            onConnectFinish={() => finishConnect(node.id)}
          />
        ))}
      </div>

      {bounds && minimapScale ? (
        <button
          type="button"
          aria-label="Move canvas viewport from minimap"
          className="absolute right-3 bottom-3 hidden overflow-hidden rounded-lg border bg-card/90 shadow-sm backdrop-blur-sm sm:block"
          style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
          onKeyDown={(event) => {
            if (!bounds || (event.key !== "Enter" && event.key !== " ")) return
            event.preventDefault()
            centerViewportAt(
              (bounds.minX + bounds.maxX) / 2,
              (bounds.minY + bounds.maxY) / 2
            )
          }}
          onPointerDown={(event) => {
            event.stopPropagation()
            const rect = event.currentTarget.getBoundingClientRect()
            const worldX =
              bounds.minX + (event.clientX - rect.left - 10) / minimapScale
            const worldY =
              bounds.minY + (event.clientY - rect.top - 10) / minimapScale
            centerViewportAt(worldX, worldY)
          }}
        >
          {graph.nodes.map((node) => (
            <span
              key={node.id}
              aria-hidden="true"
              className="absolute rounded-[2px] bg-primary/40"
              style={{
                left: 10 + (node.x - bounds.minX) * minimapScale,
                top: 10 + (node.y - bounds.minY) * minimapScale,
                width: NODE_WIDTH * minimapScale,
                height: NODE_HEIGHT * minimapScale,
              }}
            />
          ))}
        </button>
      ) : null}

      <div
        className="absolute bottom-3 left-3 flex items-center rounded-lg border bg-card/90 p-0.5 shadow-sm backdrop-blur-sm"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Zoom out"
          onClick={() => zoomByFactor(1 / 1.2)}
        >
          <MinusIcon className="size-3.5" />
        </Button>
        <span className="w-11 text-center font-mono text-[10px] text-muted-foreground">
          {Math.round(graph.viewport.zoom * 100)}%
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Zoom in"
          onClick={() => zoomByFactor(1.2)}
        >
          <PlusIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          aria-label="Fit automation to view"
          onClick={fitToView}
        >
          <Maximize2Icon className="size-3.5" />
          Fit
        </Button>
      </div>

      <div className="pointer-events-none absolute top-3 left-3 hidden rounded-md border bg-card/90 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur-sm md:block">
        Scroll to zoom · Drag to pan · Select ports to connect
      </div>
    </div>
  )
}
