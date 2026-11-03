import * as React from "react"

import { cn } from "@/lib/utils"

type Point = readonly [number, number]

/** The note's page, from its top-left corner round and back, as a closed run of points. */
const PAGE: Point[] = [
  [5, 3],
  [15, 3],
  [15, 3],
  [19, 7],
  [19, 21],
  [12, 21],
  [5, 21],
  [5, 12],
  [5, 3],
]
/** The lines written on the page, as one zigzag stroke. */
const WRITING: Point[] = [
  [8, 9],
  [16, 9],
  [8, 13],
  [16, 13],
  [8, 17],
  [13, 17],
]

/** Points spread along a line, at the given fractions of the way from one end to the other. */
function along(from: Point, to: Point, at: number[]): Point[] {
  return at.map((t) => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t])
}

// Each of the cross's strokes takes as many points as the shape it grows from,
// so every point has somewhere to go. The page folds flat onto one stroke, out
// and back; the writing straightens into the other.
const PAGE_AS_X = along([6, 6], [18, 18], [0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25, 0])
const WRITING_AS_X = along([6, 18], [18, 6], [0, 0.2, 0.4, 0.6, 0.8, 1])

const MORPH_MS = 240

function blend(from: Point[], to: Point[], t: number) {
  return from
    .map(([x, y], i) => `${(x + (to[i][0] - x) * t).toFixed(2)},${(y + (to[i][1] - y) * t).toFixed(2)}`)
    .join(" ")
}

function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

/** How far through the morph the icon is, 0 shut to 1 open, eased over MORPH_MS. */
function useMorph(open: boolean) {
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

  return ease(progress)
}

/** Lines that bend, point by point, into the cross. */
function CrossMorph({
  open,
  lines,
  shut,
  className,
}: {
  open: boolean
  lines: [Point[], Point[]][]
  /** What `data-morph` says while shut, such as "inbox". */
  shut: string
  className?: string
}) {
  const t = useMorph(open)
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      data-morph={open ? "x" : shut}
      className={cn("size-4", className)}
    >
      {lines.map(([from, to], index) => (
        <polyline key={index} points={blend(from, to, t)} />
      ))}
    </svg>
  )
}

/**
 * The trip's notes icon: a written page that bends into a cross while the
 * notes are open in the left panel, and back when they close (Tyler, 3 Nov
 * 2026: "clicking on note should then turn into an x icon to close with the
 * morph animation"). Copied from Project's inbox and Look back icons, which
 * are Project's own file.
 */
export function NotesMorphIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <CrossMorph
      open={open}
      shut="notes"
      className={className}
      lines={[
        [PAGE, PAGE_AS_X],
        [WRITING, WRITING_AS_X],
      ]}
    />
  )
}
