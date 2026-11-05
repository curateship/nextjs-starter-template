/**
 * Copy look and Paste look on a clip's right-click menu
 * (`workspace/docs/copy-a-clips-look.md`): one clip's settings onto others,
 * as one Undo step. Tyler, 4 Nov 2026, picked what travels: "Colour and film
 * look, Fades, Size, crop and fit, Speed and volume".
 *
 * What never travels: the file, the words, the clip's place on the timeline
 * or on the frame, its zooms, blur and follow points. Each kind takes only
 * the settings it has: a picture has no speed or sound, a sound has no
 * picture, and text and shapes take nothing.
 */

type LookClip = {
  kind: string
  brightness?: number
  contrast?: number
  saturation?: number
  look?: string
  fadeInMs?: number
  fadeOutMs?: number
  pictureFadeInMs?: number
  pictureFadeOutMs?: number
  fit?: string
  fillFocus?: number
  scale?: number
  speed?: number
  volume?: number
}

const PICTURE_KEYS = [
  "brightness",
  "contrast",
  "saturation",
  "look",
  "pictureFadeInMs",
  "pictureFadeOutMs",
  "fit",
  "fillFocus",
  "scale",
] as const
const SOUND_KEYS = ["fadeInMs", "fadeOutMs", "volume"] as const

export type CopiedLook = {
  /** The kind it was copied from, for the sentence that says what pasted. */
  from: string
  values: Partial<Pick<LookClip, (typeof PICTURE_KEYS)[number] | (typeof SOUND_KEYS)[number]>>
  speed?: number
}

export const LOOK_KINDS = ["video", "image", "audio"] as const

export function takesLook(kind: string) {
  return (LOOK_KINDS as readonly string[]).includes(kind)
}

function keysFor(kind: string): readonly string[] {
  if (kind === "video") return [...PICTURE_KEYS, ...SOUND_KEYS]
  if (kind === "image") return PICTURE_KEYS
  if (kind === "audio") return SOUND_KEYS
  return []
}

/**
 * The clip's look, every setting written out, so a setting left at normal on
 * the copied clip puts the pasted-onto clip back to normal too.
 */
export function copyLook(clip: LookClip): CopiedLook | null {
  if (!takesLook(clip.kind)) return null
  const values: Record<string, unknown> = {}
  for (const key of keysFor(clip.kind)) values[key] = clip[key as keyof LookClip]
  return {
    from: clip.kind,
    values: values as CopiedLook["values"],
    ...(clip.kind === "image" ? {} : { speed: clip.speed ?? 1 }),
  }
}

/**
 * What changes on one clip: the copied settings this kind has, and its new
 * speed when it plays. Null when the kind takes nothing.
 */
export function lookPatchFor(
  clip: LookClip,
  look: CopiedLook
): { patch: Record<string, unknown>; speed: number | null } | null {
  if (!takesLook(clip.kind)) return null
  const patch: Record<string, unknown> = {}
  for (const key of keysFor(clip.kind)) {
    if (key in look.values) patch[key] = look.values[key as keyof CopiedLook["values"]]
  }
  const speed = clip.kind !== "image" && look.speed !== undefined ? look.speed : null
  return { patch, speed }
}
