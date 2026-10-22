import { createRequire } from "node:module"
import { eq } from "drizzle-orm"

import sharp from "sharp"

import { CAROUSEL_FRAME_SIZES } from "@/lib/video/carousel-layout"
import {
  CAROUSEL_MEDIA_MISSING_MESSAGE,
  requireCarouselFormat,
  type CarouselFormat,
  type CarouselGradientShadowItem,
  type CarouselMediaItem,
  type CarouselSlide,
  type CarouselTextMark,
  type CarouselWordsItem,
} from "@/lib/video/carousel-schema"
import {
  BOLD_STROKE_EM,
  DEFAULT_HIGHLIGHT_COLOR,
  HIGHLIGHT_SPREAD_EM,
  baselineEm,
  letterSpacingOf,
  lineHeightOf,
  slideNumberText,
  wrapCarouselRuns,
  type TextRun,
} from "@/lib/video/carousel-text"
import { requireTextFont, type TextFont } from "@/lib/video/text-fonts"
import { db, type CustomShellDb } from "@/server/db"
import { IMAGE_TYPES } from "@/server/media/library"
import { getFromR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { requireTextFontFiles } from "@/server/video/text-font-files"

const requireNative = createRequire(import.meta.url)

function loadResvg() {
  return requireNative("@resvg/resvg-js") as typeof import("@resvg/resvg-js")
}

/** A picture as the slide drawing holds it, with its size for cropping. */
export type SlidePicture = { href: string; width: number; height: number }

/**
 * Every picture these slides show, read from storage once each and written as
 * data the slide drawing can hold. A picture that is gone, or not this
 * person's, fails the whole export rather than leaving a hole in a slide.
 */
export async function loadSlidePictures(
  userId: string,
  slides: CarouselSlide[],
  database: CustomShellDb = db
) {
  const media = new Map<string, SlidePicture>()
  for (const item of slides.flatMap((slide) => slide.items)) {
    if (item.type !== "image" || item.hidden || media.has(item.mediaId)) {
      continue
    }
    try {
      const row = await findSlidePicture(userId, item.mediaId, database)
      if (!row) throw new Error(CAROUSEL_MEDIA_MISSING_MESSAGE)
      const object = await getFromR2(row.storagePath)
      const bytes = await object.Body?.transformToByteArray()
      if (!bytes?.byteLength) throw new Error(CAROUSEL_MEDIA_MISSING_MESSAGE)
      media.set(item.mediaId, await slidePicture(bytes, row.mimeType))
    } catch {
      throw new Error(CAROUSEL_MEDIA_MISSING_MESSAGE)
    }
  }
  return media
}

/**
 * A picture's bytes as the slide drawing holds them. A phone photo that is
 * stored on its side with a note to turn it is turned first, as the browser
 * turns it on the canvas, so it crops the same way and is not sideways.
 */
export async function slidePicture(
  bytes: Uint8Array,
  mimeType: string
): Promise<SlidePicture> {
  const { width, height, orientation } = await sharp(bytes).metadata()
  if (!width || !height) throw new Error(CAROUSEL_MEDIA_MISSING_MESSAGE)
  if (!orientation || orientation === 1) {
    return {
      href: `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`,
      width,
      height,
    }
  }
  const { data, info } = await sharp(bytes)
    .rotate()
    .toBuffer({ resolveWithObject: true })
  return {
    href: `data:image/${info.format};base64,${data.toString("base64")}`,
    width: info.width,
    height: info.height,
  }
}

/**
 * A picture a slide may show: one of this person's own. Anything else, a video
 * or somebody else's upload, fails like any missing picture.
 */
export async function findSlidePicture(
  userId: string,
  mediaId: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .select()
    .from(customShellMedia)
    .where(eq(customShellMedia.id, mediaId))
    .limit(1)
  if (!row || !IMAGE_TYPES.has(row.mimeType)) return null
  return row.userId === userId ? row : null
}

/** Where a slide sits in its carousel, for its slide-number layers. */
export type SlidePlace = { index: number; count: number }

/**
 * Which layers to draw, and whether the slide's own colour goes under them.
 * A video slide is drawn as the layers under its clip, then the clip, then
 * the layers over it on a clear background.
 */
export type SlideLayers = {
  keep: (item: CarouselSlide["items"][number]) => boolean
  background: boolean
}

/** A slide as a PNG at full size, or `width` pixels wide for a cover. */
export function renderCarouselSlidePng(
  slide: CarouselSlide,
  format: CarouselFormat,
  place: SlidePlace,
  media: ReadonlyMap<string, SlidePicture> = new Map(),
  width?: number,
  layers?: SlideLayers
) {
  const { Resvg } = loadResvg()
  const svg = carouselSlideSvg(slide, format, place, media, layers)
  return new Uint8Array(
    new Resvg(svg, {
      font: { fontFiles: requireTextFontFiles(), loadSystemFonts: false },
      ...(width ? { fitTo: { mode: "width" as const, value: width } } : {}),
    })
      .render()
      .asPng()
  )
}

export function carouselSlideSvg(
  slide: CarouselSlide,
  format: CarouselFormat,
  place: SlidePlace,
  media: ReadonlyMap<string, SlidePicture> = new Map(),
  only?: SlideLayers
) {
  const canonicalFormat = requireCarouselFormat(format)
  const size = CAROUSEL_FRAME_SIZES[canonicalFormat]
  const definitions: string[] = []
  const layers = slide.items
    .filter((item) => !item.hidden && (only ? only.keep(item) : true))
    .sort((left, right) => left.zIndex - right.zIndex)
    .map((item, index) => {
      const box = itemBox(item, size)
      if (item.type === "text") {
        return wordsLayer(item, item.text, item.marks ?? [], box, index, definitions)
      }
      if (item.type === "slide-number") {
        const words = slideNumberText(place.index, place.count)
        return wordsLayer(item, words, [], box, index, definitions)
      }
      if (item.type === "gradient-shadow") {
        return shadowLayer(item, box, index, definitions)
      }
      return mediaLayer(item, box, index, media, definitions)
    })
    .join("")

  const background =
    only && !only.background
      ? ""
      : `<rect width="100%" height="100%" fill="${slide.backgroundColor}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}"><defs>${definitions.join("")}</defs>${background}${layers}</svg>`
}

type PixelBox = { x: number; y: number; width: number; height: number }

function itemBox(
  item: { x: number; y: number; width: number; height: number },
  size: { width: number; height: number }
): PixelBox {
  return {
    x: item.x * size.width,
    y: item.y * size.height,
    width: item.width * size.width,
    height: item.height * size.height,
  }
}

const advances = new Map<string, number>()

/**
 * How far `text` reaches along its line in this face, in pixels: the browser's
 * own measure of a run, which the export needs to centre a line and to put a
 * highlight's box under exactly its words. resvg measures what it would draw,
 * so a bar after the words marks where they end, spaces included.
 */
export function measureAdvance(
  text: string,
  font: TextFont,
  fontSize: number,
  letterSpacing: number
) {
  if (!text) return 0
  const key = `${font.id}|${fontSize}|${letterSpacing}|${text}`
  const known = advances.get(key)
  if (known !== undefined) return known
  const reach = (words: string) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20000" height="${fontSize * 3}"><text x="0" y="${fontSize * 2}" font-family="${font.svgFamily}" font-size="${fontSize}" font-weight="${font.weight}" letter-spacing="${letterSpacing}" xml:space="preserve">${escapeXml(words)}|</text></svg>`
    const { Resvg } = loadResvg()
    const bounds = new Resvg(svg, {
      font: { fontFiles: requireTextFontFiles(), loadSystemFonts: false },
    }).getBBox()
    return bounds ? bounds.x + bounds.width : 0
  }
  const advance = reach(text) - reach("")
  // Lines repeat across slides and exports; a long run of new words does not
  // keep every one.
  if (advances.size > 5_000) advances.clear()
  advances.set(key, advance)
  return advance
}

