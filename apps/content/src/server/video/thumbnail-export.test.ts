import sharp from "sharp"
import { describe, expect, it } from "vitest"

import {
  newShapeLayer,
  newTextLayer,
  withTextLook,
  type ThumbnailDesign,
  type ThumbnailPicture,
} from "@/lib/video/thumbnails"
import { slidePicture } from "@/server/video/carousel-export"
import { requireTextFontFiles } from "@/server/video/text-font-files"
import { loadResvg } from "@/server/video/text-measure"
import { thumbnailSvg, youtubeReadyJpeg } from "@/server/video/thumbnail-export"

/**
 * Thumbnails drawn for real by resvg, read back pixel by pixel: the looks
 * only the board has (an outline round a cut-out, a word in yellow, colour
 * sliders), an arrow, and a busy picture still coming out under 2MB.
 */

async function draw(design: ThumbnailDesign, pictures: Record<string, Uint8Array> = {}) {
  const media = new Map()
  for (const [id, bytes] of Object.entries(pictures)) {
    media.set(id, await slidePicture(bytes, "image/png"))
  }
  const { Resvg } = loadResvg()
  const png = new Resvg(thumbnailSvg(design, media), {
    font: { fontFiles: requireTextFontFiles(), loadSystemFonts: false },
  })
    .render()
    .asPng()
  return sharp(png).raw().toBuffer({ resolveWithObject: true })
}

function pixel(image: { data: Buffer; info: { width: number; channels: number } }, x: number, y: number) {
  const at = (Math.round(y) * image.info.width + Math.round(x)) * image.info.channels
  return { r: image.data[at], g: image.data[at + 1], b: image.data[at + 2] }
}

