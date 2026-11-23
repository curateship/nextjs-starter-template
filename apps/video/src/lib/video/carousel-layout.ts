import type {
  CarouselFormat,
  CarouselSlide,
  CarouselSlideItem,
  CarouselTextItem,
  CarouselWordsItem,
} from "@/lib/video/carousel-schema"
import {
  letterSpacingOf,
  lineHeightOf,
  wrapCarouselText,
} from "@/lib/video/carousel-text"
import { requireTextFont } from "@/lib/video/text-fonts"

/** Every shape is 1080 wide, so a new shape only changes the height. */
export const CAROUSEL_FRAME_SIZES: Record<
  CarouselFormat,
  { width: number; height: number }
> = {
  "4:5": { width: 1080, height: 1350 },
  "1:1": { width: 1080, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
}

// A layer dragged to an edge is saved a hair short of it.
const EDGE = 0.002
// The smallest box carouselSlideSchema accepts.
const MIN_BOX = 0.05

/**
 * Moves every layer to suit a new shape: the same size in pixels, the same
 * centre, and the same top or bottom edge when it touches one. The rule and
 * its limits are in workspace/docs/carousel-shapes.md.
 */
export function relayoutSlides(
  slides: CarouselSlide[],
  from: CarouselFormat,
  to: CarouselFormat
): CarouselSlide[] {
  if (from === to) return slides
  const heightRatio =
    CAROUSEL_FRAME_SIZES[from].height / CAROUSEL_FRAME_SIZES[to].height
  return slides.map((slide) => ({
    ...slide,
    items: slide.items.map((item) => relayoutItem(item, heightRatio)),
  }))
}

function relayoutItem(
  item: CarouselSlideItem,
  heightRatio: number
): CarouselSlideItem {
  const top = item.y <= EDGE
  const bottom = item.y + item.height >= 1 - EDGE
  if (top && bottom) return { ...item, y: 0, height: 1 }

  let width = item.width
  let height = item.height * heightRatio
  const fitted = height > 1 ? 1 : height < MIN_BOX ? MIN_BOX : null
  if (fitted !== null) {
    // Pictures and shadows scale evenly so they keep their proportions; a
    // box of words keeps its width so its words wrap as before.
    if (item.type !== "text" && item.type !== "slide-number") {
      width = Math.min(1, Math.max(MIN_BOX, (width * fitted) / height))
    }
    height = fitted
  }

  const x =
    width === item.width
      ? item.x
      : clamp(item.x + item.width / 2 - width / 2, 1 - width)
  const y = top
    ? 0
    : bottom
      ? 1 - height
      : clamp(item.y + item.height / 2 - height / 2, 1 - height)
  return { ...item, x, y, width, height }
}

function clamp(value: number, max: number) {
  return Math.min(Math.max(0, max), Math.max(0, value))
}

/** True when the export would cut off the last lines of this text box. */
export function textOverflows(item: CarouselTextItem, format: CarouselFormat) {
  if (!item.text.trim()) return false
  const size = CAROUSEL_FRAME_SIZES[format]
  const lines = wrapCarouselText(
    item.text,
    item.width * size.width,
    item.fontSize,
    letterWidthOf(item)
  )
  // Blank lines after the last words draw nothing, so they cannot be cut off.
  let drawn = lines.length
  while (drawn > 0 && !lines[drawn - 1]) drawn -= 1
  // Half a pixel of slack, so a box sized exactly to its lines is not flagged.
  return (
    drawn * item.fontSize * lineHeightOf(item) >
    item.height * size.height + 0.5
  )
}

/**
 * A letter's average width as a share of the font size: the face's own, plus
 * any extra spacing the layer adds after each letter.
 */
export function letterWidthOf(item: Pick<CarouselWordsItem, "fontId" | "letterSpacing">) {
  return requireTextFont(item.fontId).widthRatio + letterSpacingOf(item)
}

/** The text boxes that do not fit, by slide id. Slides with none are left out. */
export function findTextOverflow(
  slides: CarouselSlide[],
  format: CarouselFormat
) {
  const overflow = new Map<string, CarouselTextItem[]>()
  for (const slide of slides) {
    const items = slide.items.filter(
      (item): item is CarouselTextItem =>
        item.type === "text" && textOverflows(item, format)
    )
    if (items.length) overflow.set(slide.id, items)
  }
  return overflow
}

type LayerKind = "text" | "number" | "picture" | "shadow"

function layerKind(item: CarouselSlideItem): LayerKind {
  if (item.type === "text") return "text"
  if (item.type === "slide-number") return "number"
  if (item.type === "gradient-shadow") return "shadow"
  return "picture"
}

// How a layer of words looks, which travels with a pushed layout. The words
// and their bold or highlighted letters never do.
function wordsLook(item: CarouselWordsItem) {
  return {
    fontId: item.fontId,
    fontSize: item.fontSize,
    color: item.color,
    align: item.align,
    lineHeight: item.lineHeight,
    letterSpacing: item.letterSpacing,
    boxColor: item.boxColor,
    outlineColor: item.outlineColor,
    outlineWidth: item.outlineWidth,
  }
}

// Optional fields set to undefined are dropped, so the saved layer never
// holds a key the schema would refuse to read back.
function withoutUnset<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined)
  ) as T
}

