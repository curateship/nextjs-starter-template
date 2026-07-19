import { GripVerticalIcon } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { usePersistedState } from "@/lib/use-persisted-state"

/** Gap kept between the bar and the chart edges when clamping. */
const EDGE_GAP = 12

/** Arrow-key step while the drag handle is focused. */
const NUDGE_PX = 8
const STORAGE_KEY = "trading:chart-draw-toolbar"

type ToolbarPos = { left: number; top: number }

/** Ignores anything in storage that is not a finite pixel pair. */
function parsePos(raw: string): ToolbarPos | null {
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== "object") return null
  const { left, top } = parsed as Partial<ToolbarPos>
  if (typeof left !== "number" || !Number.isFinite(left)) return null
  if (typeof top !== "number" || !Number.isFinite(top)) return null
  return { left, top }
}

/** Keeps the whole bar inside its chart, even after the chart is resized. */
function clampToChart(pos: ToolbarPos, bar: HTMLElement): ToolbarPos {
  const parent = bar.parentElement
  if (!parent) return pos
  const maxLeft = Math.max(EDGE_GAP, parent.clientWidth - bar.offsetWidth - EDGE_GAP)
  const maxTop = Math.max(EDGE_GAP, parent.clientHeight - bar.offsetHeight - EDGE_GAP)
  return {
    left: Math.min(Math.max(pos.left, EDGE_GAP), maxLeft),
    top: Math.min(Math.max(pos.top, EDGE_GAP), maxTop),
  }
}

function samePos(a: ToolbarPos | null, b: ToolbarPos | null) {
  if (!a || !b) return a === b
  return a.left === b.left && a.top === b.top
}

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="icon-sm"
          className="text-muted-foreground aria-pressed:text-foreground"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * The floating drawing toolbar that sits on top of every chart that can be
 * drawn on (live, backtest, bot). It starts top-right, clear of the price axis;
 * drag it by the grip to any spot inside the chart and that spot is remembered
 * in this browser and shared by all charts.
 */
export function ChartDrawToolbar({
  priceAxisWidth,
  trendlineActive,
  onTrendlineToggle,
}: {
  /** Width of the chart's right price axis, so the default spot clears it. */
  priceAxisWidth: number
  trendlineActive: boolean
  onTrendlineToggle: () => void
}) {
  const barRef = React.useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = usePersistedState<ToolbarPos | null>(
    STORAGE_KEY,
    null,
    parsePos
  )

  // A remembered spot can land outside a smaller chart (different page, resized
  // panel, smaller window), so pull it back in whenever the chart resizes.
  React.useEffect(() => {
    const bar = barRef.current
    const parent = bar?.parentElement
    if (!bar || !parent) return
    const observer = new ResizeObserver(() => {
      setPos((current) => {
        if (!current) return current
        const next = clampToChart(current, bar)
        return samePos(current, next) ? current : next
      })
    })
    observer.observe(parent)
    return () => observer.disconnect()
  }, [setPos])

  /** Where the bar actually sits right now, including the unmoved default. */
  function currentPos(): ToolbarPos {
    const bar = barRef.current
    return pos ?? { left: bar?.offsetLeft ?? EDGE_GAP, top: bar?.offsetTop ?? EDGE_GAP }
  }

  function startDrag(event: React.PointerEvent) {
    const bar = barRef.current
    if (!bar || event.button !== 0) return
    const start = currentPos()
    const grabX = event.clientX - start.left
    const grabY = event.clientY - start.top
    const onMove = (moveEvent: PointerEvent) => {
      setPos(
        clampToChart(
          { left: moveEvent.clientX - grabX, top: moveEvent.clientY - grabY },
          bar
        )
      )
    }
    // pointercancel matters as much as pointerup: without it a drag the browser
    // aborts (touch gesture, context menu) leaves the bar stuck to the cursor.
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    event.preventDefault()
  }

  function onHandleKeyDown(event: React.KeyboardEvent) {
    const step: Record<string, ToolbarPos> = {
      ArrowLeft: { left: -NUDGE_PX, top: 0 },
      ArrowRight: { left: NUDGE_PX, top: 0 },
      ArrowUp: { left: 0, top: -NUDGE_PX },
      ArrowDown: { left: 0, top: NUDGE_PX },
    }
    const delta = step[event.key]
    const bar = barRef.current
    if (!delta || !bar) return
    const start = currentPos()
    setPos(
      clampToChart({ left: start.left + delta.left, top: start.top + delta.top }, bar)
    )
    event.preventDefault()
  }

  return (
    <div
      ref={barRef}
      className="absolute z-40 flex items-center gap-0.5 rounded-lg bg-card p-1 shadow-sm ring-1 ring-foreground/10"
      style={
        pos
          ? { left: pos.left, top: pos.top }
          : { right: priceAxisWidth + EDGE_GAP, top: EDGE_GAP }
      }
      role="toolbar"
      aria-label="Drawing tools"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Move drawing toolbar"
            className="flex h-7 w-4 cursor-grab touch-none items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            onPointerDown={startDrag}
            onKeyDown={onHandleKeyDown}
          >
            <GripVerticalIcon className="size-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Drag to move · arrow keys nudge</TooltipContent>
      </Tooltip>
      <ToolButton
        label="Trendline"
        active={trendlineActive}
        onClick={onTrendlineToggle}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <line
            x1="5"
            y1="18"
            x2="19"
            y2="6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          />
          <circle cx="5" cy="18" r="1.75" fill="currentColor" />
          <circle cx="19" cy="6" r="1.75" fill="currentColor" />
        </svg>
      </ToolButton>
    </div>
  )
}
