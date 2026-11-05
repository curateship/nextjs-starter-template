import { z } from "zod"

import { clipMsAt, clipSpeed, sourceEndMs, sourceMsAt } from "./clip-playback"
import { hasFrameShaping } from "./clip-frame-shape"
import { isPlacedPicture } from "./clip-size"

/**
 * Zoom in on a moment (`workspace/docs/zoom-in-on-a-moment.md`): a video clip
 * goes closer for a stretch and comes back. Tyler, 4 Nov 2026: "One-press
 * punch-in".
 *
 * A zoom is kept in the file's own time, not the clip's, so it stays on the
 * same moment of footage when the clip is trimmed, split, cut by Tighten or
 * played faster. Each piece of a split draws whichever zooms fall inside it.
 *
 * It grows the picture about the middle of the frame, which is the middle of
 * whatever part the crop spot shows. The preview and the export both work it
 * out from `punchScaleAt`, so they agree frame for frame.
 */

export const PUNCH_IN_EASES = ["ease", "jump"] as const
export type PunchInEase = (typeof PUNCH_IN_EASES)[number]

export const MIN_PUNCH_SCALE = 1.1
export const MAX_PUNCH_SCALE = 2
export const DEFAULT_PUNCH_SCALE = 1.3
export const MAX_PUNCH_INS = 50
/** How long a new zoom lasts, in the clip's own time. */
export const NEW_PUNCH_MS = 2000
/** Shortest zoom: below this an ease has no room to go in and come out. */
export const MIN_PUNCH_MS = 300
/** How long an ease takes to go in, and again to come out, in the clip's time. */
export const PUNCH_RAMP_MS = 300

export const punchInSchema = z
  .object({
    sourceStartMs: z.number().finite().min(0),
    sourceEndMs: z.number().finite().min(0),
    scale: z.number().min(MIN_PUNCH_SCALE).max(MAX_PUNCH_SCALE),
    ease: z.enum(PUNCH_IN_EASES),
  })
  .strict()
  .refine((punch) => punch.sourceEndMs > punch.sourceStartMs, {
    message: "A zoom has to end after it starts",
  })

export type PunchIn = z.infer<typeof punchInSchema>

type ZoomableClip = Parameters<typeof isPlacedPicture>[0] &
  Parameters<typeof hasFrameShaping>[0] & {
    kind: string
    startMs: number
    durationMs: number
    trimStartMs: number
    speed?: number
    punchIns?: PunchIn[]
  }

export const PUNCH_ONLY_FULL_FRAME =
  "Zoom works on a video that fills the frame. Set its Size back to full and its shape to a rectangle first."
export const PUNCH_PLAYHEAD_OFF_CLIP = "Move the playhead onto this clip first."
export const PUNCH_OVERLAPS = "There is already a zoom at the playhead."
export const PUNCH_FULL = `A clip holds at most ${MAX_PUNCH_INS} zooms.`
export const PUNCH_TOO_CLOSE_TO_END = "The playhead is too close to the clip's end for a zoom."

/**
 * Zoom is for a video that fills the frame. A smaller box or a bubble would
 * need its own crop in the preview, and the preview could no longer show
 * what the export draws.
 */
export function canPunchIn(clip: ZoomableClip) {
  return clip.kind === "video" && !isPlacedPicture(clip) && !hasFrameShaping(clip)
}

/** The zooms that land inside this clip's stretch of the file, in order. */
export function clipPunchIns(clip: ZoomableClip): PunchIn[] {
  // Kept but not drawn while the clip is smaller than the frame or shaped,
  // so a Size change back to full brings them back as they were.
  if (!canPunchIn(clip)) return []
  const from = clip.trimStartMs
  const to = sourceEndMs(clip)
  return (clip.punchIns ?? [])
    .filter((punch) => punch.sourceEndMs > from && punch.sourceStartMs < to)
    .sort((a, b) => a.sourceStartMs - b.sourceStartMs)
}

/** Where a zoom sits on the clip, in the clip's own milliseconds. */
export function punchSpanOnClip(clip: ZoomableClip, punch: PunchIn) {
  return {
    startMs: clipMsAt(clip, punch.sourceStartMs),
    endMs: clipMsAt(clip, punch.sourceEndMs),
  }
}

/**
 * A new zoom starting at the playhead, `atClipMs` into the clip, or the
 * sentence that says why there can't be one.
 */
export function newPunchIn(
  clip: ZoomableClip,
  atClipMs: number
): { punch: PunchIn } | { refusal: string } {
  if (!canPunchIn(clip)) return { refusal: PUNCH_ONLY_FULL_FRAME }
  if (atClipMs < 0 || atClipMs >= clip.durationMs) return { refusal: PUNCH_PLAYHEAD_OFF_CLIP }
  const existing = clip.punchIns ?? []
  if (existing.length >= MAX_PUNCH_INS) return { refusal: PUNCH_FULL }
  const startSource = sourceMsAt(clip, atClipMs)
  if (existing.some((punch) => punch.sourceStartMs <= startSource && punch.sourceEndMs > startSource)) {
    return { refusal: PUNCH_OVERLAPS }
  }
  // As long as a new zoom gets, cut short by the clip's end and by the next
  // zoom along, so zooms never overlap.
  const nextStart = Math.min(
    ...existing.map((punch) => punch.sourceStartMs).filter((start) => start > startSource),
    Number.POSITIVE_INFINITY
  )
  const endSource = Math.min(
    sourceMsAt(clip, Math.min(clip.durationMs, atClipMs + NEW_PUNCH_MS)),
    nextStart
  )
  if (endSource - startSource < MIN_PUNCH_MS * clipSpeed(clip)) {
    return { refusal: PUNCH_TOO_CLOSE_TO_END }
  }
  return {
    punch: {
      sourceStartMs: Math.round(startSource),
      sourceEndMs: Math.round(endSource),
      scale: DEFAULT_PUNCH_SCALE,
      ease: "ease",
    },
  }
}

