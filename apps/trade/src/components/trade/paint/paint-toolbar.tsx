import * as React from "react"
import type { ReactNode } from "react"
import {
  GripVerticalIcon,
  MinusIcon,
  SlashIcon,
  Trash2Icon,
} from "lucide-react"

import type { PaintTool } from "@/components/trade/paint/use-drawings"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { ChartToolbarPosition } from "@/lib/trade/panel-layout"

/**
 * The tools, as a small horizontal bar along the chart's top-right edge.
 *
 * On the chart rather than in the panel header because these belong to the
 * drawing surface, not to the market: the header says which market this is
 * and at what timeframe, and this says what the pointer is holding.
 *
 * The bin clears the whole chart, so it is asked about first. One line at a
 * time is thrown away from the line itself — its own × while it is picked
 * out, or Delete on the keyboard.
 */
const TOOLS: Array<{
  kind: PaintTool
  label: string
  icon: ReactNode
}> = [
  {
    kind: "level",
    label: "Draw a level",
    icon: <MinusIcon />,
  },
  {
    kind: "trendline",
    label: "Draw a trendline",
    icon: <SlashIcon />,
  },
]

const EDGE_GAP = 8
const SNAP_DISTANCE = 24
const KEYBOARD_STEP = 8

type ToolbarPosition = { left: number; top: number }

function boundedPosition(
  left: number,
  top: number,
  chartWidth: number,
  chartHeight: number,
  toolbarWidth: number,
  toolbarHeight: number,
  rightInset: number
): ToolbarPosition {
  const furthestLeft = Math.max(
    EDGE_GAP,
    chartWidth - toolbarWidth - rightInset - EDGE_GAP
  )
  const furthestTop = Math.max(EDGE_GAP, chartHeight - toolbarHeight - EDGE_GAP)
  return {
    left: Math.min(Math.max(left, EDGE_GAP), furthestLeft),
    top: Math.min(Math.max(top, EDGE_GAP), furthestTop),
  }
}

function snappedPosition(
  position: ToolbarPosition,
  chartWidth: number,
  toolbarWidth: number,
  rightInset: number
): ToolbarPosition | null {
  const rightEdge = Math.max(
    EDGE_GAP,
    chartWidth - toolbarWidth - rightInset - EDGE_GAP
  )
  return Math.abs(position.left - rightEdge) <= SNAP_DISTANCE &&
    Math.abs(position.top - EDGE_GAP) <= SNAP_DISTANCE
    ? null
    : position
}

function savedPosition(
  position: ToolbarPosition,
  chartWidth: number,
  chartHeight: number,
  toolbarWidth: number,
  toolbarHeight: number,
  rightInset: number
): ChartToolbarPosition {
  const rightEdge = Math.max(
    EDGE_GAP,
    chartWidth - toolbarWidth - rightInset - EDGE_GAP
  )
  const bottomEdge = Math.max(EDGE_GAP, chartHeight - toolbarHeight - EDGE_GAP)
  return {
    x:
      rightEdge === EDGE_GAP
        ? 1
        : (position.left - EDGE_GAP) / (rightEdge - EDGE_GAP),
    y:
      bottomEdge === EDGE_GAP
        ? 0
        : (position.top - EDGE_GAP) / (bottomEdge - EDGE_GAP),
  }
}

function rememberedPositionStyle(
  position: ChartToolbarPosition,
  rightInset: number
): React.CSSProperties {
  const leftOffset = EDGE_GAP - position.x * (rightInset + EDGE_GAP * 2)
  const topOffset = EDGE_GAP - position.y * EDGE_GAP * 2
  return {
    left: cssPosition(position.x * 100, leftOffset),
    top: cssPosition(position.y * 100, topOffset),
    transform: `translate(${-position.x * 100}%, ${-position.y * 100}%)`,
  }
}

function cssPosition(percent: number, offset: number) {
  return `calc(${percent}% ${offset < 0 ? "-" : "+"} ${Math.abs(offset)}px)`
}

