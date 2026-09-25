// Snapping and alignment guides for the studio editor. All of the maths lives
// here, away from the pointer handlers, because it is the part that has to be
// exactly right: a clip that lands one millisecond short of its neighbour
// leaves a black frame in the export that nobody can see on the timeline.
//
// Two surfaces use it. On the timeline a dragged or trimmed clip snaps to the
// edges of nearby clips and to the playhead; on the preview stage a dragged
// text overlay snaps to the frame's centre lines.

import { pxToMs } from "./timeline-utils"

// How close a dragged edge has to come before it snaps. Kept in screen pixels
// rather than milliseconds so the pull feels identical at every zoom level —
// at 18px/s that is a wide 440ms, at 90px/s a precise 89ms, and in both cases
// it is the same short distance under the pointer.
export const SNAP_THRESHOLD_PX = 8

// The same idea on the preview stage, a little tighter because the frame is
// small and there are only two lines to catch.
export const STAGE_SNAP_THRESHOLD_PX = 6

// The centre of the frame in the normalized (0..1) coordinates text clips use.
export const STAGE_CENTER = 0.5

export type SnapClip = { id: string; startMs: number; durationMs: number }
export type SnapTrack = { clips: SnapClip[] }

// Candidate snap positions, precomputed once per drag and indexed by the track
// the clip would land on. Building this on pointer-down rather than on every
// pointer-move is what keeps a long timeline smooth: each move then only does
// a binary search over a sorted array.
export type SnapIndex = { perTrack: number[][] }

// A resolved snap: where the value ended up, and the timeline position of the
// line to draw (null when nothing was in range).
export type SnapResult = { ms: number; guideMs: number | null }

// The pixel threshold expressed in milliseconds at the current zoom. Returns 0
// when snapping is off (Alt held) or the zoom is not usable, and a 0 threshold
// makes every lookup below miss, which is exactly the bypass we want.
export function snapThresholdMs(
  pxPerSecond: number,
  thresholdPx = SNAP_THRESHOLD_PX
) {
  if (!(pxPerSecond > 0)) return 0
  return pxToMs(thresholdPx, pxPerSecond)
}

function sortedUnique(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const unique: number[] = []
  for (const value of sorted) {
    if (!unique.length || unique[unique.length - 1] !== value) unique.push(value)
  }
  return unique
}

// Both edges of every clip on the track and its two neighbours, plus whatever
// extra positions the caller cares about (the playhead, the start of the
// timeline). The dragged clip is excluded — a clip must not snap to itself.
export function buildSnapIndex({
  tracks,
  excludeClipId,
  extraMs = [],
}: {
  tracks: SnapTrack[]
  excludeClipId?: string | null
  extraMs?: number[]
}): SnapIndex {
  const edges = tracks.map((track) => {
    const list: number[] = []
    for (const clip of track.clips) {
      if (clip.id === excludeClipId) continue
      list.push(clip.startMs, clip.startMs + clip.durationMs)
    }
    return list
  })
  const perTrack = tracks.map((_, index) => {
    const merged = [...extraMs]
    for (let i = index - 1; i <= index + 1; i += 1) {
      const neighbour = edges[i]
      if (neighbour) merged.push(...neighbour)
    }
    return sortedUnique(merged)
  })
  return { perTrack }
}

// The candidates for a clip dropped on `trackIndex`, clamped to the tracks that
// exist so a drag past the last lane still snaps to that lane's edges.
export function candidatesForTrack(index: SnapIndex, trackIndex: number) {
  if (!index.perTrack.length) return []
  const clamped = Math.min(Math.max(trackIndex, 0), index.perTrack.length - 1)
  return index.perTrack[clamped]
}

// Nearest candidate within the threshold, or null. Binary search rather than a
// scan: this runs on every pointer move, and a long project has thousands of
// edges. Ties go to the earlier candidate so the result never depends on which
// direction the pointer happened to arrive from.
export function nearestSnap(
  candidates: number[],
  valueMs: number,
  thresholdMs: number
): number | null {
  if (!candidates.length || !(thresholdMs > 0)) return null
  let low = 0
  let high = candidates.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (candidates[middle] < valueMs) low = middle + 1
    else high = middle
  }
  let best: number | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  // The insertion point splits the array; only its two neighbours can win.
  for (const i of [low - 1, low]) {
    const candidate = candidates[i]
    if (candidate === undefined) continue
    const distance = Math.abs(candidate - valueMs)
    if (distance <= thresholdMs && distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

// A clip being moved snaps by either edge — its head to the tail of the clip
// before it, or its tail to the head of the clip after it — and the edge that
// needs the smaller nudge wins. A tail snap that would push the clip before
// t=0 is discarded rather than clamped, since a clamped result would no longer
// sit on the line the guide is drawing.
export function snapClipMove({
  candidates,
  startMs,
  durationMs,
  thresholdMs,
}: {
  candidates: number[]
  startMs: number
  durationMs: number
  thresholdMs: number
}): SnapResult {
  const options: SnapResult[] = []
  const head = nearestSnap(candidates, startMs, thresholdMs)
  if (head !== null) options.push({ ms: head, guideMs: head })
  const tail = nearestSnap(candidates, startMs + durationMs, thresholdMs)
  if (tail !== null && tail - durationMs >= 0) {
    options.push({ ms: tail - durationMs, guideMs: tail })
  }

  let best: SnapResult = { ms: startMs, guideMs: null }
  let bestDelta = Number.POSITIVE_INFINITY
  for (const option of options) {
    const delta = Math.abs(option.ms - startMs)
    if (delta < bestDelta) {
      best = option
      bestDelta = delta
    }
  }
  return best
}

// A single boundary being dragged: a trim grip, where only the edge under the
// pointer moves.
export function snapEdge({
  candidates,
  valueMs,
  thresholdMs,
}: {
  candidates: number[]
  valueMs: number
  thresholdMs: number
}): SnapResult {
  const hit = nearestSnap(candidates, valueMs, thresholdMs)
  return hit === null
    ? { ms: valueMs, guideMs: null }
    : { ms: hit, guideMs: hit }
}

// The stage threshold as a fraction of the frame, so the pull is the same
// number of screen pixels whatever size the preview has been resized to.
export function stageSnapThreshold(
  sizePx: number,
  thresholdPx = STAGE_SNAP_THRESHOLD_PX
) {
  return sizePx > 0 ? thresholdPx / sizePx : 0
}

export type StageSnapResult = {
  x: number
  y: number
  snappedX: boolean
  snappedY: boolean
}

// Text overlays snap to the frame's vertical and horizontal centre lines,
// independently: a title can lock to the middle of the frame horizontally
// while still sitting free near the bottom.
export function snapStageCenter({
  x,
  y,
  thresholdX,
  thresholdY,
}: {
  x: number
  y: number
  thresholdX: number
  thresholdY: number
}): StageSnapResult {
  const snappedX = thresholdX > 0 && Math.abs(x - STAGE_CENTER) <= thresholdX
  const snappedY = thresholdY > 0 && Math.abs(y - STAGE_CENTER) <= thresholdY
  return {
    x: snappedX ? STAGE_CENTER : x,
    y: snappedY ? STAGE_CENTER : y,
    snappedX,
    snappedY,
  }
}
