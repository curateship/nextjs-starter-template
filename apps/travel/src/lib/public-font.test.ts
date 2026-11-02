import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import {
  PUBLIC_FONT_MAX_BYTES,
  getPublicFontUploadError,
  normalizePublicFontAsset,
  publicFontHref,
  publicFontStoragePath,
  validatePublicFontFile,
} from "@/lib/public-font"

const version = "123e4567-e89b-42d3-a456-426614174000"

function fontFile(
  overrides: Partial<Pick<File, "name" | "size" | "type">> = {}
) {
  return {
    name: "Brand.woff2",
    size: 64,
    type: "font/woff2",
    ...overrides,
  }
}

function woff2Header() {
  const data = new Uint8Array(64)
  data.set([0x77, 0x4f, 0x46, 0x32])
  const header = new DataView(data.buffer)
  header.setUint32(8, data.byteLength)
  header.setUint16(12, 1)
  header.setUint16(14, 0)
  header.setUint32(16, 128)
  header.setUint32(20, 1)
  return data
}

describe("public font", () => {
  it("accepts a real WOFF2 header and generic browser MIME types", () => {
    const data = woff2Header()

    expect(() => validatePublicFontFile(fontFile(), data)).not.toThrow()
    expect(
      getPublicFontUploadError(fontFile({ type: "application/octet-stream" }))
    ).toBeNull()
  })

  it("accepts the bundled Inter font as a real upload", () => {
    const data = new Uint8Array(
      readFileSync(
        new URL("../../public/fonts/inter-latin.woff2", import.meta.url)
      )
    )

    expect(() =>
      validatePublicFontFile(
        fontFile({ name: "Inter.woff2", size: data.byteLength }),
        data
      )
    ).not.toThrow()
  })

  it("refuses renamed files, invalid content, empty files, and large files", () => {
    expect(getPublicFontUploadError(fontFile({ name: "Brand.ttf" }))).toBe(
      "Choose a WOFF2 font file."
    )
    expect(getPublicFontUploadError(fontFile({ size: 0 }))).toBe(
      "The font file is empty."
    )
    expect(
      getPublicFontUploadError(fontFile({ size: PUBLIC_FONT_MAX_BYTES + 1 }))
    ).toContain("no bigger than 1 MB")
    expect(() =>
      validatePublicFontFile(fontFile(), new Uint8Array(64))
    ).toThrow("The file is not a valid WOFF2 font.")
    expect(() =>
      validatePublicFontFile(fontFile({ size: 63 }), woff2Header())
    ).toThrow("The file is not a valid WOFF2 font.")
  })

  it("normalizes saved assets and builds same-origin addresses", () => {
    const asset = normalizePublicFontAsset({ name: " Brand.woff2 ", version })

    expect(asset).toEqual({ name: "Brand.woff2", version })
    expect(publicFontHref(asset!)).toBe(`/public-font.woff2?v=${version}`)
    expect(publicFontStoragePath(asset!)).toBe(
      `managed/public-fonts/${version}.woff2`
    )
    expect(
      normalizePublicFontAsset({ name: "Brand.woff2", version: "../../font" })
    ).toBeNull()
  })
})
