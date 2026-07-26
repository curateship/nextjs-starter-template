/**
 * The long/short position drawing: a planned trade sketched on the chart as a
 * green reward zone (entry → target) stacked on a red risk zone (entry → stop).
 * Stored in chart values (time + price) exactly like a trendline, so it stays
 * pinned to its candles through any pan, zoom, or resize.
 */

export type ChartPositionSide = "long" | "short"

export type ChartPosition = {
  id: string
  side: ChartPositionSide
  /** Left edge, epoch seconds. */
  startTime: number
  /** Right edge, epoch seconds. */
  endTime: number
  entry: number
  target: number
  stop: number
}

/**
 * How far the stop sits from entry on a freshly placed drawing — so a click
 * drops a 1.5% stop and, at the 2R multiple below, a 3% target. Half the
 * original 3%/6%, which drew a box tall enough to swamp the chart.
 */
const DEFAULT_STOP_RATIO = 0.015
/** Target distance as a multiple of the stop distance (a 2R plan). */
const DEFAULT_REWARD_MULTIPLE = 2
/** Width of a freshly placed drawing, in candles. */
export const DEFAULT_POSITION_BARS = 20
/**
 * Smallest gap kept between entry and a stop/target while dragging. Without it
 * a stop dragged through entry would flip to the wrong side and the drawing
 * would read as a trade that profits from its own stop-out.
 */
const MIN_GAP_RATIO = 0.0005
/** Prices are always positive, so a drag can never carry one to or below zero. */
const MIN_PRICE = 1e-9

export function createChartPosition({
  id,
  side,
  entry,
  startTime,
  endTime,
}: {
  id: string
  side: ChartPositionSide
  entry: number
  startTime: number
  endTime: number
}): ChartPosition {
  const stopDistance = entry * DEFAULT_STOP_RATIO
  const direction = side === "long" ? 1 : -1
  return clampChartPosition({
    id,
    side,
    startTime,
    endTime,
    entry,
    stop: entry - direction * stopDistance,
    target: entry + direction * stopDistance * DEFAULT_REWARD_MULTIPLE,
  })
}

/**
 * Keeps a dragged drawing legible: the target stays on the winning side of
 * entry, the stop on the losing side, and the right edge stays right of the
 * left edge.
 */
export function clampChartPosition(position: ChartPosition): ChartPosition {
  const gap = Math.max(position.entry * MIN_GAP_RATIO, MIN_PRICE)
  const above = position.entry + gap
  const below = Math.max(position.entry - gap, gap)
  const long = position.side === "long"
  const startTime = Math.max(Math.round(position.startTime), 1)
  return {
    ...position,
    startTime,
    endTime: Math.max(Math.round(position.endTime), startTime + 1),
    target: long
      ? Math.max(position.target, above)
      : Math.min(position.target, below),
    stop: long
      ? Math.min(position.stop, below)
      : Math.max(position.stop, above),
  }
}

export type ChartPositionStats = {
  /** Reward ÷ risk; null when the risk is zero. */
  ratio: number | null
  /** Return on entry at the stop — always negative. */
  stopPct: number
  /** Return on entry at the target — always positive. */
  targetPct: number
}

export function chartPositionStats(
  position: ChartPosition
): ChartPositionStats {
  const direction = position.side === "long" ? 1 : -1
  const risk = Math.abs(position.entry - position.stop)
  const reward = Math.abs(position.target - position.entry)
  const legPct = (price: number) =>
    position.entry > 0
      ? ((price - position.entry) / position.entry) * 100 * direction
      : 0
  return {
    ratio: risk > 0 ? reward / risk : null,
    stopPct: legPct(position.stop),
    targetPct: legPct(position.target),
  }
}

/** Where a position drawing sits on screen, in container-local pixels. */
export type ChartPositionBox = {
  left: number
  right: number
  entryY: number
  stopY: number
  targetY: number
}

/**
 * What a press grabbed: one of the three price lines, the right edge, or the
 * drawing's body (which moves the whole plan).
 */
export type ChartPositionHandle =
  | "stop"
  | "entry"
  | "target"
  | "width"
  | "body"

export function chartPositionHandleAt(
  point: { x: number; y: number },
  box: ChartPositionBox,
  hitPx: number
): ChartPositionHandle | null {
  // The right-edge dot first: it sits on the entry line, so the line test
  // below would otherwise swallow it.
  if (Math.hypot(point.x - box.right, point.y - box.entryY) <= hitPx)
    return "width"

  const withinWidth =
    point.x >= Math.min(box.left, box.right) - hitPx &&
    point.x <= Math.max(box.left, box.right) + hitPx
  if (!withinWidth) return null

  // Each price line is grabbable along its whole length, not just at its dot.
  const lines: { handle: ChartPositionHandle; y: number }[] = [
    { handle: "stop", y: box.stopY },
    { handle: "target", y: box.targetY },
    { handle: "entry", y: box.entryY },
  ]
  let closest: { handle: ChartPositionHandle; distance: number } | null = null
  for (const { handle, y } of lines) {
    const distance = Math.abs(point.y - y)
    if (distance <= hitPx && (!closest || distance < closest.distance)) {
      closest = { handle, distance }
    }
  }
  return closest?.handle ?? null
}

/**
 * The drawing as it should look mid-drag. Each price line moves on its own —
 * including entry, which slides between the stop and the target and resizes
 * both zones — the right edge only changes how far the plan runs, and the body
 * carries the whole plan, shape intact, with the pointer.
 */
export function dragChartPosition(
  drag: {
    handle: ChartPositionHandle
    origin: ChartPosition
    grab: { time: number; price: number }
  },
  point: { time: number; price: number }
): ChartPosition {
  const { handle, origin, grab } = drag
  if (handle === "stop")
    return clampChartPosition({ ...origin, stop: point.price })
  if (handle === "target")
    return clampChartPosition({ ...origin, target: point.price })
  if (handle === "width")
    return clampChartPosition({ ...origin, endTime: point.time })
  if (handle === "entry") {
    // Entry has to stay inside its own zones, or the plan would invert.
    const long = origin.side === "long"
    const low = long ? origin.stop : origin.target
    const high = long ? origin.target : origin.stop
    const gap = Math.max(origin.entry * MIN_GAP_RATIO, MIN_PRICE)
    return clampChartPosition({
      ...origin,
      entry: Math.min(Math.max(point.price, low + gap), high - gap),
    })
  }

  const lowest = Math.min(origin.entry, origin.stop, origin.target)
  const shift = Math.max(point.price - grab.price, MIN_PRICE - lowest)
  const timeShift = point.time - grab.time
  return clampChartPosition({
    ...origin,
    entry: origin.entry + shift,
    stop: origin.stop + shift,
    target: origin.target + shift,
    startTime: origin.startTime + timeShift,
    endTime: origin.endTime + timeShift,
  })
}

/** True when the point lands anywhere on the drawing's two zones. */
export function isInsideChartPosition(
  point: { x: number; y: number },
  box: ChartPositionBox
): boolean {
  return (
    point.x >= Math.min(box.left, box.right) &&
    point.x <= Math.max(box.left, box.right) &&
    point.y >= Math.min(box.stopY, box.targetY) &&
    point.y <= Math.max(box.stopY, box.targetY)
  )
}
