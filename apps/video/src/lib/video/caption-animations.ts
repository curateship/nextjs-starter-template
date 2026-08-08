/**
 * How a caption word arrives on screen.
 *
 * A caption clip can carry an animation. When it does, each word plays a short
 * entrance the moment it becomes the word being spoken. The maths lives here,
 * as plain functions, because two very different things have to agree on it:
 * the preview, which moves the word with CSS every frame, and the export,
 * which draws still pictures a few times through the entrance. Same easing,
 * same numbers, one place to read them.
 *
 * The vertical shift is measured in `em` — a fraction of the text size —
 * rather than pixels, so it looks the same whatever size the video is made at.
 */

export const CAPTION_ANIMATION_IDS = ["none", "pop", "rise", "bounce"] as const

export type CaptionAnimationId = (typeof CAPTION_ANIMATION_IDS)[number]

export const CAPTION_ANIMATIONS: {
  id: CaptionAnimationId
  label: string
  description: string
}[] = [
  { id: "none", label: "None", description: "The word just lights up" },
  { id: "pop", label: "Pop", description: "Lands big, then settles" },
  { id: "rise", label: "Rise", description: "Slides up as it fades in" },
  { id: "bounce", label: "Bounce", description: "Swells once as it lands" },
]

export const DEFAULT_CAPTION_ANIMATION: CaptionAnimationId = "none"

/**
 * How long the entrance lasts, from the moment the word becomes the one being
 * spoken. Short on purpose: it has to finish inside even a quick word, and a
 * longer word simply rests at the end of it.
 */
export const CAPTION_ANIM_ENTRANCE_MS = 240

/**
 * How often the export draws the entrance — one picture per step. The preview
 * is smooth because a browser can be; this number only decides how much work
 * an export does. A word with an animation costs about four extra pictures.
 */
const CAPTION_ANIM_EXPORT_STEP_MS = 60

/**
 * Where the word sits at one moment: how big it is, how solid, and how far it
 * is from where it will end up.
 */
export type CaptionWordAnimation = {
  scale: number
  opacity: number
  dyEm: number
}

/** Where every word ends up: full size, fully there, in place. */
const REST: CaptionWordAnimation = { scale: 1, opacity: 1, dyEm: 0 }

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/** Fast at the start, easing to a stop — how a thing lands rather than halts. */
function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t)
  return 1 - u * u * u
}

export function isAnimatedCaption(
  id: CaptionAnimationId | undefined
): id is Exclude<CaptionAnimationId, "none"> {
  return !!id && id !== "none"
}

/**
 * Reads a saved value as one of the four. Anything unrecognised is "none", so
 * an older project or a hand-edited one draws rather than breaks.
 */
export function resolveCaptionAnimation(
  id: string | undefined | null
): CaptionAnimationId {
  return (CAPTION_ANIMATION_IDS as readonly string[]).includes(id ?? "")
    ? (id as CaptionAnimationId)
    : "none"
}

/**
 * How far through its entrance a word is, from 0 to 1. Before it starts it is
 * 0; once the entrance is over it stays at 1.
 */
export function captionEntranceProgress(
  relativeMs: number,
  wordStartMs: number
): number {
  return clamp01((relativeMs - wordStartMs) / CAPTION_ANIM_ENTRANCE_MS)
}

/**
 * Where the word sits, that far through its entrance. "none" — and anything
 * unrecognised — is exactly where it ends up, so a caption with no animation
 * is drawn identically to one that never had the idea.
 */
export function captionWordAnimation(
  id: CaptionAnimationId,
  progress: number
): CaptionWordAnimation {
  const eased = easeOutCubic(progress)
  switch (id) {
    case "pop":
      // Arrives a third bigger and settles back.
      return { scale: 1 + 0.35 * (1 - eased), opacity: 1, dyEm: 0 }
    case "rise":
      // Comes up from just under its place, fading in on the way.
      return { scale: 1, opacity: 0.2 + 0.8 * eased, dyEm: 0.45 * (1 - eased) }
    case "bounce":
      // One swell: normal, bigger, normal again.
      return {
        scale: 1 + 0.28 * Math.sin(Math.PI * eased),
        opacity: 1,
        dyEm: 0,
      }
    case "none":
    default:
      return REST
  }
}

/** The same position, written the way the preview's stylesheet wants it. */
export function captionWordTransformCss(anim: CaptionWordAnimation): string {
  return `translateY(${anim.dyEm.toFixed(4)}em) scale(${anim.scale.toFixed(4)})`
}

export type CaptionExportWindow = {
  /** The stretch of the clip this one drawing covers. */
  fromMs: number
  toMs: number
  /** How far through the entrance to draw it, read at the start of the window. */
  progress: number
}

/**
 * Cuts one word's turn on screen into the pictures an export has to draw.
 *
 * A word can already be the current one before its own entrance begins — that
 * lead-in is one still picture. Then the entrance, a few pictures across it.
 * Then everything after, as one resting picture. The pieces butt up against
 * each other and cover the whole stretch, so nothing is ever drawn twice or
 * left blank.
 */
export function captionExportWindows(
  fromMs: number,
  toMs: number,
  wordStartMs: number
): CaptionExportWindow[] {
  if (toMs <= fromMs) return []
  const windows: CaptionExportWindow[] = []
  const entranceEnd = Math.min(toMs, wordStartMs + CAPTION_ANIM_ENTRANCE_MS)
  let cursor = fromMs

  const animStart = Math.max(fromMs, wordStartMs)
  if (animStart > cursor) {
    windows.push({ fromMs: cursor, toMs: animStart, progress: 0 })
    cursor = animStart
  }

  while (cursor < entranceEnd) {
    const next = Math.min(cursor + CAPTION_ANIM_EXPORT_STEP_MS, entranceEnd)
    windows.push({
      fromMs: cursor,
      toMs: next,
      progress: clamp01((cursor - wordStartMs) / CAPTION_ANIM_ENTRANCE_MS),
    })
    cursor = next
  }

  if (toMs > cursor) {
    windows.push({ fromMs: cursor, toMs, progress: 1 })
  }
  return windows
}
