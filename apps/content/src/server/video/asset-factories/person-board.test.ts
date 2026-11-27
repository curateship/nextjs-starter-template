import sharp from "sharp"
import { describe, expect, it } from "vitest"

import { shrinkReference, stitchBoard } from "@/server/video/asset-factories/person-board"

/** A plain picture of one colour, the way a photo arrives from Media. */
async function picture(
  width: number,
  height: number,
  colour: { r: number; g: number; b: number },
  format: "png" | "jpeg" = "png"
) {
  const image = sharp({ create: { width, height, channels: 3, background: colour } })
  return new Uint8Array(await (format === "png" ? image.png() : image.jpeg()).toBuffer())
}

async function pixel(bytes: Uint8Array, left: number, top: number) {
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true })
  const at = (top * info.width + left) * info.channels
  return [data[at], data[at + 1], data[at + 2]]
}

const RED = { r: 220, g: 20, b: 20 }
const BLUE = { r: 20, g: 20, b: 220 }
const GREEN = { r: 20, g: 200, b: 20 }

describe("the person board", () => {
  it("puts two pictures side by side on one row", async () => {
    const board = await stitchBoard([
      await picture(300, 400, RED),
      await picture(300, 400, BLUE),
    ])
    const meta = await sharp(board).metadata()
    expect(meta.format).toBe("jpeg")
    expect([meta.width, meta.height]).toEqual([1200, 800])
  })

  it("lays out four pictures two by two, in the order given", async () => {
    const board = await stitchBoard([
      await picture(300, 400, RED),
      await picture(300, 400, BLUE),
      await picture(300, 400, GREEN),
      await picture(300, 400, RED, "jpeg"),
    ])
    expect(await sharp(board).metadata()).toMatchObject({ width: 1200, height: 1584 })
    const [first, second, third] = await Promise.all([
      pixel(board, 300, 400),
      pixel(board, 900, 400),
      pixel(board, 300, 1200),
    ])
    expect(first[0]).toBeGreaterThan(180)
    expect(second[2]).toBeGreaterThan(180)
    expect(third[1]).toBeGreaterThan(160)
  })

  it("shrinks a wide picture into its tile whole, on white, instead of cropping it", async () => {
    const board = await stitchBoard([
      await picture(1600, 400, RED),
      await picture(300, 400, BLUE),
    ])
    // The tile is 576 by 768. A 4 to 1 picture fills its width and only 144
    // pixels of its height, so the top of the tile is white.
    expect(await pixel(board, 300, 40)).toEqual([255, 255, 255])
    expect((await pixel(board, 300, 400))[0]).toBeGreaterThan(180)
  })

  it("refuses one picture or more than four", async () => {
    const one = await picture(10, 10, RED)
    await expect(stitchBoard([one])).rejects.toThrow("A board holds 2 to 4 pictures")
    await expect(stitchBoard([one, one, one, one, one])).rejects.toThrow(
      "A board holds 2 to 4 pictures"
    )
  })
})

describe("a reference picture for Veo", () => {
  it("comes down to 1536 pixels on its longest side as a JPEG", async () => {
    const shrunk = await shrinkReference(await picture(4000, 3000, BLUE))
    expect(shrunk.mimeType).toBe("image/jpeg")
    expect(await sharp(shrunk.bytes).metadata()).toMatchObject({
      format: "jpeg",
      width: 1536,
      height: 1152,
    })
  })

  it("takes three 4 MB pictures down to under 4 MB together", async () => {
    // Random noise squeezes worst of all, so these are the hardest 4 MB to
    // shrink. A real photo comes out several times smaller.
    const noise = () =>
      sharp(Buffer.from(Array.from({ length: 1200 * 1200 * 3 }, () => Math.floor(Math.random() * 256))), {
        raw: { width: 1200, height: 1200, channels: 3 },
      })
        .png({ compressionLevel: 0 })
        .toBuffer()
    const photos = await Promise.all([noise(), noise(), noise()])
    for (const photo of photos) expect(photo.byteLength).toBeGreaterThan(4_000_000)
    const shrunk = await Promise.all(photos.map((photo) => shrinkReference(new Uint8Array(photo))))
    const total = shrunk.reduce((sum, each) => sum + each.bytes.byteLength, 0)
    expect(total).toBeLessThan(4_000_000)
  })

  it("leaves a small picture its size", async () => {
    const shrunk = await shrinkReference(await picture(640, 480, BLUE))
    expect(await sharp(shrunk.bytes).metadata()).toMatchObject({ width: 640, height: 480 })
  })
})
