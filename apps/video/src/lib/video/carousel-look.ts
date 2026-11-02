import { z } from "zod"

import {
  CAROUSEL_LETTER_SPACING_RANGE,
  CAROUSEL_LINE_HEIGHT_RANGE,
  CAROUSEL_OUTLINE_WIDTH_MAX,
  type CarouselSlide,
} from "@/lib/video/carousel-schema"
import { TEXT_FONT_IDS } from "@/lib/video/text-fonts"

/**
 * A carousel project's look: what a new carousel in it starts with (Tyler,
 * 1 Nov 2026: "fonts, colours, text styles and slide background"). Every field
 * is optional; one left out keeps the app's own starting value.
 */
const color = z.string().regex(/^#[0-9a-f]{6}$/i)

export const carouselLookSchema = z
  .object({
    fontId: z.enum(TEXT_FONT_IDS).optional(),
    textColor: color.optional(),
    fontSize: z.number().min(8).max(220).optional(),
    lineHeight: z
      .number()
      .min(CAROUSEL_LINE_HEIGHT_RANGE.min)
      .max(CAROUSEL_LINE_HEIGHT_RANGE.max)
      .optional(),
    letterSpacing: z
      .number()
      .min(CAROUSEL_LETTER_SPACING_RANGE.min)
      .max(CAROUSEL_LETTER_SPACING_RANGE.max)
      .optional(),
    boxColor: color.optional(),
    outlineColor: color.optional(),
    outlineWidth: z.number().min(0).max(CAROUSEL_OUTLINE_WIDTH_MAX).optional(),
    backgroundColor: color.optional(),
  })
  .strict()

export type CarouselLook = z.infer<typeof carouselLookSchema>

export const CAROUSEL_CAPTION_MAX = 2_200
export const CAROUSEL_FOOTER_MAX = 1_000

/** A stored look, read safely: anything that no longer parses is left out. */
export function readCarouselLook(value: unknown): CarouselLook {
  const parsed = carouselLookSchema.safeParse(value)
  return parsed.success ? parsed.data : {}
}

/**
 * Starting slides in the project's look: every slide's background, and every
 * text layer and slide number's font, colour and text style. The text size
 * is the size of the largest words; the rest keep their size against it, so
 * an AI draft's headline stays bigger than its body.
 */
export function applyCarouselLook(slides: CarouselSlide[], look: CarouselLook): CarouselSlide[] {
  const { backgroundColor, textColor, fontSize, ...words } = look
  const wordsLook = Object.fromEntries(
    Object.entries({ ...words, color: textColor }).filter(([, value]) => value !== undefined)
  )
  const largest = Math.max(
    0,
    ...slides.flatMap((slide) =>
      slide.items.flatMap((item) =>
        item.type === "text" || item.type === "slide-number" ? [item.fontSize] : []
      )
    )
  )
  const scale = fontSize && largest ? fontSize / largest : 1
  return slides.map((slide) => ({
    ...slide,
    backgroundColor: backgroundColor ?? slide.backgroundColor,
    items: slide.items.map((item) =>
      item.type === "text" || item.type === "slide-number"
        ? {
            ...item,
            ...wordsLook,
            fontSize: Math.min(220, Math.max(8, Math.round(item.fontSize * scale))),
          }
        : item
    ),
  }))
}

/** A new carousel's caption: its own words, then the project's footer. */
export function captionWithFooter(caption: string, footer: string) {
  const end = footer.trim()
  if (!end) return caption
  const start = caption.trimEnd()
  return (start ? `${start}\n\n${end}` : end).slice(0, CAROUSEL_CAPTION_MAX)
}