/**
 * A text or slide-number layer. Lines break by measured width, as the
 * browser breaks them on the canvas; each line is placed by that width, highlighted words get a box
 * behind them, and bold is a line round the letters in their own colour
 * (workspace/docs/carousel-text-styles.md).
 */
function wordsLayer(
  item: CarouselWordsItem,
  text: string,
  marks: CarouselTextMark[],
  box: PixelBox,
  index: number,
  definitions: string[]
) {
  const clipId = `text-clip-${index}`
  definitions.push(
    `<clipPath id="${clipId}"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"/></clipPath>`
  )
  const font = requireTextFont(item.fontId)
  const fontSize = item.fontSize
  const spacing = letterSpacingOf(item) * fontSize
  const lineHeight = lineHeightOf(item)
  // Lines break by the words' real width in this face, as the browser
  // breaks them on the canvas, so wide capitals wrap instead of being cut.
  const lines = wrapCarouselRuns(text, marks, box.width, (words) =>
    measureAdvance(words, font, fontSize, spacing)
  )
  const highlight = item.type === "text" ? item.highlightColor : undefined
  const spread = HIGHLIGHT_SPREAD_EM * fontSize
  const boldStroke = BOLD_STROKE_EM * fontSize
  const outline =
    item.outlineColor && item.outlineWidth ? item.outlineWidth * 2 : 0

  const boxes: string[] = []
  const outlined: string[] = []
  const filled: string[] = []
  lines.forEach((runs, lineIndex) => {
    const words = runs.map((run) => run.text).join("")
    const lineWidth = measureAdvance(words, font, fontSize, spacing)
    const left =
      item.align === "left"
        ? box.x
        : item.align === "right"
          ? box.x + box.width - lineWidth
          : box.x + (box.width - lineWidth) / 2
    const baseline =
      box.y + (lineIndex * lineHeight + baselineEm(font, lineHeight)) * fontSize
    let before = ""
    const spans: { run: TextRun; x: number }[] = []
    for (const run of runs) {
      const x = left + measureAdvance(before, font, fontSize, spacing)
      before += run.text
      if (run.highlight) {
        const end = left + measureAdvance(before, font, fontSize, spacing)
        boxes.push(
          `<rect x="${x - spread}" y="${baseline - font.ascent * fontSize - spread}" width="${end - x + spread * 2}" height="${(font.ascent + font.descent) * fontSize + spread * 2}" fill="${highlight ?? DEFAULT_HIGHLIGHT_COLOR}"/>`
        )
      }
      spans.push({ run, x })
    }
    for (const { run, x } of spans) {
      const words = escapeXml(run.text)
      const bold = run.bold ? boldStroke : 0
      if (outline) {
        outlined.push(
          `<tspan x="${x}" y="${baseline}" stroke-width="${outline + bold}">${words}</tspan>`
        )
      }
      filled.push(
        bold
          ? `<tspan x="${x}" y="${baseline}" stroke="${item.color}" stroke-width="${bold}" stroke-linejoin="round">${words}</tspan>`
          : `<tspan x="${x}" y="${baseline}">${words}</tspan>`
      )
    }
  })

  const textAttributes = `font-family="${font.svgFamily}" font-size="${fontSize}" font-weight="${font.weight}" letter-spacing="${spacing}" xml:space="preserve"`
  const background = item.boxColor
    ? `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="${item.boxColor}"/>`
    : ""
  const outlineText = outline
    ? `<text ${textAttributes} fill="${item.outlineColor}" stroke="${item.outlineColor}" stroke-linejoin="round">${outlined.join("")}</text>`
    : ""
  // A highlight's box reaches a little past its words, so it may reach a
  // little past the layer too, as it does on the canvas.
  const boxesClipId = `highlight-clip-${index}`
  if (boxes.length) {
    definitions.push(
      `<clipPath id="${boxesClipId}"><rect x="${box.x - spread}" y="${box.y - spread}" width="${box.width + spread * 2}" height="${box.height + spread * 2}"/></clipPath>`
    )
  }
  const highlights = boxes.length
    ? `<g clip-path="url(#${boxesClipId})">${boxes.join("")}</g>`
    : ""
  // Bottom first: the layer's box, the highlights, the outline, the letters.
  return `${background}${highlights}<g clip-path="url(#${clipId})">${outlineText}<text ${textAttributes} fill="${item.color}">${filled.join("")}</text></g>`
}