export function PaintToolbar({
  tool,
  onPickTool,
  drawingCount,
  drawingsVisible,
  rightInset,
  savedPosition: rememberedPosition,
  onPositionChange,
  onClearAll,
}: {
  tool: PaintTool | null
  onPickTool: (next: PaintTool | null) => void
  /** How many lines are on this chart; the bin appears once there is one. */
  drawingCount: number
  /** Hidden drawings stay saved, but no paint tool can be picked. */
  drawingsVisible: boolean
  /** The chart's price labels; the toolbar stays to their left. */
  rightInset: number
  /** Its place inside the chart, saved as shares so panel resizing is safe. */
  savedPosition?: ChartToolbarPosition | null
  onPositionChange?: (position: ChartToolbarPosition | null) => void
  onClearAll: () => void
}) {
  const [confirming, setConfirming] = React.useState(false)
  const [placement, setPlacement] = React.useState<{
    source: ChartToolbarPosition | null | undefined
    position: ToolbarPosition | null
  } | null>(null)
  const [dragging, setDragging] = React.useState<{
    width: number
    height: number
  } | null>(null)
  const [snapReady, setSnapReady] = React.useState(false)
  const toolbarRef = React.useRef<HTMLDivElement>(null)
  const drag = React.useRef<{
    pointerId: number
    pointerX: number
    pointerY: number
    left: number
    top: number
    chartWidth: number
    chartHeight: number
    toolbarWidth: number
    toolbarHeight: number
    rightInset: number
  } | null>(null)

  function layout() {
    const toolbar = toolbarRef.current
    const chart = toolbar?.offsetParent
    if (!(toolbar && chart instanceof HTMLElement)) return null
    const chartRect = chart.getBoundingClientRect()
    const toolbarRect = toolbar.getBoundingClientRect()
    return {
      left: toolbarRect.left - chartRect.left,
      top: toolbarRect.top - chartRect.top,
      chartWidth: chartRect.width,
      chartHeight: chartRect.height,
      toolbarWidth: toolbarRect.width,
      toolbarHeight: toolbarRect.height,
    }
  }

  function moveFromDrag(
    clientX: number,
    clientY: number
  ): ToolbarPosition | null {
    const started = drag.current
    if (!started) return null
    return boundedPosition(
      started.left + clientX - started.pointerX,
      started.top + clientY - started.pointerY,
      started.chartWidth,
      started.chartHeight,
      started.toolbarWidth,
      started.toolbarHeight,
      started.rightInset
    )
  }

  function startDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    const current = layout()
    if (!current) return
    drag.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      rightInset,
      ...current,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    event.stopPropagation()
    setDragging({ width: current.toolbarWidth, height: current.toolbarHeight })
  }

  function continueDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointerId !== event.pointerId) return
    const next = moveFromDrag(event.clientX, event.clientY)
    if (next) {
      setPlacement({ source: rememberedPosition, position: next })
      const started = drag.current
      setSnapReady(
        started !== null &&
          snappedPosition(
            next,
            started.chartWidth,
            started.toolbarWidth,
            started.rightInset
          ) === null
      )
    }
  }

  function finishDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const started = drag.current
    if (!started || started.pointerId !== event.pointerId) return
    const next = moveFromDrag(event.clientX, event.clientY)
    drag.current = null
    setDragging(null)
    setSnapReady(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (next) {
      const snapped = snappedPosition(
        next,
        started.chartWidth,
        started.toolbarWidth,
        started.rightInset
      )
      setPlacement({ source: rememberedPosition, position: snapped })
      onPositionChange?.(
        snapped
          ? savedPosition(
              snapped,
              started.chartWidth,
              started.chartHeight,
              started.toolbarWidth,
              started.toolbarHeight,
              started.rightInset
            )
          : null
      )
    }
  }

  function cancelDrag() {
    drag.current = null
    setPlacement(null)
    setDragging(null)
    setSnapReady(false)
  }

  function moveWithKeyboard(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Home") {
      event.preventDefault()
      setPlacement({ source: rememberedPosition, position: null })
      onPositionChange?.(null)
      return
    }
    const movement = {
      ArrowUp: [0, -KEYBOARD_STEP],
      ArrowDown: [0, KEYBOARD_STEP],
      ArrowLeft: [-KEYBOARD_STEP, 0],
      ArrowRight: [KEYBOARD_STEP, 0],
    }[event.key]
    if (!movement) return
    const current = layout()
    if (!current) return
    event.preventDefault()
    const next = boundedPosition(
      current.left + movement[0],
      current.top + movement[1],
      current.chartWidth,
      current.chartHeight,
      current.toolbarWidth,
      current.toolbarHeight,
      rightInset
    )
    setPlacement({ source: rememberedPosition, position: next })
    onPositionChange?.(
      savedPosition(
        next,
        current.chartWidth,
        current.chartHeight,
        current.toolbarWidth,
        current.toolbarHeight,
        rightInset
      )
    )
  }

  const placedByDrag =
    placement !== null && placement.source === rememberedPosition
      ? placement.position
      : undefined
  const atHome =
    placedByDrag === null ||
    (placedByDrag === undefined && rememberedPosition == null)
  const toolbarStyle =
    placedByDrag === null
      ? { top: EDGE_GAP, right: rightInset + EDGE_GAP }
      : (placedByDrag ??
        (rememberedPosition
          ? rememberedPositionStyle(rememberedPosition, rightInset)
          : { top: EDGE_GAP, right: rightInset + EDGE_GAP }))

  return (
    // Above both the chart's own canvases and the layer the lines are drawn
    // on, so the buttons stay clickable wherever a line happens to run. The
    // paint marker keeps a press in here from letting the picked line go.
    <>
      {dragging ? (
        <div
          data-chart-paint-snap-target
          data-ready={snapReady ? "true" : "false"}
          aria-hidden
          style={{
            top: EDGE_GAP,
            right: rightInset + EDGE_GAP,
            width: dragging.width,
            height: dragging.height,
          }}
          className={cn(
            "pointer-events-none absolute z-10 rounded-lg border-2 border-dashed bg-muted/40 transition-colors",
            snapReady && "border-primary bg-primary/15"
          )}
        />
      ) : null}
      <div
        ref={toolbarRef}
        data-chart-paint
        data-position={atHome ? "top-right" : "free"}
        style={toolbarStyle}
        className={cn(
          "pointer-events-auto absolute z-20 flex flex-row gap-0.5 rounded-lg border bg-card/45 p-0.5 backdrop-blur-md backdrop-saturate-150",
          snapReady && "ring-2 ring-primary/60"
        )}
      >
        {TOOLS.map((entry) => (
          <DisabledReason
            key={entry.kind}
            disabled={!drawingsVisible}
            reason="Show your drawings in View options to use the paint tools."
          >
            <Button
              type="button"
              size="icon-xs"
              variant={tool === entry.kind ? "secondary" : "ghost"}
              aria-pressed={tool === entry.kind}
              aria-label={entry.label}
              disabled={!drawingsVisible}
              // Pressing the tool that is already in hand puts it down, so
              // there is always a way back to plain panning.
              onClick={() =>
                onPickTool(tool === entry.kind ? null : entry.kind)
              }
            >
              {entry.icon}
            </Button>
          </DisabledReason>
        ))}
        {drawingCount > 0 ? (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Clear every drawing on this chart"
            onClick={() => setConfirming(true)}
          >
            <Trash2Icon />
          </Button>
        ) : null}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label="Move drawing tools"
                aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home"
                className={cn(
                  "cursor-grab touch-none",
                  dragging !== null && "cursor-grabbing"
                )}
                onPointerDown={startDrag}
                onPointerMove={continueDrag}
                onPointerUp={finishDrag}
                onPointerCancel={cancelDrag}
                onLostPointerCapture={() => {
                  if (drag.current) cancelDrag()
                }}
                onKeyDown={moveWithKeyboard}
              >
                <GripVerticalIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Drag to move. Arrow keys move it; Home returns it to the top
              right.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title="Clear every drawing on this chart?"
          description={
            drawingCount === 1
              ? "The one drawing on this market goes. Other markets keep theirs, and this cannot be undone."
              : `All ${drawingCount} drawings on this market go. Other markets keep theirs, and this cannot be undone.`
          }
          confirmLabel={
            drawingCount === 1
              ? "Delete 1 drawing"
              : `Delete ${drawingCount} drawings`
          }
          onConfirm={() => {
            setConfirming(false)
            onClearAll()
          }}
        />
      </div>
    </>
  )
}
