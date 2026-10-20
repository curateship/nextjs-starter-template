import { createRequire } from "node:module"
import { eq } from "drizzle-orm"

import {
  CAROUSEL_FRAME_SIZES,
  CAROUSEL_TEXT_LINE_HEIGHT,
  wrapCarouselText,
} from "@/lib/video/carousel-layout"
import {
  CAROUSEL_MEDIA_MISSING_MESSAGE,
  requireCarouselFormat,
  type CarouselFormat,
  type CarouselGradientShadowItem,
  type CarouselMediaItem,
  type CarouselSlide,
  type CarouselTextItem,
} from "@/lib/video/carousel-schema"
import { requireTextFont } from "@/lib/video/text-fonts"
import { db, type CustomShellDb } from "@/server/db"
import { IMAGE_TYPES } from "@/server/media/library"
import { getFromR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { requireTextFontFiles } from "@/server/video/text-font-files"

const requireNative = createRequire(import.meta.url)

function loadResvg() {
  return requireNative("@resvg/resvg-js") as typeof import("@resvg/resvg-js")
}

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
  const media = new Map<string, string>()
  for (const item of slides.flatMap((slide) => slide.items)) {
    if (item.type !== "image" || media.has(item.mediaId)) continue
    try {
      const row = await findSlidePicture(userId, item.mediaId, database)
      if (!row) throw new Error(CAROUSEL_MEDIA_MISSING_MESSAGE)
      const object = await getFromR2(row.storagePath)
      const bytes = await object.Body?.transformToByteArray()
      if (!bytes?.byteLength) throw new Error(CAROUSEL_MEDIA_MISSING_MESSAGE)
      media.set(
        item.mediaId,
        `data:${row.mimeType};base64,${Buffer.from(bytes).toString("base64")}`
      )
    } catch {
      throw new Error(CAROUSEL_MEDIA_MISSING_MESSAGE)
    }
  }
  return media
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

/** A slide as a PNG at full size, or `width` pixels wide for a cover. */
export function renderCarouselSlidePng(
  slide: CarouselSlide,
  format: CarouselFormat,
  media: ReadonlyMap<string, string> = new Map(),
  width?: number
) {
  const { Resvg } = loadResvg()
  const svg = carouselSlideSvg(slide, format, media)
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
  media: ReadonlyMap<string, string> = new Map()
) {
  const canonicalFormat = requireCarouselFormat(format)
  const size = CAROUSEL_FRAME_SIZES[canonicalFormat]
  const definitions: string[] = []
  const layers = [...slide.items]
    .sort((left, right) => left.zIndex - right.zIndex)
    .map((item, index) => {
      const box = itemBox(item, size)
      if (item.type === "text") return textLayer(item, box, index, definitions)
      if (item.type === "gradient-shadow") {
        return shadowLayer(item, box, index, definitions)
      }
      return mediaLayer(item, box, media)
    })
    .join("")

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}"><defs>${definitions.join("")}</defs><rect width="100%" height="100%" fill="${slide.backgroundColor}"/>${layers}</svg>`
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

function textLayer(
  item: CarouselTextItem,
  box: PixelBox,
  index: number,
  definitions: string[]
) {
  const clipId = `text-clip-${index}`
  definitions.push(
    `<clipPath id="${clipId}"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"/></clipPath>`
  )
  const font = requireTextFont(item.fontId)
  const lines = wrapCarouselText(
    item.text,
    box.width,
    item.fontSize,
    font.widthRatio
  )
  const anchor =
    item.align === "left" ? "start" : item.align === "right" ? "end" : "middle"
  const x =
    item.align === "left"
      ? box.x
      : item.align === "right"
        ? box.x + box.width
        : box.x + box.width / 2
  const lineHeight = item.fontSize * CAROUSEL_TEXT_LINE_HEIGHT
  const spans = lines
    .map(
      (line, lineIndex) =>
        `<tspan x="${x}" y="${box.y + item.fontSize + lineIndex * lineHeight}">${escapeXml(line)}</tspan>`
    )
    .join("")
  return `<text clip-path="url(#${clipId})" fill="${item.color}" font-family="${font.svgFamily}" font-size="${item.fontSize}" font-weight="${font.weight}" text-anchor="${anchor}">${spans}</text>`
}

function mediaLayer(
  item: CarouselMediaItem,
  box: PixelBox,
  media: ReadonlyMap<string, string>
) {
  if (item.type === "video") {
    return `<g><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="4" fill="#000000"/><path d="M ${box.x + box.width * 0.42} ${box.y + box.height * 0.35} L ${box.x + box.width * 0.42} ${box.y + box.height * 0.65} L ${box.x + box.width * 0.68} ${box.y + box.height * 0.5} Z" fill="#ffffff"/></g>`
  }
  const source = media.get(item.mediaId)
  if (!source) throw new Error(CAROUSEL_MEDIA_MISSING_MESSAGE)
  const preserveAspectRatio =
    item.fit === "fill"
      ? "none"
      : item.fit === "contain"
        ? "xMidYMid meet"
        : "xMidYMid slice"
  return `<image x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" preserveAspectRatio="${preserveAspectRatio}" href="${source}"/>`
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
