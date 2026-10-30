import { z } from "zod"

/**
 * The thin bar along one edge of the video that fills from left to right as
 * it plays, so a viewer can see how much is left.
 *
 * There is one per project at most, and it belongs to the project rather than
 * to a lane: it always runs the whole length of the video, from the first
 * frame to the last clip's end, however the clips move. That is why it is
 * stored beside the project's shape and not as a clip.
 *
 * The preview and the export both size it from here. Its thickness is counted
 * in pixels of a frame whose short side is 1080, which every shape has at full
 * quality: 1080 by 1920, 1920 by 1080, 1080 by 1080 and 1440 by 1080. A lower
 * quality shrinks it with the frame.
 *
 * `inset` is how far in from its edge it sits, as a share of the frame's
 * height. A new bar takes the inset of the platform captions are fitted for,
 * so TikTok's or Instagram's buttons do not cover it. It is kept on the bar,
 * so changing the safe box afterwards never moves a bar that is already there.
 */

export const PROGRESS_BAR_EDGES = ["bottom", "top"] as const
export type ProgressBarEdge = (typeof PROGRESS_BAR_EDGES)[number]

export const PROGRESS_BAR_EDGE_OPTIONS: { id: ProgressBarEdge; label: string }[] =
  [
    { id: "bottom", label: "Bottom" },
    { id: "top", label: "Top" },
  ]

export const DEFAULT_PROGRESS_BAR_COLOR = "#ffffff"
// Eight pixels on a 1080-wide phone video is about 1.5mm on a real phone:
// visible at a glance, too thin to cover a caption.
export const DEFAULT_PROGRESS_BAR_THICKNESS = 8
export const MIN_PROGRESS_BAR_THICKNESS = 2
export const MAX_PROGRESS_BAR_THICKNESS = 40
// Any further in than this and it is no longer along the edge.
export const MAX_PROGRESS_BAR_INSET = 0.4

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

export const progressBarSchema = z
  .object({
    edge: z.enum(PROGRESS_BAR_EDGES),
    color: z.string().regex(HEX_COLOR),
    thickness: z
      .number()
      .min(MIN_PROGRESS_BAR_THICKNESS)
      .max(MAX_PROGRESS_BAR_THICKNESS),
    inset: z.number().min(0).max(MAX_PROGRESS_BAR_INSET),
  })
  .strict()

export type ProgressBar = z.infer<typeof progressBarSchema>

/** A new bar along the bottom, `inset` in from the edge. */
export function newProgressBar(inset: number): ProgressBar {
  return {
    edge: "bottom",
    color: DEFAULT_PROGRESS_BAR_COLOR,
    thickness: DEFAULT_PROGRESS_BAR_THICKNESS,
    inset: Math.round(Math.min(MAX_PROGRESS_BAR_INSET, Math.max(0, inset)) * 10_000) / 10_000,
  }
}

/** How much of the width is filled at one moment, 0 to 1. */
export function progressBarShare(timeMs: number, durationMs: number) {
  if (!(durationMs > 0)) return 0
  return Math.min(1, Math.max(0, timeMs / durationMs))
}

/** The bar's height in pixels, in a frame of this size. */
export function progressBarThicknessPx(
  bar: ProgressBar,
  frame: { width: number; height: number }
) {
  return (bar.thickness * Math.min(frame.width, frame.height)) / 1080
}

/** Where the bar's top edge is, in pixels from the top of the frame. */
export function progressBarTopPx(
  bar: ProgressBar,
  frame: { width: number; height: number }
) {
  const thickness = progressBarThicknessPx(bar, frame)
  const inset = bar.inset * frame.height
  return bar.edge === "top" ? inset : frame.height - inset - thickness
}

/**
 * The export's drawing: a strip of the bar's colour as wide as the frame,
 * slid in from the left so its right end is where the video has got to.
 * `inputLabel` is the picture so far and `outputLabel` the picture after.
 * `fromS` is where the film starts, for a single saved frame.
 */
export function progressBarFilters({
  bar,
  frame,
  durationS,
  fromS,
  fps,
  inputLabel,
  outputLabel,
}: {
  bar: ProgressBar
  frame: { width: number; height: number }
  durationS: number
  fromS: number
  fps: number
  inputLabel: string
  outputLabel: string
}) {
  // Even sides, for the 4:2:0 colour the film is written in.
  const height = Math.max(2, Math.round(progressBarThicknessPx(bar, frame) / 2) * 2)
  const top = Math.round(progressBarTopPx(bar, frame))
  const source = `color=c=0x${bar.color.slice(1)}:s=${frame.width}x${height}:r=${fps}:d=${(durationS - fromS).toFixed(3)}`
  const shifted =
    fromS > 0 ? `${source},setpts=PTS+${Math.round(fromS * fps)}` : source
  return [
    `${shifted}[pbar]`,
    `[${inputLabel}][pbar]overlay=x='-w+w*min(t/${durationS.toFixed(3)},1)':y=${top}:eof_action=pass[${outputLabel}]`,
  ]
}
