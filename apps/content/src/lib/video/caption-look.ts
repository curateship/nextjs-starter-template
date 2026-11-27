import { z } from "zod"

import {
  CAPTION_ANIMATION_IDS,
  DEFAULT_CAPTION_ANIMATION,
} from "@/lib/video/caption-animations"
import {
  captionClipWordTimes,
  DEFAULT_CAPTION_WORD_COLOR,
} from "@/lib/video/caption-words"
import { captionClipName, type CaptionLine } from "@/lib/video/captions"
import {
  DEFAULT_SAFE_BOXES,
  placeInSafeBox,
  readSafeBoxes,
  SAFE_BOX_ASPECT,
  SAFE_BOX_PLATFORM_IDS,
  type SafeBoxes,
} from "@/lib/video/safe-box"
import {
  DEFAULT_TEXT_FONT_ID,
  TEXT_FONT_IDS,
} from "@/lib/video/text-fonts"
import { TEXT_STROKE_WIDTH_MAX } from "@/lib/video/text-lines"
import {
  MAX_TRACK_CLIPS,
  type AspectRatio,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"

/**
 * How new captions look when they land. The look is saved once for the whole
 * app on Settings → Captions, and every window that writes captions starts
 * from it; the Captions window lets it be changed for that one run.
 *
 * It only ever shapes captions as they are written. A caption already on a
 * timeline carries its own font, size, colour and place.
 */

export const CAPTION_FONT_SIZE_MIN = 40
export const CAPTION_FONT_SIZE_MAX = 140
export const CAPTION_Y_MIN = 0.05
export const CAPTION_Y_MAX = 0.95

/**
 * The most words one caption holds. Four is what captions have always been
 * cut at; fewer cuts each line again at its word times.
 */
export const CAPTION_WORDS_MAX = 4

const colourSchema = z.string().regex(/^#[0-9a-f]{6}$/i)

export const captionLookSchema = z.object({
  fontId: z.enum(TEXT_FONT_IDS),
  /** In the 1080-tall design space every text clip is measured in. */
  fontSize: z.number().min(CAPTION_FONT_SIZE_MIN).max(CAPTION_FONT_SIZE_MAX),
  color: colourSchema,
  /** Whether the words are written all in capitals. */
  capitals: z.boolean(),
  /** An outline round each letter; a width of 0 means none. */
  strokeColor: colourSchema,
  strokeWidth: z.number().min(0).max(TEXT_STROKE_WIDTH_MAX),
  /** Whether the words sit on a block of colour, and which colour. */
  boxed: z.boolean(),
  boxColor: colourSchema,
  animation: z.enum(CAPTION_ANIMATION_IDS),
  /** Whether the word being said turns a colour of its own, and which. */
  wordHighlight: z.boolean(),
  wordColor: colourSchema,
  /** The most words on screen at once. */
  wordsPerCaption: z.number().int().min(1).max(CAPTION_WORDS_MAX),
  /** How far down the frame the middle of the words sits, 0 to 1. */
  y: z.number().min(CAPTION_Y_MIN).max(CAPTION_Y_MAX),
  /** Whose safe box new captions keep inside, or none. */
  platform: z.enum(SAFE_BOX_PLATFORM_IDS).nullable(),
})

export type CaptionLook = z.infer<typeof captionLookSchema>

/** The standard look: white words on a black box, near the bottom. */
export const DEFAULT_CAPTION_LOOK: CaptionLook = {
  fontId: DEFAULT_TEXT_FONT_ID,
  fontSize: 64,
  color: "#ffffff",
  capitals: false,
  strokeColor: "#000000",
  strokeWidth: 0,
  boxed: true,
  boxColor: "#000000",
  animation: DEFAULT_CAPTION_ANIMATION,
  wordHighlight: false,
  wordColor: DEFAULT_CAPTION_WORD_COLOR,
  wordsPerCaption: CAPTION_WORDS_MAX,
  // Down near the bottom, out of the way of a face.
  y: 0.78,
  platform: null,
}

/**
 * A saved look, with anything it does not mention taken from the standard
 * look: a look saved before the font was a choice reads as Inter. A field
 * that no longer reads, such as a font that has since gone, is taken from the
 * standard look too, field by field, so one stale field never stops every
 * project from opening or the Captions tab from loading.
 */
export function readCaptionLook(value: unknown): CaptionLook {
  if (!value || typeof value !== "object") return DEFAULT_CAPTION_LOOK
  const saved = value as Record<string, unknown>
  const look = { ...DEFAULT_CAPTION_LOOK }
  const fields = captionLookSchema.shape
  for (const key of Object.keys(fields) as (keyof CaptionLook)[]) {
    const read = fields[key].safeParse(saved[key])
    if (read.success) Object.assign(look, { [key]: read.data })
  }
  return look
}

/** Everything a caption window needs from Settings → Captions. */
export type CaptionSettings = {
  look: CaptionLook
  safeBoxes: SafeBoxes
}

export const DEFAULT_CAPTION_SETTINGS: CaptionSettings = {
  look: DEFAULT_CAPTION_LOOK,
  safeBoxes: DEFAULT_SAFE_BOXES,
}

export function readCaptionSettings(saved: {
  look: unknown
  safeBoxes: unknown
}): CaptionSettings {
  return {
    look: readCaptionLook(saved.look),
    safeBoxes: readSafeBoxes(saved.safeBoxes),
  }
}

/** Where new captions land: their look, the boxes, and the project's shape. */
export type CaptionPlacement = CaptionSettings & { aspect: AspectRatio }

/** Whether captions laid now keep inside a platform's box. */
function captionSafeBox(placement: CaptionPlacement) {
  const { look, safeBoxes, aspect } = placement
  if (!look.platform || aspect !== SAFE_BOX_ASPECT) return null
  return safeBoxes[look.platform]
}

/** The words as they go on screen, in `locale`'s capitals when asked. */
export function captionText(look: CaptionLook, text: string, locale?: string) {
  return look.capitals ? text.toLocaleUpperCase(locale) : text
}

/**
 * The fields a new caption clip takes from the look, for words that will say
 * `text`. Captions sit across the middle, or across the middle of the
 * platform's box when one is picked and the project is tall.
 */
export function captionClipStyle(placement: CaptionPlacement, text: string) {
  const { look } = placement
  const box = captionSafeBox(placement)
  const place = box
    ? placeInSafeBox({ ...look, text }, box)
    : { x: 0.5, y: look.y }
  return {
    fontId: look.fontId,
    fontSize: look.fontSize,
    color: look.color,
    highlightColor: look.boxed ? look.boxColor : undefined,
    ...(look.strokeWidth > 0
      ? { strokeColor: look.strokeColor, strokeWidth: look.strokeWidth }
      : {}),
    animation: look.animation,
    activeWordColor: look.wordHighlight ? look.wordColor : undefined,
    ...place,
  }
}

/**
 * Lines cut again so none holds more than `most` words. Only a line whose
 * word times match its words can be cut, because the times say where each
 * new line starts; a line without them is kept whole. A line is cut into
 * pieces as even as they come, so four words at three a line are two and
 * two, not three and one. Each piece runs until the next one starts, so the
 * words stay on screen as long as they did.
 */
export function splitCaptionLines(
  lines: CaptionLine[],
  most: number
): CaptionLine[] {
  return lines.flatMap((line) => {
    const words = line.text.split(/\s+/).filter(Boolean)
    const times = line.words
    if (words.length <= most || times?.length !== words.length) return [line]
    const pieces = Math.ceil(words.length / most)
    const out: CaptionLine[] = []
    let from = 0
    for (let piece = 0; piece < pieces; piece += 1) {
      const to = Math.round(((piece + 1) * words.length) / pieces)
      const last = piece === pieces - 1
      out.push({
        startMs: piece === 0 ? line.startMs : times[from].startMs,
        endMs: last ? line.endMs : times[to].startMs,
        text: words.slice(from, to).join(" "),
        words: times.slice(from, to),
      })
      from = to
    }
    return out
  })
}

type TimelineClip = ProjectTimeline["tracks"][number]["clips"][number]

/**
 * Caption lines as text clips in the look, starting `atMs` along the
 * timeline. Every window that lays captions goes through this, so they all
 * land alike. A line with word times can light up word by word; a line
 * without them (a translation laid at the original's times) draws plain.
 */
export function captionTextClips(
  lines: CaptionLine[],
  placement: CaptionPlacement,
  options: {
    atMs?: number
    spokenBy?: string
    /** The words' language, for its capitals (`capitalsLocale`). */
    locale?: string
    newId: () => string
  }
): TimelineClip[] {
  const atMs = options.atMs ?? 0
  // Cut smaller only while the lane can still hold them all: a lane takes
  // MAX_TRACK_CLIPS, and one word at a time on a long talk would pass it and
  // make the project refuse to save.
  const split = splitCaptionLines(lines, placement.look.wordsPerCaption)
  const fitting = split.length <= MAX_TRACK_CLIPS ? split : lines
  return fitting.map(
    (line) => {
      const text = captionText(placement.look, line.text, options.locale)
      const wordTimes = captionClipWordTimes(line)
      const style = captionClipStyle(placement, text)
      return {
        id: options.newId(),
        kind: "text" as const,
        name: captionClipName(text),
        text,
        startMs: atMs + line.startMs,
        durationMs: line.endMs - line.startMs,
        trimStartMs: 0,
        ...style,
        ...(wordTimes ? { wordTimes } : { activeWordColor: undefined }),
        ...(options.spokenBy ? { spokenBy: options.spokenBy } : {}),
      }
    }
  )
}