// Each kind's layers, bottom first. Equal z-orders keep their saved order.
function layersByKind(slide: CarouselSlide) {
  const byKind = new Map<LayerKind, CarouselSlideItem[]>()
  slide.items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.zIndex - b.item.zIndex || a.index - b.index)
    .forEach(({ item }) => {
      const kind = layerKind(item)
      const layers = byKind.get(kind)
      if (layers) layers.push(item)
      else byKind.set(kind, [item])
    })
  return byKind
}

/**
 * Which layer on `target` takes the look of which layer on `source`: the
 * lowest text on one matches the lowest text on the other, and so on up, kind
 * by kind. Layers with no partner are left out.
 */
export function matchSlideLayers(source: CarouselSlide, target: CarouselSlide) {
  const sourceLayers = layersByKind(source)
  const matches = new Map<string, CarouselSlideItem>()
  for (const [kind, targetItems] of layersByKind(target)) {
    const sourceItems = sourceLayers.get(kind) ?? []
    targetItems.forEach((item, index) => {
      if (sourceItems[index]) matches.set(item.id, sourceItems[index])
    })
  }
  return matches
}

/**
 * Gives a layer another layer's place, size and look while keeping what it
 * says or shows, and its own z-order. What travels is listed in
 * workspace/docs/carousel-push-layout.md.
 */
function takeLayout(
  item: CarouselSlideItem,
  from: CarouselSlideItem
): CarouselSlideItem {
  const box = { x: from.x, y: from.y, width: from.width, height: from.height }
  // Layers are matched kind to kind, so a mismatch here never happens.
  if (item.type === "text") {
    if (from.type !== "text") return item
    return withoutUnset({
      ...item,
      ...box,
      ...wordsLook(from),
      highlightColor: from.highlightColor,
    })
  }
  if (item.type === "slide-number") {
    if (from.type !== "slide-number") return item
    return withoutUnset({ ...item, ...box, ...wordsLook(from) })
  }
  if (item.type === "gradient-shadow") {
    if (from.type !== "gradient-shadow") return item
    const { direction: _ownDirection, ...rest } = item
    const next = { ...rest, ...box, color: from.color, opacity: from.opacity }
    return from.direction ? { ...next, direction: from.direction } : next
  }
  // Which part of a cropped picture shows belongs to that picture, so it
  // stays.
  if (from.type !== "image" && from.type !== "video") return item
  return { ...item, ...box, fit: from.fit }
}

/**
 * Copies one slide's layout onto the slides named in `targetIds`. Only
 * matched layers change; the words, pictures, background and every unmatched
 * layer stay as they were. The source slide is never changed.
 */
export function pushSlideLayout(
  slides: CarouselSlide[],
  sourceId: string,
  targetIds: ReadonlySet<string>
): CarouselSlide[] {
  const source = slides.find((slide) => slide.id === sourceId)
  if (!source) return slides
  return slides.map((slide) => {
    if (slide.id === sourceId || !targetIds.has(slide.id)) return slide
    const matches = matchSlideLayers(source, slide)
    if (!matches.size) return slide
    return {
      ...slide,
      items: slide.items.map((item) => {
        const from = matches.get(item.id)
        return from ? takeLayout(item, from) : item
      }),
    }
  })
}

/** A layer's name in the Layers list: its first words, or what it is. */
export function layerName(item: CarouselSlideItem) {
  if (item.type === "text") {
    const words = item.text.trim().replace(/\s+/g, " ")
    if (!words) return "Empty text"
    return words.length > 40 ? `${words.slice(0, 40)}...` : words
  }
  if (item.type === "slide-number") return "Slide number"
  if (item.type === "gradient-shadow") return "Shadow"
  const name = item.altText?.trim()
  if (name) return name
  return item.type === "video" ? "Video" : "Picture"
}
