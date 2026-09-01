import * as React from "react"
import { GripVerticalIcon, XIcon } from "lucide-react"

import { TouchOrderFrame } from "@/components/trade/touch-order-frame"
import { formatUsd } from "@/lib/trade/format"
import { MADE_MONEY } from "@/lib/trade/money-tone"
import { cn } from "@/lib/utils"

const EDGE = 8

type Point = { x: number; y: number }

function withinScreen(value: number, size: number, screenSize: number) {
  return Math.max(
    EDGE,
    Math.min(value, Math.max(EDGE, screenSize - size - EDGE))
  )
}

/**
 * The frame shared by every order window opened from the chart.
 *
 * The order forms own their fields. This frame owns everything that makes
 * those fields a floating window: its position, drag handle, screen edges,
 * backdrop, Escape key and wallet line.
 */
export function FloatingOrderWindow({
  label,
  wide,
  openedAt,
  width,
  height,
  minimumHeight,
  title,
  titleClassName,
  wallet,
  free,
  chartPreviewControls = false,
  persistent = false,
  onClose,
  children,
}: {
  label: string
  wide: boolean
  openedAt: Point
  width: number
  /** The window's tallest desktop height, used when it first opens. */
  height: number
  /** Long forms may shrink to this height as they move toward the bottom. */
  minimumHeight?: number
  title: string
  titleClassName?: string
  wallet?: string
  free?: number
  /** Let marked chart-preview handles work outside this desktop frame. */
  chartPreviewControls?: boolean
  /**
   * Keep the window open when the chart is clicked: no backdrop, so the chart
   * stays live underneath. The header then carries its own × — see
   * `closeButton`, which this switches on by itself.
   */
  persistent?: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  const [at, setAt] = React.useState(() => ({
    // A DCA preview is controlled from price tags on the chart's right edge.
    // Open its form to the left of the click so the form does not cover the
    // handles the person has just been invited to drag.
    x: withinScreen(
      chartPreviewControls ? openedAt.x - width - EDGE : openedAt.x,
      width,
      window.innerWidth
    ),
    y: withinScreen(openedAt.y, height, window.innerHeight),
  }))
  const dragRef = React.useRef<{ dx: number; dy: number } | null>(null)

  React.useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const grab = dragRef.current
      if (!grab) return

      setAt({
        x: withinScreen(event.clientX - grab.dx, width, window.innerWidth),
        y: withinScreen(
          event.clientY - grab.dy,
          minimumHeight ?? height,
          window.innerHeight
        ),
      })
    }
    const onUp = () => {
      dragRef.current = null
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [height, minimumHeight, width])

  React.useEffect(() => {
    if (!wide) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose, wide])

  const longForm = minimumHeight !== undefined

  return (
    <TouchOrderFrame
      label={label}
      wide={wide}
      desktopClassName={cn(
        "fixed z-50 overflow-hidden rounded-xl border bg-card shadow-lg",
        longForm && "grid grid-rows-[auto_minmax(0,1fr)_auto]"
      )}
      sheetClassName={
        longForm
          ? "grid h-[min(680px,calc(100dvh-8px))] grid-rows-[auto_minmax(0,1fr)_auto]"
          : "h-[min(520px,calc(100dvh-8px))]"
      }
      desktopStyle={{
        left: at.x,
        top: at.y,
        width,
        ...(minimumHeight === undefined
          ? {}
          : {
              maxHeight: Math.max(
                minimumHeight,
                Math.min(height, window.innerHeight - at.y - EDGE)
              ),
            }),
      }}
      sheetScrollable={!longForm}
      allowOutsideControl={chartPreviewControls}
      persistent={persistent}
      onClose={onClose}
    >
      <div
        className="flex cursor-grab items-center gap-2 border-b px-3 py-2 active:cursor-grabbing"
        onPointerDown={(event) => {
          dragRef.current = {
            dx: event.clientX - at.x,
            dy: event.clientY - at.y,
          }
        }}
      >
        <GripVerticalIcon className="size-4 shrink-0 text-muted-foreground" />
        <span
          // The green is only the default. A caller's own colour replaces it
          // outright — merged, the default's dark-mode half survived and a
          // red title flipped back to green on a dark screen.
          className={cn("text-sm font-semibold", titleClassName ?? MADE_MONEY)}
        >
          {title}
        </span>
        {wallet || free !== undefined ? (
          <span className="ml-auto flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            {wallet ? (
              <span className="min-w-0 truncate font-medium text-foreground">
                {wallet}
              </span>
            ) : null}
            {free === undefined ? null : (
              <span className="shrink-0 tabular-nums">
                {wallet ? "· " : null}
                {formatUsd(free)} free
              </span>
            )}
          </span>
        ) : null}
        {/* A window nothing outside can close carries its own way out. */}
        {persistent ? (
          <button
            type="button"
            aria-label="Close the window"
            className={cn(
              "shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:outline-none",
              !(wallet || free !== undefined) && "ml-auto"
            )}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
          >
            <XIcon className="size-4" />
          </button>
        ) : null}
      </div>

      {children}
    </TouchOrderFrame>
  )
}
