/**
 * Where a dragged carousel layer lands: on the slide's centre or edges, on
 * another layer's edges or middle, or at the same gap from its neighbours as
 * they keep from each other. Positions are fractions of the slide, as the
 * layers store them. The rule is in workspace/docs/carousel-snapping.md.
 */

export type SnapBox = { x: number; y: number; width: number; height: number }

export type SnapAxis = "x" | "y"

/** A line drawn across the whole slide, at `at` along its axis. */
export type SnapLine = { axis: SnapAxis; at: number }

/**
 * A gap marker between two boxes: along `axis` from `from` to `to`, drawn at
 * `cross` on the other axis. Two or more of the same length mean equal spacing.
 */
export type SnapGap = { axis: SnapAxis; from: number; to: number; cross: number }

export type SnapResult = {
  box: SnapBox
  lines: SnapLine[]
  gaps: SnapGap[]
}

/** How close, in screen pixels, a layer has to come before it snaps. */
export const CAROUSEL_SNAP_PX = 6

type Candidate = { at: number; gaps: SnapGap[] }

function start(box: SnapBox, axis: SnapAxis) {
  return axis === "x" ? box.x : box.y
}

function size(box: SnapBox, axis: SnapAxis) {
  return axis === "x" ? box.width : box.height
}

function end(box: SnapBox, axis: SnapAxis) {
  return start(box, axis) + size(box, axis)
}

function crossMiddle(boxes: SnapBox[], axis: SnapAxis) {
  const other: SnapAxis = axis === "x" ? "y" : "x"
  const top = Math.max(...boxes.map((box) => start(box, other)))
  const bottom = Math.min(...boxes.map((box) => end(box, other)))
  // The boxes overlap on the other axis, so the marker sits inside all of
  // them; when they do not, it sits between their middles.
  if (top <= bottom) return (top + bottom) / 2
  const middles = boxes.map((box) => start(box, other) + size(box, other) / 2)
  return middles.reduce((sum, value) => sum + value, 0) / middles.length
}

// Two boxes are neighbours along an axis when they overlap on the other one,
// the way two cards side by side share some height.
function overlapsAcross(a: SnapBox, b: SnapBox, axis: SnapAxis) {
  const other: SnapAxis = axis === "x" ? "y" : "x"
  return start(a, other) < end(b, other) && start(b, other) < end(a, other)
}

/** Lines the moving box's start, middle or end can lock onto. */
function edgeCandidates(others: SnapBox[], axis: SnapAxis): number[] {
  const values = [0, 0.5, 1]
  for (const box of others) {
    values.push(start(box, axis), start(box, axis) + size(box, axis) / 2)
    values.push(end(box, axis))
  }
  return values
}

/**
 * Places for the moving box's start that leave it the same gap from its
 * neighbours as two of them keep from each other.
 */
function gapCandidates(
  moving: SnapBox,
  others: SnapBox[],
  axis: SnapAxis
): Candidate[] {
  const row = others
    .filter((box) => overlapsAcross(box, moving, axis))
    .sort((a, b) => start(a, axis) - start(b, axis))
  const length = size(moving, axis)
  const candidates: Candidate[] = []

  for (let i = 0; i < row.length; i += 1) {
    for (let j = i + 1; j < row.length; j += 1) {
      const a = row[i]
      const b = row[j]
      const gap = start(b, axis) - end(a, axis)
      // Between the two: the same gap on both sides.
      const between = (end(a, axis) + start(b, axis) - length) / 2
      if (between >= end(a, axis)) {
        const cross = crossMiddle([a, moving, b], axis)
        candidates.push({
          at: between,
          gaps: [
            { axis, from: end(a, axis), to: between, cross },
            { axis, from: between + length, to: start(b, axis), cross },
          ],
        })
      }
      if (gap <= 0) continue
      const pairCross = crossMiddle([a, b, moving], axis)
      const pair: SnapGap = {
        axis,
        from: end(a, axis),
        to: start(b, axis),
        cross: pairCross,
      }
      // After the pair, or before it, at the pair's own gap.
      candidates.push({
        at: end(b, axis) + gap,
        gaps: [
          pair,
          {
            axis,
            from: end(b, axis),
            to: end(b, axis) + gap,
            cross: pairCross,
          },
        ],
      })
      candidates.push({
        at: start(a, axis) - gap - length,
        gaps: [
          { axis, from: start(a, axis) - gap, to: start(a, axis), cross: pairCross },
          pair,
        ],
      })
    }
  }
  return candidates
}

