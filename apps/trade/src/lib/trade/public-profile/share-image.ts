import { formatDate } from "@/lib/format/format-time"
import { formatWholeUsd } from "@/lib/trade/format"
import type { PublicProfileView } from "@/lib/trade/public-profile/profile"

/**
 * The picture X and Telegram show under a shared `/t/<handle>` link.
 *
 * This is the plain version the task allows while the Profit card task has
 * not shipped: the handle, the 30-day and all-time dollars, and trades that
 * made money out of 100, on one card. Drawn as SVG text here and turned into
 * a PNG on the server, because neither X nor Telegram shows an SVG.
 */
export const SHARE_IMAGE_WIDTH = 1200
export const SHARE_IMAGE_HEIGHT = 630
export const SHARE_IMAGE_FONT_FAMILY = "Inter"

const BACKGROUND = "#0b0f14"
const TEXT = "#f4f6f8"
const QUIET = "#8b95a1"
const MADE = "#22c55e"
const LOST = "#ef4444"

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

/** "+$6,200", "-$3,100", "$0". */
export function signedWholeUsd(value: number): string {
  const whole = formatWholeUsd(value)
  return Math.round(value) > 0 ? `+${whole}` : whole
}

function tone(value: number): string {
  if (Math.round(value) > 0) return MADE
  if (Math.round(value) < 0) return LOST
  return TEXT
}

type ShareCard = Pick<
  PublicProfileView,
  "handle" | "displayName" | "figures" | "recordStart"
>

export function renderProfileShareSvg(card: ShareCard, host: string): string {
  const { figures } = card
  const month = figures.made["30d"].money
  const all = figures.made.all.money
  const won =
    figures.wonPer100 === null
      ? "No closed trades yet"
      : `${figures.wonPer100} out of 100 trades made money (${figures.closedTrades.toLocaleString("en-US")} trades)`
  const since =
    card.recordStart === null
      ? "No trades recorded yet"
      : `Record starts ${formatDate(new Date(card.recordStart))}`
  const text = (
    x: number,
    y: number,
    size: number,
    fill: string,
    value: string
  ) =>
    `<text x="${x}" y="${y}" font-family="${SHARE_IMAGE_FONT_FAMILY}" font-size="${size}" font-weight="600" fill="${fill}">${escapeXml(value)}</text>`

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_IMAGE_WIDTH}" height="${SHARE_IMAGE_HEIGHT}" viewBox="0 0 ${SHARE_IMAGE_WIDTH} ${SHARE_IMAGE_HEIGHT}">`,
    `<rect width="100%" height="100%" fill="${BACKGROUND}"/>`,
    text(72, 110, 52, TEXT, card.displayName.slice(0, 40)),
    text(72, 160, 30, QUIET, `@${card.handle}`),
    text(72, 270, 28, QUIET, "Made in the last 30 days"),
    text(72, 350, 84, tone(month), signedWholeUsd(month)),
    text(640, 270, 28, QUIET, "Made all time"),
    text(640, 350, 84, tone(all), signedWholeUsd(all)),
    text(72, 440, 30, TEXT, won),
    text(72, 490, 26, QUIET, since),
    text(
      72,
      575,
      24,
      QUIET,
      `Every real wallet counts. ${host}/t/${card.handle}`
    ),
    `</svg>`,
  ].join("")
}
