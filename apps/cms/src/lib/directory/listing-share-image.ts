export const LISTING_SHARE_IMAGE_WIDTH = 1200
export const LISTING_SHARE_IMAGE_HEIGHT = 630
export const LISTING_SHARE_IMAGE_TYPE = "image/svg+xml"

const MARGIN_X = 80
const CONTENT_WIDTH = LISTING_SHARE_IMAGE_WIDTH - MARGIN_X * 2
const TITLE_FONT_LARGE = 76
const TITLE_FONT_SMALL = 60
const KICKER_FONT_SIZE = 28
const SITE_NAME_FONT_SIZE = 30
// Deliberately a whole em per character. Most glyphs are narrower, but this
// also keeps an unbroken row of wide W/CJK glyphs inside the card.
const CHARACTER_WIDTH_RATIO = 1

type ListingShareImageInput = {
  title: string
  category: string | null
  siteName: string
  accentColor: string
}

type ListingShareImageVersionInput = ListingShareImageInput & {
  updatedAt: Date | string
}

function cleanText(value: string): string {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0
    return code < 32 || code === 127 ? " " : character
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function maximumCharacters(fontSize: number, letterSpacing = 0): number {
  return Math.max(
    1,
    Math.floor(
      CONTENT_WIDTH / (fontSize * CHARACTER_WIDTH_RATIO + letterSpacing)
    )
  )
}

function shorten(line: string, maximum: number): string {
  if (line.length <= maximum) return line
  return `${line.slice(0, Math.max(1, maximum - 1)).trimEnd()}…`
}

function wrapText(text: string, fontSize: number, maximumLines: number) {
  const maximum = maximumCharacters(fontSize)
  const words = cleanText(text)
    .split(" ")
    .flatMap((word) => {
      if (word.length <= maximum) return [word]
      const pieces: string[] = []
      for (let start = 0; start < word.length; start += maximum) {
        pieces.push(word.slice(start, start + maximum))
      }
      return pieces
    })

  const lines: string[] = []
  let current = ""
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maximum) {
      current = candidate
      continue
    }

    lines.push(current)
    current = word
    if (lines.length === maximumLines) {
      const last = shorten(`${lines[maximumLines - 1]}…`, maximum)
      return {
        lines: [...lines.slice(0, maximumLines - 1), last],
        truncated: true,
      }
    }
  }
  if (current) lines.push(current)
  return { lines, truncated: false }
}

/** A fixed 1200 × 630 share card, built from text only. */
export function renderListingShareImage(input: ListingShareImageInput): string {
  const siteName = cleanText(input.siteName)
  const siteLabel = shorten(siteName, maximumCharacters(SITE_NAME_FONT_SIZE))
  const title = cleanText(input.title) || siteName
  const category = cleanText(input.category ?? "")
  const accent = /^#[0-9a-f]{6}$/i.test(input.accentColor)
    ? input.accentColor
    : "#2563eb"

  let titleSize = TITLE_FONT_LARGE
  let wrapped = wrapText(title, titleSize, 2)
  if (wrapped.truncated) {
    titleSize = TITLE_FONT_SMALL
    wrapped = wrapText(title, titleSize, 3)
  }

  const lineHeight = Math.round(titleSize * 1.2)
  const rows: Array<{
    text: string
    size: number
    colour: string
    advance: number
    letterSpacing?: number
  }> = []
  if (category) {
    rows.push({
      text: shorten(
        category.toUpperCase(),
        maximumCharacters(KICKER_FONT_SIZE, 3)
      ),
      size: KICKER_FONT_SIZE,
      colour: accent,
      advance: KICKER_FONT_SIZE + 44,
      letterSpacing: 3,
    })
  }
  for (const line of wrapped.lines) {
    rows.push({
      text: line,
      size: titleSize,
      colour: "#18181b",
      advance: lineHeight,
    })
  }

  const blockHeight = rows.reduce((total, row) => total + row.advance, 0)
  let cursor = 350 - blockHeight / 2
  const text = rows.map((row) => {
    const baseline = Math.round(cursor + row.size)
    cursor += row.advance
    const spacing = row.letterSpacing
      ? ` letter-spacing="${row.letterSpacing}"`
      : ""
    return `<text x="${MARGIN_X}" y="${baseline}" font-family="Arial, sans-serif" font-weight="600" font-size="${row.size}"${spacing} fill="${row.colour}">${escapeXml(row.text)}</text>`
  })

  return [
    `<svg width="${LISTING_SHARE_IMAGE_WIDTH}" height="${LISTING_SHARE_IMAGE_HEIGHT}" viewBox="0 0 ${LISTING_SHARE_IMAGE_WIDTH} ${LISTING_SHARE_IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">`,
    `<title>${escapeXml(`${title}${category ? ` · ${category}` : ""}`)}</title>`,
    `<rect width="${LISTING_SHARE_IMAGE_WIDTH}" height="${LISTING_SHARE_IMAGE_HEIGHT}" fill="#ffffff"/>`,
    `<circle cx="1145" cy="-60" r="280" fill="${accent}" opacity="0.1"/>`,
    `<text x="${MARGIN_X}" y="134" font-family="Arial, sans-serif" font-weight="600" font-size="${SITE_NAME_FONT_SIZE}" fill="#71717a">${escapeXml(siteLabel)}</text>`,
    ...text,
    `<rect x="${MARGIN_X}" y="538" width="88" height="8" rx="4" fill="${accent}"/>`,
    "</svg>",
  ].join("")
}

/** Changes whenever any text or colour drawn into the card changes. */
export function listingShareImageVersion(
  input: ListingShareImageVersionInput
): string {
  const updatedAt =
    input.updatedAt instanceof Date
      ? input.updatedAt.toISOString()
      : input.updatedAt
  const value = [
    input.title,
    input.category ?? "",
    input.siteName,
    input.accentColor,
    updatedAt,
  ].join("\u0000")
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return `1-${(hash >>> 0).toString(36)}`
}

export function listingShareImagePath(slug: string, version: string): string {
  return `/directory/share-image/${encodeURIComponent(slug)}?v=${encodeURIComponent(version)}`
}

export function listingShareImageUrl(
  siteUrl: string,
  slug: string,
  version: string
): string {
  return new URL(listingShareImagePath(slug, version), siteUrl).toString()
}
