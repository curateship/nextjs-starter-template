import { formatFileSize } from "@/lib/format/format-bytes"

export const PUBLIC_FONT_MAX_BYTES = 1024 * 1024
export const PUBLIC_FONT_ACCEPT = ".woff2,font/woff2"

const PUBLIC_FONT_MIME_TYPES = new Set([
  "",
  "application/font-woff2",
  "application/octet-stream",
  "font/woff2",
])
const PUBLIC_FONT_VERSION_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type PublicFontAsset = {
  name: string
  version: string
}

export function normalizePublicFontAsset(
  value: unknown
): PublicFontAsset | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const asset = value as Record<string, unknown>
  const name =
    typeof asset.name === "string" ? asset.name.trim().slice(0, 255) : ""
  const version = typeof asset.version === "string" ? asset.version.trim() : ""
  return name && PUBLIC_FONT_VERSION_PATTERN.test(version)
    ? { name, version: version.toLowerCase() }
    : null
}

export function cleanPublicFontName(value: string) {
  const name =
    value.replace(/\\/g, "/").split("/").pop()?.trim() || "font.woff2"
  return name.slice(0, 255)
}

export function publicFontHref(asset: PublicFontAsset) {
  return `/public-font.woff2?v=${asset.version}`
}

export function publicFontStoragePath(asset: PublicFontAsset) {
  return `managed/public-fonts/${asset.version}.woff2`
}

/** Browser-side check that avoids uploading an obviously invalid font. */
export function getPublicFontUploadError(
  file: Pick<File, "name" | "size" | "type">
) {
  if (
    !file.name.toLowerCase().endsWith(".woff2") ||
    !PUBLIC_FONT_MIME_TYPES.has(file.type)
  ) {
    return "Choose a WOFF2 font file."
  }
  if (!file.size) return "The font file is empty."
  if (file.size > PUBLIC_FONT_MAX_BYTES) {
    return `The font is too large. Choose a file no bigger than ${formatFileSize(PUBLIC_FONT_MAX_BYTES)}.`
  }
  return null
}

/** Server-side WOFF2 header check. The filename and browser MIME are not trusted. */
export function validatePublicFontFile(
  file: Pick<File, "name" | "size" | "type">,
  data: Uint8Array
) {
  const error = getPublicFontUploadError(file)
  if (error) throw new Error(error)

  const header = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const signature =
    data.byteLength >= 4
      ? String.fromCharCode(data[0], data[1], data[2], data[3])
      : ""
  const declaredLength = data.byteLength >= 12 ? header.getUint32(8) : 0
  const tableCount = data.byteLength >= 14 ? header.getUint16(12) : 0
  const reserved = data.byteLength >= 16 ? header.getUint16(14) : -1
  const sfntSize = data.byteLength >= 20 ? header.getUint32(16) : 0
  const compressedSize = data.byteLength >= 24 ? header.getUint32(20) : 0

  if (
    data.byteLength < 48 ||
    data.byteLength !== file.size ||
    signature !== "wOF2" ||
    declaredLength !== data.byteLength ||
    tableCount === 0 ||
    reserved !== 0 ||
    sfntSize < 12 + tableCount * 16 ||
    compressedSize === 0 ||
    compressedSize > data.byteLength - 48
  ) {
    throw new Error("The file is not a valid WOFF2 font.")
  }
}
