import { CAROUSEL_FRAME_SIZES } from "@/lib/video/carousel-layout"
import type {
  CarouselFormat,
  CarouselSlide,
  CarouselTextItem,
} from "@/lib/video/carousel-schema"
import {
  CAROUSEL_TEXT_LINE_HEIGHT,
  wrapCarouselText,
} from "@/lib/video/carousel-text"
import { DEFAULT_TEXT_FONT_ID, requireTextFont } from "@/lib/video/text-fonts"

/**
 * Slides laid out from words the writer sent back
 * (workspace/docs/carousel-writing.md): a dark cover, light middle slides, and
 * a dark last slide, each with a headline and the words under it. Every box
 * is made as tall as its words need, and words too long for the slide are
 * left for the "does not fit" check to flag, never made smaller.
 */

export type DraftWords = { headline: string; body: string }

/** The longest words the writer is asked for, so a slide can hold them. */
export const DRAFT_HEADLINE_MAX = 80
export const DRAFT_BODY_MAX = 220

const LEFT = 0.08
const WIDTH = 0.84
const GAP = 0.025
const DARK = "#111827"
const LIGHT = "#f8fafc"

type Look = {
  background: string
  headline: { size: number; color: string; top: number }
  body: { size: number; color: string }
}

const COVER: Look = {
  background: DARK,
  headline: { size: 88, color: "#ffffff", top: 0.3 },
  body: { size: 40, color: "#e5e7eb" },
}
const MIDDLE: Look = {
  background: LIGHT,
  headline: { size: 64, color: DARK, top: 0.12 },
  body: { size: 40, color: "#374151" },
}
const LAST: Look = { ...COVER, headline: { ...COVER.headline, size: 72 } }

// A box as tall as its lines, with a few pixels to spare.
function boxHeight(text: string, fontSize: number, format: CarouselFormat) {
  const size = CAROUSEL_FRAME_SIZES[format]
  const lines = wrapCarouselText(
    text,
    WIDTH * size.width,
    fontSize,
    requireTextFont(DEFAULT_TEXT_FONT_ID).widthRatio
  ).length
  const pixels = lines * fontSize * CAROUSEL_TEXT_LINE_HEIGHT + 8
  return Math.min(1, Math.max(0.05, pixels / size.height))
}

function textLayer(
  text: string,
  y: number,
  fontSize: number,
  color: string,
  format: CarouselFormat,
  zIndex: number
): CarouselTextItem {
  const height = boxHeight(text, fontSize, format)
  return {
    id: crypto.randomUUID(),
    type: "text",
    text,
    x: LEFT,
    y: Math.min(y, 1 - height),
    width: WIDTH,
    height,
    zIndex,
    fontId: DEFAULT_TEXT_FONT_ID,
    fontSize,
    color,
    align: "left",
  }
}

export function draftCarouselSlides(
  words: DraftWords[],
  format: CarouselFormat
): CarouselSlide[] {
  return words.map((slide, index) => {
    const look =
      index === 0 ? COVER : index === words.length - 1 && index > 0 ? LAST : MIDDLE
    const headline = slide.headline.trim().slice(0, DRAFT_HEADLINE_MAX)
    const body = slide.body.trim().slice(0, DRAFT_BODY_MAX)
    const items: CarouselTextItem[] = []
    let y = look.headline.top
    if (headline) {
      const layer = textLayer(
        headline,
        y,
        look.headline.size,
        look.headline.color,
        format,
        10
      )
      items.push(layer)
      y = layer.y + layer.height + GAP
    }
    if (body) {
      items.push(textLayer(body, y, look.body.size, look.body.color, format, 11))
    }
    return {
      id: crypto.randomUUID(),
      title: (headline || `Slide ${index + 1}`).slice(0, 120),
      backgroundColor: look.background,
      items,
    }
  })
}
