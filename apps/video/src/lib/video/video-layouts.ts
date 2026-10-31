/**
 * The one-press layouts for a picture or video on top of another: a corner
 * box, a top and bottom split, a side-by-side split, and back to full frame.
 *
 * A layout only sets the numbers a clip is placed by (clip-size.ts), so the
 * result can be dragged and resized afterwards like anything else. A split
 * places two clips: the one picked takes the top or left half, and the clip
 * under it on the lane below takes the other half. Both change in one Undo.
 */

import type { ProjectTimeline } from "./timeline-schema"

type Clip = ProjectTimeline["tracks"][number]["clips"][number]

export const VIDEO_LAYOUTS = [
  { id: "corner", label: "Corner box" },
  { id: "stacked", label: "Top and bottom" },
  { id: "side-by-side", label: "Side by side" },
  { id: "full", label: "Full frame" },
] as const

export type VideoLayoutId = (typeof VIDEO_LAYOUTS)[number]["id"]

// A face in the corner at 30% of the frame is 324 pixels across on a tall
// project: big enough to read an expression, small enough to leave the
// screen recording under it readable.
export const CORNER_BOX_SCALE = 0.3
// The gap between the corner box and the edge it sits against, as a share of
// the frame.
const CORNER_GAP = 0.03

type Placement = Pick<
  Clip,
  "scale" | "x" | "y" | "boxWidth" | "boxHeight" | "fit"
>

export type LayoutPatch = { clipId: string; patch: Placement }

/** How much of the frame's right and bottom edges a platform covers. */
export type CornerInset = { right: number; bottom: number }

const FULL_FRAME: Placement = {
  scale: undefined,
  x: undefined,
  y: undefined,
  boxWidth: undefined,
  boxHeight: undefined,
}

function isLaidOut(clip: Pick<Clip, "kind">) {
  return clip.kind === "video" || clip.kind === "image"
}

/**
 * The clip on the lane below the picked one that shares the most time with
 * it, which is the one a split puts in the other half. Null when nothing
 * visual sits under it.
 */
export function splitPartner(
  tracks: { clips: Clip[] }[],
  clipId: string
): Clip | null {
  const laneIndex = tracks.findIndex((track) =>
    track.clips.some((clip) => clip.id === clipId)
  )
  if (laneIndex < 0) return null
  const picked = tracks[laneIndex].clips.find((clip) => clip.id === clipId)!
  const below = tracks[laneIndex + 1]
  if (!below) return null
  let best: Clip | null = null
  let bestOverlap = 0
  for (const clip of below.clips) {
    if (!isLaidOut(clip)) continue
    const overlap =
      Math.min(picked.startMs + picked.durationMs, clip.startMs + clip.durationMs) -
      Math.max(picked.startMs, clip.startMs)
    if (overlap > bestOverlap) {
      best = clip
      bestOverlap = overlap
    }
  }
  return best
}

/** What a layout changes, clip by clip. */
export function layoutPatches(
  layout: VideoLayoutId,
  picked: Clip,
  partner: Clip | null,
  inset: CornerInset = { right: 0, bottom: 0 }
): LayoutPatch[] {
  if (layout === "full") {
    return [{ clipId: picked.id, patch: FULL_FRAME }]
  }
  if (layout === "corner") {
    // Filled, so the box is exactly frame-shaped and its edge sits where the
    // numbers say rather than wherever a letterbox happens to end.
    const half = CORNER_BOX_SCALE / 2
    return [
      {
        clipId: picked.id,
        patch: {
          ...FULL_FRAME,
          scale: CORNER_BOX_SCALE,
          x: round(1 - inset.right - CORNER_GAP - half),
          y: round(1 - inset.bottom - CORNER_GAP - half),
          fit: "cover",
        },
      },
    ]
  }
  const stacked = layout === "stacked"
  const half = (first: boolean): Placement => ({
    ...FULL_FRAME,
    boxWidth: stacked ? undefined : 0.5,
    boxHeight: stacked ? 0.5 : undefined,
    x: stacked ? 0.5 : first ? 0.25 : 0.75,
    y: stacked ? (first ? 0.25 : 0.75) : 0.5,
    fit: "cover",
  })
  const patches: LayoutPatch[] = [{ clipId: picked.id, patch: half(true) }]
  if (partner) patches.push({ clipId: partner.id, patch: half(false) })
  return patches
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}
