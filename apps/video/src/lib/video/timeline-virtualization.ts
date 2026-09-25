// Horizontal virtualization for the studio timeline. The lanes are one very
// wide strip of absolutely positioned clips, so a project with hundreds of
// clips would otherwise mount hundreds of chips, filmstrips and ruler ticks
// that are nowhere near the viewport. These helpers turn the scroll offset
// into a time range and pick only the clips and ticks that fall inside it.

import { msToPx, pxToMs } from "./timeline-utils"

// A slice of the timeline in milliseconds.
export type TimelineWindow = { startMs: number; endMs: number }

// Anything placed on a lane: the clips, and by extension the seam badges and
// filmstrips that hang off them.
export type TimelineSpan = { startMs: number; durationMs: number }

// Extra timeline drawn on each side of the viewport. Nothing pops in while
// scrolling inside this margin, and the rendered range is only recomputed once
// the viewport reaches its edge — roughly one re-render per 480px of scroll
// instead of one per animation frame.
export const TIMELINE_OVERSCAN_PX = 480

// What the scroll box reports. These two numbers do not move when the zoom
// changes, which is why they, rather than the time range derived from them,
// are what the timeline stores.
export type ScrollMetrics = { scrollLeft: number; viewportPx: number }

export type TimelineMetrics = ScrollMetrics & {
  // Width of the sticky per-track controls column; t=0 sits one gutter in from
  // the left edge of the scrolled content.
  gutterPx: number
  pxPerSecond: number
}

// The time range the viewport currently covers. The sticky gutter hides the
// leftmost `gutterPx` of it; that sliver is included rather than subtracted so
// a clip sliding out from behind the gutter is already mounted.
export function visibleTimeRange({
  scrollLeft,
  viewportPx,
  gutterPx,
  pxPerSecond,
}: TimelineMetrics): TimelineWindow {
  if (!(pxPerSecond > 0)) return { startMs: 0, endMs: 0 }
  return {
    startMs: Math.max(0, pxToMs(scrollLeft - gutterPx, pxPerSecond)),
    endMs: Math.max(0, pxToMs(scrollLeft + viewportPx - gutterPx, pxPerSecond)),
  }
}

// Widen a range by the overscan margin. This is the range actually rendered.
export function padWindow(
  window: TimelineWindow,
  pxPerSecond: number,
  overscanPx = TIMELINE_OVERSCAN_PX
): TimelineWindow {
  if (!(pxPerSecond > 0)) return window
  const padMs = pxToMs(overscanPx, pxPerSecond)
  return {
    startMs: Math.max(0, window.startMs - padMs),
    endMs: window.endMs + padMs,
  }
}

// True while the range drawn for `drawn` still covers everything visible at
// `visible` — the signal to skip a re-render on this scroll frame. Compared in
// scroll pixels rather than milliseconds so the answer stays right across a
// zoom, which moves every time but no scroll offset.
export function metricsCovered(
  drawn: ScrollMetrics,
  visible: ScrollMetrics,
  overscanPx = TIMELINE_OVERSCAN_PX
) {
  return (
    visible.scrollLeft >= drawn.scrollLeft - overscanPx &&
    visible.scrollLeft + visible.viewportPx <=
      drawn.scrollLeft + drawn.viewportPx + overscanPx
  )
}

// Clips overlapping the window, each with its index in the full track array so
// callers can still reach an off-screen neighbour (a seam transition reads the
// preceding clip). Scans the whole track: the editor keeps clips sorted by
// start, but a saved timeline is loaded exactly as stored and the schema does
// not enforce an order, so stopping early would silently drop everything after
// one out-of-order clip.
export function visibleClips<T extends TimelineSpan>(
  clips: T[],
  window: TimelineWindow
): Array<{ clip: T; index: number }> {
  const found: Array<{ clip: T; index: number }> = []
  for (let index = 0; index < clips.length; index += 1) {
    const clip = clips[index]
    if (
      clip.startMs <= window.endMs &&
      clip.startMs + clip.durationMs >= window.startMs
    ) {
      found.push({ clip, index })
    }
  }
  return found
}

// The labelled seconds inside the window, on the ruler's own label step.
export function visibleTickSeconds(
  window: TimelineWindow,
  durationMs: number,
  stepSeconds: number
) {
  const step = Math.max(1, Math.floor(stepSeconds))
  const lastSecond = Math.ceil(Math.max(durationMs, 1000) / 1000)
  const from = Math.max(0, Math.floor(window.startMs / 1000))
  const to = Math.min(lastSecond, Math.ceil(window.endMs / 1000))
  const seconds: number[] = []
  for (let s = Math.ceil(from / step) * step; s <= to; s += step) {
    seconds.push(s)
  }
  return seconds
}

export type RevealMetrics = {
  clip: TimelineSpan
  trackIndex: number
  pxPerSecond: number
  scrollLeft: number
  scrollTop: number
  viewportWidth: number
  viewportHeight: number
  gutterPx: number
  rulerPx: number
  rowHeightPx: number
}

// Smallest scroll offsets that bring a clip fully into view, allowing for the
// sticky gutter and ruler that cover the top and left of the viewport. Returns
// the current offsets unchanged when the clip already fits, so re-selecting a
// visible clip never yanks the view. A clip wider or taller than the viewport
// is aligned to its top-left corner.
export function scrollToRevealClip({
  clip,
  trackIndex,
  pxPerSecond,
  scrollLeft,
  scrollTop,
  viewportWidth,
  viewportHeight,
  gutterPx,
  rulerPx,
  rowHeightPx,
}: RevealMetrics) {
  const clipLeft = gutterPx + msToPx(clip.startMs, pxPerSecond)
  const clipRight = clipLeft + msToPx(clip.durationMs, pxPerSecond)
  const rowTop = rulerPx + trackIndex * rowHeightPx
  const rowBottom = rowTop + rowHeightPx

  let left = scrollLeft
  if (clipLeft < scrollLeft + gutterPx) {
    left = clipLeft - gutterPx
  } else if (clipRight > scrollLeft + viewportWidth) {
    left = Math.min(clipRight - viewportWidth, clipLeft - gutterPx)
  }

  let top = scrollTop
  if (rowTop < scrollTop + rulerPx) {
    top = rowTop - rulerPx
  } else if (rowBottom > scrollTop + viewportHeight) {
    top = Math.min(rowBottom - viewportHeight, rowTop - rulerPx)
  }

  return { left: Math.max(0, left), top: Math.max(0, top) }
}