function snapAxis(
  moving: SnapBox,
  others: SnapBox[],
  axis: SnapAxis,
  threshold: number
): { shift: number; lines: SnapLine[]; gaps: SnapGap[] } {
  if (threshold <= 0) return { shift: 0, lines: [], gaps: [] }
  const length = size(moving, axis)
  const anchors = [0, length / 2, length]
  const edges = edgeCandidates(others, axis)
  const gaps = gapCandidates(moving, others, axis)
  // Every place the box's start could go, nearest first.
  const shifts = [
    ...edges.flatMap((at) =>
      anchors.map((anchor) => at - (start(moving, axis) + anchor))
    ),
    ...gaps.map((candidate) => candidate.at - start(moving, axis)),
  ].filter((shift) => Math.abs(shift) <= threshold)
  if (!shifts.length) return { shift: 0, lines: [], gaps: [] }
  const shift = shifts.reduce((best, next) =>
    Math.abs(next) < Math.abs(best) ? next : best
  )

  // Everything the snapped box now lines up with is drawn, not only the one
  // it locked onto, so a box centred on the slide and spaced evenly between
  // two layers shows both.
  const snapped = start(moving, axis) + shift
  const lines = [
    ...new Set(
      edges.filter((at) =>
        anchors.some((anchor) => Math.abs(snapped + anchor - at) < 1e-9)
      )
    ),
  ].map((at) => ({ axis, at }))
  const gapMarks = gaps
    .filter((candidate) => Math.abs(candidate.at - snapped) < 1e-9)
    .flatMap((candidate) => candidate.gaps)
  return { shift, lines, gaps: gapMarks }
}

/**
 * Snaps a box being moved. `thresholdX` and `thresholdY` are the pull as a
 * fraction of the slide; 0 switches snapping off, as holding Alt does.
 */
export function snapMove({
  box,
  others,
  thresholdX,
  thresholdY,
}: {
  box: SnapBox
  others: SnapBox[]
  thresholdX: number
  thresholdY: number
}): SnapResult {
  const x = snapAxis(box, others, "x", thresholdX)
  const y = snapAxis(box, others, "y", thresholdY)
  const moved = {
    ...box,
    x: clamp(box.x + x.shift, 1 - box.width),
    y: clamp(box.y + y.shift, 1 - box.height),
  }
  return {
    box: moved,
    lines: [...x.lines, ...y.lines],
    gaps: [...x.gaps, ...y.gaps],
  }
}

/** Which sides of a box a resize handle moves. */
export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

export const RESIZE_HANDLES: ResizeHandle[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
]

/**
 * A box resized from one handle by `dx` and `dy` (fractions of the slide),
 * with the moving sides snapped to the slide and to other layers. The far
 * side stays where it was, and no side passes the edge of the slide or goes
 * under `minSize`.
 */
export function snapResize({
  box,
  handle,
  dx,
  dy,
  others,
  thresholdX,
  thresholdY,
  minSize,
}: {
  box: SnapBox
  handle: ResizeHandle
  dx: number
  dy: number
  others: SnapBox[]
  thresholdX: number
  thresholdY: number
  minSize: number
}): SnapResult {
  let left = box.x
  let right = box.x + box.width
  let top = box.y
  let bottom = box.y + box.height
  const lines: SnapLine[] = []

  function snapEdge(value: number, axis: SnapAxis, threshold: number) {
    if (threshold <= 0) return value
    let best: number | null = null
    for (const at of edgeCandidates(others, axis)) {
      if (
        Math.abs(at - value) <= threshold &&
        (best === null || Math.abs(at - value) < Math.abs(best - value))
      ) {
        best = at
      }
    }
    if (best === null) return value
    lines.push({ axis, at: best })
    return best
  }

  if (handle.includes("w")) {
    left = Math.min(
      right - minSize,
      Math.max(0, snapEdge(left + dx, "x", thresholdX))
    )
  }
  if (handle.includes("e")) {
    right = Math.max(
      left + minSize,
      Math.min(1, snapEdge(right + dx, "x", thresholdX))
    )
  }
  if (handle.includes("n")) {
    top = Math.min(
      bottom - minSize,
      Math.max(0, snapEdge(top + dy, "y", thresholdY))
    )
  }
  if (handle.includes("s")) {
    bottom = Math.max(
      top + minSize,
      Math.min(1, snapEdge(bottom + dy, "y", thresholdY))
    )
  }

  return {
    box: { x: left, y: top, width: right - left, height: bottom - top },
    lines,
    gaps: [],
  }
}

/** The smallest box holding every box given. */
export function boundingBox(boxes: SnapBox[]): SnapBox {
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** The pull as a fraction of the slide, the same in screen pixels at any zoom. */
export function snapThreshold(slidePx: number, px = CAROUSEL_SNAP_PX) {
  return slidePx > 0 ? px / slidePx : 0
}

function clamp(value: number, max: number) {
  return Math.min(Math.max(0, max), Math.max(0, value))
}