function mediaLayer(
  item: CarouselMediaItem,
  box: PixelBox,
  index: number,
  media: ReadonlyMap<string, SlidePicture>,
  definitions: string[]
) {
  // A clip is drawn as its first frame, which the export loads beside the
  // pictures (`loadSlideClips`).
  const picture = media.get(item.mediaId)
  if (!picture) throw new Error(CAROUSEL_MEDIA_MISSING_MESSAGE)
  const drawn = pictureRect(item, box, picture)
  const clipId = `picture-clip-${index}`
  definitions.push(
    `<clipPath id="${clipId}"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"/></clipPath>`
  )
  return `<image clip-path="url(#${clipId})" x="${drawn.x}" y="${drawn.y}" width="${drawn.width}" height="${drawn.height}" preserveAspectRatio="none" href="${picture.href}"/>`
}

/**
 * Where a picture is drawn so it fills its box (Fill and Crop) or fits inside
 * it (Fit), keeping its proportions. A cropped picture shows the part its
 * focus points at, the way the canvas's object-position does.
 */
export function pictureRect(
  item: Pick<CarouselMediaItem, "fit" | "focusX" | "focusY">,
  box: PixelBox,
  picture: { width: number; height: number }
): PixelBox {
  const scale =
    item.fit === "contain"
      ? Math.min(box.width / picture.width, box.height / picture.height)
      : Math.max(box.width / picture.width, box.height / picture.height)
  const width = picture.width * scale
  const height = picture.height * scale
  const focusX = item.fit === "contain" ? 0.5 : (item.focusX ?? 0.5)
  const focusY = item.fit === "contain" ? 0.5 : (item.focusY ?? 0.5)
  return {
    x: box.x + (box.width - width) * focusX,
    y: box.y + (box.height - height) * focusY,
    width,
    height,
  }
}

