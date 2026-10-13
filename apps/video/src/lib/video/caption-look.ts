import {
  DEFAULT_CAPTION_ANIMATION,
  type CaptionAnimationId,
} from "@/lib/video/caption-animations"
import { DEFAULT_CAPTION_WORD_COLOR } from "@/lib/video/caption-words"

/**
 * How new captions look when they land. Every window that writes captions
 * starts from the standard look below; the Captions window lets it be changed
 * for that one run.
 *
 * It only ever shapes captions as they are written. A caption already on a
 * timeline carries its own size, colour and place.
 */

export type CaptionLook = {
  /** In the 1080-tall design space every text clip is measured in. */
  fontSize: number
  color: string
  /** Whether the words sit on a block of colour, and which colour. */
  boxed: boolean
  boxColor: string
  animation: CaptionAnimationId
  /** Whether the word being said turns a colour of its own, and which. */
  wordHighlight: boolean
  wordColor: string
  /** How far down the frame the middle of the words sits, 0 to 1. */
  y: number
}

export const CAPTION_FONT_SIZE_MIN = 40
export const CAPTION_FONT_SIZE_MAX = 140
export const CAPTION_Y_MIN = 0.05
export const CAPTION_Y_MAX = 0.95

/** The standard look: white words on a black box, near the bottom. */
export const DEFAULT_CAPTION_LOOK: CaptionLook = {
  fontSize: 64,
  color: "#ffffff",
  boxed: true,
  boxColor: "#000000",
  animation: DEFAULT_CAPTION_ANIMATION,
  wordHighlight: false,
  wordColor: DEFAULT_CAPTION_WORD_COLOR,
  // Down near the bottom, out of the way of a face.
  y: 0.78,
}

/**
 * The fields a new caption clip takes from the look. Captions always sit
 * across the middle, so only the height is part of the look.
 */
export function captionClipStyle(look: CaptionLook) {
  return {
    fontId: "inter" as const,
    fontSize: look.fontSize,
    color: look.color,
    highlightColor: look.boxed ? look.boxColor : undefined,
    animation: look.animation,
    activeWordColor: look.wordHighlight ? look.wordColor : undefined,
    x: 0.5,
    y: look.y,
  }
}
