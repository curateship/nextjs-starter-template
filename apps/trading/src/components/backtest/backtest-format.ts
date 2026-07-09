/** Shared formatting for the backtest dashboard. */

export function num(value: number, digits = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function usd(value: number): string {
  return `${value < 0 ? "-" : ""}$${num(Math.abs(value))}`
}

export function signedUsd(value: number): string {
  return `${value >= 0 ? "+" : "-"}$${num(Math.abs(value))}`
}

export function pct(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`
}

/** Price with sensible precision for the magnitude. */
export function price(value: number): string {
  const digits = value >= 1000 ? 2 : value >= 1 ? 3 : 5
  return num(value, digits)
}

/** ∞ when a side never lost (null profit factor). */
export function profitFactor(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "∞" : value.toFixed(2)
}

/** Tailwind text tone by sign, matching the portfolio dashboard. */
export function toneClass(value: number): string {
  if (value > 0) return "text-emerald-600"
  if (value < 0) return "text-red-500"
  return "text-muted-foreground"
}

/** Trims a title to at most `maxWords` words, adding an ellipsis when cut. */
export function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/)
  if (words.length <= maxWords) return text
  return `${words.slice(0, maxWords).join(" ")}…`
}

/** A run's window length in whole days. */
export function windowDaysOf(run: {
  startTime: string
  endTime: string
}): number {
  return Math.max(
    1,
    Math.round(
      (Date.parse(run.endTime) - Date.parse(run.startTime)) / 86_400_000
    )
  )
}