function shadowLayer(
  item: CarouselGradientShadowItem,
  box: PixelBox,
  index: number,
  definitions: string[]
) {
  const opacity = item.opacity / 100
  const direction = item.direction ?? "up"
  if (direction === "solid") {
    return `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="4" fill="${item.color}" fill-opacity="${opacity}"/>`
  }
  const id = `shadow-${index}`
  if (direction === "radial") {
    definitions.push(
      `<radialGradient id="${id}" cx="50%" cy="50%" r="71%"><stop offset="0%" stop-color="${item.color}" stop-opacity="0"/><stop offset="100%" stop-color="${item.color}" stop-opacity="${opacity}"/></radialGradient>`
    )
  } else {
    const points = linearGradientPoints(direction)
    definitions.push(
      `<linearGradient id="${id}" ${points}><stop offset="0%" stop-color="${item.color}" stop-opacity="${opacity}"/><stop offset="100%" stop-color="${item.color}" stop-opacity="0"/></linearGradient>`
    )
  }
  return `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="4" fill="url(#${id})"/>`
}

function linearGradientPoints(direction: "up" | "down" | "left" | "right") {
  if (direction === "down") return 'x1="0" y1="0" x2="0" y2="1"'
  if (direction === "left") return 'x1="1" y1="0" x2="0" y2="0"'
  if (direction === "right") return 'x1="0" y1="0" x2="1" y2="0"'
  return 'x1="0" y1="1" x2="0" y2="0"'
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}
