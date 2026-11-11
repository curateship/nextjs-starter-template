import { MADE_MONEY, LOST_MONEY } from "@/lib/trade/money-tone"
import { formatSignedUsd } from "@/lib/trade/format"

export type SharedTrade = {
  symbol: string
  direction: "long" | "short"
  /** What it made or lost, or null for a trade still open with no price. */
  money: number | null
  returnPct: number | null
  from: number
  /** Null for a trade still open. */
  to: number | null
  /** The hide-profit switch is on, so the money is left off the picture. */
  hideMoney: boolean
}

const WIDTH = 1200
const HEIGHT = 630

/** The colour a class draws in on this page, so the picture uses the app's one green and one red. */
function colourOf(className: string): string {
  const probe = document.createElement("span")
  probe.className = className
  probe.style.position = "absolute"
  probe.style.visibility = "hidden"
  document.body.append(probe)
  const colour = getComputedStyle(probe).color
  probe.remove()
  return colour
}

const day = (at: number) =>
  new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

/**
 * Draws one trade as a 1200 by 630 picture, the size every social site shows
 * whole, and downloads it (Tyler, 10 Nov 2026, pick "Share a trade as a
 * picture"). The coin, its side, the money and the dates. With the profit
 * switch hiding money, the money and return are left off rather than drawn,
 * because a picture is made to be passed on.
 */
export function downloadTradePicture(trade: SharedTrade): void {
  const canvas = document.createElement("canvas")
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const context = canvas.getContext("2d")
  if (!context) return
  const page = getComputedStyle(document.body)
  const background = page.backgroundColor || "#ffffff"
  const foreground = page.color || "#111111"
  const muted = colourOf("text-muted-foreground")
  context.fillStyle = background
  context.fillRect(0, 0, WIDTH, HEIGHT)

  const font = page.fontFamily || "sans-serif"
  context.fillStyle = muted
  context.font = `500 40px ${font}`
  context.fillText(trade.direction === "long" ? "Long" : "Short", 80, 150)
  context.fillStyle = foreground
  context.font = `700 96px ${font}`
  context.fillText(trade.symbol, 80, 260)

  if (!trade.hideMoney && trade.money !== null) {
    context.fillStyle = colourOf(trade.money >= 0 ? MADE_MONEY : LOST_MONEY)
    context.font = `700 120px ${font}`
    context.fillText(formatSignedUsd(trade.money), 80, 420)
    if (trade.returnPct !== null) {
      context.font = `500 44px ${font}`
      context.fillStyle = muted
      const pct = `${trade.returnPct >= 0 ? "+" : ""}${trade.returnPct.toFixed(1)}%`
      context.fillText(pct, 80, 490)
    }
  }

  context.fillStyle = muted
  context.font = `400 36px ${font}`
  const dates = trade.to === null ? `Open since ${day(trade.from)}` : `${day(trade.from)} to ${day(trade.to)}`
  context.fillText(dates, 80, 570)

  const link = document.createElement("a")
  link.download = `${trade.symbol.replace(/[^A-Za-z0-9]+/g, "-")}-trade.png`
  link.href = canvas.toDataURL("image/png")
  link.click()
}
