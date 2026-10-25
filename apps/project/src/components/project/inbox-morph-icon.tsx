import * as React from "react"

import { cn } from "@/lib/utils"

type Point = readonly [number, number]

/** The tray's outline, from its left lip round and back, as a closed run of points. */
const TRAY: Point[] = [
  [2, 12],
  [5.5, 5],
  [18.5, 5],
  [22, 12],
  [22, 18],
  [20, 20],
  [4, 20],
  [2, 18],
  [2, 12],
]
/** The dip across the tray's middle, left to right. */
const DIP: Point[] = [
  [2, 12],
  [8, 12],
  [10, 15],
  [14, 15],
  [16, 12],
  [22, 12],
]

/** Points spread along a line, at the given fractions of the way from one end to the other. */
function along(from: Point, to: Point, at: number[]): Point[] {
  return at.map((t) => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t])
}

// Each of the cross's strokes takes as many points as the shape it grows from,
// so every point has somewhere to go. The outline folds flat onto one stroke,
// out and back; the dip straightens into the other.
const TRAY_AS_X = along([6, 6], [18, 18], [0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25, 0])
const DIP_AS_X = along([6, 18], [18, 6], [0, 0.2, 0.4, 0.6, 0.8, 1])

const MORPH_MS = 240

function blend(from: Point[], to: Point[], t: number) {
  return from
    .map(([x, y], i) => `${(x + (to[i][0] - x) * t).toFixed(2)},${(y + (to[i][1] - y) * t).toFixed(2)}`)
    .join(" ")
}

function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

/**
 * The inbox tray, which bends into a cross while the inbox is open and back
 * again when it shuts (Tyler, 25 Oct 2026: "make it morph"). The lines move
 * point by point rather than one icon fading over the other. Reduced motion
 * jumps straight to the end on the next frame.
 */
export function InboxMorphIcon({ open, className }: { open: boolean; className?: string }) {
  const [progress, setProgress] = React.useState(open ? 1 : 0)
  const current = React.useRef(progress)

  React.useEffect(() => {
    const target = open ? 1 : 0
    if (current.current === target) return
    const start = current.current
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const ms = reduced ? 0 : MORPH_MS * Math.abs(target - start)
    const began = performance.now()
    let frame = 0
    const step = (now: number) => {
      const t = ms ? Math.min(1, (now - began) / ms) : 1
      current.current = start + (target - start) * t
      setProgress(current.current)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [open])

  const t = ease(progress)
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      data-morph={open ? "x" : "inbox"}
      className={cn("size-4", className)}
    >
      <polyline points={blend(TRAY, TRAY_AS_X, t)} />
      <polyline points={blend(DIP, DIP_AS_X, t)} />
    </svg>
  )
}