/** A white disc on a see-through square, as a cut-out person is. */
async function cutOut() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="60" fill="#ffffff"/></svg>`
  return new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer())
}

function pictureLayer(extra: Partial<ThumbnailPicture>): ThumbnailPicture {
  return { id: "p", type: "image", mediaId: "cut", url: "x", fit: "contain", x: 0.25, y: 0, width: 0.5, height: 1, zIndex: 1, ...extra }
}

describe("drawing a thumbnail", () => {
  it("puts an outline round a cut-out, past its own edge", async () => {
    // The 200-pixel picture fits its 640 by 720 box at 3.2 times, so the
    // disc's edge is 60 × 3.2 = 192 pixels above the middle. An outline of
    // 20 colours the ring just outside it.
    const plain = await draw({ shape: "wide", backgroundColor: "#000000", layers: [pictureLayer({})] }, { cut: await cutOut() })
    const outlined = await draw(
      { shape: "wide", backgroundColor: "#000000", layers: [pictureLayer({ outlineColor: "#ff0000", outlineWidth: 20 })] },
      { cut: await cutOut() }
    )
    const ring = { x: 640, y: 360 - 192 - 10 }
    expect(pixel(plain, ring.x, ring.y).r).toBeLessThan(20)
    expect(pixel(outlined, ring.x, ring.y)).toMatchObject({ r: 255, g: 0 })
    expect(pixel(outlined, 640, 360).g).toBeGreaterThan(240)
  })

  it("darkens a picture by its brightness slider", async () => {
    const grey = new Uint8Array(await sharp({ create: { width: 64, height: 36, channels: 3, background: { r: 128, g: 128, b: 128 } } }).png().toBuffer())
    const darker = await draw(
      { shape: "wide", backgroundColor: "#000000", layers: [pictureLayer({ mediaId: "g", fit: "cover", x: 0, width: 1, brightness: -0.3 })] },
      { g: grey }
    )
    expect(pixel(darker, 640, 360).r).toBeLessThan(80)
  })

  it("draws the last word in yellow and the rest in white", async () => {
    const text = withTextLook({ ...newTextLayer("wide", []), text: "HI YO", fontSize: 200, outlineWidth: 0, x: 0, y: 0, width: 1, height: 1, align: "left" }, "accent")
    const image = await draw({ shape: "wide", backgroundColor: "#000000", layers: [text] })
    let white = 0
    let yellow = 0
    for (let y = 0; y < 300; y += 2) {
      for (let x = 0; x < 1280; x += 2) {
        const { r, g, b } = pixel(image, x, y)
        if (r > 230 && g > 230 && b > 230) white += 1
        if (r > 230 && g > 180 && b < 60) yellow += 1
      }
    }
    expect(white).toBeGreaterThan(100)
    expect(yellow).toBeGreaterThan(100)
  })

  it("draws a drop shadow where its sliders put it, in its colour", async () => {
    // A red shadow pushed 40 pixels right: red shows right of the white
    // words and none to their left.
    const words = { ...newTextLayer("wide", []), text: "I", fontSize: 200, outlineWidth: 0, x: 0.45, y: 0.2, width: 0.2, height: 0.6, align: "left" as const }
    const layer = { ...withTextLook(words, "shadow"), shadowColor: "#ff0000", shadowOpacity: 1, shadowBlur: 0, shadowX: 40, shadowY: 0 }
    const image = await draw({ shape: "wide", backgroundColor: "#000000", layers: [layer] })
    let redRight = 0
    let redLeft = 0
    let leftEdge = 1280
    for (let x = 0; x < 1280; x++) {
      const { r, g, b } = pixel(image, x, 300)
      if (r > 230 && g > 230 && b > 230) leftEdge = Math.min(leftEdge, x)
    }
    for (let x = 0; x < 1280; x++) {
      const { r, g } = pixel(image, x, 300)
      if (r > 200 && g < 60) {
        if (x > leftEdge) redRight += 1
        else redLeft += 1
      }
    }
    expect(leftEdge).toBeLessThan(1280)
    expect(redRight).toBeGreaterThan(20)
    expect(redLeft).toBe(0)
  })

  it("grows a shadow out evenly by its spread", async () => {
    // A red shadow on the words themselves, unmoved and sharp: with no
    // spread it hides under the white letter; with 20 it shows on both sides.
    const words = { ...newTextLayer("wide", []), text: "I", fontSize: 200, outlineWidth: 0, x: 0.45, y: 0.2, width: 0.2, height: 0.6, align: "left" as const }
    const base = { ...withTextLook(words, "shadow"), shadowColor: "#ff0000", shadowOpacity: 1, shadowBlur: 0, shadowX: 0, shadowY: 0 }
    const reds = async (spread: number) => {
      const image = await draw({ shape: "wide", backgroundColor: "#000000", layers: [{ ...base, shadowSpread: spread }] })
      let left = 1280
      let right = 0
      for (let x = 0; x < 1280; x++) {
        const { r, g, b } = pixel(image, x, 300)
        if (r > 230 && g > 230 && b > 230) {
          left = Math.min(left, x)
          right = Math.max(right, x)
        }
      }
      let before = 0
      let after = 0
      for (let x = 0; x < 1280; x++) {
        const { r, g } = pixel(image, x, 300)
        if (r > 200 && g < 60) {
          if (x < left) before += 1
          if (x > right) after += 1
        }
      }
      return { before, after }
    }
    expect(await reds(0)).toEqual({ before: 0, after: 0 })
    const grown = await reds(20)
    expect(grown.before).toBeGreaterThan(8)
    expect(grown.after).toBeGreaterThan(8)
    expect(Math.abs(grown.before - grown.after)).toBeLessThan(6)
  })

  it("makes a soft shadow darker past 100% strength", async () => {
    // A white shadow on a black board, so brighter means more shadow: the
    // same spot in a blur's faded edge is brighter at 300% than at 100%.
    const words = { ...newTextLayer("wide", []), text: "I", fontSize: 200, color: "#000000", outlineWidth: 0, x: 0.45, y: 0.2, width: 0.2, height: 0.6, align: "left" as const }
    const base = { ...withTextLook(words, "shadow"), shadowColor: "#ffffff", shadowBlur: 20, shadowX: 0, shadowY: 0 }
    // Where the letter starts, from the same words drawn white with no shadow.
    const plain = await draw({ shape: "wide", backgroundColor: "#000000", layers: [{ ...words, color: "#ffffff" }] })
    let left = 1280
    for (let x = 0; x < 1280; x++) if (pixel(plain, x, 300).r > 230) left = Math.min(left, x)
    expect(left).toBeLessThan(1280)
    const at = async (opacity: number) => {
      const image = await draw({ shape: "wide", backgroundColor: "#000000", layers: [{ ...base, shadowOpacity: opacity }] })
      return pixel(image, left - 15, 300).r
    }
    const full = await at(1)
    const triple = await at(3)
    expect(triple).toBeGreaterThan(full + 40)
  })

  it("draws an arrow inside its own box", async () => {
    const arrow = { ...newShapeLayer("arrow", []), color: "#00ff00", x: 0, y: 0, width: 1, height: 1, fromX: 0, fromY: 0.5, toX: 1, toY: 0.5, lineWidth: 30 }
    const image = await draw({ shape: "wide", backgroundColor: "#000000", layers: [arrow] })
    expect(pixel(image, 400, 360).g).toBeGreaterThan(200)
    expect(pixel(image, 400, 200).g).toBeLessThan(20)
  })
})

describe("the download", () => {
  it("is 1280 × 720 and under 2MB even for a picture full of noise", async () => {
    const noise = Buffer.alloc(1280 * 720 * 3)
    for (let at = 0; at < noise.length; at++) noise[at] = Math.floor(Math.random() * 256)
    const png = new Uint8Array(await sharp(noise, { raw: { width: 1280, height: 720, channels: 3 } }).png().toBuffer())
    const jpeg = await youtubeReadyJpeg(png, { width: 1280, height: 720 })
    const { width, height } = await sharp(jpeg).metadata()
    expect({ width, height }).toEqual({ width: 1280, height: 720 })
    expect(jpeg.byteLength).toBeLessThanOrEqual(2 * 1024 * 1024)
  })
})
