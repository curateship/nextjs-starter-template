import { escapeXml } from "@/lib/pomodoro/streak-badge"

/**
 * The picture a pasted profile link unfurls into.
 *
 * Drawn as SVG and served as PNG. Tyler's call, 2 Oct 2026: X, Slack,
 * iMessage, WhatsApp and Discord all refuse SVG in a link preview, so an SVG
 * card would show nothing in every place this feature is aimed at. Drawing it
 * as SVG keeps the streak badge's proven shape — one self-contained picture,
 * no external font, no stylesheet — and the raster happens once on the way
 * out.
 *
 * Pure and free of server imports, so the escaping can be tested without a
 * database.
 *
 * The card carries what the profile already publishes and nothing more: the
 * chosen name, the handle, hours this month and the current streak.
 */

/** The size every preview service expects of a link card. */
export const SHARE_CARD_WIDTH = 1200
export const SHARE_CARD_HEIGHT = 630

/** How long a served card may be reused, matching the streak badge. */
export const SHARE_CARD_MAX_AGE_SECONDS = 300

export type ShareCardFacts = {
  /** The chosen display name, or the handle when there is none. */
  name: string
  handle: string
  hoursThisMonth: number
  currentStreak: number
}

/**
 * Trims a name to what fits on one line of the card.
 *
 * The badge trims at 22 characters for a 220px picture; this one is far wider
 * and the name is set much larger, so 28 is the equivalent. A name is cut
 * rather than shrunk, because a shrinking name makes two cards side by side
 * look like different products.
 */
const MAX_NAME_LENGTH = 28

export function trimCardName(name: string) {
  const clean = name.trim()
  if (clean.length <= MAX_NAME_LENGTH) return clean
  return `${clean.slice(0, MAX_NAME_LENGTH - 1)}…`
}

/**
 * The card as SVG.
 *
 * Every value that came from a person goes through `escapeXml`, which is the
 * one thing here that must not be got wrong: the picture is served from our
 * own address, so an unescaped `<` in a display name would put markup, and
 * with it a script, on a page we serve.
 *
 * Fonts are generic families only. The rasteriser has no web fonts and no
 * network, so a named font would silently fall back and move every number.
 */
export function renderShareCardSvg({
  name,
  handle,
  hoursThisMonth,
  currentStreak,
}: ShareCardFacts) {
  const safeName = escapeXml(trimCardName(name))
  const safeHandle = escapeXml(`/u/${handle}`)
  const hours = `${hoursThisMonth.toLocaleString("en-GB")}`
  const streak = `${currentStreak.toLocaleString("en-GB")}`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_CARD_WIDTH}" height="${SHARE_CARD_HEIGHT}" viewBox="0 0 ${SHARE_CARD_WIDTH} ${SHARE_CARD_HEIGHT}" role="img" aria-label="${safeName} on Pomoder">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1b1714"/>
      <stop offset="1" stop-color="#2f261c"/>
    </linearGradient>
  </defs>
  <rect width="${SHARE_CARD_WIDTH}" height="${SHARE_CARD_HEIGHT}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${SHARE_CARD_WIDTH}" height="10" fill="#ff5a3c"/>
  <text x="80" y="170" font-family="Helvetica, Arial, sans-serif" font-size="68" font-weight="700" fill="#ffffff">${safeName}</text>
  <text x="80" y="226" font-family="monospace" font-size="30" fill="rgba(255,255,255,0.62)">${safeHandle}</text>
  <text x="80" y="398" font-family="Helvetica, Arial, sans-serif" font-size="104" font-weight="700" fill="#ff5a3c">${hours}</text>
  <text x="80" y="446" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="rgba(255,255,255,0.62)">hours focused this month</text>
  <text x="620" y="398" font-family="Helvetica, Arial, sans-serif" font-size="104" font-weight="700" fill="#ffffff">${streak}</text>
  <text x="620" y="446" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="rgba(255,255,255,0.62)">day streak</text>
  <text x="80" y="566" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="rgba(255,255,255,0.45)">Pomoder</text>
</svg>`
}

/**
 * The picture a pasted link to a shared sound unfurls into (task 03, part
 * 11): its name, who shared it and a waveform drawn from its id, so each
 * sound keeps one shape. A picture or clip unfurls into its own picture
 * instead, so this card is for sounds only.
 */
export function renderSoundCardSvg({
  name,
  handle,
  seed,
}: {
  name: string
  handle: string
  seed: string
}) {
  const safeName = escapeXml(trimCardName(name))
  const safeCredit = escapeXml(`by @${handle}`)
  const bars = waveBars(seed, 48)
    .map((height, index) => {
      const x = 80 + index * 22
      const tall = Math.round(40 + height * 200)
      return `<rect x="${x}" y="${470 - tall / 2}" width="12" height="${tall}" rx="6" fill="#ff5a3c" opacity="${(0.55 + height * 0.45).toFixed(2)}"/>`
    })
    .join("")
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_CARD_WIDTH}" height="${SHARE_CARD_HEIGHT}" viewBox="0 0 ${SHARE_CARD_WIDTH} ${SHARE_CARD_HEIGHT}" role="img" aria-label="${safeName} on Pomoder">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1b1714"/>
      <stop offset="1" stop-color="#2f261c"/>
    </linearGradient>
  </defs>
  <rect width="${SHARE_CARD_WIDTH}" height="${SHARE_CARD_HEIGHT}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${SHARE_CARD_WIDTH}" height="10" fill="#ff5a3c"/>
  <text x="80" y="170" font-family="Helvetica, Arial, sans-serif" font-size="68" font-weight="700" fill="#ffffff">${safeName}</text>
  <text x="80" y="226" font-family="monospace" font-size="30" fill="rgba(255,255,255,0.62)">${safeCredit}</text>
  ${bars}
  <text x="80" y="600" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="rgba(255,255,255,0.45)">A sound on Pomoder</text>
</svg>`
}

/** Bar heights from 0 to 1, the same for the same seed every time. */
function waveBars(seed: string, count: number) {
  let state = 0
  for (const char of seed) state = (state * 31 + char.charCodeAt(0)) >>> 0
  return Array.from({ length: count }, (_, index) => {
    state = (state * 1_103_515_245 + 12_345) >>> 0
    const noise = (state % 1000) / 1000
    // A gentle swell under the noise, so it reads as sound and not static.
    const swell = 0.5 + 0.5 * Math.sin((index / count) * Math.PI * 3)
    return Math.min(1, 0.25 + noise * 0.45 + swell * 0.3)
  })
}