/**
 * The clip's zooms with one moved to a new start and end in the clip's own
 * time, held inside the clip, apart from its neighbours and at least
 * `MIN_PUNCH_MS` long. `index` counts the clip's whole list.
 */
export function movePunchIn(
  clip: ZoomableClip,
  index: number,
  startClipMs: number,
  endClipMs: number
): PunchIn[] {
  const all = clip.punchIns ?? []
  const punch = all[index]
  if (!punch) return all
  const speed = clipSpeed(clip)
  const others = all.filter((_, other) => other !== index)
  const floor = Math.max(
    clip.trimStartMs,
    ...others.map((other) => other.sourceEndMs).filter((end) => end <= punch.sourceStartMs)
  )
  const ceiling = Math.min(
    sourceEndMs(clip),
    ...others.map((other) => other.sourceStartMs).filter((start) => start >= punch.sourceEndMs)
  )
  const minSpan = MIN_PUNCH_MS * speed
  let start = Math.max(floor, sourceMsAt(clip, startClipMs))
  let end = Math.min(ceiling, sourceMsAt(clip, endClipMs))
  if (end - start < minSpan) {
    if (start === punch.sourceStartMs) end = Math.min(ceiling, start + minSpan)
    else start = Math.max(floor, end - minSpan)
  }
  if (end - start < minSpan) return all
  return all.map((item, other) =>
    other === index ? { ...item, sourceStartMs: Math.round(start), sourceEndMs: Math.round(end) } : item
  )
}

/** 0 outside a zoom, 1 at its full size, smoothed in between for an ease. */
function weightAt(punch: PunchIn, sourceMs: number, rampSourceMs: number) {
  if (sourceMs < punch.sourceStartMs || sourceMs >= punch.sourceEndMs) return 0
  if (punch.ease === "jump") return 1
  const ramp = Math.min(rampSourceMs, (punch.sourceEndMs - punch.sourceStartMs) / 3)
  const linear = Math.min(
    1,
    (sourceMs - punch.sourceStartMs) / ramp,
    (punch.sourceEndMs - sourceMs) / ramp
  )
  return linear * linear * (3 - 2 * linear)
}

/** How big the picture is drawn at this moment of the file. 1 is no zoom. */
export function punchScaleAt(clip: ZoomableClip, sourceMs: number) {
  const ramp = PUNCH_RAMP_MS * clipSpeed(clip)
  let scale = 1
  for (const punch of clipPunchIns(clip)) {
    scale += (punch.scale - 1) * weightAt(punch, sourceMs, ramp)
  }
  return scale
}

/** The preview's CSS: the frame-sized picture grown about its middle. */
export function punchTransformCss(scale: number) {
  return scale === 1 ? "" : `scale(${round(scale)})`
}

/**
 * The ffmpeg stages that draw the same zooms, on a picture already fitted to
 * the frame.
 *
 * `fps` first puts the frames on an even clock, `rate` a second in the file's
 * time, so frame `in` is exactly `in / rate` seconds after `sourceStartS`,
 * where this input was opened. `rate` is the film's frame rate times the
 * clip's speed, so once the speed stage squeezes or stretches it the film
 * gets one frame per frame. Then `perspective` redraws each frame from the
 * part of the picture the zoom shows. It places that part to a fraction of a
 * pixel, where `zoompan` would round it and a zoom made of whole pixels
 * shakes (clip-motion.ts says the same of the slow moves).
 *
 * The scale is the same sum as `punchScaleAt`, written as an ffmpeg
 * expression of the file's time `S`: 1, plus for each zoom its extra size
 * times how far in it is (0 to 1, smoothed with 3w² - 2w³ for an ease).
 */
export function punchInFilter(
  clip: ZoomableClip,
  { width, height, sourceStartS, rate }: { width: number; height: number; sourceStartS: number; rate: number }
): string[] {
  const punches = clipPunchIns(clip)
  if (!punches.length) return []
  const time = `(${round(sourceStartS, 4)}+in/${round(rate, 4)})`
  const rampS = (PUNCH_RAMP_MS * clipSpeed(clip)) / 1000
  const terms = punches.map((punch) => {
    const a = round(punch.sourceStartMs / 1000, 4)
    const b = round(punch.sourceEndMs / 1000, 4)
    const extra = round(punch.scale - 1, 4)
    if (punch.ease === "jump") return `${extra}*between(${time},${a},${b})`
    const ramp = round(Math.min(rampS, (b - a) / 3), 4)
    const w = `clip(min((${time}-${a})/${ramp},(${b}-${time})/${ramp}),0,1)`
    return `${extra}*${w}*${w}*(3-2*${w})`
  })
  const scale = `(1+${terms.join("+")})`
  const left = `W*(0.5-0.5/${scale})`
  const right = `W*(0.5+0.5/${scale})`
  const top = `H*(0.5-0.5/${scale})`
  const bottom = `H*(0.5+0.5/${scale})`
  return [
    `fps=${round(rate, 4)}`,
    "format=rgba",
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black@0`,
    `perspective=x0='${left}':y0='${top}':x1='${right}':y1='${top}':x2='${left}':y2='${bottom}':x3='${right}':y3='${bottom}':interpolation=cubic:eval=frame`,
  ]
}

function round(value: number, places = 3) {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}
