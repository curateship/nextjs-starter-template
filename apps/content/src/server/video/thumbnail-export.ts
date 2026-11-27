import sharp from "sharp"

import { shapePathsMarkup } from "@/lib/video/shapes"
import {
  asCarouselItem,
  layerEffectFilter,
  THUMBNAIL_MAX_BYTES,
  THUMBNAIL_SIZES,
  type ThumbnailDesign,
  type ThumbnailLayer,
  type ThumbnailShapeLayer,
} from "@/lib/video/thumbnails"
import {
  loadSlidePictures,
  slideItemSvg,
  type SlidePicture,
} from "@/server/video/carousel-export"
import { requireTextFontFiles } from "@/server/video/text-font-files"
import { loadResvg } from "@/server/video/text-measure"

/**
 * Drawing a thumbnail (thumbnails.md): the same layers the board shows, as
 * one SVG drawn to a picture by resvg, the way carousel slides are. Words and
 * pictures go through the carousel's own drawing (`slideItemSvg`), so a text
 * look on the board is the same look in the download.
 */

const ONE_SLIDE = { index: 0, count: 1 }

/** An arrow or a circle, its two points placed inside its own box. */
function shapeLayerSvg(layer: ThumbnailShapeLayer, frame: { width: number; height: number }) {
  return shapePathsMarkup(
    {
      shape: layer.shape,
      x: layer.x + layer.fromX * layer.width,
      y: layer.y + layer.fromY * layer.height,
      toX: layer.x + layer.toX * layer.width,
      toY: layer.y + layer.toY * layer.height,
      color: layer.color,
      lineWidth: layer.lineWidth,
    },
    frame,
    1
  )
}

export function thumbnailSvg(
  design: ThumbnailDesign,
  media: ReadonlyMap<string, SlidePicture>
) {
  const size = THUMBNAIL_SIZES[design.shape]
  const definitions: string[] = []
  const layers = design.layers
    .filter((layer) => !layer.hidden)
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((layer, index) => {
      const key = `t${index}`
      const item = asCarouselItem(layer)
      const inner = item
        ? slideItemSvg(item, size, ONE_SLIDE, media, key, definitions)
        : layer.type === "shape"
          ? shapeLayerSvg(layer, size)
          : ""
      const filter = layerEffectFilter(layer, `fx-${key}`, size, 1)
      if (!filter) return inner
      definitions.push(filter)
      return `<g filter="url(#fx-${key})">${inner}</g>`
    })
    .join("")
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}"><defs>${definitions.join("")}</defs><rect width="100%" height="100%" fill="${design.backgroundColor}"/>${layers}</svg>`
}

/** The pictures a design shows, from the owner's own library only. */
function loadThumbnailPictures(owner: string, layers: ThumbnailLayer[]) {
  const items = layers.flatMap((layer) => {
    const item = asCarouselItem(layer)
    return item ? [item] : []
  })
  return loadSlidePictures(owner, [
    { id: "thumbnail", title: "", backgroundColor: "#000000", items },
  ])
}

/** A design as a full-size PNG. */
async function renderThumbnailPng(owner: string, design: ThumbnailDesign) {
  const media = await loadThumbnailPictures(owner, design.layers)
  const { Resvg } = loadResvg()
  return new Uint8Array(
    new Resvg(thumbnailSvg(design, media), {
      font: { fontFiles: requireTextFontFiles(), loadSystemFonts: false },
    })
      .render()
      .asPng()
  )
}

/**
 * A picture as a JPEG under YouTube's 2MB, at exactly the size given. The
 * quality comes down in steps until it fits; a busy picture full of fine
 * detail is the one that needs the lower steps.
 */
export async function youtubeReadyJpeg(
  png: Uint8Array,
  size: { width: number; height: number }
) {
  for (const quality of [92, 86, 80, 72, 64, 56, 48, 40]) {
    const jpeg = await sharp(png)
      .resize(size.width, size.height, { fit: "cover" })
      .flatten({ background: "#000000" })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer()
    if (jpeg.byteLength <= THUMBNAIL_MAX_BYTES) return new Uint8Array(jpeg)
  }
  const smallest = await sharp(png)
    .resize(size.width, size.height, { fit: "cover" })
    .flatten({ background: "#000000" })
    .jpeg({ quality: 30, mozjpeg: true })
    .toBuffer()
  return new Uint8Array(smallest)
}

/** A design ready for YouTube: drawn, then a JPEG under 2MB. */
export async function renderThumbnailJpeg(owner: string, design: ThumbnailDesign) {
  return youtubeReadyJpeg(
    await renderThumbnailPng(owner, design),
    THUMBNAIL_SIZES[design.shape]
  )
}
