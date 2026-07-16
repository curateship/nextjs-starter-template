// Animated caption presets. A caption clip may carry an `animation` id; when set
// (and not "none"), the ACTIVE karaoke word plays a short entrance each time it
// becomes the spoken word. The transform math lives here as a pure function so
// the editor preview (CSS transform, continuous) and the ffmpeg/resvg export
// (SVG transform, sampled per sub-frame) stay in lockstep — same easing, same
// values. Vertical offset is expressed in `em` (fraction of font size) so it is
// resolution-independent across the 1080p design space and any export size.

export const CAPTION_ANIMATION_IDS = ["none", "pop", "rise", "bounce"] as const

export type CaptionAnimationId = (typeof CAPTION_ANIMATION_IDS)[number]

export const CAPTION_ANIMATIONS: {
  id: CaptionAnimationId
  label: string
  description: string
}[] = [
  { id: "none", label: "None", description: "Static karaoke highlight" },
  { id: "pop", label: "Pop", description: "Word pops in large, then settles" },
  { id: "rise", label: "Rise", description: "Word slides up and fades in" },
  { id: "bounce", label: "Bounce", description: "Word pulses as it lands" },
]

export const DEFAULT_CAPTION_ANIMATION: CaptionAnimationId = "none"

// How long the active word's entrance lasts, measured from the moment it becomes
// active (its `startMs`). Kept short so it always finishes inside a normal word
// window; longer words simply rest at the end state.
export const CAPTION_ANIM_ENTRANCE_MS = 240

// The export re-rasterizes the entrance at this cadence (one PNG per step). The
// preview is continuous (per animation frame), so this only bounds export work:
// a word with an animated preset emits ~ENTRANCE/STEP entrance frames plus one
// resting frame, instead of the single frame a static word emits. Internal to
// captionExportWindows below.
const CAPTION_ANIM_EXPORT_STEP_MS = 60

// Per-word transform for the active word. `scale` is multiplicative about the
// word's center, `opacity` multiplies the base (full) opacity, `dyEm` shifts the
// word vertically in em (positive = down).
export type CaptionWordAnimation = {
  scale: number
  opacity: number
  dyEm: number
}

const REST: CaptionWordAnimation = { scale: 1, opacity: 1, dyEm: 0 }

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t)
  return 1 - u * u * u
}

export function isAnimatedCaption(
  id: CaptionAnimationId | undefined
): id is Exclude<CaptionAnimationId, "none"> {
  return !!id && id !== "none"
}

// Coerce an untrusted/legacy value to a known id (unknown → "none"), so old
// timelines and hand-edited data never break rendering.
export function resolveCaptionAnimation(
  id: string | undefined | null
): CaptionAnimationId {
  return (CAPTION_ANIMATION_IDS as readonly string[]).includes(id ?? "")
    ? (id as CaptionAnimationId)
    : "none"
}

// Progress (0..1) through the entrance for an active word, given clip-relative
// time and the word's own start. Before the word starts it reads 0; after the
// entrance completes it reads 1 (resting).
export function captionEntranceProgress(
  relativeMs: number,
  wordStartMs: number
): number {
  return clamp01((relativeMs - wordStartMs) / CAPTION_ANIM_ENTRANCE_MS)
}

// The transform for the active word at a given entrance progress. `none` (and
// any unknown id) is the resting identity, so non-animated captions are byte-for
// -byte unchanged.
export function captionWordAnimation(
  id: CaptionAnimationId,
  progress: number
): CaptionWordAnimation {
  const p = easeOutCubic(progress)
  switch (id) {
    case "pop":
      // Appears 1.35x and settles to 1.0.
      return { scale: 1 + 0.35 * (1 - p), opacity: 1, dyEm: 0 }
    case "rise":
      // Slides up from 0.45em below while fading in.
      return { scale: 1, opacity: 0.2 + 0.8 * p, dyEm: 0.45 * (1 - p) }
    case "bounce":
      // A single pulse: 1.0 → ~1.28 → 1.0.
      return { scale: 1 + 0.28 * Math.sin(Math.PI * p), opacity: 1, dyEm: 0 }
    case "none":
    default:
      return REST
  }
}

// The CSS transform string for the preview (applied to an inline-block word
// span). Units: em for translate so it scales with font size like the export.
export function captionWordTransformCss(anim: CaptionWordAnimation): string {
  return `translateY(${anim.dyEm.toFixed(4)}em) scale(${anim.scale.toFixed(4)})`
}

export type CaptionExportWindow = {
  // Clip-relative window this rasterized frame is shown for.
  fromMs: number
  toMs: number
  // Entrance progress (0..1) to bake into this frame, sampled at `fromMs`.
  progress: number
}

// Splits one active word's window [fromMs, toMs) into the frames the export must
// rasterize so the entrance is baked in: a leading rest frame before the word's
// own start (word 0 can be active during a lead-in), then one frame per
// CAPTION_ANIM_EXPORT_STEP_MS across the entrance, then a single resting frame
// for the remainder. The windows are contiguous and exactly cover [fromMs, toMs).
export function captionExportWindows(
  fromMs: number,
  toMs: number,
  wordStartMs: number
): CaptionExportWindow[] {
  if (toMs <= fromMs) return []
  const windows: CaptionExportWindow[] = []
  const entranceEnd = Math.min(toMs, wordStartMs + CAPTION_ANIM_ENTRANCE_MS)
  let cursor = fromMs

  // Lead-in before the word actually starts animating (progress pinned at 0).
  const animStart = Math.max(fromMs, wordStartMs)
  if (animStart > cursor) {
    windows.push({ fromMs: cursor, toMs: animStart, progress: 0 })
    cursor = animStart
  }

  // Entrance, sampled at a fixed cadence; progress read at each frame's start.
  while (cursor < entranceEnd) {
    const next = Math.min(cursor + CAPTION_ANIM_EXPORT_STEP_MS, entranceEnd)
    windows.push({
      fromMs: cursor,
      toMs: next,
      progress: clamp01((cursor - wordStartMs) / CAPTION_ANIM_ENTRANCE_MS),
    })
    cursor = next
  }

  // Resting remainder once the entrance has completed.
  if (toMs > cursor) {
    windows.push({ fromMs: cursor, toMs, progress: 1 })
  }
  return windows
}
