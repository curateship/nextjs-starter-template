import type {
  CarouselFormat,
  CarouselSlide,
  CarouselSlideItem,
  CarouselTextItem,
} from "@/lib/video/carousel-schema"
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

export const CAROUSEL_TEXT_LINE_HEIGHT = 1.16

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
    // text box keeps its width so its words wrap as before.
    if (item.type !== "text") {
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

/** The lines the export draws, worked out from each face's letter width. */
export function wrapCarouselText(
  text: string,
  width: number,
  fontSize: number,
  widthRatio: number
) {
  const maxCharacters = Math.max(1, Math.floor(width / (fontSize * widthRatio)))
  const lines: string[] = []
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) {
      lines.push("")
      continue
    }
    let line = ""
    for (const word of words) {
      if (word.length > maxCharacters) {
        if (line) lines.push(line)
        for (let start = 0; start < word.length; start += maxCharacters) {
          lines.push(word.slice(start, start + maxCharacters))
        }
        line = ""
        continue
      }
      const candidate = line ? `${line} ${word}` : word
      if (candidate.length <= maxCharacters) {
        line = candidate
      } else {
        lines.push(line)
        line = word
      }
    }
    if (line) lines.push(line)
  }
  return lines
}

/** True when the export would cut off the last lines of this text box. */
export function textOverflows(item: CarouselTextItem, format: CarouselFormat) {
  if (!item.text.trim()) return false
  const size = CAROUSEL_FRAME_SIZES[format]
  const lines = wrapCarouselText(
    item.text,
    item.width * size.width,
    item.fontSize,
    requireTextFont(item.fontId).widthRatio
  )
  // Blank lines after the last words draw nothing, so they cannot be cut off.
  let drawn = lines.length
  while (drawn > 0 && !lines[drawn - 1]) drawn -= 1
  // Half a pixel of slack, so a box sized exactly to its lines is not flagged.
  return (
    drawn * item.fontSize * CAROUSEL_TEXT_LINE_HEIGHT >
    item.height * size.height + 0.5
  )
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

type LayerKind = "text" | "picture" | "shadow"

function layerKind(item: CarouselSlideItem): LayerKind {
  if (item.type === "text") return "text"
  if (item.type === "gradient-shadow") return "shadow"
  return "picture"
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
    const { fontId, fontSize, color, align } = from
    return { ...item, ...box, fontId, fontSize, color, align }
  }
  if (item.type === "gradient-shadow") {
    if (from.type !== "gradient-shadow") return item
    const { direction: _ownDirection, ...rest } = item
    const next = { ...rest, ...box, color: from.color, opacity: from.opacity }
    return from.direction ? { ...next, direction: from.direction } : next
  }
  if (from.type === "text" || from.type === "gradient-shadow") return item
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
