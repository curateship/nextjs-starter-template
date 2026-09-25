// Drawn share-preview cards for listings and events that have no photo of
// their own. This module is pure (no DB, no filesystem) so it can run under
// the node test runner; the /share-image route does the loading, rasterizing
// and storage caching.

export type ShareImageType = 'listing' | 'event'
export type ShareImageTheme = 'light' | 'dark'

const SHARE_IMAGE_WIDTH = 1200
const SHARE_IMAGE_HEIGHT = 630

// Must match the family inside public/fonts/Inter-SemiBold.ttf, which the
// route hands to the rasterizer.
export const SHARE_IMAGE_FONT_FAMILY = 'Inter'
export const SHARE_IMAGE_FONT_FILE = 'Inter-SemiBold.ttf'

// Mirrors the listing-widget palettes so drawn surfaces look related.
const CARD_THEMES: Record<ShareImageTheme, { background: string; foreground: string; muted: string; accent: string }> = {
  light: { background: '#ffffff', foreground: '#111827', muted: '#6b7280', accent: '#f59e0b' },
  dark: { background: '#111827', foreground: '#f9fafb', muted: '#9ca3af', accent: '#fbbf24' },
}

const MARGIN_X = 80
const CONTENT_WIDTH = SHARE_IMAGE_WIDTH - MARGIN_X * 2
// Estimated average glyph advance for Inter SemiBold, kept deliberately high
// so lines wrap early instead of overflowing the card.
const CHAR_WIDTH_RATIO = 0.58
const TITLE_FONT_LARGE = 76
const TITLE_FONT_SMALL = 60
const KICKER_FONT_SIZE = 28
const SITE_NAME_FONT_SIZE = 30
const ELLIPSIS = '…'

export function isShareImageType(value: unknown): value is ShareImageType {
  return value === 'listing' || value === 'event'
}

// Cache-busting version derived from the row's updated-at: editing the item
// changes the version, which changes both the URL and the storage key.
export function shareImageVersion(updatedAt: Date | string | null | undefined): string | null {
  if (!updatedAt) return null
  const ms = updatedAt instanceof Date ? updatedAt.getTime() : Date.parse(updatedAt)
  if (!Number.isFinite(ms)) return null
  return ms.toString(36)
}

export function buildShareImagePath(type: ShareImageType, id: string, version: string): string {
  return `/share-image/${type}/${id}?v=${version}`
}

export function shareImageObjectKey(siteId: string, type: ShareImageType, id: string, version: string): string {
  return `share-images/${siteId}/${type}/${id}-${version}.png`
}

export function resolveShareImageTheme(defaultTheme: unknown): ShareImageTheme {
  return defaultTheme === 'dark' ? 'dark' : 'light'
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Event dates are stored as floating `YYYY-MM-DD` strings; format them
// without ever constructing a Date so no timezone can shift the day.
export function formatShareEventDate(eventDate: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate?.trim() || '')
  if (!match) return null
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${MONTH_NAMES[month - 1]} ${day}, ${match[1]}`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function cleanText(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
}

function maxCharsAt(fontSize: number): number {
  return Math.max(1, Math.floor(CONTENT_WIDTH / (fontSize * CHAR_WIDTH_RATIO)))
}

function truncateLine(line: string, maxChars: number): string {
  if (line.length <= maxChars) return line
  return `${line.slice(0, Math.max(1, maxChars - 1)).trimEnd()}${ELLIPSIS}`
}

// Word wrap against the estimated line capacity; words longer than a whole
// line are broken hard so they can never push past the card edge.
function wrapText(text: string, fontSize: number, maxLines: number): { lines: string[]; truncated: boolean } {
  const maxChars = maxCharsAt(fontSize)
  const words: string[] = []
  for (const word of text.split(' ')) {
    if (word.length <= maxChars) {
      words.push(word)
      continue
    }
    for (let start = 0; start < word.length; start += maxChars) {
      words.push(word.slice(start, start + maxChars))
    }
  }

  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxChars) {
      current = candidate
      continue
    }
    lines.push(current)
    current = word
    if (lines.length === maxLines) {
      // Out of room with content left over: mark the last kept line as cut.
      const last = truncateLine(`${lines[maxLines - 1]}${ELLIPSIS}`, maxChars)
      return { lines: [...lines.slice(0, maxLines - 1), last], truncated: true }
    }
  }
  if (current) lines.push(current)
  return { lines, truncated: false }
}

export interface ShareCardInput {
  title: string
  // Category title for listings, formatted date for events; omitted when the
  // item has neither — the title simply takes its place, leaving no gap.
  kicker?: string | null
  siteName: string
  theme: ShareImageTheme
}

export function buildShareCardSvg(input: ShareCardInput): string {
  const palette = CARD_THEMES[input.theme]
  const siteName = cleanText(input.siteName)
  const title = cleanText(input.title) || siteName
  const kicker = cleanText(input.kicker || '')

  // Large titles get two lines; longer ones drop a size and get three.
  let fontSize = TITLE_FONT_LARGE
  let wrapped = wrapText(title, fontSize, 2)
  if (wrapped.truncated || wrapped.lines.length > 2) {
    fontSize = TITLE_FONT_SMALL
    wrapped = wrapText(title, fontSize, 3)
  }

  const lineHeight = Math.round(fontSize * 1.2)
  const rows: Array<{ text: string; size: number; fill: string; spacing?: number; advance: number }> = []
  if (kicker) {
    rows.push({
      text: truncateLine(kicker.toUpperCase(), maxCharsAt(KICKER_FONT_SIZE)),
      size: KICKER_FONT_SIZE,
      fill: palette.accent,
      spacing: 3,
      advance: KICKER_FONT_SIZE + 44,
    })
  }
  for (const line of wrapped.lines) {
    rows.push({ text: line, size: fontSize, fill: palette.foreground, advance: lineHeight })
  }

  // Center the kicker + title block between the site name and the bottom bar.
  const blockHeight = rows.reduce((sum, row) => sum + row.advance, 0)
  let cursor = 350 - blockHeight / 2

  const textElements = rows.map((row) => {
    const baseline = Math.round(cursor + row.size)
    cursor += row.advance
    const spacing = row.spacing ? ` letter-spacing="${row.spacing}"` : ''
    return `<text x="${MARGIN_X}" y="${baseline}" font-family="${SHARE_IMAGE_FONT_FAMILY}" font-weight="600" font-size="${row.size}"${spacing} fill="${row.fill}">${escapeXml(row.text)}</text>`
  })

  return [
    `<svg width="${SHARE_IMAGE_WIDTH}" height="${SHARE_IMAGE_HEIGHT}" viewBox="0 0 ${SHARE_IMAGE_WIDTH} ${SHARE_IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">`,
    `<rect width="${SHARE_IMAGE_WIDTH}" height="${SHARE_IMAGE_HEIGHT}" fill="${palette.background}"/>`,
    `<circle cx="1145" cy="-60" r="280" fill="${palette.accent}" opacity="0.08"/>`,
    `<text x="${MARGIN_X}" y="134" font-family="${SHARE_IMAGE_FONT_FAMILY}" font-weight="600" font-size="${SITE_NAME_FONT_SIZE}" fill="${palette.muted}">${escapeXml(siteName)}</text>`,
    ...textElements,
    `<rect x="${MARGIN_X}" y="538" width="88" height="8" rx="4" fill="${palette.accent}"/>`,
    `</svg>`,
  ].join('')
}
