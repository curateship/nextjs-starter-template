import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  CAROUSEL_NOT_FOUND_MESSAGE,
  requireCarouselFormat,
  type CarouselFormat,
  type CarouselGradientShadowItem,
  type CarouselMediaItem,
  type CarouselSlide,
  type CarouselTextItem,
} from "@/lib/video/carousel-schema"
import { requireTextFont } from "@/lib/video/text-fonts"
import { getOwnedMedia, IMAGE_TYPES } from "@/server/media/library"
import { getFromR2 } from "@/server/media/storage"
import { getOwnedCarouselDetail } from "@/server/video/carousels"

export const CAROUSEL_SLIDE_NOT_FOUND_MESSAGE = "Carousel slide not found."
export const CAROUSEL_MEDIA_MISSING_MESSAGE =
  "A slide image is no longer in the media library."
export const CAROUSEL_EXPORT_FAILED_MESSAGE = "The slide could not be exported."

const SAFE_CAROUSEL_EXPORT_ERRORS = new Set([
  CAROUSEL_NOT_FOUND_MESSAGE,
  CAROUSEL_SLIDE_NOT_FOUND_MESSAGE,
  CAROUSEL_MEDIA_MISSING_MESSAGE,
  CAROUSEL_EXPORT_FAILED_MESSAGE,
])

const FORMAT_SIZES: Record<CarouselFormat, { width: number; height: number }> =
  {
    "4:5": { width: 1080, height: 1350 },
    "1:1": { width: 1080, height: 1080 },
    "9:16": { width: 1080, height: 1920 },
  }

const ASSET_DIR = fileURLToPath(new URL("../assets", import.meta.url))
const FONT_FILE = path.join(ASSET_DIR, "Inter-SemiBold.ttf")
const requireNative = createRequire(import.meta.url)

function loadResvg() {
  return requireNative("@resvg/resvg-js") as typeof import("@resvg/resvg-js")
}

export async function renderOwnedCarouselSlide(
  userId: string,
  carouselId: string,
  slideIndex: number
) {
  const carousel = await getOwnedCarouselDetail(userId, carouselId)
  if (!Number.isInteger(slideIndex) || slideIndex < 0) {
    throw new Error(CAROUSEL_SLIDE_NOT_FOUND_MESSAGE)
  }
  const slide = carousel.slides[slideIndex]
  if (!slide) throw new Error(CAROUSEL_SLIDE_NOT_FOUND_MESSAGE)

  const media = new Map<string, string>()
  for (const item of slide.items) {
    if (item.type !== "image" || media.has(item.mediaId)) continue
    try {
      const row = await getOwnedMedia(userId, item.mediaId)
      if (!IMAGE_TYPES.has(row.mimeType)) {
        throw new Error(CAROUSEL_MEDIA_MISSING_MESSAGE)
      }
      const object = await getFromR2(row.storagePath)
      const bytes = await object.Body?.transformToByteArray()
      if (!bytes?.byteLength) throw new Error(CAROUSEL_MEDIA_MISSING_MESSAGE)
      media.set(
        item.mediaId,
        `data:${row.mimeType};base64,${Buffer.from(bytes).toString("base64")}`
      )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === CAROUSEL_MEDIA_MISSING_MESSAGE
      ) {
        throw error
      }
      throw new Error(CAROUSEL_MEDIA_MISSING_MESSAGE)
    }
  }

  try {
    return renderCarouselSlidePng(slide, carousel.format, media)
  } catch (error) {
    console.error("Carousel slide export failed", error)
    throw new Error(CAROUSEL_EXPORT_FAILED_MESSAGE)
  }
}

export function renderCarouselSlidePng(
  slide: CarouselSlide,
  format: CarouselFormat,
  media: ReadonlyMap<string, string> = new Map()
) {
  const { Resvg } = loadResvg()
  const svg = carouselSlideSvg(slide, format, media)
  return new Uint8Array(
    new Resvg(svg, {
      font: { fontFiles: [FONT_FILE], loadSystemFonts: false },
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
  const size = FORMAT_SIZES[canonicalFormat]
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
  const lines = wrapText(item.text, box.width, item.fontSize)
  const anchor =
    item.align === "left" ? "start" : item.align === "right" ? "end" : "middle"
  const x =
    item.align === "left"
      ? box.x
      : item.align === "right"
        ? box.x + box.width
        : box.x + box.width / 2
  const lineHeight = item.fontSize * 1.16
  const spans = lines
    .map(
      (line, lineIndex) =>
        `<tspan x="${x}" y="${box.y + item.fontSize + lineIndex * lineHeight}">${escapeXml(line)}</tspan>`
    )
    .join("")
  return `<text clip-path="url(#${clipId})" fill="${item.color}" font-family="Inter" font-size="${item.fontSize}" font-weight="600" text-anchor="${anchor}">${spans}</text>`
}

function wrapText(text: string, width: number, fontSize: number) {
  const widthRatio = requireTextFont("inter").widthRatio
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

export function isSafeCarouselExportError(error: unknown) {
  if (!(error instanceof Error)) return false
  return SAFE_CAROUSEL_EXPORT_ERRORS.has(error.message)
}
