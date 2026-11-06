import * as React from "react"

import { cn } from "@/lib/utils"

type Point = readonly [number, number]

// Copied from Travel (`apps/travel/src/components/travel/notes-morph-icon.tsx`) for a rack's notes (Racks dashboard, part 90).
// Lucide's NotebookPen (Tyler, 3 Nov 2026: "replace the note icon with this NotebookPen"), traced as runs
// of points so it can bend into the cross. Its rounded corners are each one point on the curve between
// two straight ends, which reads the same at 16px.

/** The notebook's cover, from the top edge where the pen breaks it, round the left, and up the right side. */
const COVER: Point[] = [
  [13.4, 2],
  [6, 2],
  [4.59, 2.59],
  [4, 4],
  [4, 20],
  [4.59, 21.41],
  [6, 22],
  [18, 22],
  [19.41, 21.41],
  [20, 20],
  [20, 12.6],
]
/** The four rings on its spine. */
const RINGS: Point[][] = [6, 10, 14, 18].map((y) => [
  [2, y],
  [6, y],
])
/** The pen, round its top end, down to the nib and back. */
const PEN: Point[] = [
  [21.378, 5.626],
  [22, 4.124],
  [21.378, 2.622],
  [19.876, 2],
  [18.374, 2.622],
  [13.364, 7.634],
  [12.858, 8.488],
  [12.021, 11.358],
  [12.641, 11.978],
  [15.511, 11.141],
  [16.365, 10.635],
  [21.378, 5.626],
]

/** Points spread along a line, at the given fractions of the way from one end to the other. */
function along(from: Point, to: Point, at: number[]): Point[] {
  return at.map((t) => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t])
}

// Each of the cross's strokes takes as many points as the shape it grows from, so every point has
// somewhere to go. The cover folds flat onto one stroke, out and back, the pen onto the other, and each
// ring becomes a short piece of the first.
const DOWN: [Point, Point] = [
  [6, 6],
  [18, 18],
]
const UP: [Point, Point] = [
  [18, 6],
  [6, 18],
]
const COVER_AS_X = along(...DOWN, [0, 0.2, 0.4, 0.6, 0.8, 1, 0.8, 0.6, 0.4, 0.2, 0])
const RINGS_AS_X = RINGS.map((_, index) => along(...DOWN, [index * 0.25, index * 0.25 + 0.25]))
const PEN_AS_X = along(...UP, [0, 0.2, 0.4, 0.6, 0.8, 1, 0.8, 0.6, 0.4, 0.2, 0.1, 0])

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
 * The trip's notes icon: a notebook with a pen that bends into a cross while the
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
        [COVER, COVER_AS_X],
        ...RINGS.map((ring, index): [Point[], Point[]] => [ring, RINGS_AS_X[index]]),
        [PEN, PEN_AS_X],
      ]}
    />
  )
}
