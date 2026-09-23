import {
  DEFAULT_CAPTION_ANIMATION,
  resolveCaptionAnimation,
  type CaptionAnimationId,
} from "@/lib/video/caption-animations"

/**
 * How new captions look when they land: the one saved in the brand kit, and
 * what the captions window starts from every time it opens.
 *
 * It only ever shapes captions as they are written. A caption already on a
 * timeline carries its own size, colour and place, so changing the saved look
 * never reaches back into a finished project.
 */

export type CaptionLook = {
  /** In the 1080-tall design space every text clip is measured in. */
  fontSize: number
  color: string
  /** Whether the words sit on a block of colour, and which colour. */
  boxed: boolean
  boxColor: string
  animation: CaptionAnimationId
  /** How far down the frame the middle of the words sits, 0 to 1. */
  y: number
}

export const CAPTION_FONT_SIZE_MIN = 40
export const CAPTION_FONT_SIZE_MAX = 140
export const CAPTION_Y_MIN = 0.05
export const CAPTION_Y_MAX = 0.95

/** The look captions always had before it could be saved: white on black. */
export const DEFAULT_CAPTION_LOOK: CaptionLook = {
  fontSize: 64,
  color: "#ffffff",
  boxed: true,
  boxColor: "#000000",
  animation: DEFAULT_CAPTION_ANIMATION,
  // Down near the bottom, out of the way of a face.
  y: 0.78,
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/**
 * Reads a saved look field by field. A kit saved before captions had a look,
 * or with one field spoiled, takes the default for whatever is missing.
 */
export function normalizeCaptionLook(value: unknown): CaptionLook {
  const fallback = DEFAULT_CAPTION_LOOK
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...fallback }
  }
  const saved = value as Partial<Record<keyof CaptionLook, unknown>>
  return {
    fontSize: isFiniteNumber(saved.fontSize)
      ? Math.min(
          CAPTION_FONT_SIZE_MAX,
          Math.max(CAPTION_FONT_SIZE_MIN, Math.round(saved.fontSize))
        )
      : fallback.fontSize,
    color:
      typeof saved.color === "string" && HEX_COLOR.test(saved.color)
        ? saved.color
        : fallback.color,
    boxed: typeof saved.boxed === "boolean" ? saved.boxed : fallback.boxed,
    boxColor:
      typeof saved.boxColor === "string" && HEX_COLOR.test(saved.boxColor)
        ? saved.boxColor
        : fallback.boxColor,
    // Anything unrecognised reads as "none", which is also the default.
    animation: resolveCaptionAnimation(
      typeof saved.animation === "string" ? saved.animation : undefined
    ),
    y: isFiniteNumber(saved.y)
      ? Math.min(CAPTION_Y_MAX, Math.max(CAPTION_Y_MIN, saved.y))
      : fallback.y,
  }
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
    x: 0.5,
    y: look.y,
  }
}
