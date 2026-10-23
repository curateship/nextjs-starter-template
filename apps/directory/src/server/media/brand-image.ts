import sharp from "sharp"

import { darkBrandSvg, flipLightness } from "@/lib/brand-image"

/** Matches the ceiling the favicon resizer already works to. */
const MAX_INPUT_PIXELS = 25_000_000

export type DarkBrandImage = {
  data: Uint8Array
  extension: "png" | "svg"
  contentType: "image/png" | "image/svg+xml"
}

/**
 * The dark-mode twin of the uploaded brand image, in the same kind of file.
 *
 * An SVG stays an SVG, so the logo on a signed-out page is still a vector at any
 * size. Everything else is read as pixels and written back as PNG, because PNG
 * is the one raster format that keeps the transparent background a logo needs.
 */
export async function toDarkBrandImage(
  data: Uint8Array,
  mimeType: string
): Promise<DarkBrandImage> {
  if (mimeType === "image/svg+xml") {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(data)
    return {
      data: new TextEncoder().encode(darkBrandSvg(source)),
      extension: "svg",
      contentType: "image/svg+xml",
    }
  }

  const { data: pixels, info } = await sharp(data, {
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS,
  })
    // The camera orientation is applied before the pixels are read, the same
    // way the favicon sizes do it, so a phone photo is not flipped sideways.
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const [red, green, blue] = flipLightness(
      pixels[index],
      pixels[index + 1],
      pixels[index + 2]
    )
    pixels[index] = red
    pixels[index + 1] = green
    pixels[index + 2] = blue
  }

  return {
    data: new Uint8Array(
      await sharp(pixels, {
        raw: { width: info.width, height: info.height, channels: 4 },
      })
        .png()
        .toBuffer()
    ),
    extension: "png",
    contentType: "image/png",
  }
}
